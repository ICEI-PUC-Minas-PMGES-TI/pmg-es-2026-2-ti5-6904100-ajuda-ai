import type { ParticipacaoEntity } from '../participacoes/entities/participacao.entity.js';
import { perfilDoRegistro } from '../participacoes/perfil.js';
import type {
  PerguntaFormulario,
  TipoFormulario,
} from './entities/formulario.entity.js';

type Resposta = string | string[] | boolean;

/** Papéis de participação que respondem ao formulário de cada público. */
export const PAPEIS_DO_FORMULARIO = {
  padrinho: ['candidato', 'padrinho'],
  apadrinhado: ['apadrinhado'],
} as const satisfies Record<TipoFormulario, readonly string[]>;

export interface RespostaIndividual {
  participacaoId: number;
  usuarioId: string;
  nome: string;
  email: string;
  status: string;
  enviadoEm: Date;
  /** Versão respondida; `null` quando o envio não tem formulário associado. */
  versao: number | null;
  respostas: Array<{
    perguntaId: string;
    enunciado: string;
    tipo: string;
    resposta: Resposta | null;
  }>;
}

export interface RespostasDaPergunta {
  perguntaId: string;
  enunciado: string;
  tipo: string;
  opcoes: string[];
  /** Versões do formulário em que a pergunta existiu. */
  versoes: number[];
  total: number;
  /** Quantas vezes cada opção foi escolhida (só perguntas com alternativas). */
  contagem: Record<string, number>;
  respostas: Array<{
    usuarioId: string;
    nome: string;
    versao: number;
    resposta: Resposta;
  }>;
}

interface FotoDoFormulario {
  versao: number;
  perguntas: PerguntaFormulario[];
}

/** Foto do formulário gravada no envio; `undefined` em envios sem formulário. */
function fotoDoEnvio(item: ParticipacaoEntity): FotoDoFormulario | undefined {
  const formulario = item.respostas?._servidor?.formulario;
  if (!formulario || !Array.isArray(formulario.perguntas)) return undefined;
  return {
    versao: formulario.versao ?? 0,
    perguntas: formulario.perguntas as PerguntaFormulario[],
  };
}

function respostaDe(
  item: ParticipacaoEntity,
  perguntaId: string,
): Resposta | null {
  const valor = item.respostas?.extras?.[perguntaId];
  if (typeof valor === 'boolean') return valor;
  if (Array.isArray(valor)) return valor.length ? valor : null;
  return typeof valor === 'string' && valor.trim() ? valor : null;
}

/** Cada envio com as respostas ligadas às perguntas da versão respondida. */
export function respostasIndividuais(
  itens: ParticipacaoEntity[],
): RespostaIndividual[] {
  return itens.map((item) => {
    const foto = fotoDoEnvio(item);
    const perfil = perfilDoRegistro(item);
    return {
      participacaoId: item.id,
      usuarioId: item.usuarioId,
      nome: perfil.nome,
      email: perfil.email,
      status: item.status,
      enviadoEm: item.criadoEm,
      versao: foto?.versao ?? null,
      respostas: (foto?.perguntas ?? []).map((pergunta) => ({
        perguntaId: pergunta.id,
        enunciado: pergunta.enunciado,
        tipo: pergunta.tipo,
        resposta: respostaDe(item, pergunta.id),
      })),
    };
  });
}

/**
 * Agrupa as respostas por pergunta. A pergunta é identificada pelo id; o
 * enunciado e as opções vêm da versão mais recente em que ela aparece.
 */
export function respostasPorPergunta(
  itens: ParticipacaoEntity[],
): RespostasDaPergunta[] {
  const comFoto = itens
    .map((item) => ({ item, foto: fotoDoEnvio(item) }))
    .filter(
      (par): par is { item: ParticipacaoEntity; foto: FotoDoFormulario } =>
        Boolean(par.foto),
    )
    .sort((a, b) => b.foto.versao - a.foto.versao);

  const grupos = new Map<string, RespostasDaPergunta>();
  for (const { item, foto } of comFoto) {
    const nome = perfilDoRegistro(item).nome;
    for (const pergunta of foto.perguntas) {
      const grupo = grupos.get(pergunta.id) ?? {
        perguntaId: pergunta.id,
        enunciado: pergunta.enunciado,
        tipo: pergunta.tipo,
        opcoes: pergunta.opcoes,
        versoes: [],
        total: 0,
        contagem: {},
        respostas: [],
      };
      grupos.set(pergunta.id, grupo);
      if (!grupo.versoes.includes(foto.versao)) grupo.versoes.push(foto.versao);
      const resposta = respostaDe(item, pergunta.id);
      if (resposta === null) continue;
      grupo.total += 1;
      grupo.respostas.push({
        usuarioId: item.usuarioId,
        nome,
        versao: foto.versao,
        resposta,
      });
      if (pergunta.opcoes.length)
        for (const opcao of [resposta].flat()) {
          const chave = String(opcao);
          grupo.contagem[chave] = (grupo.contagem[chave] ?? 0) + 1;
        }
    }
  }
  return [...grupos.values()];
}
