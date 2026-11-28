import type { ParticipacaoEntity } from '../participacoes/entities/participacao.entity.js';
import type { CriterioMatching } from './entities/matching.entity.js';
import type {
  MatchingCriterioVersaoEntity,
  TipoCriterioCatalogo,
} from './entities/criterio-catalogo.entity.js';
import { avaliarCadastro } from './criterios-cadastro.ts';
import { resumirCompatibilidade } from './matching.politica.ts';

export interface MetadadoCriterio {
  criterioId: number;
  ativo?: boolean;
  alternativas?: string[];
  criterioVersao: number;
  perguntaId: string;
  tipo: TipoCriterioCatalogo;
  rotulo: string;
  nome: string;
}

export interface MetadadosPontuacao {
  campos: {
    padrinho: Map<number, MetadadoCriterio>;
    apadrinhado: Map<number, MetadadoCriterio>;
  };
  versoesValidas?: Map<string, MatchingCriterioVersaoEntity>;
}

export function normalizarBooleano(valor: unknown): boolean | undefined {
  if (typeof valor === 'boolean') return valor;
  if (valor === 'true' || valor === true) return true;
  if (valor === 'false' || valor === false) return false;
  return undefined;
}

export function metadadoDaParticipacao(
  participacao: ParticipacaoEntity,
  meta: MetadadoCriterio | undefined,
  versoesValidas?: Map<string, MatchingCriterioVersaoEntity>,
): MetadadoCriterio | undefined {
  if (!meta) return undefined;
  const formulario = participacao.respostas?._servidor?.formulario;
  // Envios legados sem snapshot continuam usando os metadados disponíveis.
  if (!formulario) return meta;
  if (!Array.isArray(formulario.perguntas)) return undefined;
  const pergunta = formulario.perguntas.find((bruta) => {
    if (!bruta || typeof bruta !== 'object') return false;
    return (
      Number((bruta as { criterioId?: unknown }).criterioId) === meta.criterioId
    );
  }) as
    | {
        id?: unknown;
        criterioVersao?: unknown;
        tipo?: unknown;
        enunciado?: unknown;
      }
    | undefined;
  const versao = Number(pergunta?.criterioVersao);
  if (
    typeof pergunta?.id !== 'string' ||
    !pergunta.id ||
    !Number.isInteger(versao) ||
    versao < 1 ||
    (pergunta.tipo !== 'sim_nao' &&
      pergunta.tipo !== 'escolha_unica' &&
      pergunta.tipo !== 'multipla_escolha')
  )
    return undefined;
  const catalogo = versoesValidas?.get(`${meta.criterioId}:${versao}`);
  if (versoesValidas && (!catalogo || catalogo.tipo !== pergunta.tipo))
    return undefined;
  return {
    ...meta,
    alternativas: catalogo?.alternativas.map((a) => a.id) ?? meta.alternativas,
    perguntaId: pergunta.id,
    criterioVersao: versao,
    tipo: pergunta.tipo,
    rotulo:
      typeof pergunta.enunciado === 'string' ? pergunta.enunciado : meta.rotulo,
  };
}

export function valorPorCriterio(
  participacao: ParticipacaoEntity,
  meta: MetadadoCriterio | undefined,
): unknown {
  if (!meta) return undefined;
  const extras = participacao.respostas?.extras;
  if (!extras) return undefined;
  const valor = extras[meta.perguntaId];
  if (meta.alternativas && meta.tipo !== 'sim_nao') {
    const valido = (item: unknown) =>
      typeof item === 'string' && meta.alternativas!.includes(item);
    if (meta.tipo === 'escolha_unica' && !valido(valor)) return undefined;
    if (
      meta.tipo === 'multipla_escolha' &&
      (!Array.isArray(valor) ||
        valor.some((v) => !valido(v)) ||
        new Set(valor).size !== valor.length)
    )
      return undefined;
  }
  return valor;
}

export function pontuarPar(
  padrinho: ParticipacaoEntity,
  apadrinhado: ParticipacaoEntity,
  criterios: CriterioMatching[],
  metadata: MetadadosPontuacao,
) {
  const detalhes = criterios.map((criterio) => {
    if (criterio.campoCadastro) {
      const avaliacao = avaliarCadastro(
        criterio.campoCadastro,
        padrinho.respostas ?? undefined,
        apadrinhado.respostas ?? undefined,
      );
      const contribuicao = avaliacao.considerado
        ? criterio.peso * avaliacao.fator
        : 0;
      return { ...criterio, ...avaliacao, contribuicao };
    }
    const metaP = metadadoDaParticipacao(
      padrinho,
      metadata.campos.padrinho.get(criterio.criterioPadrinhoId ?? 0),
      metadata.versoesValidas,
    );
    const metaA = metadadoDaParticipacao(
      apadrinhado,
      metadata.campos.apadrinhado.get(criterio.criterioApadrinhadoId ?? 0),
      metadata.versoesValidas,
    );
    let vp = valorPorCriterio(padrinho, metaP);
    let va = valorPorCriterio(apadrinhado, metaA);
    if (metaP?.tipo === 'sim_nao') vp = normalizarBooleano(vp);
    if (metaA?.tipo === 'sim_nao') va = normalizarBooleano(va);
    const ausente =
      metaP?.tipo !== metaA?.tipo ||
      vp === undefined ||
      vp === null ||
      va === undefined ||
      va === null ||
      vp === '' ||
      va === '' ||
      (Array.isArray(vp) && vp.length === 0) ||
      (Array.isArray(va) && va.length === 0);
    if (ausente)
      return {
        ...criterio,
        nomePadrinho: metaP?.nome,
        nomeApadrinhado: metaA?.nome,
        rotuloPadrinho: metaP?.rotulo,
        rotuloApadrinhado: metaA?.rotulo,
        considerado: false,
        contribuicao: 0,
        motivo: 'resposta_ausente',
      };
    let compativel = false;
    if (criterio.operacao === 'intersecao') {
      compativel =
        Array.isArray(vp) &&
        Array.isArray(va) &&
        vp.some((v) => va.includes(v));
    } else if (criterio.operacao === 'diferenca') {
      compativel =
        Array.isArray(vp) &&
        Array.isArray(va) &&
        !vp.some((v) => va.includes(v));
    } else {
      compativel = vp === va;
    }
    const contribuicao = compativel ? criterio.peso : 0;
    return {
      ...criterio,
      nomePadrinho: metaP?.nome,
      nomeApadrinhado: metaA?.nome,
      rotuloPadrinho: metaP?.rotulo,
      rotuloApadrinhado: metaA?.rotulo,
      considerado: true,
      compativel,
      contribuicao,
      valorPadrinho: vp,
      valorApadrinhado: va,
    };
  });
  return resumirCompatibilidade(detalhes);
}
