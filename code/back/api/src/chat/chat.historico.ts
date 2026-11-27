import type { ChatPeriodoEntity } from './entities/chat.entity.js';

export const MAX_ID_MENSAGEM = 2147483647;
export function intervalosDoHistorico(
  periodos: Pick<ChatPeriodoEntity, 'aposMensagemId' | 'ateMensagemId'>[],
) {
  const ordenados = periodos
    .map((p) => ({
      inicio: p.aposMensagemId + 1,
      fim: p.ateMensagemId ?? MAX_ID_MENSAGEM,
    }))
    .filter((p) => p.inicio <= p.fim)
    .sort((a, b) => a.inicio - b.inicio);
  const intervalos: typeof ordenados = [];
  for (const atual of ordenados) {
    const anterior = intervalos.at(-1);
    if (anterior && atual.inicio <= anterior.fim + 1)
      anterior.fim = Math.max(anterior.fim, atual.fim);
    else intervalos.push({ ...atual });
  }
  return intervalos;
}
export function mensagemNoHistorico(
  id: number,
  intervalos: ReturnType<typeof intervalosDoHistorico>,
) {
  return intervalos.some((p) => id >= p.inicio && id <= p.fim);
}
