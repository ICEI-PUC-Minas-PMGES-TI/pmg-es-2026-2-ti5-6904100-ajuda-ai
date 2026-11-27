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
const pref = await server.ssrLoadModule(
  "/src/components/PreferenciaGenero.jsx",
);
const { default: RevisaoStep } = await server.ssrLoadModule(
  "/src/pages/cadastro/RevisaoStep.jsx",
);
const { RevisaoPadrinho } = await server.ssrLoadModule(
  "/src/pages/cadastro/CandidaturaPadrinhoForm.jsx",
);
const { Explicacao, criterioParaApi } = await server.ssrLoadModule(
  "/src/pages/coordenacao/MatchingPage.jsx",
);
const preferencia = {
  modo: "preferencia",
  generos: ["Feminino", "Não binário"],
};

test("preferência opcional distingue ausência, neutralidade e seleção incompleta", () => {
  assert.equal(pref.textoPreferenciaGenero(undefined), "Não informado");
  assert.equal(
    pref.textoPreferenciaGenero({ modo: "sem_preferencia", generos: [] }),
    "Sem preferência",
  );
  assert.equal(
    pref.textoPreferenciaGenero(preferencia),
    "Feminino, Não binário",
  );
  assert.equal(
    pref.preferenciaGeneroValida({ modo: "preferencia", generos: [] }),
    false,
  );
  assert.equal(pref.preferenciaGeneroValida(preferencia), true);
  assert.equal(pref.preferenciaGeneroValida(undefined), true);
});
test("campo altera o modo sem inferir preferência pelo próprio gênero", () => {
  let escolhido;
  const tree = pref.default({ onChange: (v) => (escolhido = v) });
  const select = React.Children.toArray(tree.props.children).find(
    (v) => v.type === "select",
  );
  select.props.onChange({ target: { value: "sem_preferencia" } });
  assert.deepEqual(escolhido, { modo: "sem_preferencia", generos: [] });
  select.props.onChange({ target: { value: "preferencia" } });
  assert.deepEqual(escolhido, { modo: "preferencia", generos: [] });
  select.props.onChange({ target: { value: "" } });
  assert.equal(escolhido, undefined);
});
test("ambas as revisões mostram preferência antes do envio", () => {
  const profile = {
    name: "Ana",
    gender: "Masculino",
    preferenciaGenero: preferencia,
    availability: [],
    supportAreas: [],
    extras: {},
  };
  const apadrinhado = renderToStaticMarkup(
    React.createElement(RevisaoStep, { profile, perguntas: [] }),
  );
  const padrinho = renderToStaticMarkup(
    React.createElement(RevisaoPadrinho, {
      perfil: {},
      revisao: { preferenciaGenero: preferencia, extras: {} },
      requisitos: [],
      perguntas: [],
      form: { requisitos: {} },
    }),
  );
  for (const html of [apadrinhado, padrinho]) {
    assert.match(html, /Preferência de gênero/);
    assert.match(html, /Feminino, Não binário/);
  }
});
test("explicação distingue neutralidade, ausência e atendimento parcial sem expor objetos", () => {
  const html = renderToStaticMarkup(
    React.createElement(Explicacao, {
      explicacao: {
        criterios: [
          {
            campoCadastro: "preferenciaGenero",
            peso: 30,
            considerado: false,
            motivo: "sem_preferencia",
          },
          {
            campoCadastro: "deOutraCidade",
            peso: 10,
            considerado: false,
            motivo: "vivencia_nao_aplicavel",
          },
          {
            campoCadastro: "preferenciaGenero",
            peso: 30,
            considerado: true,
            fator: 0.5,
            contribuicao: 15,
            valorPadrinho: preferencia,
            valorApadrinhado: { modo: "sem_preferencia", generos: [] },
          },
        ],
      },
    }),
  );
  assert.match(html, /Sem preferência declarada/);
  assert.match(html, /Vivência não aplicável/);
  assert.match(html, /Parcialmente atendida/);
  assert.doesNotMatch(html, /\[object Object\]/);
});

test("serializa ambas as fontes sem converter campos do cadastro em IDs numéricos", () => {
  assert.deepEqual(
    criterioParaApi({
      campoCadastro: "preferenciaGenero",
      operacao: "preferencia_genero",
      peso: "40",
    }),
    {
      campoCadastro: "preferenciaGenero",
      operacao: "preferencia_genero",
      peso: 40,
    },
  );
  assert.deepEqual(
    criterioParaApi({
      criterioPadrinhoId: "2",
      criterioApadrinhadoId: "2",
      operacao: "intersecao",
      peso: "15",
    }),
    {
      criterioPadrinhoId: 2,
      criterioApadrinhadoId: 2,
      operacao: "intersecao",
      peso: 15,
    },
  );
});
