import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'vite';
import { renderToStaticMarkup } from 'react-dom/server';

const storage = new Map();
globalThis.localStorage = { getItem: k => storage.get(k) || null, setItem: (k, v) => storage.set(k, v), removeItem: k => storage.delete(k) };
const server = await createServer({ server: { middlewareMode: true }, appType: 'custom' });
after(() => server.close());
const client = await server.ssrLoadModule('/src/api/client.js');
const { ConfirmarExclusaoPrograma } = await server.ssrLoadModule('/src/pages/coordenacao/ProgramasPage.jsx');

for (const [confirmacao, ocupado, habilitado] of [['', false, false], ['SIM', false, false], ['COORDENADOR', false, true], ['coordenador', false, true], ['COORDENADOR', true, false]]) {
  test(`confirmação ${JSON.stringify(confirmacao)}, ocupado=${ocupado}`, () => {
    let chamadas = 0;
    const tree = ConfirmarExclusaoPrograma({ programa: { codigo: '2026/2' }, confirmacao, ocupado, erro: '', onConfirmar: () => chamadas++, onFechar: () => {}, onAlterar: () => {} });
    const botao = tree.props.acoes.props.children[1];
    assert.equal(botao.props.disabled, !habilitado);
    botao.props.onClick();
    assert.equal(chamadas, habilitado ? 1 : 0);
    const html = renderToStaticMarkup(tree);
    assert.match(html, /Excluir programa 2026\/2/);
    assert.match(html, /permanente/);
    assert.match(html, /Digite COORDENADOR/);
  });
}
test('bloqueio aparece no modal, sem ocultar dependências', () => {
  const html = renderToStaticMarkup(ConfirmarExclusaoPrograma({ programa: { codigo: '2026/2' }, confirmacao: 'COORDENADOR', ocupado: false, erro: 'candidaturas: 2. Encerre o programa.', onConfirmar: () => {}, onFechar: () => {}, onAlterar: () => {} }));
  assert.match(html, /role="alert"/);
  assert.match(html, /candidaturas: 2/);
});
test('DELETE usa código explícito, confirmação e JWT da coordenação; propaga recusa', async () => {
  client.persistSession({ accessToken: 'jwt-coord', usuario: { papel: 'coordenador' } });
  let chamada;
  globalThis.fetch = async (url, opts) => { chamada = { url, ...opts }; return new Response(JSON.stringify({ excluido: true }), { status: 200 }); };
  await client.api.excluirPrograma('2026/2', 'COORDENADOR');
  assert.equal(new URL(chamada.url).searchParams.get('codigo'), '2026/2');
  assert.equal(chamada.method, 'DELETE');
  assert.equal(chamada.headers.Authorization, 'Bearer jwt-coord');
  assert.deepEqual(JSON.parse(chamada.body), { confirmacao: 'COORDENADOR' });
  globalThis.fetch = async () => new Response(JSON.stringify({ message: 'participacoes: 3. Encerre o programa.' }), { status: 409 });
  await assert.rejects(() => client.api.excluirPrograma('2026/2', 'COORDENADOR'), /participacoes: 3/);
});
