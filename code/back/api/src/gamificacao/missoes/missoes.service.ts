import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { createHash } from 'node:crypto';
import { DataSource, type QueryRunner } from 'typeorm';
import { SCHEMA_MAPA, schemaPostgis } from '../../mapa/postgis.js';
import { notificacaoNivel } from '../../notificacoes/notificacoes.js';
import { NotificacoesService } from '../../notificacoes/notificacoes.service.js';
import { ParticipacoesService } from '../../participacoes/participacoes.service.js';
import { LIMITES, moedasPorXp, nivelDe } from '../economia.js';
import {
  ehViolacaoUnica,
  SCHEMA_GAMIFICACAO,
  schemaUsuarios,
  travarCarteira,
} from '../gamificacao.js';
import { creditarGanho, usoDoCiclo, type GanhoCreditado } from '../ganhos.js';
import {
  RegrasXpService,
  type RegraVigente,
} from '../regras-xp/regras-xp.service.js';
import type {
  AlvoMissaoDto,
  ConclusaoMissaoDto,
  MissaoAlunoDto,
  MissoesAlunoDto,
  PontoMissaoDto,
} from './missoes.dto.js';
import {
  type AcessoMissoes,
  CHECKIN_ANTECEDENCIA_MIN,
  chaveConclusao,
  ID_MISSAO,
  joinsEvento,
  REQUISITOS_CONTADOS,
  type RequisitoMissao,
  semanaDe,
  sqlMissaoAlcancavel,
  sqlMissaoCumprivel,
  sqlMissaoVisivel,
  type TipoMissao,
  xpPrevisto,
} from './missoes.js';
import {
  CodigoErrado,
  exigirCodigoLiberado,
  exigirTentativasDeCodigo,
  type LeituraConclusao,
  metaEfetiva,
  type MissaoParaVerificar,
  recusa,
  sqlProgresso,
  sqlPucstopsDisponiveis,
  verificarCodigo,
  verificarContagem,
  verificarEvento,
} from './requisitos.js';

const g = `"${SCHEMA_GAMIFICACAO}"`;
const mp = `"${SCHEMA_MAPA}"`;

const SEM_ACESSO_EXTRA: AcessoMissoes = { podePublicar: false, temPar: false };

interface LinhaMissaoAluno {
  id: string;
  titulo: string;
  descricao: string;
  tipo: TipoMissao;
  requisito: RequisitoMissao;
  quantidade: number;
  xp: number;
  fim: Date | null;
  progresso: number;
  disponiveis: number;
  codigo_liberado_ate: Date | null;
  conclusao_id: string | null;
  xp_configurado: number | null;
  xp_creditado: number | null;
  concluida_em: Date | null;
  alvo_id: string | null;
  alvo_nome: string | null;
  alvo_inicio: Date | null;
  alvo_fim: Date | null;
  alvo_ativo: boolean | null;
  alvo_latitude: number | null;
  alvo_longitude: number | null;
  alvo_local: string | null;
  instrucoes: string | null;
  pontos: PontoMissaoDto[] | null;
}

interface ConclusaoAnterior {
  id: string;
  xp_creditado: number;
  criado_em: Date;
}

interface MissaoDeEncontro {
  id: string;
  titulo: string;
  tipo: TipoMissao;
  xp: number;
  quantidade: number;
  ciclo: string;
  semana: string | null;
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

/** Identifica o código aceito sem guardá-lo na evidência. */
function impressaoDoCodigo(missaoId: string, codigo: string): string {
  return createHash('sha256')
    .update(`${missaoId}:${codigo}`)
    .digest('hex')
    .slice(0, 32);
}

function alvoDe(l: LinhaMissaoAluno): AlvoMissaoDto | null {
  if (!l.alvo_id || !l.alvo_nome) return null;
  const evento = l.requisito === 'EVENTO';
  return {
    tipo: evento ? 'evento' : 'pucstop',
    id: l.alvo_id,
    nome: l.alvo_nome,
    checkinAbre: evento
      ? new Date(
          l.alvo_inicio!.getTime() - CHECKIN_ANTECEDENCIA_MIN * 60_000,
        ).toISOString()
      : null,
    inicio: l.alvo_inicio?.toISOString() ?? null,
    fim: l.alvo_fim?.toISOString() ?? null,
    latitude: l.alvo_latitude === null ? null : Number(l.alvo_latitude),
    longitude: l.alvo_longitude === null ? null : Number(l.alvo_longitude),
    local: l.alvo_local,
  };
}

@Injectable()
export class MissoesService {
  private readonly logger = new Logger('Missoes');
  private schemaGeo?: string;

  constructor(
    private readonly dataSource: DataSource,
    private readonly notificacoes: NotificacoesService,
    private readonly regrasXp: RegrasXpService = new RegrasXpService(
      dataSource,
    ),
  ) {}

  private async geo(
    consultar: (sql: string, p?: unknown[]) => Promise<unknown>,
  ): Promise<string> {
    return (this.schemaGeo ??= await schemaPostgis(consultar));
  }

  private get u(): string {
    return schemaUsuarios(this.dataSource);
  }

  private async emailDe(
    consultar: (sql: string, p: unknown[]) => Promise<unknown>,
    usuarioId: number,
  ): Promise<string> {
    const [linha] = (await consultar(
      `SELECT lower("email") AS email FROM ${this.u}."usuarios" WHERE "id" = $1`,
      [usuarioId],
    )) as Array<{ email: string }>;
    if (!linha) throw new NotFoundException('Usuário não encontrado.');
    return linha.email;
  }

  async listar(
    usuarioId: number,
    agora = new Date(),
    acesso: AcessoMissoes = SEM_ACESSO_EXTRA,
  ): Promise<MissoesAlunoDto> {
    const ciclo = ParticipacoesService.programaAtual(agora);
    const semana = semanaDe(agora);
    const consultar = (sql: string, p: unknown[]) =>
      this.dataSource.query(sql, p);
    const [email, geo] = await Promise.all([
      this.emailDe(consultar, usuarioId),
      this.geo((sql, p) => this.dataSource.query(sql, p)),
    ]);
    const centro = (c: 'X' | 'Y') =>
      `CASE WHEN m."requisito" = 'PUCSTOPS' THEN ${geo}.ST_${c}(ps."localizacao") ` +
      `ELSE ${geo}.ST_${c}(${geo}.ST_Centroid(COALESCE(lp."poligono", lp."localizacao", la."poligono", la."localizacao", ev."localizacao"))) END`;
    const coletado = (ponto: string) =>
      `EXISTS (SELECT 1 FROM ${g}."pucstop_coletas" pc WHERE pc."usuario_id" = $1 AND pc."ciclo" = m."ciclo" AND pc."pucstop_id" = ${ponto})`;
    const [linhas, uso] = await Promise.all([
      this.dataSource.query(
        `SELECT m."id", m."titulo", m."descricao", m."instrucoes", m."tipo", m."requisito", m."quantidade", m."xp", m."fim", m."codigo_liberado_ate", ` +
          `COALESCE(ps."id", m."alvo_id") AS alvo_id, ` +
          `(SELECT json_agg(json_build_object('id', p."id", 'nome', p."nome", 'coletado', ${coletado('p."id"')}, 'ativo', p."ativo", ` +
          `'latitude', ${geo}.ST_Y(p."localizacao"), 'longitude', ${geo}.ST_X(p."localizacao")) ORDER BY o."n") ` +
          `FROM unnest(m."pucstops") WITH ORDINALITY AS o("id", "n") JOIN ${mp}."pucstops" p ON p."id" = o."id") AS pontos, ` +
          `(${sqlProgresso('m', this.u)})::int AS progresso, ` +
          `(CASE WHEN m."requisito" = 'PUCSTOPS' THEN ${sqlPucstopsDisponiveis('m')} ELSE 0 END)::int AS disponiveis, ` +
          `c."id" AS conclusao_id, c."xp_configurado", c."xp_creditado", c."criado_em" AS concluida_em, ` +
          `COALESCE(ps."nome", ev."titulo") AS alvo_nome, ev."inicio" AS alvo_inicio, ev."fim" AS alvo_fim, ` +
          `COALESCE(ps."ativo", ev."ativo") AS alvo_ativo, ${centro('Y')} AS alvo_latitude, ${centro('X')} AS alvo_longitude, ` +
          `COALESCE(lp."nome", la."nome") AS alvo_local ` +
          `FROM ${g}."missoes" m ` +
          `LEFT JOIN ${g}."missoes_conclusoes" c ON c."missao_id" = m."id" AND c."usuario_id" = $1 ` +
          `AND ((m."tipo" = 'UNICA' AND c."semana" IS NULL AND c."ciclo" = $4) OR (m."tipo" = 'SEMANAL' AND c."semana" = $3::date)) ` +
          // Alvo da exploração: o primeiro ponto que falta, na ordem da
          // coordenação. Ponto desativado não é coletável: fica por último.
          `LEFT JOIN LATERAL (SELECT p."id", p."nome", p."ativo", p."localizacao" ` +
          `FROM unnest(m."pucstops") WITH ORDINALITY AS o("id", "n") JOIN ${mp}."pucstops" p ON p."id" = o."id" ` +
          `ORDER BY (${coletado('p."id"')} OR NOT p."ativo"), o."n" LIMIT 1) ps ON m."requisito" = 'PUCSTOPS' ` +
          `LEFT JOIN ${mp}."eventos" ev ON m."requisito" = 'EVENTO' AND ev."id" = m."alvo_id" ` +
          `${joinsEvento('ev')} ` +
          `WHERE m."ciclo" = $4 AND ${sqlMissaoVisivel('m')} AND ${sqlMissaoAlcancavel('m', acesso)} ` +
          `AND (c."id" IS NOT NULL OR ${sqlMissaoCumprivel('m')}) ` +
          `ORDER BY m."fim" ASC NULLS LAST, m."criado_em" DESC`,
        [usuarioId, email, semana, ciclo],
      ) as Promise<LinhaMissaoAluno[]>,
      usoDoCiclo(this.dataSource, usuarioId, ciclo),
    ]);
    const [regraEncontro] = linhas.some(
      (m) => m.requisito === 'ENCONTRO' && m.conclusao_id === null,
    )
      ? await this.regrasXp.configuracoesVigentes(
          ['MISSAO_ENCONTRO'],
          this.dataSource,
        )
      : [];
    const podeGanharPorEncontro =
      !regraEncontro ||
      ((regraEncontro.elegibilidade === 'todos' ||
        regraEncontro.elegibilidade === acesso.papel) &&
        (await this.dentroDoLimiteDaRegra(
          this.dataSource,
          usuarioId,
          ciclo,
          regraEncontro,
        )));
    const instante = agora.getTime();
    const missoes = linhas.map((l): MissaoAlunoDto => {
      const concluida = l.conclusao_id !== null;
      const deEncontro = l.requisito === 'ENCONTRO';
      const xp = deEncontro
        ? (l.xp_configurado ?? regraEncontro?.valorXp ?? l.xp)
        : l.xp;
      const previsto =
        concluida || (deEncontro && !podeGanharPorEncontro)
          ? 0
          : xpPrevisto(xp, l.tipo, uso);
      const contada = REQUISITOS_CONTADOS.includes(l.requisito);
      const meta = metaEfetiva(
        l.requisito,
        l.quantidade,
        Number(l.progresso),
        Number(l.disponiveis),
      );
      const atual = Math.min(Number(l.progresso), meta);
      const alvo = alvoDe(l);
      const comCodigo = l.requisito === 'CODIGO' || l.requisito === 'EVENTO';
      const pronta =
        !concluida &&
        !deEncontro &&
        (contada
          ? atual >= meta
          : l.requisito === 'EVENTO'
            ? Boolean(
                l.alvo_ativo &&
                alvo &&
                Date.parse(alvo.checkinAbre!) <= instante &&
                instante < Date.parse(alvo.fim!),
              )
            : true);
      return {
        id: l.id,
        titulo: l.titulo,
        descricao: l.descricao,
        tipo: l.tipo,
        requisito: l.requisito,
        xp,
        moedas: moedasPorXp(xp),
        fim: l.fim?.toISOString() ?? null,
        status: concluida
          ? 'concluida'
          : previsto < xp
            ? 'limitada'
            : 'disponivel',
        xpPrevisto: previsto,
        progresso: contada ? { atual, meta } : null,
        pronta,
        codigoLiberadoAte:
          comCodigo &&
          l.codigo_liberado_ate &&
          l.codigo_liberado_ate.getTime() > instante
            ? l.codigo_liberado_ate.toISOString()
            : null,
        alvo,
        pontos: l.pontos,
        instrucoes: l.instrucoes,
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
    leitura: LeituraConclusao = {},
    acesso: AcessoMissoes = SEM_ACESSO_EXTRA,
  ): Promise<ConclusaoMissaoDto> {
    const resultado = await this.concluirNaTransacao(
      usuarioId,
      missaoId,
      agora,
      leitura,
      acesso,
    );
    // Só depois de liberar a conexão da transação: pedir outra ao pool
    // segurando esta pode esgotar o pool quando muitos sobem de nível juntos.
    if (resultado.subiuDeNivel) {
      await this.notificacoes.criar(
        usuarioId,
        notificacaoNivel(resultado.xpAcumulado),
      );
    }
    return resultado;
  }

  async missoesCumpridasPorEncontro(
    qr: QueryRunner,
    usuarioId: number,
    encontroId: string,
    ciclo: string,
    papel: NonNullable<AcessoMissoes['papel']>,
  ): Promise<MissaoDeEncontro[]> {
    const semana = semanaDe(new Date());
    const publico = sqlMissaoAlcancavel('m', {
      podePublicar: false,
      temPar: true,
      papel,
    });
    return (await qr.query(
      `SELECT m."id", m."titulo", m."tipo", m."xp", m."quantidade", m."ciclo",
        CASE WHEN m."tipo" = 'SEMANAL' THEN $3::text END AS "semana"
       FROM ${g}."missoes" m
       JOIN ${this.u}."encontro_realizacoes" r ON r."encontro_id" = $5
       WHERE m."ciclo" = $4 AND m."requisito" = 'ENCONTRO'
         AND ${sqlMissaoVisivel('m')} AND ${publico}
         AND r."realizado_em" >= GREATEST(m."inicio", m."publicada_em",
           CASE WHEN m."tipo" = 'SEMANAL' THEN $3::date::timestamp AT TIME ZONE 'America/Sao_Paulo' END)
         AND (${sqlProgresso('m', this.u)}) >= m."quantidade"
         AND NOT EXISTS (
           SELECT 1 FROM ${g}."missoes_conclusoes" c
           WHERE c."missao_id" = m."id" AND c."usuario_id" = $1 AND c."ciclo" = $4
             AND c."semana" IS NOT DISTINCT FROM
               (CASE WHEN m."tipo" = 'SEMANAL' THEN $3::date END)
         )
       ORDER BY m."xp" DESC, m."id" FOR SHARE OF m`,
      [usuarioId, '', semana, ciclo, encontroId],
    )) as MissaoDeEncontro[];
  }

  async registrarMissoesDeEncontro(
    qr: QueryRunner,
    usuarioId: number,
    encontroId: string,
    missoes: readonly MissaoDeEncontro[],
    recompensar: boolean,
    regra: RegraVigente | null,
  ): Promise<void> {
    for (const [indice, missao] of missoes.entries()) {
      const ganho =
        recompensar && indice === 0
          ? await this.creditarMissao(qr, usuarioId, missao, missao.semana)
          : null;
      await this.registrarConclusao(
        qr,
        usuarioId,
        missao,
        missao.semana,
        ganho,
        {
          requisito: 'ENCONTRO',
          encontroId,
          atual: missao.quantidade,
          meta: missao.quantidade,
          ...(regra && {
            regraXpId: regra.regraId,
            regraXpVersao: regra.versao,
          }),
        },
      );
    }
  }

  async dentroDoLimiteDaRegra(
    executor: Pick<DataSource, 'query'>,
    usuarioId: number,
    ciclo: string,
    regra: RegraVigente,
  ): Promise<boolean> {
    if (regra.limiteRepeticoes === null) return true;
    const [{ total }] = (await executor.query(
      `SELECT count(*)::int AS total FROM ${g}."missoes_conclusoes"
       WHERE "usuario_id" = $1 AND "ciclo" = $2 AND "evidencia"->>'regraXpId' = $3 AND "xp_creditado" > 0`,
      [usuarioId, ciclo, String(regra.regraId)],
    )) as Array<{ total: number }>;
    return total < regra.limiteRepeticoes;
  }

  private async xpDaMissaoDePucStop(
    qr: QueryRunner,
    usuarioId: number,
    missao: { id: string; ciclo: string; xp: number },
    meta: number,
  ): Promise<{ xp: number; coletaId: string }> {
    const [coleta] = (await qr.query(
      `SELECT c."id"::text AS id, c."xp" FROM ${g}."pucstop_coletas" c
       JOIN ${g}."missoes" m ON m."id" = $2 AND c."ciclo" = m."ciclo"
       WHERE c."usuario_id" = $1 AND (m."pucstops" IS NULL OR c."pucstop_id" = ANY(m."pucstops"))
       ORDER BY c."coletado_em", c."id" LIMIT 1 OFFSET $3`,
      [usuarioId, missao.id, meta - 1],
    )) as Array<{ id: string; xp: number }>;
    const acoes = ['VISITA_PUCSTOP', 'MISSAO_PUCSTOPS'] as const;
    const regras = await this.regrasXp.configuracoesVigentes(acoes, qr);
    const combina = regras.some((r) =>
      r.combinavelCom.includes(r.acao === acoes[0] ? acoes[1] : acoes[0]),
    );
    const [{ jaCreditado }] = (await qr.query(
      `SELECT COALESCE(sum("xp_creditado"), 0)::int AS "jaCreditado" FROM ${g}."missoes_conclusoes"
       WHERE "usuario_id" = $1 AND "ciclo" = $2 AND "evidencia"->>'coletaId' = $3`,
      [usuarioId, missao.ciclo, coleta.id],
    )) as Array<{ jaCreditado: number }>;
    return {
      xp: Math.max(0, missao.xp - (combina ? 0 : coleta.xp) - jaCreditado),
      coletaId: coleta.id,
    };
  }

  private creditarMissao(
    qr: QueryRunner,
    usuarioId: number,
    missao: { id: string; titulo: string; xp: number; ciclo: string },
    semana: string | null,
  ) {
    return creditarGanho(qr, {
      usuarioId,
      fonte: 'MISSAO',
      xp: missao.xp,
      recorrenteSemanal: semana !== null,
      ciclo: missao.ciclo,
      referenciaTipo: semana ? 'MISSAO_SEMANAL' : 'MISSAO',
      referenciaId: missao.id,
      descricao: `Missão: ${missao.titulo}`.slice(0, 200),
      chaveIdempotencia: chaveConclusao(
        missao.id,
        usuarioId,
        semana ?? missao.ciclo,
      ),
    });
  }

  private async registrarConclusao(
    qr: QueryRunner,
    usuarioId: number,
    missao: { id: string; xp: number; ciclo: string },
    semana: string | null,
    ganho: GanhoCreditado | null,
    evidencia: Record<string, unknown>,
  ) {
    const [conclusao] = (await qr.query(
      `INSERT INTO ${g}."missoes_conclusoes" ("missao_id", "usuario_id", "ciclo", "semana", "xp_configurado", "xp_creditado", "movimentacao_id", "evidencia") ` +
        `VALUES ($1, $2, $3, $4::date, $5, $6, $7, $8::jsonb) RETURNING "id", "criado_em"`,
      [
        missao.id,
        usuarioId,
        missao.ciclo,
        semana,
        missao.xp,
        ganho?.xp ?? 0,
        ganho?.movimentacao?.movimentacaoId ?? null,
        JSON.stringify(evidencia),
      ],
    )) as Array<{ id: string; criado_em: Date }>;
    return conclusao;
  }

  private async concluirNaTransacao(
    usuarioId: number,
    missaoId: string,
    agora: Date,
    leitura: LeituraConclusao,
    acesso: AcessoMissoes,
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
        `SELECT "id", "titulo", "tipo", "xp", "ativa", "ciclo", "inicio", "fim", "requisito", "quantidade", "alvo_id", "codigo", ` +
          `("inicio" IS NULL OR "inicio" <= now()) AS iniciou, ("fim" IS NULL OR "fim" > now()) AS aberta, ` +
          `COALESCE("codigo_liberado_ate" > now(), false) AS codigo_liberado, ` +
          `${sqlMissaoAlcancavel(`${g}."missoes"`, acesso)} AS alcancavel ` +
          `FROM ${g}."missoes" WHERE "id" = $1 FOR SHARE`,
        [missaoId],
      )) as Array<
        MissaoParaVerificar & {
          titulo: string;
          tipo: TipoMissao;
          xp: number;
          ativa: boolean;
          ciclo: string;
          inicio: Date | null;
          fim: Date | null;
          iniciou: boolean;
          aberta: boolean;
          alcancavel: boolean;
        }
      >;
      if (
        !missao ||
        !missao.ativa ||
        !missao.requisito ||
        !missao.alcancavel ||
        missao.ciclo !== ciclo
      ) {
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
      const semanaAtual = semanaDe(agora);
      const semana = semanal ? semanaAtual : null;
      const [anterior] = (await qr.query(
        semanal
          ? `SELECT "id", "xp_creditado", "criado_em" FROM ${g}."missoes_conclusoes" WHERE "missao_id" = $1 AND "usuario_id" = $2 AND "semana" = $3::date`
          : `SELECT "id", "xp_creditado", "criado_em" FROM ${g}."missoes_conclusoes" WHERE "missao_id" = $1 AND "usuario_id" = $2 AND "ciclo" = $3 AND "semana" IS NULL`,
        [missao.id, usuarioId, semanal ? semana : ciclo],
      )) as ConclusaoAnterior[];
      if (anterior) throw jaConcluida(missao.tipo, anterior);
      if (missao.requisito === 'ENCONTRO') {
        throw recusa(
          'presenca-necessaria',
          'Confirme a presença pelo encontro para concluir esta missão.',
        );
      }

      let evidencia: Record<string, unknown>;
      let xp = missao.xp;
      const conferirCodigo = async () => {
        exigirCodigoLiberado(missao);
        await exigirTentativasDeCodigo(qr, missao.id, usuarioId);
        try {
          verificarCodigo(missao, leitura);
        } catch (erro) {
          if (erro instanceof CodigoErrado) {
            await qr.query(
              `INSERT INTO ${g}."missoes_tentativas_codigo" ("missao_id", "usuario_id") VALUES ($1, $2)`,
              [missao.id, usuarioId],
            );
            await qr.commitTransaction();
          }
          throw erro;
        }
      };
      if (missao.requisito === 'EVENTO') {
        const presenca = await verificarEvento(
          qr,
          await this.geo((sql, p) => qr.query(sql, p)),
          missao,
          leitura,
        );
        await conferirCodigo();
        evidencia = { ...presenca, codigo: true };
      } else if (missao.requisito === 'CODIGO') {
        await conferirCodigo();
        const codigoUsado = impressaoDoCodigo(missao.id, missao.codigo!);
        // Semanal de código: a coordenação troca o código a cada semana. O
        // mesmo código não vale de novo para quem já o usou.
        if (semanal) {
          const [repetido] = (await qr.query(
            `SELECT 1 FROM ${g}."missoes_conclusoes" WHERE "missao_id" = $1 AND "usuario_id" = $2 AND "evidencia"->>'codigoUsado' = $3 LIMIT 1`,
            [missao.id, usuarioId, codigoUsado],
          )) as unknown[];
          if (repetido) {
            throw recusa(
              'codigo-repetido',
              'Você já usou este código em outra semana. Digite o código desta semana.',
            );
          }
        }
        evidencia = { codigo: true, codigoUsado };
      } else {
        const email = await this.emailDe((s, p) => qr.query(s, p), usuarioId);
        const contagem = await verificarContagem(
          qr,
          this.u,
          missao,
          usuarioId,
          email,
          semanaAtual,
        );
        evidencia = contagem;
        if (missao.requisito === 'PUCSTOPS') {
          const recompensa = await this.xpDaMissaoDePucStop(
            qr,
            usuarioId,
            missao,
            contagem.meta,
          );
          xp = recompensa.xp;
          evidencia.coletaId = recompensa.coletaId;
        }
      }

      const [{ xp_acumulado: xpAntes }] = (await qr.query(
        `SELECT "xp_acumulado" FROM ${g}."xp_carteiras" WHERE "usuario_id" = $1`,
        [usuarioId],
      )) as Array<{ xp_acumulado: number }>;

      const ganho =
        xp > 0
          ? await this.creditarMissao(qr, usuarioId, { ...missao, xp }, semana)
          : null;
      const conclusao = await this.registrarConclusao(
        qr,
        usuarioId,
        missao,
        semana,
        ganho,
        {
          requisito: missao.requisito,
          ...evidencia,
        },
      );
      await qr.commitTransaction();
      this.logger.log(
        `conclusao missao=${missao.id} usuario=${usuarioId} ciclo=${ciclo} requisito=${missao.requisito} xp=${ganho?.xp ?? 0}/${missao.xp}`,
      );

      const xpAcumulado = ganho?.movimentacao?.xpAcumulado ?? xpAntes;
      const nivel = nivelDe(xpAcumulado);
      const subiuDeNivel = nivel.numero > nivelDe(xpAntes).numero;
      return {
        missaoId: missao.id,
        conclusaoId: conclusao.id,
        xpConfigurado: missao.xp,
        xp: ganho?.xp ?? 0,
        moedas: ganho?.moedas ?? 0,
        limitado: ganho?.limitado ?? false,
        teto: ganho?.teto === 'totens' ? null : (ganho?.teto ?? null),
        saldoMoedas: ganho?.movimentacao?.saldo ?? saldoAntes,
        xpAcumulado,
        nivel,
        subiuDeNivel,
        ciclo,
        semana,
        concluidaEm: conclusao.criado_em.toISOString(),
      };
    } catch (erro) {
      if (qr.isTransactionActive) await qr.rollbackTransaction();
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
