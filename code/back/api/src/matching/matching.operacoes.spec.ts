import { randomUUID } from 'node:crypto';
import { cenarioMatching } from '../../test/helpers/matching-cenario.js';
import { PRAZO_EXECUCAO_MATCHING_MS } from './matching.service.js';

describe('Identidade e prazo de uma operação de matching', () => {
  it('repetir o UUID não executa outra rodada nem duplica sugestões', async () => {
    const c = cenarioMatching();
    const id = randomUUID();
    const primeira = await c.service.executar('2026/2', 'coord', id);
    const repetida = await c.service.executar('2026/2', 'coord', id);
    expect(repetida.id).toBe(primeira.id);
    expect(repetida.operacaoId).toBe(id);
    expect(c.execucoes).toHaveLength(1);
    expect(c.sugestoes).toHaveLength(primeira.totalSugestoes);
    await expect(c.service.executar('2026/2', 'outro', id)).rejects.toThrow(
      /outro responsável/,
    );
  });
  it('consultar o estado recupera execução abandonada e uma nova operação fica liberada', async () => {
    const c = cenarioMatching();
    const velha = await c.gerar();
    c.execucoes[0].status = 'executando';
    c.execucoes[0].criadoEm = new Date(
      Date.now() - PRAZO_EXECUCAO_MATCHING_MS - 1,
    );
    const estado = await c.service.listarExecucoes('2026/2');
    expect(estado[0].status).toBe('falha');
    expect(estado[0].concluidaEm).toBeInstanceOf(Date);
    const nova = await c.gerar();
    expect(nova.id).not.toBe(velha.id);
    expect(nova.status).toBe('concluida');
  });
  it('uma execução vencida nunca publica sugestões mesmo sem nova consulta ou POST', async () => {
    const c = cenarioMatching();
    c.aposTransacao(() => {
      c.aposTransacao();
      c.execucoes[0].criadoEm = new Date(
        Date.now() - PRAZO_EXECUCAO_MATCHING_MS - 1,
      );
    });
    await expect(c.gerar()).rejects.toThrow(/prazo/);
    expect(c.sugestoes).toHaveLength(0);
    expect(c.execucoes[0].status).toBe('falha');
  });
});
