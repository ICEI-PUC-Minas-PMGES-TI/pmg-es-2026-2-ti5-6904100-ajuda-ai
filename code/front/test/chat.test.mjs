import assert from 'node:assert/strict';
import test, { after } from 'node:test';
import { createServer } from 'vite';

const storage = new Map();
globalThis.localStorage = {
  getItem: (key) => storage.get(key) || null,
  setItem: (key, value) => storage.set(key, value),
  removeItem: (key) => storage.delete(key),
};

const server = await createServer({
  server: { middlewareMode: true, hmr: false },
  appType: 'custom',
});
after(() => server.close());

const client = await server.ssrLoadModule('/src/api/client.js');
const email = 'aluno@teste';
client.persistAlunoSession({
  accessToken: 'token-aluno',
  expiresIn: 3600,
  usuario: { email },
});

test('métodos do chat enviam as rotas, os parâmetros e o JWT do aluno', async () => {
  const anterior = globalThis.fetch;
  const chamadas = [];
  globalThis.fetch = async (url, options) => {
    chamadas.push({ url, options });
    return new Response('[]', { status: 200 });
  };

  try {
    await client.api.chats(email);
    await client.api.mensagensChat(12, email, 'mensagem/3');
    await client.api.enviarMensagemChat(12, 'Olá', email);

    assert.deepEqual(
      chamadas.map(({ url, options }) => [
        url,
        options.method || 'GET',
        options.headers.Authorization,
      ]),
      [
        ['http://localhost:3000/chats', 'GET', 'Bearer token-aluno'],
        [
          'http://localhost:3000/chats/12/mensagens?antesDe=mensagem%2F3',
          'GET',
          'Bearer token-aluno',
        ],
        ['http://localhost:3000/chats/12/mensagens', 'POST', 'Bearer token-aluno'],
      ],
    );
    assert.deepEqual(JSON.parse(chamadas[2].options.body), { texto: 'Olá' });
  } finally {
    globalThis.fetch = anterior;
  }
});

test('stream do chat processa eventos e informa o estado da conexão', async () => {
  const anterior = globalThis.fetch;
  let headers;
  globalThis.fetch = async (_url, options) => {
    headers = options.headers;
    return new Response(
      new ReadableStream({
        start(controller) {
          controller.enqueue(
            new TextEncoder().encode(
              'event: chat.ready\ndata: {"conectado":true}\n\n' +
                'event: chat.message\ndata: {"id":9,"texto":"Oi"}\n\n',
            ),
          );
          controller.close();
        },
      }),
      { headers: { 'content-type': 'text/event-stream' } },
    );
  };

  try {
    const eventos = [];
    const estados = [];
    await client.streamChatMessages(
      12,
      email,
      (evento) => eventos.push(evento),
      new AbortController().signal,
      (estado) => estados.push(estado),
    );

    assert.equal(headers.Authorization, 'Bearer token-aluno');
    assert.deepEqual(eventos, [{ id: 9, texto: 'Oi' }]);
    assert.deepEqual(estados, [true, false]);
  } finally {
    globalThis.fetch = anterior;
  }
});
