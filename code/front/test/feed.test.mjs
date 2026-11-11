import { test, after } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "vite";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { criarParserSse, abrirFeedStream } from "../src/api/feed-stream.js";

test("parser SSE preserva JSON fragmentado, CRLF e múltiplos eventos", () => {
  const eventos = [];
  const parser = criarParserSse((e) => eventos.push(e));
  parser('event: feed.post.created\r\nid: abc\r\ndata: {"public');
  parser('acaoId":1}\r');
  parser(
    '\n\r\n: heartbeat\n\nevent: feed.like.updated\ndata: {"publicacaoId":2}\n\n',
  );
  assert.equal(eventos.length, 2);
  assert.equal(eventos[0].data.publicacaoId, 1);
  assert.equal(eventos[1].type, "feed.like.updated");
});
test("stream usa Bearer sem query string e aborta ao sair da tela", async () => {
  const anterior = globalThis.fetch;
  let sinal;
  globalThis.fetch = async (url, opts) => {
    assert.equal(url, "http://localhost/publicacoes/events");
    assert.equal(opts.headers.Authorization, "Bearer tk");
    sinal = opts.signal;
    return new Response(
      new ReadableStream({
        start(c) {
          c.enqueue(
            new TextEncoder().encode(
              'event: feed.ready\ndata: {"conectado":true}\n\n',
            ),
          );
        },
      }),
      { headers: { "content-type": "text/event-stream" } },
    );
  };
  try {
    let recebeu;
    const evento = new Promise((r) => (recebeu = r));
    const fechar = abrirFeedStream({
      url: "http://localhost/publicacoes/events",
      token: () => "tk",
      onEvento: recebeu,
    });
    assert.equal((await evento).type, "feed.ready");
    fechar();
    assert.equal(sinal.aborted, true);
  } finally {
    globalThis.fetch = anterior;
  }
});
test("401 encerra tentativas e informa expiração", async () => {
  const anterior = globalThis.fetch;
  let tentativas = 0;
  let estado;
  globalThis.fetch = async () => {
    tentativas++;
    return new Response("", { status: 401 });
  };
  try {
    let pronto;
    const concluido = new Promise((r) => (pronto = r));
    const fechar = abrirFeedStream({
      url: "http://localhost/events",
      token: () => "tk",
      onEvento: () => assert.fail(),
      onEstado: (v) => {
        estado = v;
        pronto();
      },
    });
    await concluido;
    assert.match(estado, /Sessão expirada/);
    assert.equal(tentativas, 1);
    fechar();
  } finally {
    globalThis.fetch = anterior;
  }
});

const storage = new Map();
globalThis.localStorage = {
  getItem: (k) => storage.get(k) || null,
  setItem: (k, v) => storage.set(k, v),
  removeItem: (k) => storage.delete(k),
};
const server = await createServer({
  server: { middlewareMode: true, hmr: false },
  appType: "custom",
});
after(() => server.close());
const client = await server.ssrLoadModule("/src/api/client.js");
const { FeedView, filtrarPublicacoes } = await server.ssrLoadModule(
  "/src/pages/FeedPage.jsx",
);
const { default: ConfiguracoesPage } = await server.ssrLoadModule(
  "/src/pages/coordenacao/ConfiguracoesPage.jsx",
);
const { AuthProvider } = await server.ssrLoadModule(
  "/src/auth/AuthContext.jsx",
);

test("configurações encaminham comunicados ao Feed sem formulário separado", () => {
  const html = renderToStaticMarkup(
    createElement(
      MemoryRouter,
      {},
      createElement(AuthProvider, {}, createElement(ConfiguracoesPage)),
    ),
  );
  assert.ok(html.includes('href="/coordenacao/feed"'));
  assert.ok(html.includes("Conta da coordenação"));
  assert.ok(!html.includes("<form"));
  assert.ok(!html.includes(">Publicar comunicado<"));
});

const postBase = {
  id: 1,
  autor: "Pedro Santos",
  iniciais: "PS",
  descricaoAutor: "Padrinho do programa",
  tempo: "agora",
  categoria: "Campus",
  texto: "Dica para visitar a biblioteca",
  imagens: [],
  midias: [],
  curtidas: 0,
  curtidoPeloUsuario: false,
  comentarios: 1,
  comentariosDetalhes: [{ id: 1, texto: "Meu comentário", podeExcluir: true }],
};

for (const [perfil, podePublicar, podeAdministrar, podeInteragir] of [
  ["coordenador", true, true, true],
  ["padrinho", true, false, true],
  ["apadrinhado", false, false, true],
  ["nenhuma", false, false, false],
]) {
  test(`React respeita as permissões retornadas para ${perfil}`, () => {
    const html = renderToStaticMarkup(
      createElement(FeedView, {
        podePublicar,
        itens: [{ ...postBase, podeAdministrar, podeInteragir }],
      }),
    );
    assert.equal(html.includes("Nova publicação"), podePublicar);
    assert.equal(html.includes(">Editar</button>"), podeAdministrar);
    assert.equal(html.includes('aria-label="Seu comentário"'), podeInteragir);
    assert.equal(html.includes("aria-pressed="), podeInteragir);
    // Mesmo sem papel de participante, o autor conserva a exclusão própria.
    assert.ok(html.includes('aria-label="Excluir comentário"'));
    const alheio = renderToStaticMarkup(
      createElement(FeedView, {
        itens: [
          {
            ...postBase,
            podeAdministrar,
            podeInteragir,
            comentariosDetalhes: [
              { id: 2, texto: "Alheio", podeExcluir: podeAdministrar },
            ],
          },
        ],
      }),
    );
    assert.equal(
      alheio.includes('aria-label="Excluir comentário"'),
      podeAdministrar,
    );
  });
}

test("React filtra comunicados, dicas e categorias já existentes sem misturar posts", () => {
  const itens = [
    postBase,
    { ...postBase, id: 2, categoria: "Comunicados", texto: "Aviso oficial" },
    {
      ...postBase,
      id: 3,
      categoria: "Categoria antiga",
      texto: "Conteúdo legado",
    },
  ];
  assert.deepEqual(
    filtrarPublicacoes(itens, "Comunicados").map((p) => p.id),
    [2],
  );
  assert.equal(filtrarPublicacoes(itens, "").length, 3);
  const html = renderToStaticMarkup(
    createElement(FeedView, { itens, categoria: "Comunicados" }),
  );
  assert.ok(html.includes("Aviso oficial"));
  assert.ok(html.includes("Categoria antiga"));
  assert.ok(!html.includes("Dica para visitar a biblioteca"));
  assert.ok(!html.includes("Conteúdo legado"));
});
test("REST do feed reutiliza sessões e upload multipart", async () => {
  client.persistSession({
    accessToken: "coord",
    usuario: { perfil: "coordenador" },
  });
  client.persistAlunoSession({
    accessToken: "aluno",
    expiresIn: 3600,
    usuario: { email: "aluno@teste" },
  });
  const anterior = globalThis.fetch;
  const pedidos = [];
  globalThis.fetch = async (url, opts) => {
    pedidos.push({ url, ...opts });
    return new Response("{}", {
      headers: { "content-type": "application/json" },
    });
  };
  try {
    await client.api.criarPublicacao({ texto: "Olá" });
    await client.api.feed("aluno@teste");
    await client.api.comentarPublicacao(1, "Oi", "aluno@teste");
    await client.api.uploadFeed(
      new File(["foto"], "foto.png", { type: "image/png" }),
    );
    assert.equal(pedidos[0].headers.Authorization, "Bearer coord");
    assert.equal(pedidos[1].headers.Authorization, "Bearer aluno");
    assert.equal(pedidos[2].body, JSON.stringify({ texto: "Oi" }));
    assert.ok(pedidos[3].body instanceof FormData);
    assert.equal(pedidos[3].headers["Content-Type"], undefined);
  } finally {
    globalThis.fetch = anterior;
  }
});
