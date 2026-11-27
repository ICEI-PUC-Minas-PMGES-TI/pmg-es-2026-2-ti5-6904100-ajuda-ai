import assert from "node:assert/strict";
import { after, test } from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createServer } from "vite";
import { consumirEventosChat } from "../src/api/chatStream.js";
import {
  mesclarMensagens,
  buscarPaginasChat,
  tituloConversa,
} from "../src/pages/aluno/chatDados.js";

const server = await createServer({
  server: { middlewareMode: true, hmr: false },
  optimizeDeps: { noDiscovery: true, include: [] },
  appType: "custom",
});
after(() => server.close());
const { ListaConversas, MensagensChat, EstadoMensagem } =
  await server.ssrLoadModule("/src/pages/aluno/ChatPage.jsx");
const cliente = await server.ssrLoadModule("/src/api/client.js");

test("lista distingue grupo, privado, não lidas e histórico", () => {
  const chats = [
    {
      id: 1,
      tipo: "coletivo",
      titulo: "Grupo de Ana",
      programa: "2026/2",
      podeEnviar: true,
      naoLidas: 2,
    },
    {
      id: 2,
      tipo: "privado",
      programa: "2026/2",
      podeEnviar: false,
      minhaParticipacaoId: 100,
      participantes: [{ participacaoId: 1, nome: "Ana" }],
    },
  ];
  const html = renderToStaticMarkup(
    React.createElement(ListaConversas, {
      conversas: chats,
      onSelecionar() {},
    }),
  );
  for (const texto of ["Grupo de Ana", "Ana", "2 não lida(s)", "Histórico"])
    assert.ok(html.includes(texto));
  assert.equal(tituloConversa(chats[1]), "Ana");
});
test("mensagens usam a identidade da participação e os recibos reais", () => {
  const html = renderToStaticMarkup(
    React.createElement(MensagensChat, {
      mensagens: [
        {
          id: 1,
          remetenteParticipacaoId: 100,
          texto: "Minha",
          estado: "entregue",
          recibos: { total: 2, lidas: 1 },
        },
        {
          id: 2,
          remetenteParticipacaoId: 1,
          remetenteNome: "Ana",
          texto: "Resposta",
        },
        {
          id: 3,
          remetenteParticipacaoId: 1,
          remetenteNome: "Ana",
          imagemUrl: "https://storage.test/chat/image.png",
          texto: "Imagem",
        },
      ],
      meusIds: [100],
    }),
  );
  assert.match(html, /outgoing/);
  assert.match(html, /incoming/);
  assert.match(html, /1\/2 leitura/);
  assert.ok(html.includes("Ana"));
  assert.doesNotMatch(html, /Lida por todos/);
  assert.match(html, /alt="Imagem enviada na conversa"/);
  assert.match(html, /https:\/\/storage\.test\/chat\/image\.png/);
});
test("confirmação de leitura do grupo indica todos os destinatários", () => {
  const html = renderToStaticMarkup(
    React.createElement(EstadoMensagem, {
      estado: "lida",
      recibos: { total: 2, lidas: 2 },
    }),
  );
  assert.match(html, /Lida por todos os destinatários/);
});
test("mescla páginas e respostas atrasadas sem duplicar nem regredir leitura", () => {
  const m = mesclarMensagens(
    [
      {
        id: 2,
        texto: "Mensagem",
        estado: "lida",
        recibos: { total: 2, lidas: 2, entregues: 2 },
      },
    ],
    [
      { id: 1, texto: "Anterior", estado: "enviada" },
      {
        id: 2,
        texto: "Mensagem",
        estado: "enviada",
        recibos: { total: 2, lidas: 0, entregues: 0 },
      },
    ],
  );
  assert.deepEqual(
    m.map((m) => m.id),
    [1, 2],
  );
  assert.equal(m[1].estado, "lida");
  assert.equal(m[1].recibos.lidas, 2);
});
test("parser preserva UTF-8 e frames SSE divididos em chunks", async () => {
  const bytes = new TextEncoder().encode(
    'event: chat.changed\r\ndata: {"aviso":"Conexão"}\r\n\r\n',
  );
  const stream = new ReadableStream({
    start(c) {
      for (const b of bytes) c.enqueue(new Uint8Array([b]));
      c.close();
    },
  });
  const eventos = [];
  await consumirEventosChat(new Response(stream), (e) => eventos.push(e));
  assert.deepEqual(eventos, [
    { tipo: "chat.changed", id: undefined, dados: { aviso: "Conexão" } },
  ]);
});
test("fechar a tela cancela o leitor e a conexão de eventos", async () => {
  let cancelou = false;
  const controller = new AbortController();
  const stream = new ReadableStream({
    start(c) {
      c.enqueue(
        new TextEncoder().encode('event: chat.ready\ndata: {"revisao":1}\n\n'),
      );
    },
    cancel() {
      cancelou = true;
    },
  });
  await consumirEventosChat(
    new Response(stream),
    () => controller.abort(),
    controller.signal,
  );
  assert.equal(cancelou, true);
});
test("JSON de evento inválido encerra o leitor em vez de manter conexão vazando", async () => {
  let cancelou = false;
  const stream = new ReadableStream({
    start(c) {
      c.enqueue(
        new TextEncoder().encode("event: chat.changed\ndata: {invalido}\n\n"),
      );
    },
    cancel() {
      cancelou = true;
    },
  });
  await assert.rejects(consumirEventosChat(new Response(stream), () => {}));
  assert.equal(cancelou, true);
});
test("API usa JWT do aluno, cursor e UUID de envio sem publicar autoria fornecida pelo cliente", async () => {
  const anterior = globalThis.fetch,
    pedidos = [];
  cliente.persistAlunoSession({
    accessToken: "jwt-aluno",
    usuario: { email: "bia@pucminas.edu.br" },
  });
  globalThis.fetch = async (url, options = {}) => {
    pedidos.push({ url, ...options });
    return new Response(
      JSON.stringify(url.includes("/mensagens") ? { id: 1 } : []),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  };
  try {
    await cliente.api.chats("bia@pucminas.edu.br", "2026/2");
    await cliente.api.mensagensChat(7, "bia@pucminas.edu.br", { depoisDe: 0 });
    const id = "63be4551-9576-48ef-9dd8-d0ede2e7ab8e";
    await cliente.api.enviarMensagemChat(7, "Olá", "bia@pucminas.edu.br", id);
    await cliente.api.enviarMensagemChat(7, "Olá", "bia@pucminas.edu.br", id);
    await cliente.api.enviarImagemChat(
      7,
      new Blob(["imagem"], { type: "image/png" }),
      "bia@pucminas.edu.br",
    );
    assert.ok(pedidos[0].url.includes("programa=2026%2F2"));
    assert.ok(pedidos[1].url.includes("depoisDe=0"));
    assert.ok(
      pedidos.every((p) => p.headers.Authorization === "Bearer jwt-aluno"),
    );
    assert.equal(pedidos[2].body, pedidos[3].body);
    assert.deepEqual(JSON.parse(pedidos[2].body), {
      texto: "Olá",
      clientId: id,
    });
    assert.ok(pedidos[4].url.endsWith("/chats/7/imagens"));
    assert.ok(pedidos[4].body instanceof FormData);
    assert.equal(pedidos[4].headers.Authorization, "Bearer jwt-aluno");
    assert.equal(pedidos[4].body.get("arquivo").type, "image/png");
    await assert.rejects(cliente.api.chats("outra@pucminas.edu.br"), {
      status: 401,
    });
  } finally {
    globalThis.fetch = anterior;
    cliente.clearAlunoSession();
  }
});

test("conexão SSE usa token no header e encerra ao sair da tela", async () => {
  const anterior = globalThis.fetch;
  let cancelou = false;
  let pedido;
  cliente.persistAlunoSession({
    accessToken: "jwt-sse",
    usuario: { email: "bia@pucminas.edu.br" },
  });
  globalThis.fetch = async (url, options) => {
    pedido = { url, options };
    return new Response(
      new ReadableStream({
        start(c) {
          c.enqueue(
            new TextEncoder().encode(
              'event: chat.ready\ndata: {"revisao":1}\n\n',
            ),
          );
        },
        cancel() {
          cancelou = true;
        },
      }),
      { status: 200 },
    );
  };
  try {
    const controller = new AbortController();
    await cliente.streamChatMessages(
      7,
      "bia@pucminas.edu.br",
      () => controller.abort(),
      controller.signal,
    );
    assert.ok(pedido.url.endsWith("/chats/7/events"));
    assert.ok(!pedido.url.includes("jwt-sse"));
    assert.equal(pedido.options.headers.Authorization, "Bearer jwt-sse");
    assert.equal(cancelou, true);
  } finally {
    globalThis.fetch = anterior;
    cliente.clearAlunoSession();
  }
});

test('500 mensagens em memória: uma nova mensagem exige uma única página, a partir da mais recente', async () => {
 const pedidos=[], recebidas=[];
 const resultado=await buscarPaginasChat({
   mensagens:Array.from({length:500},(_,i)=>({id:i+1})),cursor:500,avancarCursor:()=>{},ativo:()=>true,
   buscar:async cursor=>{pedidos.push(cursor);return {mensagens:[{id:501,texto:'Nova'}],temMais:false};},
   aplicar:pagina=>recebidas.push(...pagina.mensagens),
 });
 assert.deepEqual(pedidos,[{antesDe:undefined,depoisDe:500}]);
 assert.deepEqual(recebidas.map(m=>m.id),[501]);assert.equal(resultado.inicial,false);
});
test('buscar histórico usa a mais antiga; atualizações percorrem somente páginas novas', async () => {
 const cursores=[];
 await buscarPaginasChat({mensagens:[{id:100},{id:500}],cursor:500,anteriores:true,ativo:()=>true,
 buscar:async c=>{cursores.push(c);return {mensagens:[{id:99}],temMais:true};},aplicar:()=>{}});
 assert.deepEqual(cursores,[{antesDe:100,depoisDe:undefined}]);
 const novos=[];
 await buscarPaginasChat({mensagens:[{id:1},{id:500}],cursor:500,avancarCursor:()=>{},ativo:()=>true,
 buscar:async c=>{novos.push(c.depoisDe);return c.depoisDe===500?{mensagens:[{id:550}],temMais:true}:{mensagens:[{id:551}],temMais:false};},aplicar:()=>{}});
 assert.deepEqual(novos,[500,550]);
});

test('resposta do envio 102 não faz a consulta pular a mensagem recebida 101', async () => {
 let mensagens=[{id:100},{id:102,texto:'Meu envio'}], cursor=100;
 const pedidos=[];
 await buscarPaginasChat({mensagens,cursor,ativo:()=>true,
   avancarCursor:c=>{cursor=c;},
   buscar:async c=>{pedidos.push(c.depoisDe);return {mensagens:c.depoisDe===100?[{id:101,texto:'Outra pessoa'},{id:102}]:[],temMais:false};},
   aplicar:p=>{mensagens=mesclarMensagens(mensagens,p.mensagens);},
 });
 assert.deepEqual(pedidos,[100]);assert.deepEqual(mensagens.map(m=>m.id),[100,101,102]);assert.equal(cursor,102);
});

test('envio durante paginação e falha posterior preservam o cursor da última página consumida', async () => {
 let mensagens=[{id:100}], cursor=100;
 const pedidos=[];
 const aplicar=p=>{mensagens=mesclarMensagens(mensagens,p.mensagens);};
 await assert.rejects(buscarPaginasChat({mensagens,cursor,ativo:()=>true,avancarCursor:c=>{cursor=c;},
   buscar:async c=>{pedidos.push(c.depoisDe);if(c.depoisDe===101)throw new Error('Rede');return {mensagens:[{id:101}],temMais:true};},
   aplicar:p=>{aplicar(p);mensagens=mesclarMensagens(mensagens,[{id:103,texto:'Envio concorrente'}]);},
 }),/Rede/);
 assert.equal(cursor,101);
 await buscarPaginasChat({mensagens,cursor,ativo:()=>true,avancarCursor:c=>{cursor=c;},
   buscar:async c=>{pedidos.push(c.depoisDe);return {mensagens:[{id:102},{id:103}],temMais:false};},aplicar});
 assert.deepEqual(pedidos,[100,101,101]);assert.deepEqual(mensagens.map(m=>m.id),[100,101,102,103]);assert.equal(cursor,103);
});

test('primeira consulta vazia estabelece cursor zero mesmo com envio local em memória', async () => {
 let cursor;
 await buscarPaginasChat({mensagens:[{id:102}],cursor,ativo:()=>true,avancarCursor:c=>{cursor=c;},
   buscar:async()=>({mensagens:[],temMais:false}),aplicar:()=>{}});
 assert.equal(cursor,0);
});
