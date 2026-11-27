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
const chatRequests = await server.ssrLoadModule(
  '/src/pages/aluno/chat-requests.js',
);
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
    await client.api.mensagensChat(12, email, 101);
    await client.api.enviarMensagemChat(12, 'Olá', email);
    await client.api.enviarImagemChat(
      12,
      new Blob(['imagem'], { type: 'image/png' }),
      email,
    );

    assert.deepEqual(
      chamadas.map(({ url, options }) => [
        url,
        options.method || 'GET',
        options.headers.Authorization,
      ]),
      [
        ['http://localhost:3000/chats', 'GET', 'Bearer token-aluno'],
        [
          'http://localhost:3000/chats/12/mensagens?antesDe=101',
          'GET',
          'Bearer token-aluno',
        ],
        ['http://localhost:3000/chats/12/mensagens', 'POST', 'Bearer token-aluno'],
        ['http://localhost:3000/chats/12/imagens', 'POST', 'Bearer token-aluno'],
      ],
    );
    assert.deepEqual(JSON.parse(chamadas[2].options.body), { texto: 'Olá' });
    assert.ok(chamadas[3].options.body instanceof FormData);
    assert.equal(chamadas[3].options.body.get('arquivo').type, 'image/png');
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
                'event: chat.message\ndata: {"id":9,"texto":"Oi"}\n\n' +
                'event: chat.access\ndata: {"revogado":true}\n\n',
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
    assert.deepEqual(eventos, [
      { id: 9, texto: 'Oi' },
      { tipo: 'chat.access', revogado: true },
    ]);
    assert.deepEqual(estados, [true, false]);
  } finally {
    globalThis.fetch = anterior;
  }
});

test('descarta a resposta atrasada de uma conversa que já não está selecionada', async () => {
  let resolver;
  const resposta = new Promise((resolve) => {
    resolver = resolve;
  });
  const ativa = { current: 'aluno@teste:10' };
  const requisicaoAtual = { current: 1 };
  const aplicar = [];
  const carregar = chatRequests.aplicarRespostaSeAtual({
    chave: 'aluno@teste:10',
    chaveAtual: ativa,
    requisicao: 1,
    requisicaoAtual,
    carregar: () => resposta,
    aplicar: (mensagens) => aplicar.push(mensagens),
  });

  ativa.current = 'aluno@teste:11';
  requisicaoAtual.current = 2;
  resolver([{ id: 8, texto: 'Resposta da conversa anterior' }]);

  assert.equal(await carregar, false);
  assert.deepEqual(aplicar, []);
});

test('descarta uma consulta mais antiga mesmo que a conversa continue selecionada', async () => {
  let resolver;
  const resposta = new Promise((resolve) => {
    resolver = resolve;
  });
  const ativa = { current: 'aluno@teste:10' };
  const requisicaoAtual = { current: 2 };
  const aplicar = [];
  const carregar = chatRequests.aplicarRespostaSeAtual({
    chave: 'aluno@teste:10',
    chaveAtual: ativa,
    requisicao: 1,
    requisicaoAtual,
    carregar: () => resposta,
    aplicar: (mensagens) => aplicar.push(mensagens),
  });

  resolver([{ id: 8, texto: 'Resultado antigo' }]);

  assert.equal(await carregar, false);
  assert.deepEqual(aplicar, []);
});

test('não abre um novo stream com a sessão expirada', async () => {
  const anterior = globalThis.fetch;
  let chamadas = 0;
  client.persistAlunoSession({
    accessToken: 'token-expirado',
    expiresIn: -120,
    usuario: { email },
  });
  globalThis.fetch = async () => {
    chamadas++;
    return new Response(null, { status: 200 });
  };

  try {
    await assert.rejects(
      client.streamChatMessages(12, email, () => {}, new AbortController().signal),
      (falha) => falha.status === 401,
    );
    assert.equal(chamadas, 0);
  } finally {
    globalThis.fetch = anterior;
    client.persistAlunoSession({
      accessToken: 'token-aluno',
      expiresIn: 3600,
      usuario: { email },
    });
  }
});
