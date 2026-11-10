import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { DataSource, type QueryRunner } from 'typeorm';
import {
  registrarMovimentacao,
  type ResponsavelCoordenacao,
  SaldoInsuficienteError,
  SCHEMA_GAMIFICACAO,
  schemaUsuarios,
  travarCarteira,
} from '../gamificacao.js';
import { chaveAjusteXp } from './ajustes-xp.js';
import type {
  AjustarXpDto,
  AjusteXpDto,
  ExtratoXpAdminDto,
  ParticipanteXpDto,
} from './xp-admin.dto.js';
import { resumoXp, XpService } from './xp.service.js';

const g = `"${SCHEMA_GAMIFICACAO}"`;
const LIMITE_LISTA = 50;

interface LinhaAjuste {
  id: string;
  usuarioId: number;
  quantidade: number;
  motivo: string;
  responsavelId: number | null;
  responsavelEmail: string | null;
  saldoApos: number;
  criadoEm: Date;
}

const AJUSTE =
  `SELECT a."id", a."usuario_id" AS "usuarioId", a."quantidade", a."motivo", ` +
  `a."responsavel_id" AS "responsavelId", a."responsavel_email" AS "responsavelEmail", ` +
  `m."saldo_apos" AS "saldoApos", a."criado_em" AS "criadoEm" ` +
  `FROM ${g}."xp_ajustes" a JOIN ${g}."xp_movimentacoes" m ON m."id" = a."movimentacao_id" `;

function ajusteDto(l: LinhaAjuste): AjusteXpDto {
  return {
    id: l.id,
    quantidade: l.quantidade,
    motivo: l.motivo,
    responsavel: { id: l.responsavelId, email: l.responsavelEmail },
    saldoApos: l.saldoApos,
    criadoEm: new Date(l.criadoEm).toISOString(),
  };
}

/**
 * XP dos participantes visto pela coordenação (F26): saldo, totais, extrato
 * e ajustes manuais justificados. O ajuste entra no ledger como
 * `AJUSTE_ADMIN` (que nunca é apagado nem editado); `xp_ajustes` guarda o
 * motivo e quem fez. Corrigir um ajuste errado é fazer outro ajuste.
 */
@Injectable()
export class XpAdminService {
  private readonly logger = new Logger(XpAdminService.name);

  constructor(
    private readonly db: DataSource,
    private readonly xp: XpService,
  ) {}

  private async usuario(
    executor: Pick<DataSource, 'query'>,
    usuarioId: number,
  ): Promise<{ id: number; nome: string; email: string }> {
    const [u] = (await executor.query(
      `SELECT "id", "nome", "email" FROM ${schemaUsuarios(this.db)}."usuarios" WHERE "id" = $1`,
      [usuarioId],
    )) as Array<{ id: number; nome: string; email: string }>;
    if (!u) throw new NotFoundException('Participante não encontrado.');
    return u;
  }

  async listar(busca?: string): Promise<ParticipanteXpDto[]> {
    const termo = busca?.trim();
    const linhas = (await this.db.query(
      `SELECT u."id", u."nome", u."email", COALESCE(c."saldo", 0) AS "saldo", c."atualizado_em" AS "atualizadoEm", ` +
        `COALESCE((SELECT sum(m."quantidade") FROM ${g}."xp_movimentacoes" m ` +
        `WHERE m."usuario_id" = u."id" AND m."tipo" = 'RECOMPENSA'), 0)::int AS "trocas" ` +
        `FROM ${schemaUsuarios(this.db)}."usuarios" u ` +
        `LEFT JOIN ${g}."xp_carteiras" c ON c."usuario_id" = u."id" ` +
        `WHERE ($1::text IS NULL OR u."nome" ILIKE $1 OR u."email" ILIKE $1) ` +
        `ORDER BY u."nome", u."id" LIMIT ${LIMITE_LISTA}`,
      [termo ? `%${termo.replace(/[\\%_]/g, (c) => `\\${c}`)}%` : null],
    )) as Array<{
      id: number;
      nome: string;
      email: string;
      saldo: number;
      atualizadoEm: Date | null;
      trocas: number;
    }>;
    return linhas.map((l) => ({
      usuario: { id: l.id, nome: l.nome, email: l.email },
      saldo: l.saldo,
      totalGanho: l.saldo - l.trocas,
      totalGasto: -l.trocas,
      atualizadoEm: l.atualizadoEm
        ? new Date(l.atualizadoEm).toISOString()
        : null,
    }));
  }

  async extrato(
    usuarioId: number,
    limite?: number,
    antes?: number,
  ): Promise<ExtratoXpAdminDto> {
    const usuario = await this.usuario(this.db, usuarioId);
    const [resumo, movimentacoes, ajustes] = await Promise.all([
      resumoXp(this.db, usuarioId),
      this.xp.movimentacoes(usuarioId, limite, antes),
      this.db.query(
        `${AJUSTE} WHERE a."usuario_id" = $1 ORDER BY a."criado_em" DESC, a."id" DESC`,
        [usuarioId],
      ) as Promise<LinhaAjuste[]>,
    ]);
    return {
      usuario,
      ...resumo,
      movimentacoes,
      ajustes: ajustes.map(ajusteDto),
    };
  }

  async ajustar(
    usuarioId: number,
    dados: AjustarXpDto,
    responsavel: ResponsavelCoordenacao,
  ): Promise<{ ajuste: AjusteXpDto; saldo: number }> {
    const qr = this.db.createQueryRunner();
    await qr.connect();
    await qr.startTransaction();
    try {
      await this.usuario(qr, usuarioId);
      const resultado = await this.ajustarNaTransacao(
        qr,
        usuarioId,
        dados,
        responsavel,
      );
      await qr.commitTransaction();
      return resultado;
    } catch (erro) {
      await qr.rollbackTransaction();
      throw erro;
    } finally {
      await qr.release();
    }
  }

  private async ajustarNaTransacao(
    qr: QueryRunner,
    usuarioId: number,
    dados: AjustarXpDto,
    responsavel: ResponsavelCoordenacao,
  ): Promise<{ ajuste: AjusteXpDto; saldo: number }> {
    const motivo = dados.motivo.trim();
    let movimento;
    try {
      // Trava a carteira antes de procurar a chave: um reenvio simultâneo
      // espera o primeiro terminar e então encontra o ajuste já gravado.
      movimento = await registrarMovimentacaoOuAnterior(qr, {
        usuarioId,
        quantidade: dados.quantidade,
        tipo: 'AJUSTE_ADMIN',
        referenciaTipo: 'AJUSTE',
        referenciaId: dados.chaveIdempotencia,
        descricao: `Ajuste da coordenação: ${motivo}`.slice(0, 200),
        chaveIdempotencia: chaveAjusteXp(dados.chaveIdempotencia),
      });
    } catch (erro) {
      if (erro instanceof SaldoInsuficienteError) {
        throw new UnprocessableEntityException({
          statusCode: 422,
          message:
            'O ajuste deixaria o saldo negativo. Informe um débito de no máximo o saldo atual.',
          motivo: 'saldo-insuficiente',
        });
      }
      throw erro;
    }
    if (movimento.anterior) {
      const [anterior] = (await qr.query(
        `${AJUSTE} WHERE a."chave_idempotencia" = $1`,
        [dados.chaveIdempotencia],
      )) as LinhaAjuste[];
      if (
        !anterior ||
        anterior.usuarioId !== usuarioId ||
        anterior.quantidade !== dados.quantidade
      ) {
        throw new ConflictException('Chave já usada em outro ajuste.');
      }
      return { ajuste: ajusteDto(anterior), saldo: movimento.saldo };
    }
    const [linha] = (await qr.query(
      `INSERT INTO ${g}."xp_ajustes" ` +
        `("usuario_id", "movimentacao_id", "quantidade", "motivo", "chave_idempotencia", "responsavel_id", "responsavel_email") ` +
        `VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING "id"`,
      [
        usuarioId,
        movimento.movimentacaoId,
        dados.quantidade,
        motivo,
        dados.chaveIdempotencia,
        responsavel.id,
        responsavel.email,
      ],
    )) as Array<{ id: string }>;
    this.logger.log(
      `ajuste de XP usuario=${usuarioId} quantidade=${dados.quantidade} id=${linha.id}`,
    );
    const [ajuste] = (await qr.query(`${AJUSTE} WHERE a."id" = $1`, [
      linha.id,
    ])) as LinhaAjuste[];
    return { ajuste: ajusteDto(ajuste), saldo: movimento.saldo };
  }
}

/**
 * Como `registrarMovimentacao`, mas se a chave já existe no ledger devolve o
 * saldo atual com `anterior: true` em vez de lançar de novo.
 */
async function registrarMovimentacaoOuAnterior(
  qr: QueryRunner,
  m: Parameters<typeof registrarMovimentacao>[1],
): Promise<{
  movimentacaoId: string | null;
  saldo: number;
  anterior: boolean;
}> {
  const saldo = await travarCarteira(qr, m.usuarioId);
  const [existe] = (await qr.query(
    `SELECT 1 FROM ${g}."xp_movimentacoes" WHERE "chave_idempotencia" = $1`,
    [m.chaveIdempotencia],
  )) as unknown[];
  if (existe) return { movimentacaoId: null, saldo, anterior: true };
  const mov = await registrarMovimentacao(qr, m);
  return {
    movimentacaoId: mov.movimentacaoId,
    saldo: mov.saldo,
    anterior: false,
  };
}
