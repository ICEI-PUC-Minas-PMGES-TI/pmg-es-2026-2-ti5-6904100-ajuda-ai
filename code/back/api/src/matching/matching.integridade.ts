import { createHash } from 'node:crypto';
import type { MatchingParDecisaoEntity } from './entities/par-decisao.entity.js';

export const VERSAO_INTEGRIDADE = '4.0.0';
export const chavePar = (padrinho: number, apadrinhado: number) =>
  `${padrinho}:${apadrinhado}`;
export function decisoesAtuais(eventos: MatchingParDecisaoEntity[]) {
  const atuais = new Map<string, MatchingParDecisaoEntity>();
  for (const evento of [...eventos].sort((a, b) => a.id - b.id))
    atuais.set(
      chavePar(evento.padrinhoParticipacaoId, evento.apadrinhadoParticipacaoId),
      evento,
    );
  return atuais;
}

/** Ordem de propriedades/conjuntos não altera a assinatura; ausência continua ausência. */
export function fingerprintMatching(valor: unknown): string {
  const comparar = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
  const canonico = (v: unknown): unknown => {
    if (v === undefined || v === null) return null;
    if (Array.isArray(v))
      return v
        .map(canonico)
        .sort((a, b) => comparar(JSON.stringify(a), JSON.stringify(b)));
    if (v instanceof Date) return v.toISOString();
    if (typeof v === 'object')
      return Object.fromEntries(
        Object.entries(v)
          .filter(([, item]) => item !== undefined)
          .sort(([a], [b]) => comparar(a, b))
          .map(([k, item]) => [k, canonico(item)]),
      );
    return v;
  };
  return createHash('sha256')
    .update(JSON.stringify(canonico(valor)))
    .digest('hex');
}

export const MOTIVOS_VALIDADE: Record<string, string> = {
  par_nao_viavel:
    'O par não atende mais às condições ou não apresenta afinidade comprovada.',
  configuracao_alterada:
    'A configuração mudou desde a geração. Gere uma nova rodada.',
  dados_alterados:
    'Os dados, a elegibilidade ou os vínculos usados no cálculo mudaram.',
  politica_desatualizada:
    'Esta rodada não tem o contrato de validade atual. Gere uma nova rodada.',
  ciclo_fora_matching: 'O ciclo não está disponível para decisões de matching.',
  execucao_substituida:
    'A sugestão não pertence à rodada concluída mais recente.',
  par_recusado:
    'Este par foi recusado no ciclo. Use Reconsiderar par antes de uma nova rodada.',
  vinculos_alterados:
    'Os vínculos confirmados foram alterados. Gere uma nova rodada.',
  capacidade_atingida: 'A capacidade de um participante foi atingida.',
};
