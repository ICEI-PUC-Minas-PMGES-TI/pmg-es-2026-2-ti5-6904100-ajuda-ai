import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'vite';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';

globalThis.window ??= globalThis; // request() usa window.setTimeout
const storage = new Map();
globalThis.localStorage = { getItem: k => storage.get(k) || null, setItem: (k, v) => storage.set(k, v), removeItem: k => storage.delete(k) };
const server = await createServer({ server: { middlewareMode: true }, appType: 'custom' });
after(() => server.close());
const client = await server.ssrLoadModule('/src/api/client.js');
const pagina = await server.ssrLoadModule('/src/pages/coordenacao/RecompensasPage.jsx');
const { ListaRecompensas, ConfirmarRemocao, FormularioRecompensa, validarRecompensa, validarAjuste, camposAlterados, corpoCriacao, formDaRecompensa, tiposAjuste, textoEstoque } = pagina;

const ID = '6f1c2b8e-3a4d-4e5f-9a0b-1c2d3e4f5a6b';
const base = {
  id: ID, nome: 'Caneca', descricao: 'Cerâmica', imagemUrl: null, custoXp: 300, condicoesRetirada: 'Retirar na coordenação.',
  estoque: { ilimitado: false, total: 10, comprometido: 2, disponivel: 8 }, limitePorAluno: null, publico: 'todos', programaCodigo: null,
  disponivelDe: null, disponivelAte: null, status: 'publicada', disponivelAgora: true, versao: 2, transacoes: 0, podeExcluir: true,
  criadoPor: null, criadoPorEmail: 'renata@pucminas.edu.br', criadoEm: '2026-10-01T12:00:00.000Z', atualizadoEm: '2026-10-10T12:00:00.000Z', publicadoEm: null, arquivadoEm: null,
};

function capturar(resposta = base, status = 200) {
  const chamadas = [];
  globalThis.fetch = async (url, opts) => { chamadas.push({ url, ...opts }); return new Response(JSON.stringify(resposta), { status }); };
  return chamadas;
}

test('cliente usa método, URL, corpo e JWT da coordenação', async () => {
  client.persistSession({ accessToken: 'jwt-coord', usuario: { papel: 'coordenador' } });
  const casos = [
    [() => client.api.recompensas(), 'GET', '/coordenacao/recompensas', undefined],
    [() => client.api.recompensa(ID), 'GET', `/coordenacao/recompensas/${ID}`, undefined],
    [() => client.api.criarRecompensa({ nome: 'X' }), 'POST', '/coordenacao/recompensas', { nome: 'X' }],
    [() => client.api.atualizarRecompensa(ID, { custoXp: 10 }), 'PATCH', `/coordenacao/recompensas/${ID}`, { custoXp: 10 }],
    [() => client.api.ajustarEstoqueRecompensa(ID, { tipo: 'reposicao', quantidade: 3, motivo: 'lote' }), 'POST', `/coordenacao/recompensas/${ID}/estoque`, { tipo: 'reposicao', quantidade: 3, motivo: 'lote' }],
    [() => client.api.publicarRecompensa(ID), 'POST', `/coordenacao/recompensas/${ID}/publicar`, undefined],
    [() => client.api.desativarRecompensa(ID), 'POST', `/coordenacao/recompensas/${ID}/desativar`, undefined],
    [() => client.api.arquivarRecompensa(ID), 'POST', `/coordenacao/recompensas/${ID}/arquivar`, undefined],
    [() => client.api.excluirRecompensa(ID), 'DELETE', `/coordenacao/recompensas/${ID}`, undefined],
  ];
  for (const [chamar, metodo, caminho, corpo] of casos) {
    const chamadas = capturar();
    await chamar();
    assert.equal(chamadas[0].method, metodo);
    assert.equal(new URL(chamadas[0].url).pathname, caminho);
    assert.equal(chamadas[0].headers.Authorization, 'Bearer jwt-coord');
    if (corpo === undefined) assert.equal(chamadas[0].body, undefined);
    else assert.deepEqual(JSON.parse(chamadas[0].body), corpo);
  }
  const chamadas = capturar([]);
  await client.api.recompensas('arquivada');
  assert.equal(new URL(chamadas[0].url).search, '?status=arquivada');
});

test('propaga a recusa de exclusão com transações (409)', async () => {
  capturar({ message: 'Esta recompensa já tem resgates registrados.', motivo: 'recompensa-com-transacoes' }, 409);
  await assert.rejects(() => client.api.excluirRecompensa(ID), (e) => e.status === 409 && e.motivo === 'recompensa-com-transacoes');
});

test('validação do formulário', () => {
  const ok = { ...formDaRecompensa(null), nome: 'Caneca', descricao: 'Azul', custoXp: '300', condicoesRetirada: 'Na coordenação', estoqueInicial: '10' };
  assert.equal(validarRecompensa(ok, { criando: true }), '');
  assert.match(validarRecompensa({ ...ok, nome: ' ' }, { criando: true }), /nome/);
  assert.match(validarRecompensa({ ...ok, descricao: '' }, { criando: true }), /descrição/);
  assert.match(validarRecompensa({ ...ok, custoXp: '0' }, { criando: true }), /custo/);
  assert.match(validarRecompensa({ ...ok, custoXp: '1.5' }, { criando: true }), /custo/);
  assert.match(validarRecompensa({ ...ok, condicoesRetirada: '' }, { criando: true }), /condições/);
  assert.match(validarRecompensa({ ...ok, estoqueInicial: '' }, { criando: true }), /estoque inicial/);
  assert.equal(validarRecompensa({ ...ok, estoqueInicial: '', estoqueIlimitado: true }, { criando: true }), '');
  assert.match(validarRecompensa({ ...ok, imagemUrl: 'http://x/y.png' }, { criando: true }), /https/);
  assert.match(validarRecompensa({ ...ok, limitePorAluno: '0' }, { criando: true }), /limite/);
  assert.match(validarRecompensa({ ...ok, disponivelDe: '2026-12-10T10:00', disponivelAte: '2026-12-01T10:00' }, { criando: true }), /anterior/);
  assert.match(validarRecompensa({ ...ok, publicar: true, disponivelAte: '2020-01-01T10:00' }, { criando: true }), /vigência/);
});

test('corpo de criação: estoque explícito e opcionais só quando preenchidos', () => {
  const form = { ...formDaRecompensa(null), nome: ' Caneca ', descricao: ' Azul ', custoXp: '300', condicoesRetirada: 'Na coordenação', estoqueInicial: '10' };
  assert.deepEqual(corpoCriacao(form), { nome: 'Caneca', descricao: 'Azul', custoXp: 300, condicoesRetirada: 'Na coordenação', estoqueIlimitado: false, estoqueInicial: 10, publico: 'todos', publicar: false });
  const ilimitado = corpoCriacao({ ...form, estoqueIlimitado: true, programaCodigo: '2026-2', limitePorAluno: '2', imagemUrl: 'https://x/y.png' });
  assert.equal('estoqueInicial' in ilimitado, false);
  assert.equal(ilimitado.estoqueIlimitado, true);
  assert.equal(ilimitado.programaCodigo, '2026-2');
  assert.equal(ilimitado.limitePorAluno, 2);
});

test('edição envia só o que mudou; limpar opcional envia null', () => {
  const comLimite = { ...base, limitePorAluno: 2, programaCodigo: '2026-2' };
  const form = formDaRecompensa(comLimite);
  assert.deepEqual(camposAlterados(comLimite, form), {});
  assert.deepEqual(camposAlterados(comLimite, { ...form, custoXp: '350' }), { custoXp: 350 });
  assert.deepEqual(camposAlterados(comLimite, { ...form, limitePorAluno: '', programaCodigo: '' }), { limitePorAluno: null, programaCodigo: null });
});

test('ajuste de estoque respeita o comprometido e exige motivo', () => {
  const e = base.estoque;
  assert.deepEqual(tiposAjuste(e).map((t) => t.valor), ['reposicao', 'correcao', 'ilimitado']);
  assert.deepEqual(tiposAjuste({ ilimitado: true }).map((t) => t.valor), ['limitado']);
  assert.equal(validarAjuste({ tipo: 'reposicao', quantidade: '5', motivo: 'novo lote' }, e), '');
  assert.match(validarAjuste({ tipo: 'reposicao', quantidade: '0', motivo: 'novo lote' }, e), /pelo menos 1/);
  assert.match(validarAjuste({ tipo: 'correcao', quantidade: '1', motivo: 'contagem' }, e), /comprometidas/);
  assert.match(validarAjuste({ tipo: 'correcao', quantidade: '10', motivo: 'contagem' }, e), /já tem/);
  assert.match(validarAjuste({ tipo: 'reposicao', quantidade: '5', motivo: 'ok' }, e), /motivo/);
  assert.equal(validarAjuste({ tipo: 'ilimitado', motivo: 'digital' }, e), '');
  assert.equal(textoEstoque(e), '8 de 10');
  assert.equal(textoEstoque({ ilimitado: true }), 'Ilimitado');
});

test('lista mostra status, estoque e a ação certa (excluir x arquivar)', () => {
  const html = renderToStaticMarkup(createElement(ListaRecompensas, {
    recompensas: [
      base,
      { ...base, id: 'b', nome: 'Moletom', status: 'inativa', podeExcluir: false, transacoes: 3 },
      { ...base, id: 'c', nome: 'Antiga', status: 'arquivada', podeExcluir: false },
    ],
  }));
  assert.match(html, /Publicada/);
  assert.match(html, /8 de 10/);
  assert.match(html, /2 comprometida/);
  assert.match(html, /Excluir recompensa Caneca/);
  assert.match(html, /Arquivar recompensa Moletom/);
  assert.match(html, /Publicar recompensa Moletom/);
  assert.match(html, /Desativar recompensa Caneca/);
  assert.doesNotMatch(html, /Editar recompensa Antiga/);
  assert.match(html, /Histórico de estoque de Antiga/);
});

test('confirmação explica exclusão x arquivamento', () => {
  const excluir = renderToStaticMarkup(createElement(ConfirmarRemocao, { recompensa: base, onExcluir() {}, onArquivar() {}, onFechar() {} }));
  assert.match(excluir, /Excluir de vez/);
  const arquivar = renderToStaticMarkup(createElement(ConfirmarRemocao, { recompensa: { ...base, podeExcluir: false, transacoes: 3 }, onExcluir() {}, onArquivar() {}, onFechar() {} }));
  assert.match(arquivar, /não pode ser excluída/);
  assert.doesNotMatch(arquivar, /Excluir de vez/);
});

test('formulário de criação renderiza estoque, disponibilidade e publicação', () => {
  const html = renderToStaticMarkup(createElement(FormularioRecompensa, { original: null, programas: [{ codigo: '2026-2', titulo: 'Ciclo 2026/2' }], onCancelar() {}, onSalvo() {} }));
  for (const trecho of [/Custo em moedas/, /Condições de retirada/, /Estoque ilimitado/, /Estoque inicial/, /Público/, /Todos os programas/, /aria-haspopup="listbox"/, /aria-haspopup="dialog"/, /Disponível até/, /Limite por aluno/, /Publicar agora/]) assert.match(html, trecho);
  const edicao = renderToStaticMarkup(createElement(FormularioRecompensa, { original: base, onCancelar() {}, onSalvo() {} }));
  assert.match(edicao, /nova versão/);
  assert.doesNotMatch(edicao, /Estoque inicial/);
});
