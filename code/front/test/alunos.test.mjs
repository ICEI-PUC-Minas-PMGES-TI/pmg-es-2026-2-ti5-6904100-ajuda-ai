import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'vite';

const storage = new Map();
globalThis.localStorage = {
  getItem: (key) => storage.get(key) ?? null,
  setItem: (key, value) => storage.set(key, value),
};

const server = await createServer({ server: { middlewareMode: true, ws: false }, optimizeDeps: { noDiscovery: true }, appType: 'custom' });
after(() => server.close());
const { api, persistSession, persistAlunoSession } = await server.ssrLoadModule('/src/api/client.js');

test('consulta, concessão e revogação de delegações usam a sessão da coordenação', async () => {
  persistSession({ accessToken: 'jwt-coord', usuario: { perfil: 'coordenador' } });
  const chamadas = [];
  globalThis.fetch = async (url, options) => {
    chamadas.push([new URL(url), options]);
    return new Response(JSON.stringify({ id: 7, delegacoes: [] }), { status: 200 });
  };

  await api.alunos('Ana & Bruna');
  await api.aluno(7);
  await api.concederDelegacao(7, 'mapa');
  await api.revogarDelegacao(7, 'mapa');

  assert.equal(chamadas[0][0].searchParams.get('busca'), 'Ana & Bruna');
  assert.deepEqual(chamadas.map(([url, opts]) => [url.pathname, opts.method, opts.headers.Authorization]), [
    ['/coordenacao/alunos', 'GET', 'Bearer jwt-coord'],
    ['/coordenacao/alunos/7', 'GET', 'Bearer jwt-coord'],
    ['/coordenacao/alunos/7/delegacoes', 'POST', 'Bearer jwt-coord'],
    ['/coordenacao/alunos/7/delegacoes/mapa', 'DELETE', 'Bearer jwt-coord'],
  ]);
  assert.deepEqual(JSON.parse(chamadas[2][1].body), { funcionalidade: 'mapa' });
});

test('a API preserva o motivo de uma concessão duplicada', async () => {
  globalThis.fetch = async () => new Response(JSON.stringify({
    motivo: 'ja-delegado',
    message: 'Delegação existente',
  }), { status: 409 });
  await assert.rejects(() => api.concederDelegacao(7, 'mapa'), { motivo: 'ja-delegado' });
});

test('o aluno delegado usa a própria sessão para consultar a delegação e editar o mapa', async () => {
  const email = 'aluna@pucminas.edu.br';
  persistAlunoSession({ accessToken: 'jwt-aluna', email });
  const chamadas = [];
  globalThis.fetch = async (url, options) => {
    chamadas.push([new URL(url).pathname, options.headers.Authorization]);
    return new Response('["mapa"]', { status: 200 });
  };
  assert.deepEqual(await api.minhasDelegacoes(email), ['mapa']);
  await api.pucstops(email);
  await api.atualizarInformacoesLocal('local', 'Texto novo', email);
  assert.deepEqual(chamadas, [
    ['/me/delegacoes', 'Bearer jwt-aluna'],
    ['/coordenacao/pucstops', 'Bearer jwt-aluna'],
    ['/coordenacao/mapa/predios/local', 'Bearer jwt-aluna'],
  ]);
});
