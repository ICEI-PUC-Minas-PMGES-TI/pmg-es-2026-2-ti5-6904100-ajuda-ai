import { BadRequestException } from '@nestjs/common';
import { PerguntaFormulario } from './entities/formulario.entity.js';

export const OPERADORES_CONDICAO = [
  'igual',
  'diferente',
  'contem',
  'preenchida',
  'vazia',
] as const;
export type OperadorCondicao = (typeof OPERADORES_CONDICAO)[number];

/** Condição no estilo Google Forms: mostrar a pergunta só se a resposta de outra bater. */
export interface CondicaoVisibilidade {
  perguntaId: string;
  operador: OperadorCondicao;
  /** Obrigatório para igual / diferente / contem. */
  valor?: string;
}

export function operadorCondicao(valor: unknown): valor is OperadorCondicao {
  return (
    typeof valor === 'string' &&
    (OPERADORES_CONDICAO as readonly string[]).includes(valor)
  );
}

function respostaPreenchida(valor: unknown): boolean {
  if (valor == null) return false;
  if (Array.isArray(valor)) return valor.length > 0;
  return String(valor).trim().length > 0;
}

/** Avalia se a condição é satisfeita pela resposta da pergunta referenciada. */
export function condicaoSatisfeita(
  condicao: CondicaoVisibilidade,
  resposta: unknown,
): boolean {
  switch (condicao.operador) {
    case 'preenchida':
      return respostaPreenchida(resposta);
    case 'vazia':
      return !respostaPreenchida(resposta);
    case 'igual':
      if (Array.isArray(resposta))
        return resposta.length === 1 && resposta[0] === condicao.valor;
      return String(resposta ?? '') === (condicao.valor ?? '');
    case 'diferente':
      if (!respostaPreenchida(resposta)) return true;
      if (Array.isArray(resposta))
        return !(resposta.length === 1 && resposta[0] === condicao.valor);
      return String(resposta) !== (condicao.valor ?? '');
    case 'contem':
      if (Array.isArray(resposta)) return resposta.includes(condicao.valor);
      return String(resposta ?? '')
        .toLowerCase()
        .includes(String(condicao.valor ?? '').toLowerCase());
    default:
      return true;
  }
}

export function perguntaVisivel(
  pergunta: PerguntaFormulario,
  respostas: Record<string, unknown>,
): boolean {
  if (!pergunta.visivelSe) return true;
  return condicaoSatisfeita(
    pergunta.visivelSe,
    respostas[pergunta.visivelSe.perguntaId],
  );
}

/** Perguntas que o aluno deve ver/responder, na ordem do formulário. */
export function perguntasVisiveis(
  perguntas: PerguntaFormulario[],
  respostas: Record<string, unknown>,
): PerguntaFormulario[] {
  return perguntas.filter((p) => perguntaVisivel(p, respostas));
}

/**
 * Valida e normaliza `visivelSe`. Só pode apontar para uma pergunta anterior
 * (evita ciclos e perguntas ainda não respondidas).
 */
export function normalizarCondicao(
  bruta: unknown,
  indice: number,
  idsAnteriores: ReadonlySet<string>,
  numero: number,
): CondicaoVisibilidade | undefined {
  if (bruta == null || bruta === false) return undefined;
  if (typeof bruta !== 'object' || Array.isArray(bruta)) {
    throw new BadRequestException(
      `Condição inválida na pergunta ${numero}.`,
    );
  }
  const item = bruta as Record<string, unknown>;
  const perguntaId =
    typeof item.perguntaId === 'string' ? item.perguntaId.trim() : '';
  if (!perguntaId || !idsAnteriores.has(perguntaId)) {
    throw new BadRequestException(
      `A pergunta ${numero} só pode depender de uma pergunta anterior.`,
    );
  }
  if (!operadorCondicao(item.operador)) {
    throw new BadRequestException(
      `Operador de condição inválido na pergunta ${numero}.`,
    );
  }
  const precisaValor =
    item.operador === 'igual' ||
    item.operador === 'diferente' ||
    item.operador === 'contem';
  const valor =
    typeof item.valor === 'string' ? item.valor.trim().slice(0, 300) : '';
  if (precisaValor && !valor) {
    throw new BadRequestException(
      `A condição da pergunta ${numero} precisa de um valor para comparar.`,
    );
  }
  // índice só documenta a posição; idsAnteriores já garante a ordem.
  void indice;
  return {
    perguntaId,
    operador: item.operador,
    ...(precisaValor ? { valor } : {}),
  };
}
