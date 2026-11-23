import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { DataSource, type QueryRunner } from 'typeorm';
import { nivelDe } from '../economia.js';
import {
  AjusteForaDoLimiteError,
  ehViolacaoCheck,
  ehViolacaoUnica,
  registrarMovimentacao,
  type ResponsavelCoordenacao,
  SaldoInsuficienteError,
  SCHEMA_GAMIFICACAO,
  schemaUsuarios,
} from '../gamificacao.js';
import { normalizarJustificativa } from '../justificativa.js';
import { chaveAjusteXp, MOTIVO_AJUSTE_XP } from './ajustes-xp.js';
import type {
  AjustarXpDto,
  AjusteXpDto,
  ExtratoXpAdminDto,
  ParticipanteXpDto,
} from './xp-admin.dto.js';
import { XpService } from './xp.service.js';

const g = `"${SCHEMA_GAMIFICACAO}"`;
const LIMITE_LISTA = 50;

interface LinhaAjuste {
  id: string;
  chaveIdempotencia: string;
  usuarioId: number;
  quantidade: number;
  motivo: string;
  responsavelId: number | null;
  responsavelEmail: string | null;
  saldoApos: number;
  criadoEm: Date;
}

interface ResultadoAjuste {
  ajuste: AjusteXpDto;
  saldo: number;
  xpAcumulado: number;
}

const AJUSTE =
  `SELECT a."id", a."chave_idempotencia" AS "chaveIdempotencia", a."usuario_id" AS "usuarioId", ` +
  `a."quantidade", a."motivo", ` +
  `a."responsavel_id" AS "responsavelId", a."responsavel_email" AS "responsavelEmail", ` +
  `m."saldo_apos" AS "saldoApos", a."criado_em" AS "criadoEm" ` +
  `FROM ${g}."xp_ajustes" a JOIN ${g}."xp_movimentacoes" m ON m."id" = a."movimentacao_id" `;

function ajusteDto(l: LinhaAjuste): AjusteXpDto {
  return {
    id: l.id,
    chaveIdempotencia: l.chaveIdempotencia,
    quantidade: l.quantidade,
    motivo: l.motivo,
    responsavel: { id: l.responsavelId, email: l.responsavelEmail },
    saldoApos: l.saldoApos,
    criadoEm: new Date(l.criadoEm).toISOString(),
  };
}

/** A chave já foi usada por um ajuste com outros dados. */
function chaveReutilizada(): ConflictException {
  return new ConflictException({
    statusCode: 409,
    message:
      'Esta chave já foi usada em outro ajuste (participante, quantidade ou motivo diferentes).',
    motivo: 'chave-reutilizada',
  });
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
      `SELECT u."id", u."nome", u."email", COALESCE(c."saldo", 0) AS "moedas", ` +
        `COALESCE(c."xp_acumulado", 0) AS "xpAcumulado", c."atualizado_em" AS "atualizadoEm" ` +
        `FROM ${schemaUsuarios(this.db)}."usuarios" u ` +
        `LEFT JOIN ${g}."xp_carteiras" c ON c."usuario_id" = u."id" ` +
        `WHERE ($1::text IS NULL OR u."nome" ILIKE $1 OR u."email" ILIKE $1) ` +
        `ORDER BY u."nome", u."id" LIMIT ${LIMITE_LISTA}`,
      [termo ? `%${termo.replace(/[\\%_]/g, (c) => `\\${c}`)}%` : null],
    )) as Array<{
      id: number;
      nome: string;
      email: string;
      moedas: number;
      xpAcumulado: number;
      atualizadoEm: Date | null;
    }>;
    return linhas.map((l) => ({
      usuario: { id: l.id, nome: l.nome, email: l.email },
      moedas: l.moedas,
      xpAcumulado: l.xpAcumulado,
      nivel: nivelDe(l.xpAcumulado),
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
      this.xp.resumo(usuarioId),
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

  /**
   * Ajuste idempotente. A chave identifica uma intenção: mesmo participante,
   * quantidade e motivo (normalizado).
   *
   * 1. Trava por CHAVE (`pg_advisory_xact_lock`), antes de qualquer outra
   *    trava. A trava da carteira não basta: duas requisições com a mesma
   *    chave para participantes diferentes travariam carteiras distintas e
   *    as duas veriam a chave livre.
   * 2. Chave já usada: devolve o ajuste gravado se os dados coincidem; senão
   *    409 `chave-reutilizada`.
   * 3. Se ainda assim o UNIQUE do ledger ou de `xp_ajustes` disparar (rede de
   *    segurança), a resposta é a mesma do passo 2, nunca um 500. A consulta
   *    usa o mesmo QueryRunner, já fora da transação desfeita, sem pedir
   *    outra conexão ao pool.
   */
  async ajustar(
    usuarioId: number,
    dados: AjustarXpDto,
    responsavel: ResponsavelCoordenacao,
  ): Promise<ResultadoAjuste> {
    const pedido = {
      usuarioId,
      quantidade: dados.quantidade,
      motivo: normalizarJustificativa(dados.motivo),
      chave: dados.chaveIdempotencia,
    };
    const qr = this.db.createQueryRunner();
    await qr.connect();
    try {
      await qr.startTransaction();
      try {
        await qr.query(
          `SELECT pg_advisory_xact_lock(hashtextextended($1, 0))`,
          [chaveAjusteXp(pedido.chave)],
        );
        await this.usuario(qr, usuarioId);
        const anterior = await this.ajusteDaChave(qr, pedido.chave);
        const resultado = anterior
          ? await this.repetir(qr, anterior, pedido)
          : await this.ajustarNaTransacao(qr, pedido, responsavel);
        await qr.commitTransaction();
        return resultado;
      } catch (erro) {
        await qr.rollbackTransaction();
        throw erro;
      }
    } catch (erro) {
      if (
        ehViolacaoUnica(erro, 'uq_xp_movimentacoes_chave') ||
        ehViolacaoUnica(erro, 'uq_xp_ajustes_chave')
      ) {
        const anterior = await this.ajusteDaChave(qr, pedido.chave);
        if (anterior) return this.repetir(qr, anterior, pedido);
        throw chaveReutilizada();
      }
      // Rede de segurança: o DTO já recusa o motivo inválido com 400.
      if (ehViolacaoCheck(erro, 'ck_xp_ajustes_motivo')) {
        throw new BadRequestException(
          `motivo deve ter de ${MOTIVO_AJUSTE_XP.min} a ${MOTIVO_AJUSTE_XP.max} caracteres, sem contar espaços no início e no fim`,
        );
      }
      throw erro;
    } finally {
      await qr.release();
    }
  }

  private async ajusteDaChave(
    executor: Pick<QueryRunner, 'query'>,
    chave: string,
  ): Promise<LinhaAjuste | undefined> {
    const [linha] = (await executor.query(
      `${AJUSTE} WHERE a."chave_idempotencia" = $1`,
      [chave],
    )) as LinhaAjuste[];
    return linha;
  }

  /** Reenvio da mesma chave: devolve o ajuste já gravado, se for o mesmo pedido. */
  private async repetir(
    executor: Pick<QueryRunner, 'query'>,
    anterior: LinhaAjuste,
    pedido: { usuarioId: number; quantidade: number; motivo: string },
  ): Promise<ResultadoAjuste> {
    if (
      anterior.usuarioId !== pedido.usuarioId ||
      anterior.quantidade !== pedido.quantidade ||
      anterior.motivo !== pedido.motivo
    ) {
      throw chaveReutilizada();
    }
    const [carteira] = (await executor.query(
      `SELECT "saldo", "xp_acumulado" AS "xpAcumulado" FROM ${g}."xp_carteiras" WHERE "usuario_id" = $1`,
      [pedido.usuarioId],
    )) as Array<{ saldo: number; xpAcumulado: number }>;
    return {
      ajuste: ajusteDto(anterior),
      saldo: carteira.saldo,
      xpAcumulado: carteira.xpAcumulado,
    };
  }

  private async ajustarNaTransacao(
    qr: QueryRunner,
    pedido: {
      usuarioId: number;
      quantidade: number;
      motivo: string;
      chave: string;
    },
    responsavel: ResponsavelCoordenacao,
  ): Promise<ResultadoAjuste> {
    let movimento;
    try {
      movimento = await registrarMovimentacao(qr, {
        usuarioId: pedido.usuarioId,
        quantidade: pedido.quantidade,
        tipo: 'AJUSTE_ADMIN',
        referenciaTipo: 'AJUSTE',
        referenciaId: pedido.chave,
        descricao: `Ajuste da coordenação: ${pedido.motivo}`.slice(0, 200),
        chaveIdempotencia: chaveAjusteXp(pedido.chave),
      });
    } catch (erro) {
      if (erro instanceof SaldoInsuficienteError) {
        throw new UnprocessableEntityException({
          statusCode: 422,
          message:
            'O ajuste deixaria as moedas negativas. Informe um débito de no máximo o saldo atual.',
          motivo: 'saldo-insuficiente',
        });
      }
      if (ehViolacaoCheck(erro, 'ck_xp_carteiras_xp_acumulado')) {
        throw new UnprocessableEntityException({
          statusCode: 422,
          message:
            'O ajuste deixaria o XP acumulado negativo. Informe um débito de no máximo o XP atual.',
          motivo: 'xp-insuficiente',
        });
      }
      if (erro instanceof AjusteForaDoLimiteError) {
        throw new UnprocessableEntityException({
          statusCode: 422,
          message: erro.message,
          motivo: 'ajuste-fora-do-limite',
        });
      }
      throw erro;
    }
    const [linha] = (await qr.query(
      `INSERT INTO ${g}."xp_ajustes" ` +
        `("usuario_id", "movimentacao_id", "quantidade", "motivo", "chave_idempotencia", "responsavel_id", "responsavel_email") ` +
        `VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING "id"`,
      [
        pedido.usuarioId,
        movimento.movimentacaoId,
        pedido.quantidade,
        pedido.motivo,
        pedido.chave,
        responsavel.id,
        responsavel.email,
      ],
    )) as Array<{ id: string }>;
    this.logger.log(
      `ajuste de XP usuario=${pedido.usuarioId} quantidade=${pedido.quantidade} id=${linha.id}`,
    );
    const [ajuste] = (await qr.query(`${AJUSTE} WHERE a."id" = $1`, [
      linha.id,
    ])) as LinhaAjuste[];
    return {
      ajuste: ajusteDto(ajuste),
      saldo: movimento.saldo,
      xpAcumulado: movimento.xpAcumulado,
    };
  }
}
