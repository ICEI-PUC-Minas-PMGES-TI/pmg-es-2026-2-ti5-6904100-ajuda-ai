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
const { Explicacao, criterioParaApi } = await server.ssrLoadModule(
  "/src/pages/coordenacao/MatchingPage.jsx",
);
const { default: Relatorio } = await server.ssrLoadModule(
  "/src/components/RelatorioMatching.jsx",
);

test("10 conhecidos em 100 mostram cobertura e afinidade separadamente", () => {
  const html = renderToStaticMarkup(
    React.createElement(Explicacao, {
      explicacao: {
        politicaVersao: "3.0.0",
        score: 0.1,
        cobertura: 0.1,
        afinidade: 1,
        pesoConhecido: 10,
        pesoConfigurado: 100,
        pesoNeutro: 0,
        criterios: [],
      },
    }),
  );
  assert.match(html, /Aderência comprovada/);
  assert.match(html, /Cobertura dos dados: 10%/);
  assert.match(html, /Afinidade entre os dados avaliáveis: 100%/);
  assert.match(html, /10 de 100 pontos/);
});
test("rodadas históricas não recebem cobertura inventada", () => {
  const html = renderToStaticMarkup(
    React.createElement(Explicacao, {
      explicacao: { score: 1, criterios: [] },
    }),
  );
  assert.match(html, /cobertura dos dados não registrada/);
  assert.doesNotMatch(html, /Cobertura dos dados: 0%/);
});
test("a ausência de dados avaliáveis não aparece como afinidade zero", () => {
  const html = renderToStaticMarkup(
    React.createElement(Explicacao, {
      explicacao: {
        politicaVersao: "3.0.0",
        score: 0,
        afinidade: null,
        cobertura: 1,
        pesoConhecido: 100,
        pesoConfigurado: 100,
        pesoNeutro: 100,
        criterios: [],
      },
    }),
  );
  assert.match(html, /Sem dados avaliáveis/);
  assert.match(html, /Neutralidades: 100/);
});
test("condições obrigatórias são preservadas no payload e na explicação", () => {
  assert.equal(
    criterioParaApi({
      campoCadastro: "areas",
      operacao: "intersecao",
      peso: 25,
      obrigatorio: true,
    }).obrigatorio,
    true,
  );
  assert.equal(
    criterioParaApi({
      campoCadastro: "areas",
      operacao: "intersecao",
      peso: 25,
      obrigatorio: false,
    }).obrigatorio,
    false,
  );
  const html = renderToStaticMarkup(
    React.createElement(Explicacao, {
      explicacao: {
        politicaVersao: "3.0.0",
        viabilidade: "dados_insuficientes",
        criterios: [{ peso: 25, obrigatorio: true, considerado: false }],
      },
    }),
  );
  assert.match(html, /Faltam dados para conferir uma condição obrigatória/);
  assert.match(html, /Correspondência obrigatória/);
});
test("relatório explica ocupação e alunos sem sugestão", () => {
  const html = renderToStaticMarkup(
    React.createElement(Relatorio, {
      relatorio: {
        politica: { versao: "3.0.0" },
        novosAtendidos: 2,
        cargaPadrinhos: [
          {
            participacaoId: 1,
            nome: "Ana",
            confirmados: 2,
            sugeridos: 1,
            totalProjetado: 3,
            limite: 3,
          },
        ],
        semSugestao: [
          {
            participacaoId: 10,
            nome: "Bia",
            descricao: "Faltam dados para conferir condições.",
            pendencias: ["Disponibilidade"],
          },
        ],
      },
    }),
  );
  for (const texto of [
    "Relatório da rodada",
    "Ana",
    "3/3",
    "Bia",
    "Faltam dados",
    "Disponibilidade",
    "confirmação da coordenação",
  ])
    assert.ok(html.includes(texto));
});

test("apoio parcialmente atendido é descrito sem esconder a cobertura", () => {
  const html = renderToStaticMarkup(
    React.createElement(Explicacao, {
      explicacao: {
        politicaVersao: "3.0.0",
        score: 0.5,
        cobertura: 1,
        afinidade: 0.5,
        criterios: [
          {
            nomePadrinho: "Áreas",
            peso: 100,
            considerado: true,
            compativel: true,
            contribuicao: 50,
            atendimento: 0.5,
            cobertura: 1,
          },
        ],
      },
    }),
  );
  assert.match(html, /Parcialmente atendida/);
});
test("evidência positiva muito pequena não aparece como zero absoluto", () => {
  const html = renderToStaticMarkup(
    React.createElement(Explicacao, {
      explicacao: {
        politicaVersao: "3.0.0",
        score: 0.00001,
        cobertura: 0.01,
        afinidade: 0.001,
        criterios: [],
      },
    }),
  );
  assert.match(html, /&lt;0,01%/);
});
