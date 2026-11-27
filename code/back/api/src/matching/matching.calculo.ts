import { alocarMatching } from './matching.algorithm.ts';
import type { ArestaMatching } from './matching.algorithm.ts';
import { pontuarPar } from './matching.pontuacao.ts';
import type { MetadadosPontuacao } from './matching.pontuacao.ts';
import { relatorioAlocacao } from './matching.relatorio.ts';
import type { ParticipacaoEntity } from '../participacoes/entities/participacao.entity.js';
import type { CriterioMatching } from './entities/matching.entity.js';

export interface EntradaCalculoMatching {
  padrinhos: ParticipacaoEntity[];
  apadrinhados: ParticipacaoEntity[];
  criterios: CriterioMatching[];
  metadata: MetadadosPontuacao;
  vinculos: Array<{
    padrinhoParticipacaoId: number;
    apadrinhadoParticipacaoId: number;
  }>;
  impedidos: Set<string>;
  usadosP: Map<number, number>;
  usadosA: Map<number, number>;
  capP: Map<number, number>;
  capA: Map<number, number>;
  capacidadePorPadrinho: number;
  capacidadePorApadrinhado: number;
}

/** Trabalho puramente computacional; nenhuma entidade ou conexão de banco é carregada. */
export function calcularMatching(entrada: EntradaCalculoMatching) {
  const {
    padrinhos,
    apadrinhados,
    criterios,
    metadata,
    vinculos,
    impedidos,
    capP,
    capA,
    usadosP,
    usadosA,
  } = entrada;
  const ativos = new Set(
    vinculos.map(
      (v) => `${v.padrinhoParticipacaoId}:${v.apadrinhadoParticipacaoId}`,
    ),
  );
  const avaliacoes = new Map<string, ReturnType<typeof pontuarPar>>();
  const adequadas: ArestaMatching[] = [];
  for (const p of padrinhos)
    for (const a of apadrinhados) {
      const chave = `${p.id}:${a.id}`;
      if (
        p.usuarioId === a.usuarioId ||
        ativos.has(chave) ||
        impedidos.has(chave)
      )
        continue;
      const resultado = pontuarPar(p, a, criterios, metadata);
      avaliacoes.set(chave, resultado);
      if (resultado.sugerivel)
        adequadas.push({
          padrinhoId: p.id,
          apadrinhadoId: a.id,
          score: resultado.score,
        });
    }
  const alocacao = alocarMatching(adequadas, capP, capA, {
    ocupacaoPadrinhos: usadosP,
    ocupacaoApadrinhados: usadosA,
  });
  const relatorio = relatorioAlocacao({
    ...entrada,
    alocacao,
    avaliacoes,
    paresRecusados: impedidos,
  });
  // Somente explicações dos pares escolhidos atravessam a thread.
  const explicacoes = new Map(
    alocacao.map((par) => {
      const chave = `${par.padrinhoId}:${par.apadrinhadoId}`;
      return [chave, avaliacoes.get(chave)!] as const;
    }),
  );
  return { alocacao, explicacoes, relatorio };
}
