export const POLITICA_MATCHING = {
  versao: '3.0.0',
  precisaoScore: 10_000,
  objetivos: [
    'Respeitar condições obrigatórias e capacidades; exigir evidência positiva de afinidade.',
    'Maximizar sugestões viáveis e priorizar alunos ainda sem vínculo.',
    'Maximizar aderência comprovada, considerando a cobertura dos dados.',
    'Entre soluções de mesma qualidade, equilibrar vínculos confirmados e sugestões da rodada.',
    'Resolver empates de forma estável pelos identificadores.',
  ],
  equilibrio: 'mesma_qualidade',
} as const;

export interface DetalheCompatibilidade {
  peso: number;
  obrigatorio?: boolean;
  considerado: boolean;
  fracaoConhecida?: number;
  fracaoNeutra?: number;
  compativel?: boolean;
  contribuicao: number;
  motivo?: string;
  nomePadrinho?: string;
  campoCadastro?: string;
  criterioPadrinhoId?: number;
}

/** Score conservador: falta de dados não é incompatibilidade nem afinidade comprovada. */
export function resumirCompatibilidade<T extends DetalheCompatibilidade>(
  criterios: T[],
) {
  const neutro = (c: T) =>
    c.motivo === 'sem_preferencia' || c.motivo === 'vivencia_nao_aplicavel';
  const conhecida = (c: T) =>
    c.fracaoConhecida ?? (c.considerado || neutro(c) ? 1 : 0);
  const neutra = (c: T) => c.fracaoNeutra ?? (neutro(c) ? 1 : 0);
  const pesoConfigurado = criterios.reduce((s, c) => s + c.peso, 0);
  const pesoNeutro = criterios.reduce((s, c) => s + c.peso * neutra(c), 0);
  const pesoConsiderado = criterios.reduce(
    (s, c) => s + c.peso * (conhecida(c) - neutra(c)),
    0,
  );
  const pesoObtido = criterios.reduce((s, c) => s + c.contribuicao, 0);
  const pesoConhecido = criterios.reduce(
    (s, c) => s + c.peso * conhecida(c),
    0,
  );
  const pendencias = criterios.filter((c) => conhecida(c) < 1);
  const obrigatoriosPendentes = pendencias.filter((c) => c.obrigatorio);
  const impedimentos = criterios.filter(
    (c) => c.obrigatorio && c.considerado && !c.compativel,
  );
  const viabilidade = impedimentos.length
    ? 'inviavel'
    : obrigatoriosPendentes.length
      ? 'dados_insuficientes'
      : 'viavel';
  const score =
    pesoConfigurado > pesoNeutro
      ? pesoObtido / (pesoConfigurado - pesoNeutro)
      : 0;
  const afinidade = pesoConsiderado > 0 ? pesoObtido / pesoConsiderado : null;
  const cobertura = pesoConfigurado > 0 ? pesoConhecido / pesoConfigurado : 0;
  const sugerivel = viabilidade === 'viavel' && pesoObtido > 0;
  const motivo =
    viabilidade !== 'viavel'
      ? viabilidade
      : pesoObtido > 0
        ? 'afinidade_comprovada'
        : pendencias.length
          ? 'dados_insuficientes'
          : pesoConsiderado
            ? 'sem_afinidade'
            : 'sem_criterios_aplicaveis';
  return {
    score,
    sugerivel,
    explicacao: {
      politicaVersao: POLITICA_MATCHING.versao,
      score,
      afinidade,
      cobertura,
      pesoObtido,
      pesoConfigurado,
      pesoConhecido,
      pesoNeutro,
      pesoConsiderado,
      viabilidade,
      motivo,
      criterios: criterios.map((c) => ({
        ...c,
        cobertura: conhecida(c),
        atendimento:
          conhecida(c) > neutra(c)
            ? c.contribuicao / (c.peso * (conhecida(c) - neutra(c)))
            : null,
      })),
      pendencias,
      impedimentos,
    },
  };
}
