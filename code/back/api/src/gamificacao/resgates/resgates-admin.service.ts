import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { DataSource, type QueryRunner } from 'typeorm';
import {
  ehViolacaoUnica,
  registrarMovimentacao,
  type ResponsavelCoordenacao,
  schemaUsuarios,
  travarCarteira,
} from '../gamificacao.js';
import type {
  ListarResgatesQuery,
  ResgateAdminDto,
} from './resgates-admin.dto.js';
import {
  chaveEstorno,
  COLUNAS_SITUACAO,
  type DesfechoResgate,
  type SituacaoResgate,
} from './resgates.js';

const g = '"gamificacao"';
/** Teto da listagem; a coordenação filtra por situação, programa ou busca. */
const LIMITE_LISTA = 200;

interface Linha {
  id: string;
  codigo: string;
  situacao: SituacaoResgate;
  usuarioId: number;
  nome: string;
  email: string;
  recompensaId: string;
  recompensaNome: string;
  versao: number;
  programaCodigo: string | null;
  custoXp: number;
  condicoesRetirada: string;
  resgatadoEm: Date;
  entregueEm: Date | null;
  canceladoEm: Date | null;
  motivoCancelamento: string | null;
  responsavelId: number | null;
  responsavelEmail: string | null;
}

function paraDto(l: Linha): ResgateAdminDto {
  const iso = (d: Date | null) => (d ? new Date(d).toISOString() : null);
  return {
    id: l.id,
    codigo: l.codigo,
    situacao: l.situacao,
    participante: { id: l.usuarioId, nome: l.nome, email: l.email },
    recompensa: {
      id: l.recompensaId,
      nome: l.recompensaNome,
      versao: l.versao,
      programaCodigo: l.programaCodigo,
    },
    custoXp: l.custoXp,
    condicoesRetirada: l.condicoesRetirada,
    resgatadoEm: new Date(l.resgatadoEm).toISOString(),
    entregueEm: iso(l.entregueEm),
    canceladoEm: iso(l.canceladoEm),
    motivoCancelamento: l.motivoCancelamento,
    responsavel:
      l.situacao === 'aguardando_entrega'
        ? null
        : { id: l.responsavelId, email: l.responsavelEmail },
  };
}

/**
 * Acompanhamento dos resgates pela coordenação (F29): entrega e cancelamento
 * administrativo. O resgate em si nunca muda (tabela só de inserção); o
 * desfecho é uma linha em `resgate_desfechos`, no máximo uma por resgate.
 *
 * Cancelar devolve o XP (movimentação `RECOMPENSA` positiva, chave
 * `estorno:<id>`) e a unidade comprometida, tudo na mesma transação. A
 * carteira é travada antes do resgate e da recompensa, na mesma ordem do
 * resgate do aluno.
 */
@Injectable()
export class ResgatesAdminService {
  private readonly logger = new Logger(ResgatesAdminService.name);

  constructor(private readonly db: DataSource) {}

  private select(): string {
    const u = schemaUsuarios(this.db);
    return (
      `SELECT r."id", r."codigo", r."usuario_id" AS "usuarioId", us."nome", us."email", ` +
      `r."recompensa_id" AS "recompensaId", r."nome" AS "recompensaNome", r."versao", ` +
      `c."programa_codigo" AS "programaCodigo", r."custo_xp" AS "custoXp", ` +
      `r."condicoes_retirada" AS "condicoesRetirada", r."criado_em" AS "resgatadoEm", ` +
      `${COLUNAS_SITUACAO}, d."responsavel_id" AS "responsavelId", d."responsavel_email" AS "responsavelEmail" ` +
      `FROM ${g}."resgates" r ` +
      `JOIN ${u}."usuarios" us ON us."id" = r."usuario_id" ` +
      `JOIN ${g}."recompensas" c ON c."id" = r."recompensa_id" ` +
      `LEFT JOIN ${g}."resgate_desfechos" d ON d."resgate_id" = r."id" `
    );
  }

  async listar(filtros: ListarResgatesQuery): Promise<ResgateAdminDto[]> {
    const busca = filtros.busca?.trim();
    const linhas = (await this.db.query(
      `${this.select()} WHERE ` +
        `($1::text IS NULL OR COALESCE(d."tipo", 'aguardando_entrega') = $1) ` +
        `AND ($2::text IS NULL OR c."programa_codigo" = $2) ` +
        `AND ($3::uuid IS NULL OR r."recompensa_id" = $3) ` +
        `AND ($4::text IS NULL OR us."nome" ILIKE $4 OR us."email" ILIKE $4 OR r."codigo" = upper($5)) ` +
        `ORDER BY r."criado_em" DESC, r."id" DESC LIMIT ${LIMITE_LISTA}`,
      [
        filtros.situacao ?? null,
        filtros.programa ?? null,
        filtros.recompensaId ?? null,
        busca ? `%${busca.replace(/[\\%_]/g, (c) => `\\${c}`)}%` : null,
        busca ?? null,
      ],
    )) as Linha[];
    return linhas.map(paraDto);
  }

  async detalhe(id: string): Promise<ResgateAdminDto> {
    const [linha] = (await this.db.query(`${this.select()} WHERE r."id" = $1`, [
      id,
    ])) as Linha[];
    if (!linha) throw new NotFoundException('Resgate não encontrado.');
    return paraDto(linha);
  }

  async entregar(
    id: string,
    responsavel: ResponsavelCoordenacao,
  ): Promise<ResgateAdminDto> {
    await this.emTransacao(id, 'entregue', async (qr) => {
      await this.travarSemDesfecho(qr, id);
      await this.gravarDesfecho(qr, id, 'entregue', responsavel);
    });
    this.logger.log(`resgate entregue id=${id}`);
    return this.detalhe(id);
  }

  async cancelar(
    id: string,
    motivo: string,
    responsavel: ResponsavelCoordenacao,
  ): Promise<ResgateAdminDto> {
    await this.emTransacao(id, 'cancelado', async (qr) => {
      const [resgate] = (await qr.query(
        `SELECT "usuario_id" AS "usuarioId", "recompensa_id" AS "recompensaId", "custo_xp" AS "custoXp", "nome" ` +
          `FROM ${g}."resgates" WHERE "id" = $1`,
        [id],
      )) as Array<{
        usuarioId: number;
        recompensaId: string;
        custoXp: number;
        nome: string;
      }>;
      if (!resgate) throw new NotFoundException('Resgate não encontrado.');
      await travarCarteira(qr, resgate.usuarioId);
      await this.travarSemDesfecho(qr, id);
      await qr.query(
        `SELECT 1 FROM ${g}."recompensas" WHERE "id" = $1 FOR UPDATE`,
        [resgate.recompensaId],
      );
      const estorno = await registrarMovimentacao(qr, {
        usuarioId: resgate.usuarioId,
        quantidade: resgate.custoXp,
        tipo: 'RECOMPENSA',
        referenciaTipo: 'RESGATE',
        referenciaId: id,
        descricao: `Estorno: ${resgate.nome}`.slice(0, 200),
        chaveIdempotencia: chaveEstorno(id),
      });
      // Sem tocar em `atualizado_em` (marca só edições da coordenação).
      await qr.query(
        `UPDATE ${g}."recompensas" SET "estoque_comprometido" = "estoque_comprometido" - 1 WHERE "id" = $1`,
        [resgate.recompensaId],
      );
      await this.gravarDesfecho(
        qr,
        id,
        'cancelado',
        responsavel,
        motivo.trim(),
        estorno.movimentacaoId,
      );
    });
    this.logger.log(`resgate cancelado id=${id}`);
    return this.detalhe(id);
  }

  /** Trava o resgate e recusa se ele já foi entregue ou cancelado. */
  private async travarSemDesfecho(qr: QueryRunner, id: string): Promise<void> {
    const [linha] = (await qr.query(
      `SELECT r."id", d."tipo" FROM ${g}."resgates" r ` +
        `LEFT JOIN ${g}."resgate_desfechos" d ON d."resgate_id" = r."id" ` +
        `WHERE r."id" = $1 FOR UPDATE OF r`,
      [id],
    )) as Array<{ id: string; tipo: DesfechoResgate | null }>;
    if (!linha) throw new NotFoundException('Resgate não encontrado.');
    if (linha.tipo) throw this.jaConcluido(linha.tipo);
  }

  private jaConcluido(tipo: DesfechoResgate): ConflictException {
    return new ConflictException({
      statusCode: 409,
      message:
        tipo === 'entregue'
          ? 'Este resgate já foi entregue.'
          : 'Este resgate já foi cancelado.',
      motivo: tipo === 'entregue' ? 'resgate-entregue' : 'resgate-cancelado',
    });
  }

  private async gravarDesfecho(
    qr: QueryRunner,
    id: string,
    tipo: DesfechoResgate,
    responsavel: ResponsavelCoordenacao,
    motivo: string | null = null,
    estornoId: string | null = null,
  ): Promise<void> {
    await qr.query(
      `INSERT INTO ${g}."resgate_desfechos" ` +
        `("resgate_id", "tipo", "motivo", "movimentacao_estorno_id", "responsavel_id", "responsavel_email") ` +
        `VALUES ($1, $2, $3, $4, $5, $6)`,
      [id, tipo, motivo, estornoId, responsavel.id, responsavel.email],
    );
  }

  /**
   * Transação própria. Duas ações simultâneas no mesmo resgate esperam a
   * trava; se mesmo assim uma corrida chegar ao UNIQUE, vira 409.
   */
  private async emTransacao(
    id: string,
    tipo: DesfechoResgate,
    corpo: (qr: QueryRunner) => Promise<void>,
  ): Promise<void> {
    const qr = this.db.createQueryRunner();
    await qr.connect();
    await qr.startTransaction();
    try {
      await corpo(qr);
      await qr.commitTransaction();
    } catch (erro) {
      await qr.rollbackTransaction();
      if (
        ehViolacaoUnica(erro, 'uq_resgate_desfechos_resgate') ||
        ehViolacaoUnica(erro, 'uq_xp_movimentacoes_chave')
      ) {
        const [d] = (await this.db.query(
          `SELECT "tipo" FROM ${g}."resgate_desfechos" WHERE "resgate_id" = $1`,
          [id],
        )) as Array<{ tipo: DesfechoResgate }>;
        throw this.jaConcluido(d?.tipo ?? tipo);
      }
      throw erro;
    } finally {
      await qr.release();
    }
  }
}
