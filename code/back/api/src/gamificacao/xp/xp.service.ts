import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { ParticipacoesService } from '../../participacoes/participacoes.service.js';
import {
  celebracaoPara,
  confirmarCelebracao,
  nivelCelebrado,
} from '../celebracoes.js';
import { LIMITES, NIVEIS, nivelDe } from '../economia.js';
import { SCHEMA_GAMIFICACAO, type TipoMovimentacaoXp } from '../gamificacao.js';
import { usoDoCiclo } from '../ganhos.js';
import {
  LIMITE_MOVIMENTACOES_PADRAO,
  type MovimentacaoXpDto,
  type NivelTabelaDto,
  type XpResumoDto,
} from './xp.dto.js';

const g = `"${SCHEMA_GAMIFICACAO}"`;

/** Leitura do XP do próprio usuário. Escrita só por `registrarMovimentacao`. */
@Injectable()
export class XpService {
  constructor(private readonly dataSource: DataSource) {}

  /**
   * Progresso real do usuário. Funciona para ex-participantes também (só
   * leitura): o histórico e o nível são mantidos.
   */
  async resumo(usuarioId: number): Promise<XpResumoDto> {
    const ciclo = ParticipacoesService.programaAtual();
    const [[carteira], uso, celebrado] = await Promise.all([
      this.dataSource.query(
        `SELECT "saldo", "xp_acumulado", "atualizado_em" FROM ${g}."xp_carteiras" WHERE "usuario_id" = $1`,
        [usuarioId],
      ) as Promise<
        Array<{ saldo: number; xp_acumulado: number; atualizado_em: Date }>
      >,
      usoDoCiclo(this.dataSource, usuarioId, ciclo),
      nivelCelebrado(this.dataSource, usuarioId),
    ]);
    const moedas = carteira?.saldo ?? 0;
    const xpAcumulado = carteira?.xp_acumulado ?? 0;
    const nivel = nivelDe(xpAcumulado);
    return {
      saldo: moedas,
      moedas,
      xpAcumulado,
      nivel,
      ciclo,
      limites: {
        totens: { ganho: uso.totens, limite: LIMITES.totensPorCiclo },
        ciclo: { ganho: uso.geral, limite: LIMITES.geralPorCiclo },
      },
      atualizadoEm: carteira?.atualizado_em.toISOString() ?? null,
      celebracao: celebracaoPara(nivel.numero, celebrado),
    };
  }

  /**
   * O cliente exibiu a animação do nível `nivel`. Idempotente; nunca grava
   * acima do nível real nem concede XP, moedas ou recompensa.
   */
  confirmarCelebracao(usuarioId: number, nivel: number) {
    return confirmarCelebracao(this.dataSource, usuarioId, nivel);
  }

  /** Tabela pública dos níveis (os apps não guardam os limiares). */
  niveis(): NivelTabelaDto[] {
    return NIVEIS.map((n) => ({ ...n }));
  }

  async movimentacoes(
    usuarioId: number,
    limite = LIMITE_MOVIMENTACOES_PADRAO,
    antes?: number,
  ): Promise<MovimentacaoXpDto[]> {
    const linhas = (await this.dataSource.query(
      `SELECT "id", "quantidade", COALESCE("xp_quantidade", CASE WHEN "tipo" = 'RECOMPENSA' THEN 0 ELSE "quantidade" END) AS "xp", ` +
        `"tipo", "referencia_tipo", "referencia_id", "descricao", "saldo_apos", "criado_em" ` +
        `FROM ${g}."xp_movimentacoes" WHERE "usuario_id" = $1 AND ($2::bigint IS NULL OR "id" < $2) ` +
        `ORDER BY "id" DESC LIMIT $3`,
      [usuarioId, antes ?? null, limite],
    )) as Array<{
      id: string;
      quantidade: number;
      xp: number;
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
      xp: l.xp,
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
