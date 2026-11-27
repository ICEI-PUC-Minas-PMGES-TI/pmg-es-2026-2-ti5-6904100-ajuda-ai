import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'vite';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';

globalThis.window ??= globalThis;
const storage = new Map();
globalThis.localStorage = { getItem: (k) => storage.get(k) || null, setItem: (k, v) => storage.set(k, v), removeItem: (k) => storage.delete(k) };
const server = await createServer({ server: { middlewareMode: true }, appType: 'custom' });
after(() => server.close());
const coord = await server.ssrLoadModule('/src/pages/coordenacao/ConquistasPage.jsx');
const aluno = await server.ssrLoadModule('/src/pages/aluno/ConquistasAlunoPage.jsx');
const notificacoes = await server.ssrLoadModule('/src/pages/aluno/notificacoes.js');

const CRITERIOS = [
  { criterio: 'MISSOES_CONCLUIDAS', rotulo: 'Missões concluídas no semestre', escopo: 'CICLO', metaMin: 1, metaMax: 50 },
  { criterio: 'FEED_PUBLICACOES', rotulo: 'Publicações no feed no semestre', escopo: 'CICLO', metaMin: 1, metaMax: 50 },
  { criterio: 'NIVEL_ALCANCADO', rotulo: 'Nível alcançado', escopo: 'GERAL', metaMin: 2, metaMax: 10 },
];
const form = (extra = {}) => ({ ...coord.formDaConquista(null), nome: 'Explorador', descricao: 'Coletou totens.', ...extra });

test('formulário novo começa válido só com nome e descrição', () => {
  assert.equal(coord.validarConquista(coord.formDaConquista(null), CRITERIOS), 'Informe o nome da conquista.');
  assert.equal(coord.validarConquista(form(), CRITERIOS), '');
});

test('formulário avisa os mesmos erros que o servidor recusa', () => {
  assert.match(coord.validarConquista(form({ meta: '51' }), CRITERIOS), /meta vai de 1 a 50/);
  assert.match(coord.validarConquista(form({ criterio: 'NIVEL_ALCANCADO', meta: '1' }), CRITERIOS), /2 a 10/);
  assert.match(coord.validarConquista(form({ criterio: 'FEED_PUBLICACOES', publico: 'APADRINHADOS' }), CRITERIOS), /padrinhos/);
  assert.match(coord.validarConquista(form({ xp: '51' }), CRITERIOS), /0 a 50/);
  assert.match(coord.validarConquista(form({ imagemUrl: 'http://x.com/a.png' }), CRITERIOS), /https/);
  assert.match(coord.validarConquista(form({ meta: '2.5' }), CRITERIOS), /inteiro/);
});

test('criação normaliza; edição manda só o que mudou', () => {
  assert.deepEqual(coord.corpoCriacaoConquista(form({ nome: '  Explorador ', imagemUrl: ' ', programaCodigo: '' })), {
    nome: 'Explorador', descricao: 'Coletou totens.', imagemUrl: null, criterio: 'MISSOES_CONCLUIDAS',
    meta: 3, publico: 'TODOS', programaCodigo: null, xp: 0, publicar: false,
  });
  const original = { nome: 'A', descricao: 'B', imagemUrl: null, criterio: 'MISSOES_CONCLUIDAS', meta: 3, publico: 'TODOS', programaCodigo: null, xp: 0 };
  assert.deepEqual(coord.alteracoesConquista(original, { ...coord.formDaConquista(original), nome: 'Novo' }), { nome: 'Novo' });
  assert.deepEqual(coord.alteracoesConquista(original, coord.formDaConquista(original)), {});
});

test('lista da coordenação: estado, critério e exclusão só sem uso', () => {
  const base = { criterio: 'MISSOES_CONCLUIDAS', criterioTexto: 'Concluir 3 missões no semestre.', publico: 'TODOS', programaCodigo: null, imagemUrl: null, criadoEm: '2026-11-01T00:00:00Z' };
  const html = renderToStaticMarkup(createElement(coord.ListaConquistas, {
    conquistas: [
      { ...base, id: '1', nome: 'Usada', estado: 'publicada', xp: 20, desbloqueios: 3, podeExcluir: false },
      { ...base, id: '2', nome: 'Nova', estado: 'rascunho', xp: 0, desbloqueios: 0, podeExcluir: true },
    ],
  }));
  assert.match(html, /Concluir 3 missões no semestre\./);
  assert.match(html, /\+20 XP/);
  assert.match(html, /Só a medalha/);
  assert.match(html, /3 alunos/);
  assert.match(html, /Arquivar conquista Usada/);
  assert.doesNotMatch(html, /Excluir conquista Usada/);
  assert.match(html, /Excluir conquista Nova/);
  assert.match(html, /Publicar conquista Nova/);
});

test('coleção do aluno: aviso das novas, contexto e barra de progresso', () => {
  const colecao = {
    novas: [{ id: 'a', contexto: '2026/2' }],
    obtidas: [{ id: 'a', nome: 'Explorador', contexto: '2026/2' }, { id: 'b', nome: 'Outra', contexto: 'GERAL' }],
  };
  assert.equal(aluno.textoNovas(colecao), 'Conquista desbloqueada: Explorador!');
  assert.equal(aluno.textoNovas({ ...colecao, novas: [...colecao.novas, { id: 'b', contexto: 'GERAL' }] }), 'Você desbloqueou 2 conquistas!');
  assert.equal(aluno.textoNovas({ ...colecao, novas: [] }), '');
  assert.equal(aluno.rotuloContexto('GERAL'), 'Conquista de carreira');
  assert.equal(aluno.rotuloContexto('2026/2'), 'Semestre 2026/2');
  assert.equal(aluno.porcentagem({ atual: 1, meta: 3 }), 33);
  assert.equal(aluno.porcentagem({ atual: 9, meta: 3 }), 100);
  assert.equal(aluno.dataLocal('inválida'), '');
});

test('notificação de conquista abre a coleção na web', () => {
  assert.equal(notificacoes.rotaDaNotificacao('/conquistas'), '/aluno/conquistas');
  assert.equal(notificacoes.ICONE_NOTIFICACAO.CONQUISTA_DESBLOQUEADA, 'trophy');
});

test('mesma conquista em dois semestres: só o desbloqueio de agora é novo (id + contexto)', () => {
  const colecao = {
    novas: [{ id: 'a', contexto: '2026/2' }],
    obtidas: [
      { id: 'a', nome: 'Explorador', contexto: '2026/2' },
      { id: 'a', nome: 'Explorador', contexto: '2026/1' },
    ],
  };
  assert.equal(aluno.textoNovas(colecao), 'Conquista desbloqueada: Explorador!');
  assert.deepEqual(colecao.obtidas.filter((o) => aluno.ehNova(colecao, o)).map((o) => o.contexto), ['2026/2']);
  // Formato antigo (só o id) não marca nada como novo.
  assert.equal(aluno.textoNovas({ ...colecao, novas: ['a'] }), '');
});

test('imagem com HTTPS:// maiúsculo é aceita e enviada em minúsculas, como o banco exige', () => {
  const form = { ...coord.formDaConquista(null), nome: 'X', descricao: 'Y', criterio: 'MISSOES_CONCLUIDAS', meta: '2', imagemUrl: '  HTTPS://exemplo.com/Medalha.PNG ' };
  assert.equal(coord.validarConquista(form, CRITERIOS), '');
  assert.equal(coord.corpoCriacaoConquista(form).imagemUrl, 'https://exemplo.com/Medalha.PNG');
  assert.equal(coord.normalizarImagem('HtTpS://a.b/c'), 'https://a.b/c');
  assert.equal(coord.normalizarImagem('   '), null);
  const original = { nome: 'X', descricao: 'Y', imagemUrl: 'https://exemplo.com/Medalha.PNG', criterio: 'MISSOES_CONCLUIDAS', meta: 2, publico: 'TODOS', programaCodigo: null, xp: 0 };
  assert.deepEqual(coord.alteracoesConquista(original, form), {});
});

test('aviso "Nova!": confirma ao servidor só o que a tela exibiu (id + contexto)', () => {
  const colecao = {
    novas: [{ id: 'a', contexto: '2026/2' }, { id: 'fantasma', contexto: '2026/2' }],
    obtidas: [
      { id: 'a', nome: 'Explorador', contexto: '2026/2' },
      { id: 'a', nome: 'Explorador', contexto: '2026/1' },
      { id: 'b', nome: 'Outra', contexto: 'GERAL' },
    ],
  };
  assert.deepEqual(aluno.vistasParaConfirmar(colecao), [{ id: 'a', contexto: '2026/2' }]);
  assert.deepEqual(aluno.vistasParaConfirmar({ ...colecao, novas: [] }), []);
  assert.deepEqual(aluno.vistasParaConfirmar(null), []);
});

test('mais de 200 avisos: confirma em lotes de até 200; um lote com falha não barra os outros', async () => {
  const vistas = Array.from({ length: 450 }, (_, i) => ({ id: `id-${i}`, contexto: '2026/2' }));
  assert.equal(aluno.VISTAS_POR_LOTE, 200);
  assert.deepEqual(aluno.lotesDeVistas(vistas).map((l) => l.length), [200, 200, 50]);
  assert.deepEqual(aluno.lotesDeVistas([]), []);
  const enviados = [];
  const conta = { email: 'a@pucminas.edu.br', contaAtiva: () => 'a@pucminas.edu.br' };
  const confirmados = await aluno.confirmarEmLotes(vistas, {
    ...conta,
    enviar: async (lote) => {
      enviados.push(lote.length);
      if (enviados.length === 2) throw new Error('falha simulada no 2º lote');
    },
  });
  assert.deepEqual(enviados, [200, 200, 50]);
  assert.equal(confirmados, 250);
  // Todos os avisos foram enviados, cada um uma vez.
  const todos = [];
  await aluno.confirmarEmLotes(vistas, { ...conta, enviar: async (lote) => { todos.push(...lote); } });
  assert.deepEqual(todos, vistas);
});

test('troca de conta no meio da confirmação: para, e nunca envia os avisos de A com a sessão de B', async () => {
  const client = await server.ssrLoadModule('/src/api/client.js');
  const entrar = (email, accessToken) => client.persistAlunoSession({ accessToken, expiresIn: 3600, usuario: { email, nome: email } });
  const fetchOriginal = globalThis.fetch;
  const autorizacoes = [];
  try {
    entrar('a@pucminas.edu.br', 'token-de-A');
    globalThis.fetch = async (_url, opcoes) => {
      autorizacoes.push(opcoes.headers.Authorization);
      // Durante o 1º lote, a pessoa entra na conta B.
      entrar('b@pucminas.edu.br', 'token-de-B');
      return new Response('{"marcadas":200}', { status: 200, headers: { 'content-type': 'application/json' } });
    };
    const vistas = Array.from({ length: 450 }, (_, i) => ({ id: `id-${i}`, contexto: '2026/2' }));
    const confirmados = await aluno.confirmarEmLotes(vistas, { email: 'a@pucminas.edu.br' });
    assert.deepEqual(autorizacoes, ['Bearer token-de-A']);
    assert.equal(confirmados, 200);
    // Mesmo chamada direto, a API do cliente recusa a conta errada antes de enviar.
    await assert.rejects(client.api.confirmarConquistasVistas(vistas.slice(0, 1), 'a@pucminas.edu.br'), { status: 401 });
    assert.deepEqual(autorizacoes, ['Bearer token-de-A']);
    // Sem conta que carregou a coleção, nada é enviado.
    assert.equal(await aluno.confirmarEmLotes(vistas, {}), 0);
  } finally {
    globalThis.fetch = fetchOriginal;
    client.clearAlunoSession();
  }
});

