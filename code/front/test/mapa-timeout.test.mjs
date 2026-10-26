import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'vite';

const originalFetch = globalThis.fetch;
const server = await createServer({ server: { middlewareMode: true, hmr: false }, appType: 'custom' });
after(async () => { globalThis.fetch = originalFetch; await server.close(); });
const { api } = await server.ssrLoadModule('/src/api/client.js');

test('consulta do painel do mapa cancela conexão travada e permite tentar novamente', async (t) => {
  let signal;
  globalThis.fetch = (_url, options) => {
    signal = options.signal;
    return new Promise(() => {}); // Conexão que não devolve sequer os headers.
  };
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const pending = api.pucstops();
  assert.ok(signal instanceof AbortSignal);
  t.mock.timers.tick(15_001);
  await assert.rejects(pending, (error) => error.status === 0 && /tempo|demorou/i.test(error.message));
  assert.equal(signal.aborted, true);
  globalThis.fetch = async () => new Response('[]');
  assert.deepEqual(await api.pucstops(), []);
});

test('upload de cardápio também termina se o corpo da resposta ficar travado', async (t) => {
  let signal;
  globalThis.fetch = async (_url, options) => {
    signal = options.signal;
    return { ok: true, status: 201, text: () => new Promise(() => {}) };
  };
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const pending = api.enviarCardapio('restaurante-local', {
    arquivo: new File(['%PDF-1.7'], 'menu.pdf', { type: 'application/pdf' }),
    validoDe: '2026-10-18', validoAte: '2026-10-19',
  });
  assert.ok(signal instanceof AbortSignal);
  const assertion = assert.rejects(pending, (error) => error.status === 0 && /tempo|demorou/i.test(error.message));
  t.mock.timers.tick(60_001);
  await assertion;
});
