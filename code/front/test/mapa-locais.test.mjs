import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';

const storage = new Map();
globalThis.localStorage = { getItem: k => storage.get(k) || null, setItem: (k, v) => storage.set(k, v), removeItem: k => storage.delete(k) };
const server = await createServer({ server: { middlewareMode: true }, appType: 'custom' });
after(() => server.close());
const client = await server.ssrLoadModule('/src/api/client.js');
const { EditorLocal, VisualizadorImagem } = await server.ssrLoadModule('/src/pages/CampusMapPage.jsx');

const local = { id: 'P01_R4751608', nome: 'Igreja', descricao: 'Horários das missas.', imagens: [{ id: '11111111-1111-4111-8111-111111111111', url: 'https://storage.test/missa.webp', originalUrl: 'https://storage.test/missa-original.webp', tipoConteudo: 'image/webp' }] };

test('visualizador usa original, zoom e ação de download', () => {
  const html = renderToStaticMarkup(createElement(VisualizadorImagem, { imagem: local.imagens[0], onFechar() {} }));
  assert.match(html, /missa-original\.webp/);
  assert.match(html, /Aumentar zoom/);
  assert.match(html, /Diminuir zoom/);
  assert.match(html, /Baixar imagem/);
});

test('editor mantém descrição e oferece substituir/remover', () => {
  const html = renderToStaticMarkup(createElement(EditorLocal, { local, onFechar() {}, onSalvo() {} }));
  assert.match(html, /Horários das missas/);
  assert.match(html, /Adicionar imagens/);
  assert.match(html, /Substituir/);
  assert.match(html, /Remover/);
  assert.match(html, /Salvar informações/);
});

test('cliente usa leitura pública e mutações administrativas multipart', async () => {
  client.persistSession({ accessToken: 'coord', usuario: { perfil: 'coordenador' } });
  const chamadas = [];
  globalThis.fetch = async (url, opcoes = {}) => {
    chamadas.push({ url, ...opcoes });
    return new Response(JSON.stringify(local), { status: 200 });
  };
  await client.api.predio(local.id);
  await client.api.atualizarInformacoesLocal(local.id, 'Novo texto');
  await client.api.adicionarImagensLocal(local.id, [new File(['png'], 'menu.png', { type: 'image/png' })]);
  await client.api.substituirImagemLocal(local.id, local.imagens[0].id, new File(['webp'], 'missa.webp', { type: 'image/webp' }));
  await client.api.removerImagemLocal(local.id, local.imagens[0].id);
  assert.deepEqual(chamadas.map(c => [c.method || 'GET', new URL(c.url).pathname]), [
    ['GET', `/mapa/predios/${local.id}`],
    ['PATCH', `/coordenacao/mapa/predios/${local.id}`],
    ['POST', `/coordenacao/mapa/predios/${local.id}/imagens`],
    ['PATCH', `/coordenacao/mapa/predios/${local.id}/imagens/${local.imagens[0].id}`],
    ['DELETE', `/coordenacao/mapa/predios/${local.id}/imagens/${local.imagens[0].id}`],
  ]);
  assert.equal(chamadas[0].headers.Authorization, undefined);
  assert.equal(chamadas[1].headers.Authorization, 'Bearer coord');
  assert.ok(chamadas[2].body instanceof FormData);
});
