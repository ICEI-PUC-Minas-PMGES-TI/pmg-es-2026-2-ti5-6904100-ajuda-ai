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
const pendente = await server.ssrLoadModule('/src/pages/coordenacao/ajustePendente.js');

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

test('resgates: motivo obrigatório', () => {
  assert.match(resgates.validarMotivo('  '), /motivo/);
  assert.match(resgates.validarMotivo('x'.repeat(301)), /300/);
  assert.equal(resgates.validarMotivo('Sem retirada'), '');
});

test('resgates: filtros vão para o servidor, que filtra antes de paginar', async () => {
  client.persistSession({ accessToken: 'jwt-coord', usuario: { papel: 'coordenador' } });
  const urls = [];
  globalThis.fetch = async (url) => { urls.push(new URL(url)); return new Response('{}', { status: 200 }); };
  const enviado = async (filtros) => {
    urls.length = 0;
    await client.api.resgatesCoordenacao(resgates.consultaResgates(filtros));
    assert.equal(urls.length, 1);
    assert.equal(urls[0].pathname, '/coordenacao/resgates');
    return Object.fromEntries(urls[0].searchParams);
  };
  const limite = String(resgates.PAGINA_RESGATES);
  // Sem filtro: só o tamanho da página; nada de filtrar a página no navegador.
  assert.deepEqual(await enviado({}), { limite });
  assert.deepEqual(await enviado({ situacao: 'entregue' }), { situacao: 'entregue', limite });
  // A busca vai aparada e vazia não é enviada.
  assert.deepEqual(await enviado({ busca: '  camila  ' }), { busca: 'camila', limite });
  assert.deepEqual(await enviado({ busca: '   ' }), { limite });
  assert.deepEqual(await enviado({ programa: 'PUCSTOPS' }), { programa: 'PUCSTOPS', limite });
  // "Sem programa" vira semPrograma=true, sem mandar o marcador interno como programa.
  assert.deepEqual(await enviado({ programa: resgates.SEM_PROGRAMA }), { semPrograma: 'true', limite });
  // Próxima página: os mesmos filtros e o cursor.
  assert.deepEqual(
    await enviado({ situacao: 'aguardando_entrega', programa: 'PUCSTOPS', busca: 'a1b2', cursor: 'abc' }),
    { situacao: 'aguardando_entrega', programa: 'PUCSTOPS', busca: 'a1b2', limite, cursor: 'abc' },
  );
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

test('ajuste pendente: reenvio editado não troca o envio pendente e o aviso vem do extrato', () => {
  const mem = new Map();
  const loja = { getItem: k => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, v), removeItem: k => mem.delete(k) };
  const motivo = 'Mutirão';
  // 1º envio: crédito de 50, gravado no servidor, mas a resposta se perde.
  const primeiro = xp.corpoAjusteXp({ sentido: 'credito', quantidade: '50', motivo }, ID);
  pendente.gravarPendente(7, primeiro, loja);
  // Reenvio com a MESMA chave, editado para 80; a resposta também se perde.
  const reenvio = xp.corpoAjusteXp({ sentido: 'credito', quantidade: '80', motivo }, ID);
  pendente.gravarPendente(7, reenvio, loja);

  const guardado = pendente.lerPendente(7, loja);
  assert.equal(guardado.chave, ID);
  assert.deepEqual(guardado.corpo, primeiro, 'o envio pendente original é preservado');
  assert.deepEqual(guardado.ultimo, reenvio);
  // Ainda sem confirmação, o formulário volta com o que foi enviado por último.
  assert.deepEqual(pendente.formularioDoPendente(guardado), { sentido: 'credito', quantidade: '80', motivo });

  // Ao reabrir, o extrato mostra o crédito de 50 com a chave: o aviso confirma 50, não 80.
  const ajustes = [{ id: 'a1', chaveIdempotencia: ID, quantidade: 50, motivo, responsavel: { id: 3, email: 'c@x' }, saldoApos: 50, criadoEm: '2026-11-20T10:00:00.000Z' }];
  const gravado = pendente.ajusteDoPendente(guardado, ajustes);
  assert.equal(gravado.quantidade, 50);
  const aviso = xp.avisoAjusteJaRegistrado(gravado);
  assert.match(aviso, /\(\+50: Mutirão\) já estava registrado/);
  assert.doesNotMatch(aviso, /80/);

  // Chave ausente do extrato: nada confirmado.
  assert.equal(pendente.ajusteDoPendente(guardado, [{ ...ajustes[0], chaveIdempotencia: 'outra' }]), null);
  assert.equal(pendente.ajusteDoPendente(null, ajustes), null);
});

test('ajuste pendente: chave nova substitui; registro adulterado é descartado', () => {
  const mem = new Map();
  const loja = { getItem: k => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, v), removeItem: k => mem.delete(k) };
  const OUTRA = '00000000-0000-4000-8000-000000000000';
  pendente.gravarPendente(7, xp.corpoAjusteXp({ sentido: 'credito', quantidade: '50', motivo: 'Mutirão' }, ID), loja);
  const novo = xp.corpoAjusteXp({ sentido: 'debito', quantidade: '5', motivo: 'Erro' }, OUTRA);
  pendente.gravarPendente(7, novo, loja);
  const substituido = pendente.lerPendente(7, loja);
  assert.equal(substituido.chave, OUTRA);
  assert.deepEqual(substituido.corpo, novo);
  assert.equal(substituido.ultimo, undefined);
  // `ultimo` com outra chave não é aceito: o registro inteiro sai.
  const [k] = mem.keys();
  mem.set(k, JSON.stringify({ chave: OUTRA, corpo: novo, ultimo: { ...novo, chaveIdempotencia: ID }, em: Date.now() }));
  assert.equal(pendente.lerPendente(7, loja), null);
  assert.equal(mem.size, 0);
});
