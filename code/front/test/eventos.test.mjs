import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'vite';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';

// Datas dos testes no fuso do campus (datetime-local é interpretado no fuso do navegador).
process.env.TZ = 'America/Sao_Paulo';
const storage = new Map();
globalThis.localStorage = { getItem: k => storage.get(k) || null, setItem: (k, v) => storage.set(k, v), removeItem: k => storage.delete(k) };
const server = await createServer({ server: { middlewareMode: true }, appType: 'custom' });
after(() => server.close());
const client = await server.ssrLoadModule('/src/api/client.js');
const ev = await server.ssrLoadModule('/src/pages/coordenacao/EventosPage.jsx');
const loc = await server.ssrLoadModule('/src/pages/coordenacao/SeletorLocal.jsx');
const SeletorLocal = loc.default;

const ID = '0b7c3d2e-1f4a-4b5c-8d9e-0f1a2b3c4d5e';
const AREA = '9a8b7c6d-5e4f-4a3b-9c2d-1e0f9a8b7c6d';
const local = { tipo: 'predio', id: 'P16', nome: 'Prédio 16', latitude: -19.9221, longitude: -43.9925, rota: { id: 'P16' } };
const base = { id: ID, titulo: 'Feira de profissões', descricao: 'Estandes dos cursos.', inicio: '2026-10-20T22:00:00.000Z', fim: '2026-10-21T00:00:00.000Z', situacao: 'em-breve', local, ativo: true, criadoPor: 1, criadoEm: '2026-10-01T12:00:00.000Z', atualizadoEm: '2026-10-10T12:00:00.000Z' };
const limite = { type: 'Polygon', coordinates: [[[-44.0, -19.93], [-43.98, -19.93], [-43.98, -19.91], [-44.0, -19.91], [-44.0, -19.93]]] };
const campus = { limite, margemMetros: 30, bbox: { west: -44.0, south: -19.93, east: -43.98, north: -19.91 }, centro: { latitude: -19.92, longitude: -43.99 } };
const predios = [
  { id: 'P16', nome: 'Prédio 16', codigo: '16', categoria: 'ACADEMIC', altura: 20, latitude: -19.9221, longitude: -43.9925 },
  { id: 'P29', nome: 'Cantina do Prédio 29', codigo: '29', categoria: 'CAFETERIA', altura: 8, latitude: -19.9235, longitude: -43.9941 },
  { id: 'OSM_455954541', nome: null, codigo: 'RU', categoria: 'CAFETERIA', altura: 6, latitude: -19.9240, longitude: -43.9950 },
  { id: 'P34', nome: 'Biblioteca Padre Alberto Antoniazzi', codigo: null, categoria: 'ACADEMIC', altura: 15, latitude: -19.9228, longitude: -43.9931 },
];
const areas = [{ id: AREA, nome: 'Praça central', categoria: 'PLAZA', latitude: -19.9226, longitude: -43.9928, geometria: { type: 'Polygon', coordinates: [[[-43.993, -19.923], [-43.992, -19.923], [-43.992, -19.922], [-43.993, -19.922], [-43.993, -19.923]]] } }];

function capturar(resposta = base, status = 200) {
  const chamadas = [];
  globalThis.fetch = async (url, opts) => { chamadas.push({ url, ...opts }); return new Response(JSON.stringify(resposta), { status }); };
  return chamadas;
}

test('cliente de eventos e mapa: método, URL, corpo e JWT da coordenação', async () => {
  client.persistSession({ accessToken: 'jwt-coord', usuario: { papel: 'coordenador' } });
  const corpo = { titulo: 'X', inicio: '2026-10-20T22:00:00.000Z', fim: '2026-10-21T00:00:00.000Z', local: { predioId: 'P16' }, ativo: true };
  const casos = [
    [() => client.api.campus(), 'GET', '/coordenacao/campus', undefined],
    [() => client.api.predios(), 'GET', '/mapa/predios', undefined],
    [() => client.api.areas(), 'GET', '/mapa/areas', undefined],
    [() => client.api.eventos(), 'GET', '/coordenacao/eventos', undefined],
    [() => client.api.evento(ID), 'GET', `/coordenacao/eventos/${ID}`, undefined],
    [() => client.api.criarEvento(corpo), 'POST', '/coordenacao/eventos', corpo],
    [() => client.api.atualizarEvento(ID, { local: null }), 'PATCH', `/coordenacao/eventos/${ID}`, { local: null }],
    [() => client.api.desativarEvento(ID), 'POST', `/coordenacao/eventos/${ID}/desativar`, undefined],
    [() => client.api.ativarEvento(ID), 'POST', `/coordenacao/eventos/${ID}/ativar`, undefined],
  ];
  for (const [chamar, metodo, caminho, esperado] of casos) {
    const chamadas = capturar();
    await chamar();
    assert.equal(chamadas.length, 1);
    assert.equal(chamadas[0].method, metodo);
    assert.equal(new URL(chamadas[0].url).pathname, caminho);
    assert.equal(chamadas[0].headers.Authorization, 'Bearer jwt-coord');
    if (esperado === undefined) assert.equal(chamadas[0].body, undefined);
    else {
      assert.equal(chamadas[0].headers['Content-Type'], 'application/json');
      assert.deepEqual(JSON.parse(chamadas[0].body), esperado);
    }
  }
});

test('id do evento é codificado na URL', async () => {
  const chamadas = capturar();
  await client.api.evento('a/b?c');
  assert.match(chamadas[0].url, /\/coordenacao\/eventos\/a%2Fb%3Fc$/);
});

test('propaga recusas do servidor (422 com motivo, 400 em lista, 503, 403)', async () => {
  capturar({ message: 'O ponto está fora da área do campus.', motivo: 'fora-do-campus' }, 422);
  await assert.rejects(() => client.api.criarEvento({}), (e) => e.status === 422 && e.motivo === 'fora-do-campus');
  capturar({ message: 'Local inexistente.', motivo: 'local-inexistente' }, 422);
  await assert.rejects(() => client.api.atualizarEvento(ID, {}), (e) => e.status === 422 && e.motivo === 'local-inexistente');
  capturar({ message: ['titulo não pode ser vazio', 'inicio: use data/hora ISO 8601 com fuso'] }, 400);
  await assert.rejects(() => client.api.criarEvento({}), (e) => e.status === 400 && /titulo não pode ser vazio, inicio/.test(e.message));
  capturar({ message: 'Sem versão ativa.' }, 503);
  await assert.rejects(() => client.api.campus(), (e) => e.status === 503);
  capturar({ message: 'Acesso restrito à coordenação.' }, 403);
  await assert.rejects(() => client.api.eventos(), (e) => e.status === 403 && /restrito/.test(e.message));
});

test('mensagemErroLocal traduz fora-do-campus, local-inexistente e 503', () => {
  assert.match(loc.mensagemErroLocal({ status: 422, motivo: 'fora-do-campus', message: 'x' }), /fora do campus/);
  assert.match(loc.mensagemErroLocal({ status: 422, motivo: 'local-inexistente', message: 'x' }), /não existem no mapa ativo/);
  assert.match(loc.mensagemErroLocal({ status: 503, message: 'x' }), /versão ativa/);
  assert.equal(loc.mensagemErroLocal({ status: 400, message: 'Título curto.' }), 'Título curto.');
  assert.equal(loc.mensagemErroLocal({}, 'Padrão.'), 'Padrão.');
});

test('datetime-local ↔ ISO com fuso (Z)', () => {
  assert.equal(ev.paraIso('2026-10-20T19:00'), '2026-10-20T22:00:00.000Z');
  assert.equal(ev.paraDatetimeLocal('2026-10-20T22:00:00.000Z'), '2026-10-20T19:00');
  assert.equal(ev.paraDatetimeLocal('2026-10-20T19:00:00-03:00'), '2026-10-20T19:00');
  assert.equal(ev.paraIso(''), null);
  assert.equal(ev.paraIso('amanhã'), null);
  assert.equal(ev.paraDatetimeLocal(null), '');
});

test('validarEvento: título, descrição, período e duração máxima', () => {
  const ok = { titulo: 'Feira', descricao: '', inicio: '2026-10-20T19:00', fim: '2026-10-20T21:00', local: loc.formDoLocal(null, { permitirSemLocal: true }) };
  assert.equal(ev.validarEvento(ok), '');
  assert.match(ev.validarEvento({ ...ok, titulo: '   ' }), /Informe o título/);
  assert.match(ev.validarEvento({ ...ok, titulo: ' ab ' }), /pelo menos 3/);
  assert.equal(ev.validarEvento({ ...ok, titulo: '  abc  ' }), '');
  assert.match(ev.validarEvento({ ...ok, titulo: 'x'.repeat(256) }), /no máximo 255/);
  assert.equal(ev.validarEvento({ ...ok, titulo: 'x'.repeat(255) }), '');
  assert.match(ev.validarEvento({ ...ok, descricao: 'x'.repeat(2001) }), /2000 caracteres/);
  assert.match(ev.validarEvento({ ...ok, inicio: '' }), /início/);
  assert.match(ev.validarEvento({ ...ok, fim: '' }), /término/);
  assert.match(ev.validarEvento({ ...ok, fim: ok.inicio }), /término deve ser depois do início/);
  assert.match(ev.validarEvento({ ...ok, fim: '2026-10-20T18:00' }), /depois do início/);
  assert.equal(ev.validarEvento({ ...ok, fim: '2026-11-20T19:00' }), '', 'exatamente 31 dias');
  assert.match(ev.validarEvento({ ...ok, fim: '2026-11-20T19:01' }), /no máximo 31 dias/);
  assert.match(ev.validarEvento({ ...ok, local: { ...ok.local, modo: 'predio', predioId: '' } }), /Escolha o prédio/);
  assert.match(ev.validarEvento({ ...ok, local: { ...ok.local, modo: 'ponto' } }), /Clique no mapa/);
  assert.equal(ev.validarEvento(ev.formDoEvento(base)), '');
});

test('corpoCriacaoEvento: ISO com Z, local só se escolhido, descrição opcional', () => {
  const form = { titulo: ' Feira ', descricao: '  ', inicio: '2026-10-20T19:00', fim: '2026-10-20T21:30', local: loc.formDoLocal(null, { permitirSemLocal: true }), ativo: false };
  assert.deepEqual(ev.corpoCriacaoEvento(form), { titulo: 'Feira', inicio: '2026-10-20T22:00:00.000Z', fim: '2026-10-21T00:30:00.000Z', ativo: false });
  const comLocal = { ...form, descricao: ' Estandes ', local: { ...form.local, modo: 'area', areaId: AREA }, ativo: true };
  assert.deepEqual(ev.corpoCriacaoEvento(comLocal), { titulo: 'Feira', descricao: 'Estandes', inicio: '2026-10-20T22:00:00.000Z', fim: '2026-10-21T00:30:00.000Z', local: { areaId: AREA }, ativo: true });
  const ponto = { ...form, local: { ...form.local, modo: 'ponto', latitude: -19.92, longitude: -43.99, predioId: 'P16' } };
  assert.deepEqual(ev.corpoCriacaoEvento(ponto).local, { latitude: -19.92, longitude: -43.99 });
});

test('camposAlteradosEvento envia só o que mudou; local null ao remover', () => {
  const form = ev.formDoEvento(base);
  assert.deepEqual(ev.camposAlteradosEvento(base, form), {});
  assert.deepEqual(ev.camposAlteradosEvento({ ...base, inicio: '2026-10-20T22:00:42.000Z' }, form), {}, 'segundos não editados');
  assert.deepEqual(ev.camposAlteradosEvento(base, { ...form, titulo: '  Feira de profissões ' }), {});
  assert.deepEqual(ev.camposAlteradosEvento(base, { ...form, titulo: 'Feira 2026' }), { titulo: 'Feira 2026' });
  assert.deepEqual(ev.camposAlteradosEvento(base, { ...form, descricao: '' }), { descricao: '' });
  assert.deepEqual(ev.camposAlteradosEvento(base, { ...form, fim: '2026-10-20T22:00' }), { fim: '2026-10-21T01:00:00.000Z' });
  assert.deepEqual(ev.camposAlteradosEvento(base, { ...form, local: { ...form.local, modo: 'nenhum' } }), { local: null });
  assert.deepEqual(ev.camposAlteradosEvento(base, { ...form, local: { ...form.local, predioId: 'P29' } }), { local: { predioId: 'P29' } });
  assert.deepEqual(ev.camposAlteradosEvento(base, { ...form, local: { ...form.local, modo: 'ponto', latitude: -19.92, longitude: -43.99 } }), { local: { latitude: -19.92, longitude: -43.99 } });
  const semLocal = { ...base, local: null };
  assert.deepEqual(ev.camposAlteradosEvento(semLocal, ev.formDoEvento(semLocal)), {});
  assert.equal('ativo' in ev.camposAlteradosEvento(base, { ...form, ativo: false }), false);
});

test('conversões de local: LocalDto ↔ formulário ↔ LocalEntrada', () => {
  assert.deepEqual(loc.entradaDoLocal(local), { predioId: 'P16' });
  assert.deepEqual(loc.entradaDoLocal({ tipo: 'area', id: AREA, nome: 'Praça', latitude: 1, longitude: 2, rota: null }), { areaId: AREA });
  assert.deepEqual(loc.entradaDoLocal({ tipo: 'ponto', id: null, nome: null, latitude: -19.92, longitude: -43.99, rota: { latitude: -19.92, longitude: -43.99 } }), { latitude: -19.92, longitude: -43.99 });
  assert.equal(loc.entradaDoLocal(null), null);
  assert.equal(loc.formDoLocal(null, { permitirSemLocal: true }).modo, 'nenhum');
  assert.equal(loc.formDoLocal(null).modo, 'predio');
  const form = loc.formDoLocal(local);
  assert.equal(form.modo, 'predio');
  assert.equal(form.predioId, 'P16');
  assert.deepEqual(loc.localParaEntrada(form), { predioId: 'P16' });
  assert.deepEqual(loc.localParaEntrada({ ...form, modo: 'area', areaId: AREA }), { areaId: AREA });
  assert.equal(loc.localParaEntrada({ ...form, modo: 'nenhum' }), null);
  assert.equal(loc.localParaEntrada({ ...form, modo: 'ponto' }), null);
  assert.equal(loc.mesmaEntrada(null, null), true);
  assert.equal(loc.mesmaEntrada({ predioId: 'P16' }, { predioId: 'P16' }), true);
  assert.equal(loc.mesmaEntrada({ predioId: 'P16' }, { areaId: 'P16' }), false);
  assert.equal(loc.mesmaEntrada({ latitude: 1, longitude: 2 }, { latitude: 1, longitude: 2.1 }), false);
  assert.equal(loc.mesmaEntrada({ predioId: 'P16' }, null), false);
  assert.equal(loc.validarLocal({ modo: 'nenhum' }, { obrigatorio: true }).length > 0, true);
  assert.equal(loc.validarLocal({ modo: 'area', areaId: '' }), 'Escolha a área do mapa.');
});

test('filtrarPredios busca por nome, código e id sem acentos', () => {
  const ids = (termo) => loc.filtrarPredios(predios, termo).map((p) => p.id);
  assert.deepEqual(ids(''), ['P16', 'P29', 'OSM_455954541', 'P34']);
  assert.deepEqual(ids('cantina'), ['P29']);
  assert.deepEqual(ids('PREDIO'), ['P16', 'P29']);
  assert.deepEqual(ids('ru'), ['OSM_455954541']);
  assert.deepEqual(ids('osm_4559'), ['OSM_455954541']);
  assert.deepEqual(ids('biblioteca'), ['P34']);
  assert.deepEqual(ids('p3'), ['P34']);
  assert.deepEqual(ids('zzz'), []);
  assert.equal(loc.rotuloPredio(predios[0]), 'Prédio 16 (16)');
  assert.equal(loc.rotuloPredio(predios[2]), 'Prédio RU');
  assert.equal(loc.rotuloPredio(predios[3]), 'Biblioteca Padre Alberto Antoniazzi');
  assert.equal(loc.rotuloLocal(null), 'Sem local');
  assert.equal(loc.rotuloLocal({ tipo: 'ponto', id: null, nome: null }), 'Ponto no mapa');
});

test('formatarPeriodo em pt-BR (mesmo dia e dias diferentes)', () => {
  assert.equal(ev.formatarPeriodo('2026-10-20T22:00:00.000Z', '2026-10-21T00:00:00.000Z'), '20/10/2026, 19:00–21:00');
  assert.equal(ev.formatarPeriodo('2026-10-20T12:00:00.000Z', '2026-10-22T21:00:00.000Z'), '20/10/2026 09:00 – 22/10/2026 18:00');
  assert.equal(ev.formatarPeriodo('x', 'y'), '—');
});

test('filtrarEventos: próximos, encerrados, inativos e todos', () => {
  const lista = [
    { ...base, id: 'a', situacao: 'em-breve' },
    { ...base, id: 'b', situacao: 'acontecendo' },
    { ...base, id: 'c', situacao: 'encerrado' },
    { ...base, id: 'd', situacao: 'em-breve', ativo: false },
  ];
  const ids = (f) => ev.filtrarEventos(lista, f).map((e) => e.id);
  assert.deepEqual(ids('proximos'), ['a', 'b']);
  assert.deepEqual(ids('encerrados'), ['c']);
  assert.deepEqual(ids('inativos'), ['d']);
  assert.deepEqual(ids('todos'), ['a', 'b', 'c', 'd']);
});

test('lista mostra período, situação, local, status e ações por estado', () => {
  const inativo = { ...base, id: 'b2', titulo: 'Semana de calouros', situacao: 'encerrado', local: null, ativo: false };
  const agora = { ...base, id: 'b3', titulo: 'Show na praça', situacao: 'acontecendo', local: { tipo: 'area', id: AREA, nome: 'Praça central', latitude: 1, longitude: 2, rota: null } };
  const html = renderToStaticMarkup(createElement(ev.ListaEventos, { eventos: [base, inativo, agora] }));
  assert.match(html, /Feira de profissões/);
  assert.match(html, /20\/10\/2026, 19:00–21:00/);
  assert.match(html, /class="flag purple">Em breve</);
  assert.match(html, /class="flag muted">Encerrado</);
  assert.match(html, /class="flag green">Acontecendo</);
  assert.match(html, /<td data-label="Local">Prédio 16<\/td>/);
  assert.match(html, /<td data-label="Local">Sem local<\/td>/);
  assert.match(html, /<td data-label="Local">Praça central<\/td>/);
  assert.match(html, />Ativo</);
  assert.match(html, />Inativo</);
  assert.match(html, /aria-label="Editar evento Feira de profissões"/);
  assert.match(html, /aria-label="Excluir \(desativar\) evento Feira de profissões"/);
  assert.match(html, /aria-label="Reativar evento Semana de calouros"/);
  assert.doesNotMatch(html, /Reativar evento Feira de profissões/);
  assert.doesNotMatch(html, /Excluir \(desativar\) evento Semana de calouros/);
});

test('confirmação de exclusão explica que some do mapa e pode ser reativado', () => {
  let confirmou = 0;
  const tree = ev.ConfirmarDesativacaoEvento({ evento: base, ocupado: false, erro: '', onConfirmar: () => confirmou++, onFechar: () => {} });
  tree.props.acoes.props.children[1].props.onClick();
  assert.equal(confirmou, 1);
  const html = renderToStaticMarkup(tree);
  assert.match(html, /Excluir o evento &quot;Feira de profissões&quot;\?/);
  assert.match(html, /some do mapa dos alunos/);
  assert.match(html, /reativá-lo/);
  const ocupado = ev.ConfirmarDesativacaoEvento({ evento: base, ocupado: true, erro: 'Falhou.', onConfirmar: () => confirmou++, onFechar: () => {} });
  ocupado.props.acoes.props.children[1].props.onClick();
  assert.equal(confirmou, 1);
  assert.match(renderToStaticMarkup(ocupado), /role="alert"[^>]*>.*Falhou\./);
});

test('formulário: criação vazia bloqueada; edição sem mudanças também', () => {
  const props = { mapa: {}, onCancelar: () => {}, onSalvo: () => {} };
  const criar = renderToStaticMarkup(createElement(ev.FormularioEvento, { ...props, original: null }));
  assert.match(criar, /Adicionar evento/);
  assert.match(criar, /type="datetime-local"/);
  assert.match(criar, /role="radio" aria-checked="true"[^>]*>Sem local</);
  assert.match(criar, /O evento fica sem lugar fixo no mapa/);
  assert.match(criar, /role="switch"[^>]*aria-checked="true"/);
  assert.match(criar, /<button type="submit"[^>]*disabled=""[^>]*>.*Criar evento/);
  assert.match(criar, /Informe o título do evento/);
  const editar = renderToStaticMarkup(createElement(ev.FormularioEvento, { ...props, original: base, mapa: { campus, predios, areas } }));
  assert.match(editar, /Editar evento &quot;Feira de profissões&quot;/);
  assert.match(editar, /value="2026-10-20T19:00"/);
  assert.match(editar, /value="2026-10-20T21:00"/);
  assert.match(editar, /role="radio" aria-checked="true"[^>]*>Prédio do mapa</);
  assert.match(editar, /<option value="P16" selected="">Prédio 16 \(16\)<\/option>/);
  assert.match(editar, /<button type="submit"[^>]*disabled=""[^>]*>.*Salvar alterações/);
  assert.match(editar, /Nenhuma alteração para salvar/);
  assert.doesNotMatch(editar, /role="switch"/);
});

test('seletor de local: modos, busca de prédio, área, ponto e aviso fora do campus', () => {
  const props = { campus, predios, areas, token: 'pk.teste', onChange: () => {} };
  const semLocal = renderToStaticMarkup(createElement(SeletorLocal, { ...props, valor: loc.formDoLocal(null) }));
  assert.doesNotMatch(semLocal, />Sem local</, 'restaurante: sem a opção "Sem local"');
  assert.match(semLocal, />Prédio do mapa</);
  assert.match(semLocal, />Área</);
  assert.match(semLocal, />Ponto no mapa</);
  assert.match(semLocal, /Selecione um prédio \(4\)/);
  assert.match(semLocal, /aria-label="Mapa do campus com o local escolhido destacado"/);
  const comSem = renderToStaticMarkup(createElement(SeletorLocal, { ...props, permitirSemLocal: true, valor: loc.formDoLocal(null, { permitirSemLocal: true }) }));
  assert.match(comSem, /role="radio" aria-checked="true"[^>]*>Sem local</);
  assert.doesNotMatch(comSem, /aria-label="Mapa do campus/);
  const area = renderToStaticMarkup(createElement(SeletorLocal, { ...props, valor: { ...loc.formDoLocal(null), modo: 'area', areaId: AREA } }));
  assert.match(area, new RegExp(`<option value="${AREA}" selected="">Praça central</option>`));
  assert.match(area, /Área escolhida/);
  const fora = renderToStaticMarkup(createElement(SeletorLocal, { ...props, valor: { ...loc.formDoLocal(null), modo: 'ponto', latitude: -19.95, longitude: -43.99 } }));
  assert.match(fora, /fora da área permitida/);
  assert.match(fora, /-19\.950000, -43\.990000/);
  assert.match(fora, /aria-label="Mapa do campus: clique para escolher o ponto/);
  const dentro = renderToStaticMarkup(createElement(SeletorLocal, { ...props, valor: { ...loc.formDoLocal(null), modo: 'ponto', latitude: -19.92, longitude: -43.99 } }));
  assert.doesNotMatch(dentro, /fora da área permitida/);
  assert.doesNotMatch(dentro, /Geofence/);
  const ausente = renderToStaticMarkup(createElement(SeletorLocal, { ...props, valor: { ...loc.formDoLocal(null), predioId: 'P99', nome: 'Prédio antigo' } }));
  assert.match(ausente, /<option value="P99" selected="">Prédio antigo<\/option>/);
  assert.match(ausente, /não está no mapa ativo/);
  const semToken = renderToStaticMarkup(createElement(SeletorLocal, { ...props, token: '', valor: { ...loc.formDoLocal(null), modo: 'ponto' } }));
  assert.match(semToken, /Mapa indisponível: configure VITE_MAPBOX_ACCESS_TOKEN/);
  assert.match(semToken, /Nenhuma posição escolhida/);
});
