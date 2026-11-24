import { after, test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "vite";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

const server = await createServer({
  server: { middlewareMode: true, hmr: false },
  optimizeDeps: { noDiscovery: true, include: [] },
  appType: "custom",
});
after(() => server.close());
const { HistoricoParMatching, ValidadeSugestaoMatching } =
  await server.ssrLoadModule("/src/components/ParesRecusadosMatching.jsx");
const { api } = await server.ssrLoadModule("/src/api/client.js");

test("histórico preserva a recusa e acrescenta a reconsideração com autores e motivos", () => {
  const html = renderToStaticMarkup(
    React.createElement(HistoricoParMatching, {
      eventos: [
        {
          id: 1,
          acao: "recusado",
          responsavel: "coord1",
          motivo: "Horários incompatíveis",
        },
        {
          id: 2,
          acao: "reconsiderado",
          responsavel: "coord2",
          motivo: "Informação complementada",
        },
      ],
    }),
  );
  for (const texto of [
    "Recusado",
    "Reconsiderado",
    "coord1",
    "coord2",
    "Horários incompatíveis",
    "Informação complementada",
  ])
    assert.ok(html.includes(texto));
});
test("obsolescência mostra o motivo, sem fabricar uma decisão humana", () => {
  const html = renderToStaticMarkup(
    React.createElement(ValidadeSugestaoMatching, {
      dados: {
        status: "obsoleta",
        podeAprovar: false,
        validade: {
          mensagens: ["A configuração mudou. Gere uma nova rodada."],
        },
      },
    }),
  );
  assert.match(html, /Sugestão desatualizada/);
  assert.match(html, /configuração mudou/);
  assert.doesNotMatch(html, /Recusado por|Aprovado por/);
});
test("pendência não vigente também é sinalizada, enquanto aprovação histórica é preservada", () => {
  assert.ok(
    renderToStaticMarkup(
      React.createElement(ValidadeSugestaoMatching, {
        dados: { status: "pendente", podeAprovar: false },
      }),
    ).includes("Gere uma nova rodada"),
  );
  assert.equal(
    renderToStaticMarkup(
      React.createElement(ValidadeSugestaoMatching, {
        dados: { status: "aprovada", podeAprovar: false },
      }),
    ),
    "",
  );
});
test("consultar recusas e reconsiderar usam endpoints próprios; reconsiderar não chama aprovação", async () => {
  const original = globalThis.fetch;
  const pedidos = [];
  globalThis.fetch = async (url, opcoes) => {
    pedidos.push({ url, ...opcoes });
    return new Response(
      JSON.stringify(url.includes("/recusados") ? [] : { impedido: false }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  };
  try {
    await api.paresRecusadosMatching("2026/2");
    await api.reconsiderarParMatching(3, "Informação complementada");
    assert.ok(pedidos[0].url.includes("/pares/recusados?programa=2026%2F2"));
    assert.ok(pedidos[1].url.endsWith("/pares/3/reconsiderar"));
    assert.equal(pedidos[1].method, "POST");
    assert.deepEqual(JSON.parse(pedidos[1].body), {
      justificativa: "Informação complementada",
    });
    assert.equal(
      pedidos.some((p) => p.url.includes("/aprovar")),
      false,
    );
  } finally {
    globalThis.fetch = original;
  }
});
