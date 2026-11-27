import type { ParticipacaoEntity } from '../participacoes/entities/participacao.entity.js';
import type { ArestaMatching } from './matching.algorithm.js';
import { POLITICA_MATCHING } from './matching.politica.ts';

interface AvaliacaoPar {
  score: number;
  sugerivel: boolean;
  explicacao: { motivo: string; pendencias: Array<{ nomePadrinho?: string }> };
}
const nome = (p: ParticipacaoEntity) => p.respostas?.nome || p.usuarioId;

export function relatorioAlocacao(entrada: {
  padrinhos: ParticipacaoEntity[];
  apadrinhados: ParticipacaoEntity[];
  usadosP: Map<number, number>;
  usadosA: Map<number, number>;
  capacidadePorPadrinho: number;
  capacidadePorApadrinhado: number;
  alocacao: ArestaMatching[];
  avaliacoes: Map<string, AvaliacaoPar>;
  paresRecusados?: Set<string>;
}) {
  const { padrinhos, apadrinhados, usadosP, usadosA, alocacao, avaliacoes } =
    entrada;
  const cargaPadrinhos = padrinhos.map((p) => {
    const confirmados = usadosP.get(p.id) ?? 0;
    const sugeridos = alocacao.filter((par) => par.padrinhoId === p.id).length;
    return {
      participacaoId: p.id,
      nome: nome(p),
      limite: entrada.capacidadePorPadrinho,
      confirmados,
      sugeridos,
      totalProjetado: confirmados + sugeridos,
      vagasRestantes: Math.max(
        0,
        entrada.capacidadePorPadrinho - confirmados - sugeridos,
      ),
    };
  });
  const semSugestao = apadrinhados
    .filter(
      (a) =>
        !(usadosA.get(a.id) ?? 0) &&
        !alocacao.some((par) => par.apadrinhadoId === a.id),
    )
    .map((a) => {
      const recusados = padrinhos.filter((p) =>
        entrada.paresRecusados?.has(`${p.id}:${a.id}`),
      ).length;
      const pares = padrinhos
        .map((p) => ({ p, avaliacao: avaliacoes.get(`${p.id}:${a.id}`) }))
        .filter((v) => v.avaliacao);
      const adequados = pares.filter((v) => v.avaliacao!.sugerivel);
      const comVaga = adequados.filter(
        (v) => (usadosP.get(v.p.id) ?? 0) < entrada.capacidadePorPadrinho,
      );
      const ocorrencias: Record<string, number> = {};
      for (const par of pares)
        ocorrencias[par.avaliacao!.explicacao.motivo] =
          (ocorrencias[par.avaliacao!.explicacao.motivo] ?? 0) + 1;
      const motivo = adequados.length
        ? comVaga.length
          ? 'vagas_disputadas'
          : 'sem_vagas'
        : ocorrencias.dados_insuficientes
          ? 'dados_insuficientes'
          : ocorrencias.inviavel === pares.length && pares.length > 0
            ? 'condicoes_obrigatorias'
            : ocorrencias.inviavel
              ? 'sem_combinacao_adequada'
              : pares.length
                ? 'sem_afinidade'
                : recusados > 0
                  ? 'pares_recusados'
                  : 'sem_padrinho_elegivel';
      const descricoes = {
        pares_recusados:
          'Os pares disponíveis foram recusados neste ciclo. A coordenação pode reconsiderá-los explicitamente.',
        sem_combinacao_adequada:
          'Nenhum par atende simultaneamente às condições obrigatórias e apresenta afinidade comprovada.',
        vagas_disputadas:
          'Há pares adequados, mas as vagas foram ocupadas por outras sugestões nesta rodada.',
        sem_vagas:
          'Os padrinhos adequados já atingiram a capacidade com vínculos confirmados.',
        dados_insuficientes:
          'Faltam dados para comprovar afinidade ou conferir condições obrigatórias.',
        condicoes_obrigatorias:
          'As combinações avaliadas não atendem às condições obrigatórias.',
        sem_afinidade:
          'Nenhum par tem evidência positiva de afinidade nos critérios configurados.',
        sem_padrinho_elegivel:
          'Não há outro participante elegível para formar um par.',
      };
      return {
        participacaoId: a.id,
        nome: nome(a),
        motivo,
        descricao: descricoes[motivo],
        paresAvaliados: pares.length,
        paresRecusados: recusados,
        paresAdequados: adequados.length,
        ocorrencias,
        pendencias: [
          ...new Set(
            pares.flatMap((p) =>
              p
                .avaliacao!.explicacao.pendencias.map((c) => c.nomePadrinho)
                .filter((n): n is string => Boolean(n)),
            ),
          ),
        ],
      };
    });
  return {
    politica: POLITICA_MATCHING,
    totalParesAvaliados: avaliacoes.size,
    paresRecusadosNoCiclo: entrada.paresRecusados?.size ?? 0,
    totalSugestoes: alocacao.length,
    novosAtendidos: new Set(
      alocacao
        .filter((p) => !(usadosA.get(p.apadrinhadoId) ?? 0))
        .map((p) => p.apadrinhadoId),
    ).size,
    jaVinculados: apadrinhados.filter((a) => (usadosA.get(a.id) ?? 0) > 0)
      .length,
    semSugestao,
    cargaPadrinhos,
  };
}
