import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'vite';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';

const storage = new Map();
globalThis.localStorage = { getItem: k => storage.get(k) || null, setItem: (k, v) => storage.set(k, v), removeItem: k => storage.delete(k) };
const server = await createServer({ server: { middlewareMode: true }, appType: 'custom' });
after(() => server.close());
const client = await server.ssrLoadModule('/src/api/client.js');
const m = await server.ssrLoadModule('/src/pages/coordenacao/MissoesPage.jsx');

const ID = '6f1c2b0e-3d7a-4c61-9a52-1b8e0f4d2a77';
const base = {
  id: ID, titulo: 'Visite a biblioteca', descricao: 'Tire uma foto', tipo: 'UNICA', xp: 80, ativa: true,
  inicio: null, fim: null, ciclo: '2026/2', vigenteAgora: true, conclusoes: 37, xpCreditadoTotal: 2860,
  criadoPor: 3, criadoEm: '2026-11-16T18:00:00.000Z', atualizadoEm: '2026-11-16T18:00:00.000Z',
};

function capturar(resposta = base, status = 200) {
  const chamadas = [];
  globalThis.fetch = async (url, opts) => { chamadas.push({ url, ...opts }); return new Response(JSON.stringify(resposta), { status }); };
  return chamadas;
}

test('cliente da coordenação usa método, URL, corpo e JWT', async () => {
  client.persistSession({ accessToken: 'jwt-coord', usuario: { papel: 'coordenador' } });
  const casos = [
    [() => client.api.missoesCoordenacao(), 'GET', '/coordenacao/missoes', undefined],
    [() => client.api.missoesCoordenacao('ativa'), 'GET', '/coordenacao/missoes?status=ativa', undefined],
    [() => client.api.criarMissao({ titulo: 'X' }), 'POST', '/coordenacao/missoes', { titulo: 'X' }],
    [() => client.api.atualizarMissao(ID, { xp: 60 }), 'PATCH', `/coordenacao/missoes/${ID}`, { xp: 60 }],
    [() => client.api.ativarMissao(ID), 'POST', `/coordenacao/missoes/${ID}/ativar`, undefined],
    [() => client.api.desativarMissao(ID), 'POST', `/coordenacao/missoes/${ID}/desativar`, undefined],
  ];
  for (const [chamar, metodo, caminho, corpo] of casos) {
    const chamadas = capturar();
    await chamar();
    assert.equal(chamadas.length, 1);
    assert.ok(chamadas[0].url.endsWith(caminho), chamadas[0].url);
    assert.equal(chamadas[0].method, metodo);
    assert.equal(chamadas[0].headers.Authorization, 'Bearer jwt-coord');
    assert.deepEqual(chamadas[0].body === undefined ? undefined : JSON.parse(chamadas[0].body), corpo);
  }
});

test('validação segue as regras do servidor', () => {
  const ok = { ...m.formDaMissao(null), titulo: 'T', descricao: 'D', xp: '100' };
  assert.equal(m.validarMissao(ok), '');
  assert.match(m.validarMissao({ ...ok, titulo: '  ' }), /título/);
  assert.match(m.validarMissao({ ...ok, descricao: '' }), /Descreva/);
  assert.match(m.validarMissao({ ...ok, xp: '101' }), /1 a 100/);
  assert.match(m.validarMissao({ ...ok, xp: '0' }), /1 a 100/);
  assert.match(m.validarMissao({ ...ok, tipo: 'SEMANAL', xp: '61' }), /semanal limitada a 60/);
  assert.match(m.validarMissao({ ...ok, inicio: '2026-12-02T10:00', fim: '2026-12-01T10:00' }), /depois do início/);
  assert.match(m.validarMissao({ ...ok, fim: '2026-01-01T10:00' }, { agora: new Date('2026-11-18T12:00:00Z') }), /futuro/);
  assert.equal(m.validarMissao({ ...ok, fim: '2026-01-01T10:00' }, { agora: new Date('2026-11-18T12:00:00Z'), fimNovo: false }), '');
});

test('corpo da criação: datas com fuso e sem campos vazios', () => {
  const corpo = m.corpoCriacaoMissao({ titulo: ' T ', descricao: ' D ', tipo: 'UNICA', xp: '80', inicio: '', fim: '2026-12-04T23:59', ativar: true });
  assert.equal(corpo.titulo, 'T');
  assert.equal(corpo.xp, 80);
  assert.equal(corpo.ativar, true);
  assert.equal('inicio' in corpo, false);
  assert.match(corpo.fim, /Z$/);
});

test('edição envia só o que mudou; remover o fim manda null', () => {
  const comFim = { ...base, fim: '2026-12-05T02:59:00.000Z' };
  const form = m.formDaMissao(comFim);
  assert.deepEqual(m.camposAlteradosMissao(comFim, form), {});
  assert.deepEqual(m.camposAlteradosMissao(comFim, { ...form, xp: '60', fim: '' }), { xp: 60, fim: null });
});

test('resumo, filtros e período', () => {
  const lista = [base, { ...base, id: 'b', titulo: 'Converse com seu padrinho', tipo: 'SEMANAL', ativa: false, conclusoes: 3, xpCreditadoTotal: 60 }];
  assert.deepEqual(m.resumoMissoes(lista), { ativas: 1, conclusoes: 40, xp: 2920 });
  assert.deepEqual(m.filtrarMissoes(lista, { busca: 'padrinho' }).map((x) => x.id), ['b']);
  assert.deepEqual(m.filtrarMissoes(lista, { tipo: 'UNICA' }).map((x) => x.id), [ID]);
  assert.deepEqual(m.filtrarMissoes(lista, { status: 'inativa' }).map((x) => x.id), ['b']);
  assert.equal(m.periodoMissao(base), 'Ciclo 2026/2');
  assert.equal(m.periodoMissao({ ...base, tipo: 'SEMANAL' }), 'Contínua');
});

test('tabela mostra recompensa, conclusões e a ação certa por status', () => {
  const html = renderToStaticMarkup(createElement(m.ListaMissoes, { missoes: [base, { ...base, id: 'b', ativa: false }] }));
  assert.match(html, /Visite a biblioteca/);
  assert.match(html, /80 XP \+ 80 moedas/);
  assert.match(html, />37</);
  assert.match(html, /Desativar missão Visite a biblioteca/);
  assert.match(html, /Ativar missão Visite a biblioteca/);
});
