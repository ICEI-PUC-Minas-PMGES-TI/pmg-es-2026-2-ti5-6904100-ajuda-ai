import type { ParticipacoesService } from '../../src/participacoes/participacoes.service.js';

/**
 * Registra a conferência acadêmica com todos os itens atendidos. Desde a F09
 * a aprovação exige essa conferência; os testes de fluxo a fazem antes de
 * aprovar, como a coordenação faria.
 */
export async function conferirTudo(
  service: ParticipacoesService,
  id: number,
  por = 'coord@pucminas.edu.br',
) {
  const registro = await service.buscarPorId(id);
  const itens = await service.itensDaConferencia(registro);
  return service.registrarVerificacao(
    id,
    { itens: itens.map((item) => ({ id: item.id, atende: true })) },
    por,
  );
}
