import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { createServer } from 'vite';

const storage = new Map();
globalThis.localStorage = { getItem: k => storage.get(k) || null, setItem: (k, v) => storage.set(k, v), removeItem: k => storage.delete(k) };
const server = await createServer({ server: { middlewareMode: true }, appType: 'custom' });
after(() => server.close());
const client = await server.ssrLoadModule('/src/api/client.js');

function arquivos(pasta) {
  return readdirSync(pasta).flatMap((nome) => {
    const caminho = join(pasta, nome);
    if (statSync(caminho).isDirectory()) return arquivos(caminho);
    return /\.(jsx?|mjs)$/.test(nome) ? [caminho] : [];
  });
}

// Um merge já perdeu api.encerrarInscricoes sem nenhum teste acusar: toda
// chamada `api.X(` das telas precisa existir no cliente HTTP.
test('todo método api.X usado nas telas existe em client.js', () => {
  const usados = new Map();
  for (const arquivo of arquivos(join(import.meta.dirname, '..', 'src'))) {
    for (const [, nome] of readFileSync(arquivo, 'utf8').matchAll(/\bapi\.([A-Za-z_]\w*)\s*\(/g)) {
      if (!usados.has(nome)) usados.set(nome, arquivo);
    }
  }
  const ausentes = [...usados].filter(([nome]) => typeof client.api[nome] !== 'function');
  assert.deepEqual(ausentes.map(([nome, arquivo]) => `${nome} (${arquivo})`), []);
});

test('encerrar inscrições faz POST com o código do ciclo e o JWT da coordenação', async () => {
  client.persistSession({ accessToken: 'jwt-coord', usuario: { papel: 'coordenador' } });
  let chamada;
  globalThis.fetch = async (url, opts) => { chamada = { url, ...opts }; return new Response(JSON.stringify({ codigo: '2026/2' }), { status: 201 }); };
  await client.api.encerrarInscricoes('2026/2');
  const url = new URL(chamada.url);
  assert.equal(url.pathname, '/coordenacao/programas/encerrar-inscricoes');
  assert.equal(url.searchParams.get('codigo'), '2026/2');
  assert.equal(chamada.method, 'POST');
  assert.equal(chamada.headers.Authorization, 'Bearer jwt-coord');
  globalThis.fetch = async () => new Response(JSON.stringify({ message: 'Inscrições já encerradas.' }), { status: 400 });
  await assert.rejects(() => client.api.encerrarInscricoes('2026/2'), /já encerradas/);
});
