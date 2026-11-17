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
const { ListaPucStops, ConfirmarDesativacao, FormularioPucStop, validarPucStop, camposAlterados, corpoCriacao, formDoPucStop } = await server.ssrLoadModule('/src/pages/coordenacao/PucStopsPage.jsx');
const geo = await server.ssrLoadModule('/src/pages/coordenacao/SeletorPucStopMapa.jsx');
const SeletorPucStopMapa = geo.default;

const ID = '6f1c2b8e-3a4d-4e5f-9a0b-1c2d3e4f5a6b';
const base = { id: ID, nome: 'Totem Biblioteca', latitude: -19.9230, longitude: -43.9930, raioMetros: 30, xp: 50, ativo: true, criadoPor: 1, criadoEm: '2026-10-01T12:00:00.000Z', atualizadoEm: '2026-10-10T12:00:00.000Z', coletas: 7 };
// Quadrado de teste (não é o campus real): lon -44.00..-43.98, lat -19.93..-19.91.
const limite = { type: 'Polygon', coordinates: [[[-44.0, -19.93], [-43.98, -19.93], [-43.98, -19.91], [-44.0, -19.91], [-44.0, -19.93]]] };

function capturar(resposta = base, status = 200) {
  const chamadas = [];
  globalThis.fetch = async (url, opts) => { chamadas.push({ url, ...opts }); return new Response(JSON.stringify(resposta), { status }); };
  return chamadas;
}

test('cliente usa método, URL, corpo e JWT da coordenação', async () => {
  client.persistSession({ accessToken: 'jwt-coord', usuario: { papel: 'coordenador' } });
  const casos = [
    [() => client.api.pucstops(), 'GET', '/coordenacao/pucstops', undefined],
    [() => client.api.campusPucStops(), 'GET', '/coordenacao/pucstops/campus', undefined],
    [() => client.api.pucstop(ID), 'GET', `/coordenacao/pucstops/${ID}`, undefined],
    [() => client.api.criarPucStop({ nome: 'X', latitude: -19.92, longitude: -43.99, xp: 10, raioMetros: 25, ativo: true }), 'POST', '/coordenacao/pucstops', { nome: 'X', latitude: -19.92, longitude: -43.99, xp: 10, raioMetros: 25, ativo: true }],
    [() => client.api.atualizarPucStop(ID, { xp: 80 }), 'PATCH', `/coordenacao/pucstops/${ID}`, { xp: 80 }],
    [() => client.api.desativarPucStop(ID), 'POST', `/coordenacao/pucstops/${ID}/desativar`, undefined],
    [() => client.api.ativarPucStop(ID), 'POST', `/coordenacao/pucstops/${ID}/ativar`, undefined],
  ];
  for (const [chamar, metodo, caminho, corpo] of casos) {
    const chamadas = capturar();
    await chamar();
    assert.equal(chamadas.length, 1);
    assert.equal(chamadas[0].method, metodo);
    assert.equal(new URL(chamadas[0].url).pathname, caminho);
    assert.equal(chamadas[0].headers.Authorization, 'Bearer jwt-coord');
    if (corpo === undefined) assert.equal(chamadas[0].body, undefined);
    else assert.deepEqual(JSON.parse(chamadas[0].body), corpo);
  }
});

test('id é codificado na URL', async () => {
  const chamadas = capturar();
  await client.api.pucstop('a/b?c');
  assert.match(chamadas[0].url, /\/coordenacao\/pucstops\/a%2Fb%3Fc$/);
});

test('propaga recusas do servidor (422 fora-do-campus, 403)', async () => {
  capturar({ message: 'O ponto está fora da área do campus.', motivo: 'fora-do-campus' }, 422);
  await assert.rejects(() => client.api.criarPucStop({}), (e) => e.status === 422 && e.motivo === 'fora-do-campus' && /fora da área do campus/.test(e.message));
  capturar({ message: 'Acesso restrito à coordenação.' }, 403);
  await assert.rejects(() => client.api.pucstops(), (e) => e.status === 403 && /restrito/.test(e.message));
});

test('validarPucStop: nome, XP, raio e ponto na criação', () => {
  const ok = { nome: 'Totem', xp: '50', raioMetros: '30', latitude: -19.92, longitude: -43.99 };
  assert.equal(validarPucStop(ok, { criando: true }), '');
  assert.match(validarPucStop({ ...ok, nome: '   ' }), /Informe o nome/);
  assert.match(validarPucStop({ ...ok, nome: 'x'.repeat(121) }), /120 caracteres/);
  assert.equal(validarPucStop({ ...ok, nome: `  ${'x'.repeat(120)}  ` }), '');
  // BL-50: só 10, 20, 30, 40 ou 50 XP (o servidor também recusa o resto).
  for (const xp of ['', '0', '1', '15', '25', '60', '1000', '2.5', 'abc', '-3']) assert.match(validarPucStop({ ...ok, xp }), /10, 20, 30, 40 ou 50 XP/, `xp=${xp}`);
  for (const xp of ['10', '20', '30', '40', '50']) assert.equal(validarPucStop({ ...ok, xp }), '');
  for (const raioMetros of ['', '9.9', '201', 'x']) assert.match(validarPucStop({ ...ok, raioMetros }), /entre 10 e 200 metros/, `raio=${raioMetros}`);
  for (const raioMetros of ['10', '200', '12.5']) assert.equal(validarPucStop({ ...ok, raioMetros }), '');
  assert.match(validarPucStop({ ...ok, latitude: null, longitude: null }, { criando: true }), /Escolha a posição/);
  assert.equal(validarPucStop(formDoPucStop(base), { criando: false }), '');
});

test('camposAlterados envia só o que mudou; latitude e longitude juntas', () => {
  const form = formDoPucStop(base);
  assert.deepEqual(camposAlterados(base, form), {});
  assert.deepEqual(camposAlterados(base, { ...form, nome: '  Totem Biblioteca  ' }), {});
  assert.deepEqual(camposAlterados(base, { ...form, nome: 'Totem Central ' }), { nome: 'Totem Central' });
  assert.deepEqual(camposAlterados(base, { ...form, xp: '80' }), { xp: 80 });
  assert.deepEqual(camposAlterados(base, { ...form, raioMetros: '45' }), { raioMetros: 45 });
  assert.deepEqual(camposAlterados(base, { ...form, latitude: -19.924 }), { latitude: -19.924, longitude: base.longitude });
  assert.deepEqual(camposAlterados(base, { ...form, longitude: -43.994 }), { latitude: base.latitude, longitude: -43.994 });
  assert.equal('ativo' in camposAlterados(base, { ...form, ativo: false }), false);
});

test('corpoCriacao converte 25 XP e mantém ativo', () => {
  assert.deepEqual(corpoCriacao({ nome: ' Totem ', xp: '25', raioMetros: '15', latitude: -19.92, longitude: -43.99, ativo: false }),
    { nome: 'Totem', xp: 25, raioMetros: 15, latitude: -19.92, longitude: -43.99, ativo: false });
});

test('pontoDentroDoPoligono (ray casting, buracos e MultiPolygon)', () => {
  assert.equal(geo.pontoDentroDoPoligono(-43.99, -19.92, limite), true);
  assert.equal(geo.pontoDentroDoPoligono(-43.97, -19.92, limite), false);
  assert.equal(geo.pontoDentroDoPoligono(-43.99, -19.95, limite), false);
  assert.equal(geo.pontoDentroDoPoligono(NaN, -19.92, limite), false);
  assert.equal(geo.pontoDentroDoPoligono(-43.99, -19.92, null), false);
  const comBuraco = { type: 'Polygon', coordinates: [limite.coordinates[0], [[-43.995, -19.925], [-43.985, -19.925], [-43.985, -19.915], [-43.995, -19.915], [-43.995, -19.925]]] };
  assert.equal(geo.pontoDentroDoPoligono(-43.99, -19.92, comBuraco), false);
  assert.equal(geo.pontoDentroDoPoligono(-43.998, -19.92, comBuraco), true);
  assert.equal(geo.pontoDentroDoPoligono(-43.99, -19.92, { type: 'MultiPolygon', coordinates: [limite.coordinates] }), true);
});

test('circuloGeofence: anel fechado com raio aproximadamente correto', () => {
  const circulo = geo.circuloGeofence(-19.92, -43.99, 50, 64);
  assert.equal(circulo.type, 'Polygon');
  const anel = circulo.coordinates[0];
  assert.equal(anel.length, 65);
  assert.deepEqual(anel[0], anel[64]);
  for (const [lon, lat] of anel) {
    const d = geo.distanciaMetros({ latitude: -19.92, longitude: -43.99 }, { latitude: lat, longitude: lon });
    assert.ok(Math.abs(d - 50) < 0.5, `distância ${d}`);
  }
  assert.equal(geo.pontoDentroDoPoligono(-43.99, -19.92, circulo), true);
});

test('lista mostra status, XP, raio, coletas e ações por estado', () => {
  const inativo = { ...base, id: 'b2', nome: 'Totem Prédio 34', ativo: false, xp: 120, raioMetros: 12.5, coletas: 0 };
  const html = renderToStaticMarkup(createElement(ListaPucStops, { pucstops: [base, inativo] }));
  assert.match(html, /Totem Biblioteca/);
  assert.match(html, /Totem Prédio 34/);
  assert.match(html, />Ativo</);
  assert.match(html, />Inativo</);
  assert.match(html, /50 XP/);
  assert.match(html, /120 XP/);
  assert.match(html, /30 m/);
  assert.match(html, /12,5 m/);
  assert.match(html, /<td data-label="Coletas">7<\/td>/);
  assert.match(html, /aria-label="Editar PucStop Totem Biblioteca"/);
  assert.match(html, /aria-label="Excluir \(desativar\) PucStop Totem Biblioteca"/);
  assert.match(html, /aria-label="Reativar PucStop Totem Prédio 34"/);
  assert.doesNotMatch(html, /Reativar PucStop Totem Biblioteca/);
  assert.doesNotMatch(html, /Excluir \(desativar\) PucStop Totem Prédio 34/);
});

test('confirmação de exclusão explica que o histórico é preservado', () => {
  let confirmou = 0;
  const tree = ConfirmarDesativacao({ pucstop: base, ocupado: false, erro: '', onConfirmar: () => confirmou++, onFechar: () => {} });
  tree.props.acoes.props.children[1].props.onClick();
  assert.equal(confirmou, 1);
  const html = renderToStaticMarkup(tree);
  assert.match(html, /Excluir o PucStop &quot;Totem Biblioteca&quot;\?/);
  assert.match(html, /desativado/);
  assert.match(html, /histórico/);
  assert.match(html, /7 coleta/);
  const ocupado = ConfirmarDesativacao({ pucstop: base, ocupado: true, erro: 'Falhou.', onConfirmar: () => confirmou++, onFechar: () => {} });
  ocupado.props.acoes.props.children[1].props.onClick();
  assert.equal(confirmou, 1);
  assert.match(renderToStaticMarkup(ocupado), /role="alert"[^>]*>.*Falhou\./);
});

test('sem token o mapa fica indisponível com mensagem clara; coordenadas só leitura', () => {
  const campus = { limite, margemMetros: 30, bbox: { west: -44.0, south: -19.93, east: -43.98, north: -19.91 }, centro: { latitude: -19.92, longitude: -43.99 } };
  const html = renderToStaticMarkup(createElement(SeletorPucStopMapa, { campus, token: '', ponto: { latitude: -19.9230001, longitude: -43.9930001 }, raioMetros: '30', onChange: () => {} }));
  assert.match(html, /role="alert"/);
  assert.match(html, /Mapa indisponível: configure VITE_MAPBOX_ACCESS_TOKEN/);
  assert.match(html, /-19\.923000, -43\.993000/);
  assert.doesNotMatch(html, /<input/);
  const secreto = renderToStaticMarkup(createElement(SeletorPucStopMapa, { campus, token: 'sk.abc', ponto: {}, raioMetros: '30' }));
  assert.match(secreto, /token público \(pk\.\)/);
  assert.match(secreto, /Nenhuma posição escolhida/);
});

test('ponto fora da área permitida mostra aviso', () => {
  const campus = { limite, bbox: { west: -44.0, south: -19.93, east: -43.98, north: -19.91 } };
  const fora = renderToStaticMarkup(createElement(SeletorPucStopMapa, { campus, token: 'pk.teste', ponto: { latitude: -19.95, longitude: -43.99 }, raioMetros: '30' }));
  assert.match(fora, /fora da área permitida/);
  assert.match(fora, /aria-label="Mapa do campus/);
  const dentro = renderToStaticMarkup(createElement(SeletorPucStopMapa, { campus, token: 'pk.teste', ponto: { latitude: -19.92, longitude: -43.99 }, raioMetros: '30' }));
  assert.doesNotMatch(dentro, /fora da área permitida/);
  const erro = renderToStaticMarkup(createElement(SeletorPucStopMapa, { campus: null, erroCampus: 'o mapa do campus ainda não tem uma versão ativa.', token: 'pk.teste', ponto: {}, raioMetros: '30' }));
  assert.match(erro, /Área do campus indisponível: o mapa do campus ainda não tem uma versão ativa/);
});

test('formulário: criação sem ponto fica bloqueada; edição sem mudanças também', () => {
  const props = { campus: null, erroCampus: '', outros: [], onCancelar: () => {}, onSalvo: () => {} };
  const criar = renderToStaticMarkup(createElement(FormularioPucStop, { ...props, original: null }));
  assert.match(criar, /Novo totem/);
  assert.match(criar, /Raio da geofence \(m\)/);
  assert.match(criar, /Escolher no mapa 3D/);
  assert.doesNotMatch(criar, /aria-label="Mapa do campus/);
  assert.match(criar, /role="switch"[^>]*aria-checked="true"/);
  assert.match(criar, /<button type="submit"[^>]*disabled=""[^>]*>.*Criar totem/);
  assert.match(criar, /Informe o nome do PucStop/);
  const editar = renderToStaticMarkup(createElement(FormularioPucStop, { ...props, original: base }));
  assert.match(editar, /Editar totem &quot;Totem Biblioteca&quot;/);
  assert.match(editar, /só para novas coletas/);
  assert.match(editar, /não apaga coletas anteriores/);
  assert.match(editar, /<button type="submit"[^>]*disabled=""[^>]*>.*Salvar alterações/);
  assert.match(editar, /Nenhuma alteração para salvar/);
  assert.doesNotMatch(editar, /role="switch"/);
});
