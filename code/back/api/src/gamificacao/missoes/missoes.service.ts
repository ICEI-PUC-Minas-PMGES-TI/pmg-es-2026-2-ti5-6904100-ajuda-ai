import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { DataSource } from 'typeorm';
import { notificacaoNivel } from '../../notificacoes/notificacoes.js';
import { NotificacoesService } from '../../notificacoes/notificacoes.service.js';
import { ParticipacoesService } from '../../participacoes/participacoes.service.js';
import { LIMITES, moedasPorXp, nivelDe } from '../economia.js';
import {
  ehViolacaoUnica,
  SCHEMA_GAMIFICACAO,
  travarCarteira,
} from '../gamificacao.js';
import { creditarGanho, usoDoCiclo } from '../ganhos.js';
import type {
  ConclusaoMissaoDto,
  MissaoAlunoDto,
  MissoesAlunoDto,
} from './missoes.dto.js';
import {
  chaveConclusao,
  ID_MISSAO,
  semanaDe,
  type TipoMissao,
  xpPrevisto,
} from './missoes.js';

const g = `"${SCHEMA_GAMIFICACAO}"`;

interface LinhaMissaoAluno {
  id: string;
  titulo: string;
  descricao: string;
  tipo: TipoMissao;
  xp: number;
  fim: Date | null;
  conclusao_id: string | null;
  xp_configurado: number | null;
  xp_creditado: number | null;
  concluida_em: Date | null;
}

interface ConclusaoAnterior {
  id: string;
  xp_creditado: number;
  criado_em: Date;
}

function jaConcluida(tipo: TipoMissao, anterior?: ConclusaoAnterior) {
  return new ConflictException({
    statusCode: 409,
    message:
      tipo === 'SEMANAL'
        ? 'Você já concluiu esta missão nesta semana.'
        : 'Você já concluiu esta missão neste semestre.',
    motivo: 'ja-concluida',
    ...(anterior && {
      conclusao: {
        id: anterior.id,
        xp: anterior.xp_creditado,
        moedas: moedasPorXp(anterior.xp_creditado),
        concluidaEm: anterior.criado_em.toISOString(),
      },
    }),
  });
}

@Injectable()
export class MissoesService {
  private readonly logger = new Logger('Missoes');

  constructor(
    private readonly dataSource: DataSource,
    private readonly notificacoes: NotificacoesService,
  ) {}

  async listar(
    usuarioId: number,
    agora = new Date(),
  ): Promise<MissoesAlunoDto> {
    const ciclo = ParticipacoesService.programaAtual(agora);
    const semana = semanaDe(agora);
    const [linhas, uso] = await Promise.all([
      this.dataSource.query(
        `SELECT m."id", m."titulo", m."descricao", m."tipo", m."xp", m."fim", ` +
          `c."id" AS conclusao_id, c."xp_configurado", c."xp_creditado", c."criado_em" AS concluida_em ` +
          `FROM ${g}."missoes" m LEFT JOIN ${g}."missoes_conclusoes" c ON c."missao_id" = m."id" AND c."usuario_id" = $1 ` +
          `AND ((m."tipo" = 'UNICA' AND c."semana" IS NULL AND c."ciclo" = $2) OR (m."tipo" = 'SEMANAL' AND c."semana" = $3::date)) ` +
          `WHERE m."ativa" AND m."ciclo" = $2 AND (m."inicio" IS NULL OR m."inicio" <= now()) AND (m."fim" IS NULL OR m."fim" > now()) ` +
          `ORDER BY m."fim" ASC NULLS LAST, m."criado_em" DESC`,
        [usuarioId, ciclo, semana],
      ) as Promise<LinhaMissaoAluno[]>,
      usoDoCiclo(this.dataSource, usuarioId, ciclo),
    ]);
    const missoes = linhas.map((l): MissaoAlunoDto => {
      const concluida = l.conclusao_id !== null;
      const previsto = concluida ? 0 : xpPrevisto(l.xp, l.tipo, uso);
      return {
        id: l.id,
        titulo: l.titulo,
        descricao: l.descricao,
        tipo: l.tipo,
        xp: l.xp,
        moedas: moedasPorXp(l.xp),
        fim: l.fim?.toISOString() ?? null,
        status: concluida
          ? 'concluida'
          : previsto < l.xp
            ? 'limitada'
            : 'disponivel',
        xpPrevisto: previsto,
        conclusao: concluida
          ? {
              id: l.conclusao_id!,
              xp: l.xp_creditado!,
              moedas: moedasPorXp(l.xp_creditado!),
              limitado: l.xp_creditado! < l.xp_configurado!,
              concluidaEm: l.concluida_em!.toISOString(),
            }
          : null,
      };
    });
    missoes.sort(
      (a, b) =>
        Number(a.status === 'concluida') - Number(b.status === 'concluida'),
    );
    return {
      ciclo,
      semana,
      limites: {
        ciclo: { ganho: uso.geral, limite: LIMITES.geralPorCiclo },
        semanal: { ganho: uso.missoesSemana, limite: LIMITES.missoesSemanais },
      },
      missoes,
    };
  }

  async concluir(
    usuarioId: number,
    missaoId: string,
    agora = new Date(),
  ): Promise<ConclusaoMissaoDto> {
    if (!ID_MISSAO.test(missaoId)) {
      throw new NotFoundException('Missão não encontrada.');
    }
    const ciclo = ParticipacoesService.programaAtual(agora);
    const qr = this.dataSource.createQueryRunner();
    await qr.connect();
    await qr.startTransaction();
    let tipo: TipoMissao | undefined;
    try {
      const [missao] = (await qr.query(
        `SELECT "id", "titulo", "tipo", "xp", "ativa", "ciclo", "inicio", "fim", ` +
          `("inicio" IS NULL OR "inicio" <= now()) AS iniciou, ("fim" IS NULL OR "fim" > now()) AS aberta ` +
          `FROM ${g}."missoes" WHERE "id" = $1 FOR SHARE`,
        [missaoId],
      )) as Array<{
        id: string;
        titulo: string;
        tipo: TipoMissao;
        xp: number;
        ativa: boolean;
        ciclo: string;
        inicio: Date | null;
        fim: Date | null;
        iniciou: boolean;
        aberta: boolean;
      }>;
      if (!missao || !missao.ativa || missao.ciclo !== ciclo) {
        throw new NotFoundException('Missão não encontrada.');
      }
      tipo = missao.tipo;
      if (!missao.iniciou || !missao.aberta) {
        throw new UnprocessableEntityException({
          statusCode: 422,
          message: missao.iniciou
            ? 'O prazo desta missão já terminou.'
            : 'Esta missão ainda não começou.',
          motivo: 'fora-do-periodo',
          inicio: missao.inicio?.toISOString() ?? null,
          fim: missao.fim?.toISOString() ?? null,
        });
      }

      const saldoAntes = await travarCarteira(qr, usuarioId);
      const semanal = missao.tipo === 'SEMANAL';
      const semana = semanal ? semanaDe(agora) : null;
      const [anterior] = (await qr.query(
        semanal
          ? `SELECT "id", "xp_creditado", "criado_em" FROM ${g}."missoes_conclusoes" WHERE "missao_id" = $1 AND "usuario_id" = $2 AND "semana" = $3::date`
          : `SELECT "id", "xp_creditado", "criado_em" FROM ${g}."missoes_conclusoes" WHERE "missao_id" = $1 AND "usuario_id" = $2 AND "ciclo" = $3 AND "semana" IS NULL`,
        [missao.id, usuarioId, semanal ? semana : ciclo],
      )) as ConclusaoAnterior[];
      if (anterior) throw jaConcluida(missao.tipo, anterior);

      const [{ xp_acumulado: xpAntes }] = (await qr.query(
        `SELECT "xp_acumulado" FROM ${g}."xp_carteiras" WHERE "usuario_id" = $1`,
        [usuarioId],
      )) as Array<{ xp_acumulado: number }>;

      const ganho = await creditarGanho(qr, {
        usuarioId,
        fonte: 'MISSAO',
        xp: missao.xp,
        recorrenteSemanal: semanal,
        ciclo,
        referenciaTipo: semanal ? 'MISSAO_SEMANAL' : 'MISSAO',
        referenciaId: missao.id,
        descricao: `Missão: ${missao.titulo}`.slice(0, 200),
        chaveIdempotencia: chaveConclusao(
          missao.id,
          usuarioId,
          semanal ? semana! : ciclo,
        ),
      });
      const [conclusao] = (await qr.query(
        `INSERT INTO ${g}."missoes_conclusoes" ("missao_id", "usuario_id", "ciclo", "semana", "xp_configurado", "xp_creditado", "movimentacao_id") ` +
          `VALUES ($1, $2, $3, $4::date, $5, $6, $7) RETURNING "id", "criado_em"`,
        [
          missao.id,
          usuarioId,
          ciclo,
          semana,
          missao.xp,
          ganho.xp,
          ganho.movimentacao?.movimentacaoId ?? null,
        ],
      )) as Array<{ id: string; criado_em: Date }>;
      await qr.commitTransaction();
      this.logger.log(
        `conclusao missao=${missao.id} usuario=${usuarioId} ciclo=${ciclo} xp=${ganho.xp}/${missao.xp}`,
      );

      const xpAcumulado = ganho.movimentacao?.xpAcumulado ?? xpAntes;
      const nivel = nivelDe(xpAcumulado);
      const subiuDeNivel = nivel.numero > nivelDe(xpAntes).numero;
      if (subiuDeNivel) {
        await this.notificacoes.criar(usuarioId, notificacaoNivel(xpAcumulado));
      }
      return {
        missaoId: missao.id,
        conclusaoId: conclusao.id,
        xpConfigurado: ganho.xpConfigurado,
        xp: ganho.xp,
        moedas: ganho.moedas,
        limitado: ganho.limitado,
        teto: ganho.teto === 'totens' ? null : ganho.teto,
        saldoMoedas: ganho.movimentacao?.saldo ?? saldoAntes,
        xpAcumulado,
        nivel,
        subiuDeNivel,
        ciclo,
        semana,
        concluidaEm: conclusao.criado_em.toISOString(),
      };
    } catch (erro) {
      await qr.rollbackTransaction();
      if (
        ehViolacaoUnica(erro, 'uq_missoes_conclusoes_unica') ||
        ehViolacaoUnica(erro, 'uq_missoes_conclusoes_semanal') ||
        ehViolacaoUnica(erro, 'uq_xp_movimentacoes_chave')
      ) {
        throw jaConcluida(tipo ?? 'UNICA');
      }
      throw erro;
    } finally {
      await qr.release();
    }
  }
}
