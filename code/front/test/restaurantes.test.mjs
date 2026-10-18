import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'vite';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';

process.env.TZ = 'America/Sao_Paulo';
const storage = new Map();
globalThis.localStorage = { getItem: k => storage.get(k) || null, setItem: (k, v) => storage.set(k, v), removeItem: k => storage.delete(k) };
const server = await createServer({ server: { middlewareMode: true }, appType: 'custom' });
after(() => server.close());
const client = await server.ssrLoadModule('/src/api/client.js');
const rs = await server.ssrLoadModule('/src/pages/coordenacao/RestaurantesPage.jsx');
const loc = await server.ssrLoadModule('/src/pages/coordenacao/SeletorLocal.jsx');

const ID = '3c2b1a0f-9e8d-4c7b-a6f5-e4d3c2b1a0f9';
const CARDAPIO = '7d6c5b4a-3f2e-4d1c-b0a9-f8e7d6c5b4a3';
const AREA = '9a8b7c6d-5e4f-4a3b-9c2d-1e0f9a8b7c6d';
const local = { tipo: 'predio', id: 'P16', nome: 'Cantina do Prédio 16', latitude: -19.9221, longitude: -43.9925, rota: { id: 'P16' } };
const semana = [1, 2, 3, 4, 5].map((dia) => ({ dia, abre: '07:00', fecha: '21:00' }));
const base = { id: ID, nome: 'Cantina do Prédio 16', descricao: 'Salgados e almoço.', local, horarios: semana, abertoAgora: true, cardapioHoje: true, ativo: true, criadoPor: 1, criadoEm: '2026-10-01T12:00:00.000Z', atualizadoEm: '2026-10-10T12:00:00.000Z', cardapios: 2 };
const cardapio = { id: CARDAPIO, url: 'https://exemplo.blob.core.windows.net/restaurant-menus/restaurantes/x/cardapios/y.png', tipoConteudo: 'image/png', tamanhoBytes: 1288490, validoDe: '2026-10-12', validoAte: '2026-10-18', criadoEm: '2026-10-12T10:00:00.000Z' };

function capturar(resposta = base, status = 200) {
  const chamadas = [];
  globalThis.fetch = async (url, opts) => { chamadas.push({ url, ...opts }); return new Response(JSON.stringify(resposta), { status }); };
  return chamadas;
}

const arquivo = (nome, tipo, tamanho = 2048) => ({ name: nome, type: tipo, size: tamanho });

test('cliente de restaurantes: método, URL, corpo e JWT da coordenação', async () => {
  client.persistSession({ accessToken: 'jwt-coord', usuario: { papel: 'coordenador' } });
  const corpo = { nome: 'Cantina', local: { predioId: 'P16' }, horarios: semana, ativo: true };
  const casos = [
    [() => client.api.restaurantes(), 'GET', '/coordenacao/restaurantes', undefined],
    [() => client.api.restaurante(ID), 'GET', `/coordenacao/restaurantes/${ID}`, undefined],
    [() => client.api.sugestoesRestaurantes(), 'GET', '/coordenacao/restaurantes/sugestoes', undefined],
    [() => client.api.criarRestaurante(corpo), 'POST', '/coordenacao/restaurantes', corpo],
    [() => client.api.atualizarRestaurante(ID, { horarios: [] }), 'PATCH', `/coordenacao/restaurantes/${ID}`, { horarios: [] }],
    [() => client.api.desativarRestaurante(ID), 'POST', `/coordenacao/restaurantes/${ID}/desativar`, undefined],
    [() => client.api.ativarRestaurante(ID), 'POST', `/coordenacao/restaurantes/${ID}/ativar`, undefined],
    [() => client.api.cardapios(ID), 'GET', `/coordenacao/restaurantes/${ID}/cardapios`, undefined],
    [() => client.api.removerCardapio(CARDAPIO), 'DELETE', `/coordenacao/cardapios/${CARDAPIO}`, undefined],
  ];
  for (const [chamar, metodo, caminho, esperado] of casos) {
    const chamadas = capturar();
    await chamar();
    assert.equal(chamadas.length, 1);
    assert.equal(chamadas[0].method, metodo);
    assert.equal(new URL(chamadas[0].url).pathname, caminho);
    assert.equal(chamadas[0].headers.Authorization, 'Bearer jwt-coord');
    if (esperado === undefined) assert.equal(chamadas[0].body, undefined);
    else assert.deepEqual(JSON.parse(chamadas[0].body), esperado);
  }
  const ids = capturar();
  await client.api.restaurante('a/b?c');
  await client.api.cardapios('a/b');
  await client.api.removerCardapio('x?y');
  assert.match(ids[0].url, /\/coordenacao\/restaurantes\/a%2Fb%3Fc$/);
  assert.match(ids[1].url, /\/coordenacao\/restaurantes\/a%2Fb\/cardapios$/);
  assert.match(ids[2].url, /\/coordenacao\/cardapios\/x%3Fy$/);
});

test('enviarCardapio usa multipart (FormData) com os campos certos e sem JSON', async () => {
  const chamadas = capturar(cardapio, 201);
  const file = new File([new Uint8Array([137, 80, 78, 71])], 'cardapio.png', { type: 'image/png' });
  const resposta = await client.api.enviarCardapio(ID, { arquivo: file, validoDe: '2026-10-19', validoAte: '2026-10-25', substitui: CARDAPIO });
  assert.equal(resposta.id, CARDAPIO);
  const [c] = chamadas;
  assert.equal(c.method, 'POST');
  assert.equal(new URL(c.url).pathname, `/coordenacao/restaurantes/${ID}/cardapios`);
  assert.equal(c.headers.Authorization, 'Bearer jwt-coord');
  assert.equal(c.headers['Content-Type'], undefined);
  assert.ok(c.body instanceof FormData);
  assert.equal(c.body.get('arquivo').name, 'cardapio.png');
  assert.equal(c.body.get('validoDe'), '2026-10-19');
  assert.equal(c.body.get('validoAte'), '2026-10-25');
  assert.equal(c.body.get('substitui'), CARDAPIO);
  const sem = capturar(cardapio, 201);
  await client.api.enviarCardapio(ID, { arquivo: file, validoDe: '2026-10-19', validoAte: '2026-10-19' });
  assert.equal(sem[0].body.has('substitui'), false);
  assert.deepEqual([...sem[0].body.keys()].sort(), ['arquivo', 'validoAte', 'validoDe']);
});

test('propaga recusas do servidor (422 motivo, 413, 400 em lista, 403)', async () => {
  capturar({ message: 'Local inexistente no mapa ativo.', motivo: 'local-inexistente' }, 422);
  await assert.rejects(() => client.api.criarRestaurante({}), (e) => e.status === 422 && e.motivo === 'local-inexistente');
  capturar({ message: 'Payload Too Large' }, 413);
  await assert.rejects(() => client.api.enviarCardapio(ID, { arquivo: new File(['x'], 'a.pdf'), validoDe: '2026-10-19', validoAte: '2026-10-20' }), (e) => e.status === 413);
  capturar({ message: ['horarios: faixas sobrepostas', 'nome não pode ser vazio'] }, 400);
  await assert.rejects(() => client.api.atualizarRestaurante(ID, {}), (e) => e.status === 400 && e.message === 'horarios: faixas sobrepostas, nome não pode ser vazio');
  capturar({ message: 'Acesso restrito à coordenação.' }, 403);
  await assert.rejects(() => client.api.restaurantes(), (e) => e.status === 403);
});

test('cardápios: conflito concorrente e resultado indeterminado preservam orientação do servidor', async () => {
  capturar({ message: 'O cardápio foi alterado ou removido. Atualize a lista antes de substituir.', motivo: 'cardapio-alterado' }, 409);
  await assert.rejects(() => client.api.enviarCardapio(ID, {
    arquivo: new File(['%PDF-1.7'], 'menu.pdf'), validoDe: '2026-10-18', validoAte: '2026-10-19', substitui: CARDAPIO,
  }), error => error.status === 409 && error.motivo === 'cardapio-alterado' && /Atualize a lista/.test(error.message));
  capturar({ message: 'Não foi possível confirmar a remoção do cardápio. Recarregue a lista antes de repetir a operação.', motivo: 'resultado-indeterminado' }, 503);
  await assert.rejects(() => client.api.removerCardapio(CARDAPIO),
    error => error.status === 503 && error.motivo === 'resultado-indeterminado' && /Recarregue a lista/.test(error.message));
});

test('validarHorarios: formato, ordem, sobreposição e limite de faixas', () => {
  const faixa = (dia, abre, fecha) => ({ dia: String(dia), abre, fecha });
  assert.equal(rs.validarHorarios([]), '');
  assert.equal(rs.validarHorarios([faixa(1, '07:00', '12:00'), faixa(1, '12:00', '14:00')]), '', 'faixas encostadas não se sobrepõem');
  assert.equal(rs.validarHorarios([faixa(0, '00:00', '23:59'), faixa(6, '08:00', '12:00')]), '');
  assert.match(rs.validarHorarios([faixa('', '07:00', '12:00')]), /Horário 1: escolha o dia/);
  assert.match(rs.validarHorarios([faixa(7, '07:00', '12:00')]), /escolha o dia/);
  assert.match(rs.validarHorarios([faixa(1, '7:00', '12:00')]), /HH:mm/);
  assert.match(rs.validarHorarios([faixa(1, '07:00', '24:00')]), /HH:mm/);
  assert.match(rs.validarHorarios([faixa(1, '07:00', '')]), /HH:mm/);
  assert.match(rs.validarHorarios([faixa(1, '07:00', '07:00')]), /Horário 1: o fechamento deve ser depois/);
  assert.match(rs.validarHorarios([faixa(2, '07:00', '12:00'), faixa(1, '22:00', '02:00')]), /Horário 2: .*meia-noite/);
  assert.match(rs.validarHorarios([faixa(3, '11:00', '14:00'), faixa(3, '07:00', '12:00')]), /sobrepostas em Quarta: 07:00–12:00 e 11:00–14:00/);
  assert.equal(rs.validarHorarios([faixa(3, '11:00', '14:00'), faixa(4, '07:00', '12:00')]), '');
  const muitas = Array.from({ length: 22 }, (_, i) => faixa(i % 7, `${String(Math.floor(i / 7) * 3 + 6).padStart(2, '0')}:00`, `${String(Math.floor(i / 7) * 3 + 7).padStart(2, '0')}:00`));
  assert.match(rs.validarHorarios(muitas), /no máximo 21/);
  assert.equal(rs.validarHorarios(muitas.slice(0, 21)), '');
});

test('validarRestaurante: nome, descrição, local obrigatório e horários', () => {
  const ok = rs.formDoRestaurante(base);
  assert.equal(rs.validarRestaurante(ok), '');
  assert.match(rs.validarRestaurante({ ...ok, nome: '  ' }), /Informe o nome/);
  assert.match(rs.validarRestaurante({ ...ok, nome: 'RU' }), /pelo menos 3/);
  assert.match(rs.validarRestaurante({ ...ok, nome: 'x'.repeat(256) }), /no máximo 255/);
  assert.match(rs.validarRestaurante({ ...ok, descricao: 'x'.repeat(2001) }), /2000/);
  assert.match(rs.validarRestaurante({ ...ok, local: { ...ok.local, modo: 'nenhum' } }), /Escolha o local/);
  assert.match(rs.validarRestaurante({ ...ok, local: { ...ok.local, predioId: '' } }), /Escolha o prédio/);
  assert.match(rs.validarRestaurante({ ...ok, horarios: [rs.novaFaixa({ dia: 1, abre: '10:00', fecha: '09:00' })] }), /fechamento/);
});

test('corpoCriacaoRestaurante e camposAlteradosRestaurante (PATCH só com o que mudou)', () => {
  const novo = { ...rs.formDoRestaurante(null), nome: ' Trailer ', local: { ...loc.formDoLocal(null), modo: 'ponto', latitude: -19.92, longitude: -43.99 }, horarios: [rs.novaFaixa({ dia: 2, abre: '18:00', fecha: '22:00' }), rs.novaFaixa({ dia: 1, abre: '18:00', fecha: '22:00' })], ativo: false };
  assert.deepEqual(rs.corpoCriacaoRestaurante(novo), {
    nome: 'Trailer',
    local: { latitude: -19.92, longitude: -43.99 },
    horarios: [{ dia: 1, abre: '18:00', fecha: '22:00' }, { dia: 2, abre: '18:00', fecha: '22:00' }],
    ativo: false,
  });
  const form = rs.formDoRestaurante(base);
  assert.deepEqual(rs.camposAlteradosRestaurante(base, form), {});
  assert.deepEqual(rs.camposAlteradosRestaurante(base, { ...form, horarios: [...form.horarios].reverse() }), {}, 'mesma lista em outra ordem');
  assert.deepEqual(rs.camposAlteradosRestaurante(base, { ...form, nome: ' Cantina 16 ' }), { nome: 'Cantina 16' });
  assert.deepEqual(rs.camposAlteradosRestaurante(base, { ...form, descricao: '' }), { descricao: '' });
  assert.deepEqual(rs.camposAlteradosRestaurante(base, { ...form, local: { ...form.local, modo: 'area', areaId: AREA } }), { local: { areaId: AREA } });
  const semSexta = form.horarios.filter((h) => h.dia !== '5');
  assert.deepEqual(rs.camposAlteradosRestaurante(base, { ...form, horarios: semSexta }), { horarios: semana.slice(0, 4) });
  assert.equal('local' in rs.camposAlteradosRestaurante(base, { ...form, local: { ...form.local, modo: 'nenhum' } }), false, 'local nunca vai null');
});

test('formDaSugestao preenche nome e prédio do mapa', () => {
  const form = rs.formDaSugestao({ predioId: 'P29', nome: 'Cantina do Prédio 29', latitude: -19.92, longitude: -43.99, cadastrado: false });
  assert.equal(form.nome, 'Cantina do Prédio 29');
  assert.deepEqual(loc.localParaEntrada(form.local), { predioId: 'P29' });
  assert.equal(form.ativo, true);
  assert.deepEqual(form.horarios, []);
  assert.equal(rs.formDaSugestao({ predioId: 'OSM_1', nome: null }).nome, '');
});

test('resumoHorarios agrupa dias consecutivos e faixas iguais', () => {
  assert.equal(rs.resumoHorarios(semana), 'Seg–Sex 07:00–21:00');
  assert.equal(rs.resumoHorarios([]), 'Sem horários cadastrados');
  assert.equal(rs.resumoHorarios([...semana, { dia: 6, abre: '08:00', fecha: '12:00' }]), 'Seg–Sex 07:00–21:00 · Sáb 08:00–12:00');
  assert.equal(rs.resumoHorarios([{ dia: 1, abre: '07:00', fecha: '12:00' }, { dia: 3, abre: '07:00', fecha: '12:00' }]), 'Seg, Qua 07:00–12:00');
  assert.equal(rs.resumoHorarios([{ dia: 6, abre: '08:00', fecha: '12:00' }, { dia: 0, abre: '08:00', fecha: '12:00' }]), 'Sáb, Dom 08:00–12:00');
  assert.equal(rs.resumoHorarios([{ dia: 1, abre: '14:00', fecha: '18:00' }, { dia: 1, abre: '07:00', fecha: '11:00' }, { dia: 2, abre: '07:00', fecha: '11:00' }]), 'Seg 07:00–11:00, 14:00–18:00 · Ter 07:00–11:00');
});

test('preencherDiasUteis cria Seg a Sex com o horário da primeira faixa e mantém o fim de semana', () => {
  const resultado = rs.preencherDiasUteis([rs.novaFaixa({ dia: 6, abre: '08:00', fecha: '12:00' }), rs.novaFaixa({ dia: 2, abre: '06:30', fecha: '22:00' })]);
  assert.deepEqual(rs.horariosParaCorpo(resultado), [
    ...[1, 2, 3, 4, 5].map((dia) => ({ dia, abre: '06:30', fecha: '22:00' })),
    { dia: 6, abre: '08:00', fecha: '12:00' },
  ]);
  assert.deepEqual(rs.horariosParaCorpo(rs.preencherDiasUteis([])), semana);
  assert.equal(new Set(resultado.map((h) => h.chave)).size, resultado.length);
});

test('validarArquivoCardapio: tipo por MIME + extensão e tamanho até 10 MB', () => {
  assert.match(rs.validarArquivoCardapio(null), /Escolha o arquivo/);
  for (const [nome, tipo] of [['a.png', 'image/png'], ['a.JPG', 'image/jpeg'], ['a.jpeg', 'image/jpeg'], ['a.webp', 'image/webp'], ['menu.semana.pdf', 'application/pdf'], ['a.pdf', ''], ['a.jpg', 'image/jpg']]) {
    assert.equal(rs.validarArquivoCardapio(arquivo(nome, tipo)), '', `${nome} ${tipo}`);
  }
  for (const [nome, tipo] of [['a.gif', 'image/gif'], ['a.png', 'application/pdf'], ['a.pdf', 'image/png'], ['cardapio', 'image/png'], ['a.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'], ['a.svg', 'image/svg+xml']]) {
    assert.match(rs.validarArquivoCardapio(arquivo(nome, tipo)), /Formato não aceito/, `${nome} ${tipo}`);
  }
  assert.match(rs.validarArquivoCardapio(arquivo('a.png', 'image/png', 0)), /vazio/);
  assert.equal(rs.validarArquivoCardapio(arquivo('a.png', 'image/png', 10 * 1024 * 1024)), '');
  assert.match(rs.validarArquivoCardapio(arquivo('a.png', 'image/png', 10 * 1024 * 1024 + 1)), /no máximo 10 MB/);
});

test('validarVigencia: datas válidas, fim ≥ início e no máximo 31 dias', () => {
  assert.equal(rs.validarVigencia('2026-10-19', '2026-10-19'), '');
  assert.equal(rs.validarVigencia('2026-10-01', '2026-10-31'), '', '31 dias contando os dois');
  assert.match(rs.validarVigencia('2026-10-01', '2026-11-01'), /no máximo 31 dias/);
  assert.match(rs.validarVigencia('2026-10-20', '2026-10-19'), /igual ou posterior/);
  assert.match(rs.validarVigencia('', '2026-10-19'), /início da validade/);
  assert.match(rs.validarVigencia('2026-02-30', '2026-03-01'), /início da validade/);
  assert.match(rs.validarVigencia('2026-10-19', '19/10/2026'), /fim da validade/);
});

test('semanaAtual (segunda a domingo) e formatações', () => {
  assert.deepEqual(rs.semanaAtual(new Date(2026, 9, 18, 15)), { validoDe: '2026-10-12', validoAte: '2026-10-18' }, 'domingo');
  assert.deepEqual(rs.semanaAtual(new Date(2026, 9, 19, 8)), { validoDe: '2026-10-19', validoAte: '2026-10-25' }, 'segunda');
  assert.deepEqual(rs.semanaAtual(new Date(2026, 9, 31, 23)), { validoDe: '2026-10-26', validoAte: '2026-11-01' }, 'virada de mês');
  assert.equal(rs.formatarDia('2026-10-19'), '19/10/2026');
  assert.equal(rs.formatarTamanho(512), '512 B');
  assert.equal(rs.formatarTamanho(850 * 1024), '850 KB');
  assert.equal(rs.formatarTamanho(1288490), '1,2 MB');
  assert.equal(rs.vigenciaCardapio(cardapio, '2026-10-12'), 'vigente');
  assert.equal(rs.vigenciaCardapio(cardapio, '2026-10-11'), 'futuro');
  assert.equal(rs.vigenciaCardapio(cardapio, '2026-10-19'), 'expirado');
});

test('lista mostra local, horários, badges, cardápios, status e ações', () => {
  const inativo = { ...base, id: 'r2', nome: 'Trailer do estacionamento', local: { tipo: 'ponto', id: null, nome: null, latitude: -19.92, longitude: -43.99, rota: null }, horarios: [], abertoAgora: false, cardapioHoje: false, ativo: false, cardapios: 0 };
  const html = renderToStaticMarkup(createElement(rs.ListaRestaurantes, { restaurantes: [base, inativo] }));
  assert.match(html, /<td data-label="Local">Cantina do Prédio 16<\/td>/);
  assert.match(html, /<td data-label="Local">Ponto no mapa<\/td>/);
  assert.match(html, /Seg–Sex 07:00–21:00/);
  assert.match(html, /Sem horários cadastrados/);
  assert.match(html, /class="flag green">Aberto agora</);
  // Sem horário cadastrado: situação desconhecida, não "fechado".
  assert.match(html, /class="flag muted">Sem horário</);
  assert.doesNotMatch(html, /Fechado agora/);
  assert.match(html, /class="flag purple">Cardápio hoje</);
  assert.match(html, /Sem cardápio hoje/);
  assert.match(html, /<td data-label="Cardápios">2<\/td>/);
  assert.match(html, /<td data-label="Cardápios">0<\/td>/);
  assert.match(html, />Ativo</);
  assert.match(html, />Inativo</);
  assert.match(html, /aria-label="Editar restaurante Cantina do Prédio 16"/);
  assert.match(html, /aria-label="Cardápios do restaurante Cantina do Prédio 16"/);
  assert.match(html, /aria-label="Excluir \(desativar\) restaurante Cantina do Prédio 16"/);
  assert.match(html, /aria-label="Reativar restaurante Trailer do estacionamento"/);
  assert.doesNotMatch(html, /Reativar restaurante Cantina/);
});

test('sugestões do mapa: cadastradas aparecem como já cadastradas', () => {
  let escolhida = null;
  const sugestoes = [{ predioId: 'P16', nome: 'Cantina do Prédio 16', latitude: 1, longitude: 2, cadastrado: true }, { predioId: 'OSM_455954541', nome: null, latitude: 1, longitude: 2, cadastrado: false }];
  const html = renderToStaticMarkup(createElement(rs.ListaSugestoes, { sugestoes, onCadastrar: (s) => { escolhida = s; } }));
  assert.match(html, /Cantina do Prédio 16/);
  assert.match(html, /Já cadastrado/);
  assert.match(html, /aria-label="Cadastrar restaurante a partir do mapa: Prédio OSM_455954541"/);
  assert.doesNotMatch(html, /Cadastrar restaurante a partir do mapa: Cantina/);
  const tree = rs.ListaSugestoes({ sugestoes, onCadastrar: (s) => { escolhida = s; } });
  tree.props.children[1].props.children[2].props.onClick();
  assert.equal(escolhida.predioId, 'OSM_455954541');
});

test('confirmação de exclusão: some do mapa e pode ser reativado', () => {
  let confirmou = 0;
  const tree = rs.ConfirmarDesativacaoRestaurante({ restaurante: base, ocupado: false, erro: '', onConfirmar: () => confirmou++, onFechar: () => {} });
  tree.props.acoes.props.children[1].props.onClick();
  assert.equal(confirmou, 1);
  const html = renderToStaticMarkup(tree);
  assert.match(html, /Excluir o restaurante &quot;Cantina do Prédio 16&quot;\?/);
  assert.match(html, /some do mapa dos alunos/);
  assert.match(html, /reativá-lo/);
});

test('formulário: local obrigatório (sem "Sem local"), horários e salvar bloqueado', () => {
  const props = { mapa: {}, onCancelar: () => {}, onSalvo: () => {} };
  const criar = renderToStaticMarkup(createElement(rs.FormularioRestaurante, { ...props, original: null }));
  assert.match(criar, /Adicionar restaurante/);
  assert.doesNotMatch(criar, />Sem local</);
  assert.match(criar, /role="radio" aria-checked="true"[^>]*>Prédio do mapa</);
  assert.match(criar, /Horários de funcionamento/);
  assert.match(criar, /Preencher Seg a Sex/);
  assert.match(criar, /<button type="submit"[^>]*disabled=""[^>]*>.*Criar restaurante/);
  assert.match(criar, /Informe o nome do restaurante/);
  const sugestao = renderToStaticMarkup(createElement(rs.FormularioRestaurante, { ...props, original: null, inicial: rs.formDaSugestao({ predioId: 'P29', nome: 'Cantina do Prédio 29' }) }));
  assert.match(sugestao, /value="Cantina do Prédio 29"/);
  assert.match(sugestao, /<option value="P29" selected="">Cantina do Prédio 29<\/option>/);
  assert.doesNotMatch(sugestao, /<button type="submit"[^>]*disabled=""/);
  const editar = renderToStaticMarkup(createElement(rs.FormularioRestaurante, { ...props, original: base }));
  assert.match(editar, /Editar restaurante &quot;Cantina do Prédio 16&quot;/);
  assert.equal((editar.match(/type="time"/g) || []).length, 10);
  assert.match(editar, /aria-label="Remover horário 5"/);
  assert.match(editar, /<button type="submit"[^>]*disabled=""[^>]*>.*Salvar alterações/);
  assert.match(editar, /Nenhuma alteração para salvar/);
  assert.doesNotMatch(editar, /role="switch"/);
});

test('lista de cardápios: validade, tipo, tamanho, abrir, miniatura e confirmação de remoção', () => {
  const pdf = { ...cardapio, id: 'c2', url: 'https://exemplo/menu.pdf', tipoConteudo: 'application/pdf', tamanhoBytes: 850 * 1024, validoDe: '2026-10-19', validoAte: '2026-10-25' };
  const html = renderToStaticMarkup(createElement(rs.ListaCardapios, { cardapios: [pdf, cardapio], hoje: '2026-10-18' }));
  assert.match(html, /12\/10\/2026 a 18\/10\/2026/);
  assert.match(html, /PNG · 1,2 MB/);
  assert.match(html, /PDF · 850 KB/);
  assert.match(html, /class="flag green">Vigente</);
  assert.match(html, /class="flag purple">Futuro</);
  assert.match(html, new RegExp(`<img src="${cardapio.url.replace(/[.?/]/g, '\\$&')}"`));
  assert.equal((html.match(/<img /g) || []).length, 1, 'miniatura só para imagens');
  assert.match(html, /href="https:\/\/exemplo\/menu.pdf" target="_blank" rel="noopener noreferrer"/);
  assert.match(html, />.*Abrir<\/a>/);
  assert.match(html, /aria-label="Substituir cardápio de 12\/10\/2026 a 18\/10\/2026"/);
  assert.doesNotMatch(html, /apagado definitivamente/);
  let removido = null;
  const confirmando = rs.ListaCardapios({ cardapios: [cardapio], hoje: '2026-10-18', confirmandoId: CARDAPIO, onConfirmarRemocao: (c) => { removido = c; } });
  const htmlConfirmando = renderToStaticMarkup(confirmando);
  assert.match(htmlConfirmando, /apagado definitivamente/);
  assert.match(htmlConfirmando, /Remover definitivamente/);
  confirmando.props.children[0].props.children[1].props.children[1].props.children[1].props.onClick();
  assert.equal(removido.id, CARDAPIO);
});

test('formulário de cardápio: aceita só imagem/PDF, validade padrão da semana e envio bloqueado sem arquivo', () => {
  const novo = renderToStaticMarkup(createElement(rs.FormularioCardapio, { restauranteId: ID, hoje: new Date(2026, 9, 21, 10) }));
  assert.match(novo, /accept="image\/png,image\/jpeg,image\/webp,application\/pdf"/);
  assert.match(novo, /type="date"[^>]*value="2026-10-19"/);
  assert.match(novo, /type="date"[^>]*value="2026-10-25"/);
  assert.match(novo, /<button type="submit"[^>]*disabled=""[^>]*>.*Enviar cardápio/);
  assert.match(novo, /Escolha o arquivo do cardápio/);
  const substituir = renderToStaticMarkup(createElement(rs.FormularioCardapio, { restauranteId: ID, substituindo: cardapio }));
  assert.match(substituir, /Substituir o cardápio de 12\/10\/2026 a 18\/10\/2026/);
  assert.match(substituir, /value="2026-10-12"/);
  assert.match(substituir, /antigo é removido depois/);
  assert.match(substituir, /Substituir cardápio<\/button>/);
});

test('painel de cardápios renderiza carregando sem efeitos no servidor', () => {
  const html = renderToStaticMarkup(createElement(rs.PainelCardapios, { restaurante: base, onFechar: () => {} }));
  assert.match(html, /Cardápios de &quot;Cantina do Prédio 16&quot;/);
  assert.match(html, /Carregando cardápios/);
});
