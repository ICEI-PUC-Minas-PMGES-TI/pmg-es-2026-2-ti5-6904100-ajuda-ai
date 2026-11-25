import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'vite';

const storage = new Map();
globalThis.localStorage = { getItem: k => storage.get(k) || null, setItem: (k, v) => storage.set(k, v), removeItem: k => storage.delete(k) };
const server = await createServer({ server: { middlewareMode: true }, appType: 'custom' });
after(() => server.close());
const client = await server.ssrLoadModule('/src/api/client.js');
const n = await server.ssrLoadModule('/src/pages/aluno/notificacoes.js');

const ID = '4a3b2c1d-0e9f-4876-a5b4-c3d2e1f0a9b8';

function capturar(resposta = {}, status = 200) {
  const chamadas = [];
  globalThis.fetch = async (url, opts) => { chamadas.push({ url, ...opts }); return new Response(JSON.stringify(resposta), { status }); };
  return chamadas;
}

test('cliente do sino usa as rotas me/notificacoes com o JWT do aluno', async () => {
  client.persistAlunoSession({ accessToken: 'jwt-aluno', expiresIn: 3600, usuario: { email: 'ana@sga.pucminas.br', nome: 'Ana' } });
  const casos = [
    [() => client.api.notificacoes(20), 'GET', '/me/notificacoes?limite=20'],
    [() => client.api.marcarNotificacaoLida(ID), 'PATCH', `/me/notificacoes/${ID}/lida`],
    [() => client.api.marcarNotificacoesLidas(), 'PATCH', '/me/notificacoes/lidas'],
  ];
  for (const [chamar, metodo, caminho] of casos) {
    const chamadas = capturar();
    await chamar();
    assert.ok(chamadas[0].url.endsWith(caminho), chamadas[0].url);
    assert.equal(chamadas[0].method, metodo);
    assert.equal(chamadas[0].headers.Authorization, 'Bearer jwt-aluno');
  }
});

test('sem sessão de aluno o sino não chama a API', async () => {
  client.clearAlunoSession();
  const chamadas = capturar();
  await assert.rejects(client.api.notificacoes(20), (e) => e.status === 401);
  assert.equal(chamadas.length, 0);
});

test('marcar como lida atualiza item e contagem', () => {
  const estado = { naoLidas: 2, itens: [{ id: 'a', lida: false }, { id: 'b', lida: false }] };
  const otimista = n.marcarLidaLocal(estado, 'a');
  assert.equal(otimista.naoLidas, 1);
  assert.equal(otimista.itens[0].lida, true);
  assert.equal(otimista.itens[1].lida, false);
  const confirmado = n.marcarLidaLocal(estado, 'a', { naoLidas: 5, lidaEm: '2026-11-18T10:00:00.000Z' });
  assert.equal(confirmado.naoLidas, 5);
  assert.equal(confirmado.itens[0].lidaEm, '2026-11-18T10:00:00.000Z');
  const todas = n.marcarTodasLocal(estado);
  assert.equal(todas.naoLidas, 0);
  assert.ok(todas.itens.every((i) => i.lida));
});

test('tempo relativo e rotas da web', () => {
  const agora = new Date('2026-11-18T12:00:00Z');
  assert.equal(n.tempoRelativo('2026-11-18T11:55:00Z', agora), 'há 5 min');
  assert.equal(n.tempoRelativo('2026-11-18T11:00:00Z', agora), 'há 1 h');
  assert.equal(n.tempoRelativo('2026-11-17T10:00:00Z', agora), 'ontem');
  const noite = new Date(2026, 10, 18, 23, 40);
  assert.equal(n.tempoRelativo(new Date(2026, 10, 18, 0, 5).toISOString(), noite), 'há 23 h');
  assert.equal(n.tempoRelativo(new Date(2026, 10, 17, 23).toISOString(), new Date(2026, 10, 18, 8)), 'ontem');
  assert.equal(n.tempoRelativo(new Date(2026, 10, 16, 20).toISOString(), new Date(2026, 10, 18, 8)), '16/11');
  assert.equal(n.rotaDaNotificacao('/perfil'), '/aluno/perfil');
  assert.equal(n.rotaDaNotificacao('/missoes'), null);
  assert.equal(n.destinoNoApp('/missoes'), 'Abra no app Ajuda-aí para ver a missão.');
  assert.equal(n.destinoNoApp('/lojinha/resgates/8c1f3a2e-4b5d-4e6f-9a7b-1c2d3e4f5a6b'), 'Abra no app Ajuda-aí para ver o resgate.');
  assert.equal(n.destinoNoApp('/perfil'), null);
  assert.equal(n.destinoNoApp(null), null);
  assert.equal(n.ICONE_NOTIFICACAO.MISSAO_NOVA, 'trophy');
});

test('paginação: antes na URL e ateId no corpo do marcar todas', async () => {
  client.persistAlunoSession({ accessToken: 'jwt-aluno', expiresIn: 3600, usuario: { email: 'ana@sga.pucminas.br', nome: 'Ana' } });
  let chamadas = capturar({ naoLidas: 0, itens: [], temMais: false });
  await client.api.notificacoes(20, ID);
  assert.ok(chamadas[0].url.endsWith(`/me/notificacoes?limite=20&antes=${ID}`), chamadas[0].url);
  chamadas = capturar({ atualizadas: 1, naoLidas: 0 });
  await client.api.marcarNotificacoesLidas(ID);
  assert.deepEqual(JSON.parse(chamadas[0].body), { ateId: ID });
});

test('juntar página não repete itens e guarda temMais da página nova', () => {
  const estado = { naoLidas: 3, itens: [{ id: 'a' }, { id: 'b' }], temMais: true };
  const junto = n.juntarPagina(estado, { naoLidas: 2, itens: [{ id: 'b' }, { id: 'c' }], temMais: false });
  assert.deepEqual(junto.itens.map((i) => i.id), ['a', 'b', 'c']);
  assert.equal(junto.temMais, false);
  assert.equal(junto.naoLidas, 2);
  assert.equal(n.marcarTodasLocal(estado).temMais, true);
  assert.equal(n.marcarLidaLocal(estado, 'a').temMais, true);
});
