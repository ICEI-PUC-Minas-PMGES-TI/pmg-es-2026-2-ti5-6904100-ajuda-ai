import { after, test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "vite";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

const server = await createServer({
  server: { middlewareMode: true },
  appType: "custom",
});
after(() => server.close());
const modulo = await server.ssrLoadModule(
  "/src/components/PerguntasAdicionais.jsx",
);
const { PerguntaEditor } = await server.ssrLoadModule(
  "/src/pages/coordenacao/FormulariosPage.jsx",
);
const { default: RevisaoStep } = await server.ssrLoadModule(
  "/src/pages/cadastro/RevisaoStep.jsx",
);

test("criação oferece somente os quatro tipos suportados", () => {
  assert.deepEqual(
    modulo.TIPOS_PERGUNTA.map((p) => p.valor),
    ["texto_curto", "texto_longo", "checklist", "dropdown"],
  );
  const html = renderToStaticMarkup(
    React.createElement(PerguntaEditor, {
      pergunta: {
        id: "nova",
        enunciado: "Pergunta",
        tipo: "texto_curto",
        opcoes: [],
        obrigatoria: false,
      },
      indice: 0,
      total: 1,
    }),
  );
  assert.doesNotMatch(
    html,
    /Envio de arquivo|value="upload"|value="file"|value="attachment"/,
  );
});

for (const tipo of ["upload", "file", "attachment", "outro"]) {
  test(`legado ${tipo} exibe erro e não é respondível, mesmo opcional/preenchido`, () => {
    const pergunta = {
      id: "antiga",
      enunciado: "Pergunta antiga",
      tipo,
      obrigatoria: false,
      opcoes: [],
    };
    assert.equal(modulo.formularioSuportado([pergunta]), false);
    assert.deepEqual(
      modulo.validarExtras([pergunta], { antiga: "arquivo.pdf" }),
      { antiga: true },
    );
    assert.throws(() => modulo.limparExtras([pergunta], {}), /não suportado/);
    const html = renderToStaticMarkup(
      React.createElement(modulo.default, { perguntas: [pergunta] }),
    );
    assert.match(html, /role="alert"/);
    assert.match(html, /não suportado/);
    assert.doesNotMatch(html, /<input|<textarea|<select|em breve/);
    const revisao = renderToStaticMarkup(
      React.createElement(RevisaoStep, { perguntas: [pergunta] }),
    );
    assert.match(revisao, /role="alert"/);
    const admin = renderToStaticMarkup(
      React.createElement(PerguntaEditor, { pergunta, indice: 0, total: 1 }),
    );
    assert.match(admin, /Tipo não suportado/);
    assert.match(admin, new RegExp(`value="${tipo}" disabled`));
    assert.equal(pergunta.tipo, tipo);
  });
}

test("texto e escolhas válidos continuam renderizando e validando obrigatoriedade", () => {
  for (const tipo of ["texto_curto", "texto_longo", "dropdown", "checklist"]) {
    const perguntas = [
      {
        id: "p",
        enunciado: "Pergunta",
        tipo,
        obrigatoria: true,
        opcoes: ["Sim"],
      },
    ];
    assert.deepEqual(modulo.validarExtras(perguntas, {}), { p: true });
    const respostas = { p: tipo === "checklist" ? ["Sim"] : "Sim" };
    assert.deepEqual(modulo.validarExtras(perguntas, respostas), {});
    assert.deepEqual(modulo.limparExtras(perguntas, respostas), respostas);
    const html = renderToStaticMarkup(
      React.createElement(modulo.default, { perguntas, valores: respostas }),
    );
    assert.doesNotMatch(html, /não suportado|em breve|type="file"/);
  }
});
