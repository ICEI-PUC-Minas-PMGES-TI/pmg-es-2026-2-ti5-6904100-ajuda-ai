import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'vite';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';

globalThis.window ??= globalThis;
const storage = new Map();
globalThis.localStorage = { getItem: k => storage.get(k) || null, setItem: (k, v) => storage.set(k, v), removeItem: k => storage.delete(k) };
const server = await createServer({ server: { middlewareMode: true }, appType: 'custom' });
after(() => server.close());
const client = await server.ssrLoadModule('/src/api/client.js');
const resgates = await server.ssrLoadModule('/src/pages/coordenacao/ResgatesPage.jsx');
const xp = await server.ssrLoadModule('/src/pages/coordenacao/XpPage.jsx');

const ID = '6f1c2b8e-3a4d-4e5f-9a0b-1c2d3e4f5a6b';
const resgate = (extra = {}) => ({
  id: ID, codigo: 'A1B2C3D4E5', situacao: 'aguardando_entrega',
  participante: { id: 7, nome: 'Camila Souza', email: 'camila@pucminas.edu.br' },
  recompensa: { id: 'r1', nome: 'Caneca', versao: 2, programaCodigo: null },
  custoXp: 120, condicoesRetirada: 'Coordenação', resgatadoEm: '2026-11-10T15:00:00.000Z',
  entregueEm: null, canceladoEm: null, motivoCancelamento: null, responsavel: null, ...extra,
});

test('cliente: rotas de resgates e de XP da coordenação', async () => {
  client.persistSession({ accessToken: 'jwt-coord', usuario: { papel: 'coordenador' } });
  const chamadas = [];
  globalThis.fetch = async (url, opts) => { chamadas.push({ url, ...opts }); return new Response('{}', { status: 200 }); };
  const casos = [
    [() => client.api.resgatesCoordenacao({ situacao: 'entregue', busca: '' }), 'GET', '/coordenacao/resgates?situacao=entregue', undefined],
    [() => client.api.resgateCoordenacao(ID), 'GET', `/coordenacao/resgates/${ID}`, undefined],
    [() => client.api.entregarResgate(ID), 'POST', `/coordenacao/resgates/${ID}/entregar`, undefined],
    [() => client.api.cancelarResgate(ID, 'Sem retirada'), 'POST', `/coordenacao/resgates/${ID}/cancelar`, { motivo: 'Sem retirada' }],
    [() => client.api.xpParticipantes('cam'), 'GET', '/coordenacao/xp?busca=cam', undefined],
    [() => client.api.xpParticipante(7, { limite: 20, antes: 99 }), 'GET', '/coordenacao/xp/7?limite=20&antes=99', undefined],
    [() => client.api.ajustarXp(7, { quantidade: -5, motivo: 'Erro', chaveIdempotencia: ID }), 'POST', '/coordenacao/xp/7/ajustes', { quantidade: -5, motivo: 'Erro', chaveIdempotencia: ID }],
  ];
  for (const [chamar, metodo, caminho, corpo] of casos) {
    chamadas.length = 0;
    await chamar();
    const { url, method, headers, body } = chamadas[0];
    const u = new URL(url);
    assert.equal(method ?? 'GET', metodo);
    assert.equal(u.pathname + u.search, caminho);
    assert.equal(headers.Authorization, 'Bearer jwt-coord');
    assert.deepEqual(body ? JSON.parse(body) : undefined, corpo);
  }
});

test('resgates: motivo obrigatório e filtro por situação e busca', () => {
  assert.match(resgates.validarMotivo('  '), /motivo/);
  assert.match(resgates.validarMotivo('x'.repeat(301)), /300/);
  assert.equal(resgates.validarMotivo('Sem retirada'), '');
  const lista = [resgate(), resgate({ id: 'b', codigo: 'FFFF000011', situacao: 'entregue', participante: { id: 8, nome: 'João', email: 'joao@x' } })];
  assert.equal(resgates.filtrarResgates(lista, { situacao: 'entregue' }).length, 1);
  assert.equal(resgates.filtrarResgates(lista, { busca: 'camila' }).length, 1);
  assert.equal(resgates.filtrarResgates(lista, { busca: 'a1b2' }).length, 1);
  assert.equal(resgates.filtrarResgates(lista, { busca: 'caneca' }).length, 2);
});

test('resgates: só o aguardando tem ações; concluídos mostram quem e quando', () => {
  const html = renderToStaticMarkup(createElement(resgates.ListaResgates, {
    resgates: [
      resgate(),
      resgate({ id: 'e', situacao: 'entregue', entregueEm: '2026-11-11T10:05:00.000Z', responsavel: { id: 3, email: 'renata@pucminas.edu.br' } }),
      resgate({ id: 'c', situacao: 'cancelado', canceladoEm: '2026-11-11T10:05:00.000Z', motivoCancelamento: 'Danificada', responsavel: { id: null, email: 'renata@pucminas.edu.br' } }),
    ],
  }));
  assert.equal((html.match(/>\s*Entregar</g) || []).length, 1);
  assert.equal((html.match(/>\s*Cancelar</g) || []).length, 1);
  assert.match(html, /Aguardando entrega/);
  assert.match(html, /Entregue em .* por renata@pucminas\.edu\.br/);
  assert.match(html, /Cancelado em .*: Danificada/);
  assert.match(html, /120 moedas/);
  assert.match(html, /Código A1B2C3D4E5/);
});

test('ajuste de XP: limite, débito até o saldo e corpo com sinal', () => {
  const v = (f, moedas = 50) => xp.validarAjusteXp({ sentido: 'credito', quantidade: '10', motivo: 'Mutirão', ...f }, moedas);
  assert.equal(v({}), '');
  assert.match(v({ quantidade: '0' }), /maior que zero/);
  assert.match(v({ quantidade: '1.5' }), /inteira/);
  assert.match(v({ quantidade: '201' }), /200/);
  assert.match(v({ sentido: 'debito', quantidade: '51' }), /50 moedas/);
  assert.equal(v({ sentido: 'debito', quantidade: '50' }), '');
  assert.match(v({ motivo: ' ' }), /motivo/);
  assert.deepEqual(xp.corpoAjusteXp({ sentido: 'debito', quantidade: ' 12 ', motivo: ' Erro ' }, ID), { quantidade: -12, motivo: 'Erro', chaveIdempotencia: ID });
});

test('lista de XP mostra nível, XP acumulado e moedas', () => {
  const html = renderToStaticMarkup(createElement(xp.ListaParticipantesXp, {
    participantes: [{ usuario: { id: 7, nome: 'Camila', email: 'c@x' }, moedas: 1200, xpAcumulado: 1500, nivel: { numero: 8, nome: 'Guia do campus' }, atualizadoEm: null }],
  }));
  assert.match(html, /8 · Guia do campus/);
  assert.match(html, /1\.500 XP/);
  assert.match(html, /1\.200/);
});
