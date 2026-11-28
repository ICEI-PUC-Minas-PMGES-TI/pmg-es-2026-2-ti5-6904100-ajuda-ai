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
    [() => client.api.excluirMissao(ID), 'DELETE', `/coordenacao/missoes/${ID}`, undefined],
    [() => client.api.liberarCodigoMissao(ID, 15), 'POST', `/coordenacao/missoes/${ID}/codigo`, { minutos: 15 }],
    [() => client.api.encerrarCodigoMissao(ID), 'DELETE', `/coordenacao/missoes/${ID}/codigo`, undefined],
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

test('excluir rascunho: 204 vira null', async () => {
  client.persistSession({ accessToken: 'jwt-coord', usuario: { papel: 'coordenador' } });
  globalThis.fetch = async () => new Response(null, { status: 204 });
  assert.equal(await client.api.excluirMissao(ID), null);
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
  const evento = { id: 'ev', inicio: '2026-12-10T21:00:00Z', fim: '2026-12-10T23:00:00Z' };
  const deEvento = { ...ok, requisito: 'EVENTO', alvoId: 'ev', codigo: 'CARREIRA-26', tipo: 'UNICA' };
  const agoraEvento = { agora: new Date('2026-11-18T12:00:00Z'), evento };
  assert.match(m.validarMissao({ ...deEvento, inicio: '2026-12-10T23:00:00Z' }, agoraEvento), /cruzar o check-in/);
  assert.match(m.validarMissao({ ...deEvento, fim: '2026-12-10T20:30:00Z' }, agoraEvento), /cruzar o check-in/);
  assert.equal(m.validarMissao({ ...deEvento, fim: '2026-12-10T20:31:00Z' }, agoraEvento), '');
  assert.equal(m.validarMissao({ ...deEvento, inicio: '2026-12-10T22:59:00Z' }, agoraEvento), '');
  assert.equal(m.validarMissao({ ...deEvento, inicio: '2026-12-10T23:00:00Z' }, { agora: agoraEvento.agora }), '');
  assert.equal(m.validarMissao({ ...ok, fim: '2026-01-01T10:00' }, { agora: new Date('2026-11-18T12:00:00Z'), fimNovo: false }), '');
});

test('publicada: o prazo só prorroga ou some', () => {
  const ok = { ...m.formDaMissao(null), titulo: 'T', descricao: 'D', xp: '100' };
  const agora = new Date('2026-11-18T12:00:00Z');
  const prazoAtual = '2026-12-05T02:59:00.000Z';
  assert.match(m.validarMissao({ ...ok, fim: '2026-12-01T10:00' }, { agora, prazoAtual }), /só pode ser prorrogado/);
  assert.equal(m.validarMissao({ ...ok, fim: '2026-12-10T10:00' }, { agora, prazoAtual }), '');
  assert.equal(m.validarMissao({ ...ok, fim: '' }, { agora, prazoAtual }), '');
  assert.match(m.validarMissao({ ...ok, fim: '2026-12-10T10:00' }, { agora, prazoAtual: null }), /só pode ser prorrogado/);
  // Rascunho: qualquer data futura.
  assert.equal(m.validarMissao({ ...ok, fim: '2026-12-01T10:00' }, { agora }), '');
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
  const html = renderToStaticMarkup(createElement(m.ListaMissoes, {
    missoes: [base, { ...base, id: 'b', ativa: false, estado: 'arquivada' }, { ...base, id: 'c', ativa: false, estado: 'rascunho', conclusoes: 0 }],
  }));
  assert.match(html, /Visite a biblioteca/);
  assert.match(html, /80 XP<\/strong><small>\+80 moedas/);
  assert.match(html, />37</);
  assert.match(html, /Ações da missão Visite a biblioteca/);
  assert.match(html, /Selecionar todas as missões/);
  assert.match(html, /missoes-selo ativa/);
  assert.match(html, /missoes-selo inativa">Arquivada/);
  assert.match(html, /missoes-selo rascunho">Rascunho/);
  assert.match(html, /missoes-selo ativa">Publicada/);
});

test('lista marca as selecionadas e o cabeçalho fica parcial', () => {
  const base = { id: 'a', titulo: 'A', descricao: 'd', tipo: 'UNICA', xp: 10, ativa: true, vigenteAgora: true, inicio: null, fim: null, ciclo: '2026/2', conclusoes: 0, xpCreditadoTotal: 0, criadoEm: '2026-11-01T10:00:00.000Z', atualizadoEm: '2026-11-01T10:00:00.000Z' };
  const html = renderToStaticMarkup(createElement(m.ListaMissoes, {
    missoes: [base, { ...base, id: 'b', titulo: 'B' }],
    selecionadas: new Set(['a']),
    ordem: { campo: 'xp', direcao: 'asc' },
  }));
  assert.equal((html.match(/class="selecionada"/g) || []).length, 1);
  // Com seleção, o cabeçalho vira a barra de ações em lote.
  assert.match(html, /1 selecionada/);
  assert.match(html, /Arquivar/);
  assert.match(html, /Publicar/);
  assert.doesNotMatch(html, /aria-sort/);
  const semSelecao = renderToStaticMarkup(createElement(m.ListaMissoes, {
    missoes: [base],
    ordem: { campo: 'xp', direcao: 'asc' },
  }));
  assert.match(semSelecao, /aria-sort="ascending"/);
  assert.doesNotMatch(semSelecao, /selecionada/);
});

test('ordenação, status e data da coluna Atualizada', () => {
  const mk = (id, extra) => ({ id, titulo: id, tipo: 'UNICA', xp: 10, ativa: true, vigenteAgora: true, conclusoes: 0, inicio: null, criadoEm: '2026-11-01T10:00:00.000Z', atualizadoEm: '2026-11-01T10:00:00.000Z', ...extra });
  const lista = [mk('b', { xp: 50 }), mk('a', { xp: 20, ativa: false }), mk('c', { xp: 30, vigenteAgora: false })];
  assert.deepEqual(m.ordenarMissoes(lista, { campo: 'xp', direcao: 'asc' }).map((x) => x.id), ['a', 'c', 'b']);
  assert.deepEqual(m.ordenarMissoes(lista, { campo: 'titulo', direcao: 'asc' }).map((x) => x.id), ['a', 'b', 'c']);
  assert.deepEqual(m.ordenarMissoes(lista, { campo: 'status', direcao: 'asc' }).map((x) => x.id), ['b', 'c', 'a']);
  assert.deepEqual(lista.map((x) => x.id), ['b', 'a', 'c'], 'não altera a lista original');
  assert.equal(m.situacaoMissao(lista[2]).rotulo, 'Fora do período');
  const agora = new Date(2026, 10, 22, 15, 0);
  assert.equal(m.textoAtualizada(new Date(2026, 10, 22, 8).toISOString(), agora), 'Hoje');
  assert.equal(m.textoAtualizada(new Date(2026, 10, 21, 23).toISOString(), agora), 'Ontem');
  assert.match(m.textoAtualizada(new Date(2026, 9, 3).toISOString(), agora), /03.*out.*2026/);
});

const EVENTO = '0a9b8c7d-6e5f-4a3b-8c2d-1e0f9a8b7c6d';
const TOTEM = 'a593faa9-34b4-495d-9e55-890830f43f17';

test('requisito: obrigatório e coerente, como no servidor', () => {
  const ok = { ...m.formDaMissao(null), titulo: 'T', descricao: 'D', xp: '30' };
  assert.equal(ok.requisito, 'PUCSTOPS');
  assert.equal(m.validarMissao(ok), '');
  assert.match(m.validarMissao({ ...ok, requisito: '' }), /comprova/);
  assert.match(m.validarMissao({ ...ok, requisito: 'AUTODECLARADA' }), /comprova/);
  assert.match(m.validarMissao({ ...ok, quantidade: '0' }), /1 a 20/);
  assert.match(m.validarMissao({ ...ok, quantidade: '21' }), /1 a 20/);
  assert.match(m.validarMissao({ ...ok, quantidade: '2.5' }), /1 a 20/);
  // Com pontos marcados a meta é coletar todos: a quantidade digitada não vale.
  assert.equal(m.validarMissao({ ...ok, pontos: [TOTEM], quantidade: '99' }), '');
  assert.match(m.validarMissao({ ...ok, requisito: 'EVENTO' }), /Escolha o evento/);
  assert.match(m.validarMissao({ ...ok, requisito: 'EVENTO', alvoId: EVENTO, tipo: 'SEMANAL' }), /única/);
  assert.match(m.validarMissao({ ...ok, requisito: 'EVENTO', alvoId: EVENTO }), /4 a 20/);
  assert.equal(m.validarMissao({ ...ok, requisito: 'EVENTO', alvoId: EVENTO, codigo: 'calouro-26' }), '');
  assert.match(m.validarMissao({ ...ok, tipo: 'SEMANAL' }), /PucStop é única/);
  assert.equal(m.validarMissao({ ...ok, requisito: 'FEED_COMENTARIOS', tipo: 'SEMANAL' }), '');
  for (const codigo of ['', 'AB', 'CALOURO@26', 'A'.repeat(21)]) {
    assert.match(m.validarMissao({ ...ok, requisito: 'CODIGO', codigo }), /4 a 20/, codigo);
  }
  assert.equal(m.validarMissao({ ...ok, requisito: 'CODIGO', codigo: ' calouro 26 ' }), '');
});

test('corpo da criação leva só os campos do requisito escolhido', () => {
  const form = { ...m.formDaMissao(null), titulo: 'T', descricao: 'D', xp: '30', ativar: true };
  assert.deepEqual(
    pick(m.corpoCriacaoMissao({ ...form, requisito: 'FEED_COMENTARIOS', quantidade: '3', alvoId: TOTEM, codigo: 'X' })),
    { requisito: 'FEED_COMENTARIOS', quantidade: 3 },
  );
  assert.deepEqual(pick(m.corpoCriacaoMissao({ ...form, requisito: 'PUCSTOPS', pontos: [TOTEM], quantidade: '5' })), {
    requisito: 'PUCSTOPS', quantidade: 1, alvoIds: [TOTEM],
  });
  assert.deepEqual(pick(m.corpoCriacaoMissao({ ...form, requisito: 'PUCSTOPS', quantidade: '5' })), {
    requisito: 'PUCSTOPS', quantidade: 5,
  });
  assert.deepEqual(pick(m.corpoCriacaoMissao({ ...form, requisito: 'EVENTO', alvoId: EVENTO, codigo: ' calouro 26 ' })), {
    requisito: 'EVENTO', quantidade: 1, alvoId: EVENTO, codigo: 'CALOURO26',
  });
  assert.deepEqual(pick(m.corpoCriacaoMissao({ ...form, requisito: 'CODIGO', codigo: ' calouro 26 ', quantidade: '4' })), {
    requisito: 'CODIGO', quantidade: 1, codigo: 'CALOURO26',
  });
});

function pick(corpo) {
  const { requisito, quantidade, alvoId, alvoIds, codigo } = corpo;
  return Object.fromEntries(Object.entries({ requisito, quantidade, alvoId, alvoIds, codigo }).filter(([, v]) => v !== undefined));
}

test('edição: trocar o requisito manda a regra inteira; trocar só o código manda só ele', () => {
  const original = { ...base, requisito: 'CODIGO', quantidade: 1, alvoId: null, codigo: 'RODA-1' };
  const form = m.formDaMissao(original);
  assert.deepEqual(m.camposAlteradosMissao(original, form), {});
  assert.deepEqual(m.camposAlteradosMissao(original, { ...form, codigo: 'roda-2' }), { codigo: 'RODA-2' });
  assert.deepEqual(m.camposAlteradosMissao(original, { ...form, requisito: 'FEED_CURTIDAS', quantidade: '3' }), {
    requisito: 'FEED_CURTIDAS', quantidade: 3, alvoId: null, alvoIds: null, codigo: null,
  });
  const legado = { ...base, requisito: null, quantidade: 1, alvoId: null, codigo: null };
  const formLegado = m.formDaMissao(legado);
  assert.equal(formLegado.requisito, '');
  assert.match(m.validarMissao({ ...formLegado }), /comprova/);
  assert.deepEqual(m.camposAlteradosMissao(legado, { ...formLegado, requisito: 'PUCSTOPS', pontos: [TOTEM] }), {
    requisito: 'PUCSTOPS', quantidade: 1, alvoId: null, alvoIds: [TOTEM], codigo: null,
  });
});

test('lista mostra o requisito de cada missão e destaca a antiga sem requisito', () => {
  assert.equal(m.rotuloRequisito({ requisito: 'PUCSTOPS', quantidade: 3 }), 'PucStops ×3');
  assert.equal(m.rotuloRequisito({ requisito: 'EVENTO', quantidade: 1, alvoNome: 'Abertura da Semana do Calouro' }), 'Evento: Abertura da Semana do Calouro');
  assert.equal(m.rotuloRequisito({ requisito: 'CODIGO', quantidade: 1 }), 'Código');
  assert.equal(m.rotuloRequisito({ requisito: null }), 'Sem requisito');
  const html = renderToStaticMarkup(createElement(m.ListaMissoes, {
    missoes: [{ ...base, requisito: 'FEED_COMENTARIOS', quantidade: 2 }, { ...base, id: 'b', requisito: null }],
  }));
  assert.match(html, /Comentários ×2/);
  assert.match(html, /missoes-tipo requisito sem">Sem requisito/);
});

test('formulário mostra só os campos do requisito', () => {
  const render = (missao) => renderToStaticMarkup(createElement(m.FormularioMissao, { original: missao, onCancelar() {}, onSalvo() {} }));
  const codigo = render({ ...base, conclusoes: 0, requisito: 'CODIGO', quantidade: 1, alvoId: null, codigo: 'RODA-1' });
  assert.match(codigo, /Como o aluno comprova/);
  assert.match(codigo, /value="RODA-1"/);
  assert.doesNotMatch(codigo, /Quantidade/);
  const contado = render({ ...base, conclusoes: 0, requisito: 'FEED_COMENTARIOS', quantidade: 2, alvoId: null, codigo: null });
  assert.match(contado, /id="[^"]*-quantidade"/);
  assert.match(contado, /Em quantos posts diferentes/);
  assert.doesNotMatch(contado, /Código<\/span>/);
  const travado = render({ ...base, conclusoes: 5, requisito: 'PUCSTOPS', quantidade: 3, alvoId: null, codigo: null });
  assert.match(travado, /o requisito não pode mudar/);
});

const PONTO_B = 'c2d3e4f5-a6b7-4c8d-9e0f-1a2b3c4d5e6f';

test('ciclo de vida: estado vem da API, com fallback por ativa e publicadaEm', () => {
  assert.equal(m.estadoMissao({ estado: 'arquivada', ativa: false }), 'arquivada');
  assert.equal(m.estadoMissao({ ativa: true }), 'publicada');
  assert.equal(m.estadoMissao({ ativa: false, publicadaEm: '2026-11-01T10:00:00.000Z' }), 'arquivada');
  assert.equal(m.estadoMissao({ ativa: false, publicadaEm: null }), 'rascunho');
  const lista = [
    { ...base, id: 'p' },
    { ...base, id: 'r', ativa: false, estado: 'rascunho' },
    { ...base, id: 'a', ativa: false, estado: 'arquivada' },
  ];
  assert.deepEqual(m.contarEstados(lista), { rascunho: 1, publicada: 1, arquivada: 1 });
  assert.deepEqual(m.filtrarMissoes(lista, { status: 'rascunho' }).map((x) => x.id), ['r']);
  assert.deepEqual(m.filtrarMissoes(lista, { status: 'arquivada' }).map((x) => x.id), ['a']);
  assert.deepEqual(m.filtrarMissoes(lista, { status: 'ativa' }).map((x) => x.id), ['p']);
});

test('público, instruções e roteiro de PucStops vão no corpo da criação', () => {
  const form = { ...m.formDaMissao(null), titulo: 'T', descricao: 'D', xp: '30' };
  assert.equal(form.publico, 'TODOS');
  assert.deepEqual(form.pontos, []);
  const corpo = m.corpoCriacaoMissao({ ...form, publico: 'PADRINHOS', instrucoes: '  Leve o crachá  ', pontos: [TOTEM, PONTO_B, TOTEM] });
  assert.equal(corpo.publico, 'PADRINHOS');
  assert.equal(corpo.instrucoes, 'Leve o crachá');
  assert.deepEqual(corpo.alvoIds, [TOTEM, PONTO_B]);
  assert.equal(corpo.quantidade, 2, 'meta = todos os pontos marcados');
  assert.equal('alvoId' in corpo, false);
  assert.equal('instrucoes' in m.corpoCriacaoMissao({ ...form, instrucoes: '   ' }), false);
  assert.match(m.validarMissao({ ...form, publico: 'APADRINHADOS', requisito: 'FEED_PUBLICACOES' }), /padrinhos/);
  assert.equal(m.validarMissao({ ...form, publico: 'PADRINHOS', requisito: 'FEED_PUBLICACOES' }), '');
  assert.match(m.validarMissao({ ...form, instrucoes: 'x'.repeat(1001) }), /instruções/);
  assert.match(m.validarMissao({ ...form, pontos: Array.from({ length: 21 }, (_, i) => `p${i}`) }), /no máximo 20/);
});

test('edição: instruções e público mudam sozinhos; trocar pontos manda a regra inteira', () => {
  const original = {
    ...base, ativa: false, estado: 'rascunho', conclusoes: 0, requisito: 'PUCSTOPS', quantidade: 1, alvoId: null, codigo: null,
    publico: 'TODOS', instrucoes: 'Vá de manhã', pontos: [{ id: TOTEM, nome: 'PucStop da Capela' }],
  };
  const form = m.formDaMissao(original);
  assert.deepEqual(form.pontos, [TOTEM]);
  assert.deepEqual(m.camposAlteradosMissao(original, form), {});
  assert.deepEqual(m.camposAlteradosMissao(original, { ...form, instrucoes: ' ' }), { instrucoes: null });
  assert.deepEqual(m.camposAlteradosMissao(original, { ...form, publico: 'APADRINHADOS' }), { publico: 'APADRINHADOS' });
  assert.deepEqual(m.camposAlteradosMissao(original, { ...form, pontos: [TOTEM, PONTO_B] }), {
    requisito: 'PUCSTOPS', quantidade: 2, alvoId: null, alvoIds: [TOTEM, PONTO_B], codigo: null,
  });
  assert.deepEqual(m.camposAlteradosMissao(original, { ...form, pontos: [], quantidade: '3' }), {
    requisito: 'PUCSTOPS', quantidade: 3, alvoId: null, alvoIds: null, codigo: null,
  });
});

test('rótulo da lista mostra o roteiro e o público', () => {
  assert.equal(m.rotuloRequisito({ requisito: 'PUCSTOPS', quantidade: 1, pontos: [{ id: TOTEM, nome: 'Capela' }] }), 'PucStops: Capela');
  assert.equal(m.rotuloRequisito({ requisito: 'PUCSTOPS', quantidade: 3, pontos: [{ id: 'a' }, { id: 'b' }, { id: 'c' }] }), 'PucStops: roteiro de 3');
  const html = renderToStaticMarkup(createElement(m.ListaMissoes, { missoes: [{ ...base, publico: 'APADRINHADOS' }] }));
  assert.match(html, /missoes-tipo publico">Só apadrinhados/);
});

test('formulário trava regra e recompensa pela publicação, não pelas conclusões', () => {
  const render = (missao) => renderToStaticMarkup(createElement(m.FormularioMissao, { original: missao, onCancelar() {}, onSalvo() {} }));
  const regra = { requisito: 'FEED_COMENTARIOS', quantidade: 2, alvoId: null, codigo: null, publico: 'TODOS', instrucoes: null, pontos: [] };
  const rascunho = render({ ...base, ...regra, ativa: false, estado: 'rascunho', conclusoes: 0 });
  assert.match(rascunho, /Rascunho: nenhum aluno vê a missão ainda/);
  assert.doesNotMatch(rascunho, /Já publicada/);
  assert.match(rascunho, /Instruções \(opcional\)/);
  assert.match(rascunho, /Público/);
  const publicada = render({ ...base, ...regra, estado: 'publicada', conclusoes: 0 });
  assert.match(publicada, /Publicada: objetivo, meta, pontos, público, tipo, início e XP ficam como os alunos viram/);
  assert.match(publicada, /Já publicada: o requisito não pode mudar/);
  assert.match(publicada, /<input[^>]*id="[^"]*-xp"[^>]*disabled=""/);
  // Publicada sem prazo não ganha um; com prazo, só prorroga.
  const calendarioFimTravado = /<button[^>]*disabled=""[^>]*aria-labelledby="[^"]*-fim-rotulo/;
  assert.match(publicada, /Já publicada sem prazo/);
  assert.match(publicada, calendarioFimTravado);
  const comPrazo = render({ ...base, ...regra, fim: '2026-12-05T02:59:00.000Z', estado: 'publicada', conclusoes: 0 });
  assert.match(comPrazo, /o prazo só pode ser prorrogado/);
  assert.doesNotMatch(comPrazo, calendarioFimTravado);
  assert.doesNotMatch(rascunho, calendarioFimTravado);
  const arquivada = render({ ...base, ...regra, ativa: false, estado: 'arquivada', conclusoes: 0 });
  assert.match(arquivada, /Arquivada: objetivo, meta/);
  const roteiro = render({ ...base, ...regra, ativa: false, estado: 'rascunho', conclusoes: 0, requisito: 'PUCSTOPS', quantidade: 1, pontos: [{ id: TOTEM, nome: 'PucStop da Capela' }] });
  assert.match(roteiro, /PucStops do roteiro/);
  assert.match(roteiro, /PucStop da Capela \(fora do mapa\)/);
  assert.match(roteiro, /Meta: coletar o ponto marcado\./);
});

test('excluir só existe para rascunho e explica que apaga de vez', () => {
  const html = renderToStaticMarkup(createElement(m.ConfirmarExclusaoMissao, { missao: { ...base, titulo: 'Teste' }, ocupado: false, erro: '', onConfirmar() {}, onFechar() {} }));
  assert.match(html, /Excluir o rascunho &quot;Teste&quot;\?/);
  assert.match(html, /apaga a missão de vez/);
});

test('formulário não oferece requisito que o app ainda não permite cumprir', () => {
  assert.equal(m.REQUISITOS_NO_APP.includes('CHAT_MENSAGENS'), false);
  assert.deepEqual(m.REQUISITOS_NO_APP, ['PUCSTOPS', 'EVENTO', 'FEED_COMENTARIOS', 'FEED_CURTIDAS', 'FEED_PUBLICACOES', 'ENCONTRO', 'CODIGO']);
});

test('editar missão de requisito fora do painel mostra o requisito real', () => {
  const html = renderToStaticMarkup(createElement(m.FormularioMissao, {
    original: { ...base, conclusoes: 0, requisito: 'CHAT_MENSAGENS', quantidade: 3, alvoId: null, codigo: null },
    onCancelar() {},
    onSalvo() {},
  }));
  assert.match(html, /Mensagens no chat da dupla/);
  assert.doesNotMatch(html, /Coletar PucStops/);
});

test('código liberado: menu, selo na lista e contagem regressiva', () => {
  const agora = new Date('2026-11-26T14:00:00-03:00').getTime();
  const ate = new Date(agora + 9 * 60_000 + 41_000).toISOString();
  const codigo = { ...base, requisito: 'CODIGO', codigo: 'PALESTRA-1', estado: 'publicada', codigoLiberadoAte: ate };
  assert.equal(m.codigoLiberadoAte(codigo, agora)?.toISOString(), ate);
  assert.equal(m.codigoLiberadoAte({ ...codigo, codigoLiberadoAte: null }, agora), null);
  assert.equal(m.codigoLiberadoAte(codigo, agora + 10 * 60_000), null);
  assert.equal(m.textoRestante(9 * 60_000 + 41_000), '9:41');
  assert.equal(m.textoRestante(65 * 60_000 + 12_000), '1:05:12');
  assert.equal(m.textoRestante(-5), '0:00');

  const lista = renderToStaticMarkup(createElement(m.ListaMissoes, { missoes: [codigo], agora }));
  assert.match(lista, new RegExp(`missoes-tipo codigo">Código até ${m.horaCurta(new Date(ate))}`));
  const vencido = renderToStaticMarkup(createElement(m.ListaMissoes, { missoes: [codigo], agora: agora + 10 * 60_000 }));
  assert.doesNotMatch(vencido, /Código até/);

  const painel = (missao, extra = {}) => renderToStaticMarkup(createElement(m.PainelCodigoMissao, {
    missao, ocupado: false, erro: '', onLiberar() {}, onEncerrar() {}, onFechar() {}, agoraInicial: agora, ...extra,
  }));
  const aberto = painel(codigo);
  assert.match(aberto, /PALESTRA-1/);
  assert.match(aberto, new RegExp(`Liberado até <strong>${m.horaCurta(new Date(ate))}</strong>`));
  assert.match(aberto, /fecha em 9:41/);
  assert.match(aberto, /Encerrar agora/);
  assert.match(aberto, /Liberar de novo por 10 min/);
  const fechado = painel({ ...codigo, codigoLiberadoAte: null }, { erro: 'Publique a missão antes de liberar o código.' });
  assert.match(fechado, /Fechado: os alunos não conseguem usar o código agora/);
  assert.doesNotMatch(fechado, /Encerrar agora/);
  assert.match(fechado, /Liberar por 10 min/);
  assert.match(fechado, /role="alert"[^>]*>.*Publique a missão antes de liberar o código\./s);
});

test('roteiro com ponto desativado: o formulário marca o ponto e explica que ele não conta', () => {
  const render = (missao) => renderToStaticMarkup(createElement(m.FormularioMissao, { original: missao, onCancelar() {}, onSalvo() {} }));
  const roteiro = {
    ...base, requisito: 'PUCSTOPS', quantidade: 2, alvoId: null, codigo: null, publico: 'TODOS', instrucoes: null, conclusoes: 0,
    pontos: [{ id: TOTEM, nome: 'PucStop da Capela', ativo: true }, { id: 'p2', nome: 'PucStop do P43', ativo: false }],
  };
  const publicada = render({ ...roteiro, estado: 'publicada' });
  assert.match(publicada, /PucStop do P43 \(desativado\)/);
  assert.match(publicada, /O ponto desativado não conta para quem ainda não o coletou\./);
  const rascunho = render({ ...roteiro, ativa: false, estado: 'rascunho' });
  assert.match(rascunho, /Tire o ponto desativado antes de publicar\./);
  const comentarios = render({ ...base, requisito: 'FEED_COMENTARIOS', quantidade: 2, alvoId: null, codigo: null, pontos: [], conclusoes: 0, ativa: false, estado: 'rascunho' });
  assert.match(comentarios, /Em quantos posts diferentes/);
  assert.match(comentarios, /vários no mesmo post valem um/);
});
