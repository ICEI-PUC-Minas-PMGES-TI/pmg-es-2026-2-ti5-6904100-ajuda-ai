import { after, test } from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createServer } from "vite";
import { consultarContextoAluno } from "../src/auth/contextoAluno.js";
import { alvoConversa } from "../src/pages/aluno/chatDados.js";

const server = await createServer({
  server: { middlewareMode: true, hmr: false },
  optimizeDeps: { noDiscovery: true, include: [] },
  appType: "custom",
});
after(() => server.close());
const { VinculosAlunoView } = await server.ssrLoadModule(
  "/src/pages/aluno/PadrinhoPage.jsx",
);
const { default: Diagnostico } = await server.ssrLoadModule(
  "/src/components/DiagnosticoMatching.jsx",
);
const render = (props) =>
  renderToStaticMarkup(React.createElement(VinculosAlunoView, props));
const padrinhos = [
  {
    nome: "Ana",
    email: "ana@pucminas.edu.br",
    vinculoId: 21,
    grupoId: 41,
    grupo: "Grupo Ana",
  },
  {
    nome: "Bia",
    email: "bia@pucminas.edu.br",
    vinculoId: 22,
    grupoId: 42,
    grupo: "Grupo Bia",
  },
];
test("apadrinhado vê todos os padrinhos e suas conversas individuais e coletivas", () => {
  const html = render({
    dados: {
      situacao: "apadrinhado_ativo",
      podeConversar: true,
      padrinho: padrinhos[0],
      padrinhos,
    },
  });
  assert.match(html, /Meus padrinhos/);
  for (const p of padrinhos)
    assert.ok(html.includes(p.nome) && html.includes(p.grupo));
  assert.equal((html.match(/Conversa do grupo/g) || []).length, 2);
  assert.equal((html.match(/Conversar/g) || []).length, 2);
});
test("lista canônica vazia não ressuscita padrinho singular antigo", () => {
  const html = render({
    dados: {
      situacao: "apadrinhado_aguardando",
      padrinho: padrinhos[0],
      padrinhos: [],
    },
  });
  assert.ok(!html.includes("ana@pucminas.edu.br"));
  assert.match(html, /ainda não foi definido/);
});
test("encerramento oferece histórico sem prometer participação nova", () => {
  const html = render({
    dados: { situacao: "concluido", padrinhos, podeConversar: false },
  });
  assert.match(html, /Participação encerrada/);
  assert.match(html, /Ver conversas e histórico/);
  assert.ok(
    !html.includes("Quero participar") && !html.includes("ana@pucminas.edu.br"),
  );
});
test("estado desconhecido informa falha sem inventar ausência de participação", () => {
  const html = render({ dados: { situacao: "estado_desconhecido" } });
  assert.match(html, /Não foi possível confirmar/);
  assert.ok(!html.includes("Quero participar"));
});
test("padrinho aprovado sem par continua aguardando vínculo, com acesso ao feed explicado", () => {
  const html = render({
    dados: { situacao: "candidatura_aprovada_aguardando_matching" },
  });
  assert.match(html, /Candidatura aprovada/);
  assert.match(html, /continua participando do feed/);
});
test("conversas pausadas não oferecem botões ativos", () => {
  const html = render({
    dados: { situacao: "apadrinhado_ativo", padrinhos, podeConversar: false },
  });
  assert.match(html, /somente para consulta/);
  assert.equal((html.match(/Conversar/g) || []).length, 0);
});
test("diagnóstico separa preferência, obrigatoriedade e pendências antes da rodada", () => {
  const html = renderToStaticMarkup(
    React.createElement(Diagnostico, {
      dados: {
        criterios: [
          {
            chave: "apoio",
            nome: "Áreas de apoio",
            obrigatorio: true,
            padrinhos: { conhecidos: 2, total: 3 },
            apadrinhados: { conhecidos: 4, total: 4 },
          },
        ],
        pendencias: [
          {
            participacaoId: 1,
            nome: "Ana",
            papel: "padrinho",
            campos: ["Áreas de apoio"],
            obrigatorio: true,
          },
        ],
      },
    }),
  );
  assert.match(html, /Dados antes da execução/);
  assert.match(html, /Condição obrigatória/);
  assert.match(html, /2\/3/);
  assert.match(html, /Ana/);
  assert.match(html, /Ausência de resposta não significa incompatibilidade/);
});
test("atalho de grupo e vínculo escolhe o ID exato, inclusive no histórico", () => {
  const conversas = [
    { id: 1, tipo: "privado", matchingVinculoId: 21, podeEnviar: false },
    { id: 2, tipo: "privado", matchingVinculoId: 22, podeEnviar: true },
    { id: 3, tipo: "coletivo", grupoId: 41 },
    { id: 4, tipo: "coletivo", grupoId: 42 },
  ];
  assert.equal(alvoConversa(conversas, { grupo: "42" }).id, 4);
  assert.equal(alvoConversa(conversas, { vinculo: "21" }).id, 1);
  assert.equal(
    alvoConversa(conversas, { vinculo: "999", pessoa: "ana" }),
    undefined,
  );
});
test("consulta histórica não muda a permissão de feed do ciclo atual", async () => {
  let consultado;
  const api = {
    perfilAluno: async () => ({ nome: "Ana" }),
    programasAluno: async () => [
      { codigo: "2026/2", atual: true },
      { codigo: "2020/1" },
    ],
    permissoesFeed: async () => ({ programa: "2026/2", podeLer: true }),
    situacao: async (_, codigo) => {
      consultado = codigo;
      return { situacao: "concluido" };
    },
  };
  const r = await consultarContextoAluno({
    api,
    email: "ana",
    codigo: "2020/1",
    vigente: () => true,
  });
  assert.equal(consultado, "2020/1");
  assert.equal(r.permissoesFeed.programa, "2026/2");
  assert.equal(r.situacao.situacao, "concluido");
});
test("troca de conta durante perfil descarta consulta antes de buscar situação", async () => {
  let atual = true;
  const api = {
    perfilAluno: async () => {
      atual = false;
      return {};
    },
    programasAluno: async () => [],
    permissoesFeed: async () => ({}),
    situacao: async () => assert.fail(),
  };
  assert.equal(
    await consultarContextoAluno({
      api,
      email: "ana",
      codigo: "2026/2",
      vigente: () => atual,
    }),
    null,
  );
});
test("resposta de outro ciclo não substitui o novo contexto", async () => {
  let atual = true;
  const api = {
    perfilAluno: async () => ({}),
    programasAluno: async () => [],
    permissoesFeed: async () => ({}),
    situacao: async () => {
      atual = false;
      return { situacao: "padrinho_ativo" };
    },
  };
  assert.equal(
    await consultarContextoAluno({
      api,
      email: "ana",
      codigo: "2026/2",
      vigente: () => atual,
    }),
    null,
  );
});
