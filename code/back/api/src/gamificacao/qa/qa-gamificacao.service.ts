import { Injectable, NotFoundException } from '@nestjs/common';
import { ParticipacoesService } from '../../participacoes/participacoes.service.js';
import { LIMITES, NIVEIS, nivelDe } from '../economia.js';
import type { NivelTabelaDto, XpResumoDto } from '../xp/xp.dto.js';

/** `GET /qa/gamificacao/acesso`: o painel está liberado e a tabela real. */
export interface AcessoQaGamificacaoDto {
  habilitado: true;
  niveis: NivelTabelaDto[];
}

/**
 * Perfil simulado: mesmo formato de `GET /me/xp`, marcado como simulação.
 * Calculado em memória pelas mesmas regras (`nivelDe`); nada é gravado.
 */
export interface SimulacaoGamificacaoDto extends XpResumoDto {
  simulado: true;
}

/** Progresso padrão da barra na simulação (meio do nível). */
export const PROGRESSO_SIMULADO_PADRAO = 50;

@Injectable()
export class QaGamificacaoService {
  acesso(): AcessoQaGamificacaoDto {
    return { habilitado: true, niveis: NIVEIS.map((n) => ({ ...n })) };
  }

  /**
   * XP que põe a barra do nível em `progresso`% (0–100). No nível máximo
   * qualquer XP a partir do mínimo vale; usa o mínimo + `progresso`.
   */
  xpSimulado(numero: number, progresso = PROGRESSO_SIMULADO_PADRAO): number {
    const i = NIVEIS.findIndex((n) => n.numero === numero);
    if (i < 0) throw new NotFoundException('Nível não encontrado.');
    const atual = NIVEIS[i];
    const proximo = NIVEIS[i + 1];
    const p = Math.min(100, Math.max(0, Math.floor(progresso)));
    if (!proximo) return atual.xpMinimo + p;
    const tamanho = proximo.xpMinimo - atual.xpMinimo;
    return atual.xpMinimo + Math.min(tamanho - 1, Math.floor((tamanho * p) / 100));
  }

  simular(numero: number, progresso?: number): SimulacaoGamificacaoDto {
    const xpAcumulado = this.xpSimulado(numero, progresso);
    const nivel = nivelDe(xpAcumulado);
    return {
      simulado: true,
      // Simulação sem resgates: moedas = XP (proporção 1:1 dos ganhos).
      saldo: xpAcumulado,
      moedas: xpAcumulado,
      xpAcumulado,
      nivel,
      ciclo: ParticipacoesService.programaAtual(),
      limites: {
        totens: { ganho: 0, limite: LIMITES.totensPorCiclo },
        ciclo: { ganho: 0, limite: LIMITES.geralPorCiclo },
      },
      atualizadoEm: null,
      // Nunca dispara a celebração automática: a animação no painel é manual.
      celebracao: null,
    };
  }
}
