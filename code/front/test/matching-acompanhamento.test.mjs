import { test } from 'node:test';
import assert from 'node:assert/strict';
import { acompanharMatching } from '../src/pages/coordenacao/acompanharMatching.js';

function cenario(respostas, opcoes = {}) {
  let chamadas = 0, esperas = 0, falhas = 0;
  const atualizacoes = [];
  const promise = acompanharMatching({
    consultar: async () => { const r = respostas[chamadas++]; if (r instanceof Error) throw r; return r; },
    anteriorId: 10, ativo: () => true,
    atualizar: e => atualizacoes.push(e), erroRede: () => falhas++,
    esperar: async () => { esperas++; assert.ok(esperas < 10, 'deve atingir um estado final'); },
    ...opcoes,
  });
  return { promise, dados: () => ({ chamadas, esperas, falhas, atualizacoes }) };
}
test('resposta POST perdida acompanha a rodada em execução até a conclusão', async () => {
  const final = { id: 11, status: 'concluida' };
  const c = cenario([[{ id: 11, status: 'executando' }], [final]]);
  assert.deepEqual(await c.promise, final);
  assert.equal(c.dados().chamadas, 2);
});
test('não confunde rodadas antigas com o resultado do POST perdido', async () => {
  const c = cenario([[{ id: 10, status: 'concluida' }, { id: 9, status: 'concluida' }], [], [{ id: 11, status: 'concluida' }]]);
  assert.equal((await c.promise).id, 11);
  assert.equal(c.dados().esperas, 2);
});
test('falha transitória de rede continua consultando e preserva o erro final da API', async () => {
  const c = cenario([new Error('rede'), [{ id: 11, status: 'falha', erro: 'Dados mudaram' }]]);
  assert.equal((await c.promise).erro, 'Dados mudaram');
  assert.equal(c.dados().falhas, 1);
});
test('retoma exatamente a rodada em andamento ao reabrir a página', async () => {
  const c = cenario([[{ id: 12, status: 'executando' }, { id: 11, status: 'concluida' }], [{ id: 12, status: 'executando' }, { id: 11, status: 'falha' }]], { execucaoId: 11 });
  assert.equal((await c.promise).id, 11);
});
test('resposta tardia não atualiza a tela depois da troca de contexto', async () => {
  let ativo = true;
  const c = cenario([], { ativo: () => ativo, consultar: async () => { ativo = false; return [{id:11,status:'concluida'}]; } });
  assert.equal(await c.promise, null);
  assert.deepEqual(c.dados().atualizacoes, []);
});
test('sessão expirada encerra o acompanhamento sem repetir a requisição', async () => {
  const c = cenario([Object.assign(new Error('Sessão expirou'), {status:401})]);
  await assert.rejects(c.promise, /Sessão expirou/);
  assert.equal(c.dados().chamadas, 1);
});
