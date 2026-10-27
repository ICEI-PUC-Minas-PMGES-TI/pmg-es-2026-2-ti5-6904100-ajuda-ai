import { randomUUID } from 'node:crypto';
import {
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { DataSource } from 'typeorm';
import {
  registrarMovimentacao,
  SaldoInsuficienteError,
  travarCarteira,
} from '../gamificacao.js';
import type { CriarRecompensaDto } from './lojinha.dto.js';

const g = '"gamificacao"';

export interface Recompensa {
  id: string;
  nome: string;
  descricao: string;
  custoXp: number;
  estoque: number | null;
  condicoesRetirada: string;
  publicada: boolean;
}

export interface Resgate {
  id: string;
  recompensaId: string;
  nome: string;
  descricao: string;
  custoXp: number;
  condicoesRetirada: string;
  criadoEm: Date;
  saldoApos: number;
}

@Injectable()
export class LojinhaService {
  constructor(private readonly db: DataSource) {}

  listar(publicadasApenas = true): Promise<Recompensa[]> {
    return this.db.query(
      `SELECT "id", "nome", "descricao", "custo_xp" AS "custoXp", "estoque", ` +
        `"condicoes_retirada" AS "condicoesRetirada", "publicada" ` +
        `FROM ${g}."recompensas" ${publicadasApenas ? 'WHERE "publicada"' : ''} ORDER BY "nome", "id"`,
    ) as Promise<Recompensa[]>;
  }

  async criar(dados: CriarRecompensaDto): Promise<Recompensa> {
    const [recompensa] = (await this.db.query(
      `INSERT INTO ${g}."recompensas" ` +
        `("nome", "descricao", "custo_xp", "estoque", "condicoes_retirada") ` +
        `VALUES ($1, $2, $3, $4, $5) RETURNING "id", "nome", "descricao", ` +
        `"custo_xp" AS "custoXp", "estoque", "condicoes_retirada" AS "condicoesRetirada", "publicada"`,
      [
        dados.nome.trim(),
        dados.descricao.trim(),
        dados.custoXp,
        dados.estoque ?? null,
        dados.condicoesRetirada.trim(),
      ],
    )) as Recompensa[];
    return recompensa;
  }

  async publicar(id: string, publicada: boolean): Promise<Recompensa> {
    const [recompensa] = (await this.db.query(
      `UPDATE ${g}."recompensas" SET "publicada" = $2, "atualizada_em" = now() ` +
        `WHERE "id" = $1 RETURNING "id", "nome", "descricao", ` +
        `"custo_xp" AS "custoXp", "estoque", "condicoes_retirada" AS "condicoesRetirada", "publicada"`,
      [id, publicada],
    )) as Recompensa[];
    if (!recompensa) throw new NotFoundException('Recompensa não encontrada.');
    return recompensa;
  }

  historico(usuarioId: number): Promise<Resgate[]> {
    return this.db.query(
      `SELECT r."id", r."recompensa_id" AS "recompensaId", r."nome", r."descricao", ` +
        `r."custo_xp" AS "custoXp", r."condicoes_retirada" AS "condicoesRetirada", ` +
        `r."criado_em" AS "criadoEm", m."saldo_apos" AS "saldoApos" ` +
        `FROM ${g}."resgates" r JOIN ${g}."xp_movimentacoes" m ON m."id" = r."movimentacao_id" ` +
        `WHERE r."usuario_id" = $1 ORDER BY r."criado_em" DESC, r."id" DESC`,
      [usuarioId],
    ) as Promise<Resgate[]>;
  }

  /** Carteira e recompensa são travadas até o commit; toda falha desfaz débito e estoque. */
  async resgatar(
    usuarioId: number,
    recompensaId: string,
    chave: string,
  ): Promise<Resgate & { saldoAtual: number }> {
    const qr = this.db.createQueryRunner();
    await qr.connect();
    await qr.startTransaction();
    try {
      const saldoAtual = await travarCarteira(qr, usuarioId);
      const [anterior] = (await qr.query(
        `SELECT r."id", r."recompensa_id" AS "recompensaId", r."nome", r."descricao", ` +
          `r."custo_xp" AS "custoXp", r."condicoes_retirada" AS "condicoesRetirada", ` +
          `r."criado_em" AS "criadoEm", m."saldo_apos" AS "saldoApos" ` +
          `FROM ${g}."resgates" r JOIN ${g}."xp_movimentacoes" m ON m."id" = r."movimentacao_id" ` +
          `WHERE r."usuario_id" = $1 AND r."chave_idempotencia" = $2`,
        [usuarioId, chave],
      )) as Resgate[];
      if (anterior) {
        if (anterior.recompensaId !== recompensaId) {
          throw new ConflictException('Chave já usada para outra recompensa.');
        }
        await qr.commitTransaction();
        return { ...anterior, saldoAtual };
      }

      const [item] = (await qr.query(
        `SELECT "id", "nome", "descricao", "custo_xp" AS "custoXp", "estoque", ` +
          `"condicoes_retirada" AS "condicoesRetirada", "publicada" ` +
          `FROM ${g}."recompensas" WHERE "id" = $1 FOR UPDATE`,
        [recompensaId],
      )) as Recompensa[];
      if (!item || !item.publicada)
        throw new NotFoundException('Recompensa indisponível.');
      if (item.estoque !== null && item.estoque <= 0) {
        throw new ConflictException('Recompensa esgotada.');
      }

      const id = randomUUID();
      let movimento;
      try {
        movimento = await registrarMovimentacao(qr, {
          usuarioId,
          quantidade: -item.custoXp,
          tipo: 'RECOMPENSA',
          referenciaTipo: 'RESGATE',
          referenciaId: id,
          descricao: `Resgate: ${item.nome}`.slice(0, 200),
          chaveIdempotencia: `resgate:${usuarioId}:${chave}`,
        });
      } catch (erro) {
        if (erro instanceof SaldoInsuficienteError) {
          throw new UnprocessableEntityException('Saldo de XP insuficiente.');
        }
        throw erro;
      }
      if (item.estoque !== null) {
        await qr.query(
          `UPDATE ${g}."recompensas" SET "estoque" = "estoque" - 1, "atualizada_em" = now() WHERE "id" = $1`,
          [recompensaId],
        );
      }
      const [resgate] = (await qr.query(
        `INSERT INTO ${g}."resgates" ` +
          `("id", "usuario_id", "recompensa_id", "movimentacao_id", "chave_idempotencia", "nome", "descricao", "custo_xp", "condicoes_retirada") ` +
          `VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) ` +
          `RETURNING "id", "recompensa_id" AS "recompensaId", "nome", "descricao", "custo_xp" AS "custoXp", ` +
          `"condicoes_retirada" AS "condicoesRetirada", "criado_em" AS "criadoEm"`,
        [
          id,
          usuarioId,
          recompensaId,
          movimento.movimentacaoId,
          chave,
          item.nome,
          item.descricao,
          item.custoXp,
          item.condicoesRetirada,
        ],
      )) as Resgate[];
      await qr.commitTransaction();
      return {
        ...resgate,
        saldoApos: movimento.saldo,
        saldoAtual: movimento.saldo,
      };
    } catch (erro) {
      await qr.rollbackTransaction();
      throw erro;
    } finally {
      await qr.release();
    }
  }
}
