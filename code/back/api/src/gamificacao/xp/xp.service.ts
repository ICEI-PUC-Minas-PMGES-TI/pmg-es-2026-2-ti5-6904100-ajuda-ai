import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { SCHEMA_GAMIFICACAO, type TipoMovimentacaoXp } from '../gamificacao.js';
import {
  LIMITE_MOVIMENTACOES_PADRAO,
  type MovimentacaoXpDto,
  type XpResumoDto,
} from './xp.dto.js';

const g = `"${SCHEMA_GAMIFICACAO}"`;

/** Leitura do XP do próprio usuário. Escrita só por `registrarMovimentacao`. */
@Injectable()
export class XpService {
  constructor(private readonly dataSource: DataSource) {}

  async resumo(usuarioId: number): Promise<XpResumoDto> {
    const [carteira] = (await this.dataSource.query(
      `SELECT "saldo", "atualizado_em" FROM ${g}."xp_carteiras" WHERE "usuario_id" = $1`,
      [usuarioId],
    )) as Array<{ saldo: number; atualizado_em: Date }>;
    return {
      saldo: carteira?.saldo ?? 0,
      atualizadoEm: carteira?.atualizado_em.toISOString() ?? null,
    };
  }

  async movimentacoes(
    usuarioId: number,
    limite = LIMITE_MOVIMENTACOES_PADRAO,
    antes?: number,
  ): Promise<MovimentacaoXpDto[]> {
    const linhas = (await this.dataSource.query(
      `SELECT "id", "quantidade", "tipo", "referencia_tipo", "referencia_id", "descricao", "saldo_apos", "criado_em" ` +
        `FROM ${g}."xp_movimentacoes" WHERE "usuario_id" = $1 AND ($2::bigint IS NULL OR "id" < $2) ` +
        `ORDER BY "id" DESC LIMIT $3`,
      [usuarioId, antes ?? null, limite],
    )) as Array<{
      id: string;
      quantidade: number;
      tipo: TipoMovimentacaoXp;
      referencia_tipo: string | null;
      referencia_id: string | null;
      descricao: string;
      saldo_apos: number;
      criado_em: Date;
    }>;
    return linhas.map((l) => ({
      id: String(l.id),
      quantidade: l.quantidade,
      tipo: l.tipo,
      referencia:
        l.referencia_tipo && l.referencia_id
          ? { tipo: l.referencia_tipo, id: l.referencia_id }
          : null,
      descricao: l.descricao,
      saldoApos: l.saldo_apos,
      criadoEm: l.criado_em.toISOString(),
    }));
  }
}
