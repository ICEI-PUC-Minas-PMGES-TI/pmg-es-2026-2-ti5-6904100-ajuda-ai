import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'vite';

const server = await createServer({ server: { middlewareMode: true, ws: false }, optimizeDeps: { noDiscovery: true }, appType: 'custom' });
after(() => server.close());
const { api } = await server.ssrLoadModule('/src/api/client.js');
const { REQUISITOS_NO_APP } = await server.ssrLoadModule('/src/pages/coordenacao/MissoesPage.jsx');

test('cria, versiona e altera o status da regra pelos endpoints correspondentes', async () => {
  const chamadas = [];
  globalThis.fetch = async (url, { method, body }) => {
    chamadas.push([method, new URL(url).pathname, body ? JSON.parse(body) : undefined]);
    return new Response('{}', { status: 200 });
  };
  const valores = { valorXp: 500, elegibilidade: 'todos', limiteRepeticoes: null, combinavelCom: ['MISSAO_ENCONTRO'] };
  const acao = 'ENCONTRO_REALIZADO';

  await api.regrasXp();
  await api.regraXp(7);
  await api.criarRegraXp({ acao, programa: '2026/2', ...valores });
  await api.editarRegraXp(7, valores);
  await api.definirStatusRegraXp(7, false);
  assert.deepEqual(chamadas, [
    ['GET', '/coordenacao/regras-xp', undefined],
    ['GET', '/coordenacao/regras-xp/7', undefined],
    ['POST', '/coordenacao/regras-xp', { acao, programa: '2026/2', ...valores }],
    ['PATCH', '/coordenacao/regras-xp/7', valores],
    ['PATCH', '/coordenacao/regras-xp/7/status', { ativo: false }],
  ]);
  assert.ok(REQUISITOS_NO_APP.includes('ENCONTRO'));
});

test('o motivo acao-duplicada chega à tela', async () => {
  globalThis.fetch = async () => new Response(JSON.stringify({ motivo: 'acao-duplicada' }), { status: 409 });
  await assert.rejects(() => api.criarRegraXp({ acao: 'ENCONTRO_REALIZADO' }), { motivo: 'acao-duplicada' });
});
