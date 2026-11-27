import { after, test } from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createServer } from "vite";

const server = await createServer({
  server: { middlewareMode: true, hmr: false },
  optimizeDeps: { noDiscovery: true, include: [] },
  appType: "custom",
});
after(() => server.close());
const { ListaGruposMatching, CompatibilidadeDestino } =
  await server.ssrLoadModule("/src/components/GruposMatching.jsx");
const { api } = await server.ssrLoadModule("/src/api/client.js");
const grupos = [
  {
    id: 1,
    nome: "Grupo 1",
    padrinho: { id: 10, nome: "Ana" },
    ocupacao: 2,
    apadrinhados: [
      { id: 20, nome: "Bia", vinculoId: 7 },
      { id: 21, nome: "Caio", vinculoId: 8 },
    ],
  },
];

test("grupo mostra vários apadrinhados e a ação de transferência para cada vínculo", () => {
  const html = renderToStaticMarkup(
    React.createElement(ListaGruposMatching, {
      dados: { grupos, podeMovimentar: true },
      onTransferir() {},
    }),
  );
  for (const texto of [
    "Ana",
    "2 apadrinhado(s)",
    "Transferir Bia",
    "Transferir Caio",
  ])
    assert.ok(html.includes(texto));
  assert.doesNotMatch(html, /disabled/);
});
test("ciclo histórico preserva a lista e impede a ação de transferência", () => {
  const html = renderToStaticMarkup(
    React.createElement(ListaGruposMatching, {
      dados: { grupos, podeMovimentar: false },
    }),
  );
  assert.equal((html.match(/disabled=""/g) || []).length, 2);
});
test("destino mostra vaga, cobertura parcial e motivo de impedimento", () => {
  const html = renderToStaticMarkup(
    React.createElement(CompatibilidadeDestino, {
      destino: {
        vagas: 0,
        capacidade: 3,
        bloqueio: "Capacidade atingida.",
        compatibilidade: { aderencia: 0.75, cobertura: 0.5 },
      },
    }),
  );
  for (const texto of ["0 vaga(s)", "75%", "50%", "Capacidade atingida"])
    assert.ok(html.includes(texto));
});
test("API conserva identidade da operação em uma nova tentativa e usa vínculo de origem", async () => {
  const anterior = globalThis.fetch;
  const pedidos = [];
  globalThis.fetch = async (url, options = {}) => {
    pedidos.push({ url, ...options });
    return new Response(JSON.stringify({ programa: "2026/2", destinos: [] }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  };
  try {
    await api.gruposMatching("2026/2");
    await api.destinosMatching(20, 7);
    const corpo = {
      padrinhoDestinoId: 11,
      motivo: "Disponibilidade",
      operacaoId: "63be4551-9576-48ef-9dd8-d0ede2e7ab8e",
    };
    await api.transferirVinculoMatching(7, corpo);
    await api.transferirVinculoMatching(7, corpo);
    assert.ok(pedidos[0].url.includes("programa=2026%2F2"));
    assert.ok(pedidos[1].url.includes("apadrinhadoId=20&vinculoOrigemId=7"));
    assert.ok(pedidos[2].url.endsWith("/matching/vinculos/7/transferir"));
    assert.deepEqual(JSON.parse(pedidos[2].body), corpo);
    assert.equal(pedidos[2].body, pedidos[3].body);
    assert.ok(pedidos.every((p) => !p.url.endsWith("/desvincular")));
  } finally {
    globalThis.fetch = anterior;
  }
});
