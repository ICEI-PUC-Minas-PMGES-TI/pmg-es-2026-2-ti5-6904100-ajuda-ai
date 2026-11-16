import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'vite';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { act } from 'react';

const storage = new Map();
globalThis.localStorage = { getItem: (k) => storage.get(k) || null, setItem: (k, v) => storage.set(k, v), removeItem: (k) => storage.delete(k) };
const server = await createServer({ server: { middlewareMode: true }, appType: 'custom' });
after(() => server.close());
const { ProgressoGamificacao } = await server.ssrLoadModule('/src/pages/aluno/PerfilAlunoPage.jsx');
// O SSR do React separa trechos de texto com <!-- -->.
const texto = (html) => html.replaceAll('<!-- -->', '');
const { OrcamentoPucStops, ImpactoOrcamento, potencialAposSalvar, formDoPucStop } = await server.ssrLoadModule('/src/pages/coordenacao/PucStopsPage.jsx');

test('progresso: primeiro render mostra carregando, nunca 0 XP', () => {
  const html = renderToString(React.createElement(ProgressoGamificacao, { carregar: () => new Promise(() => {}) }));
  assert.match(html, /Carregando seu progresso/);
  assert.doesNotMatch(html, /0 XP/);
});

test('orçamento dos totens avisa quando passa do teto', () => {
  const base = { ativos: 5, inativos: 2, xpPotencial: 150, moedasPotenciais: 150, recompensaMedia: 30, distribuicao: [{ xp: 10, totens: 0 }, { xp: 30, totens: 5 }], limitePorCiclo: 400, excedeLimite: false, participantesElegiveis: 200, emissaoMaximaEstimada: 30000 };
  const ok = texto(renderToString(React.createElement(OrcamentoPucStops, { orcamento: base })));
  assert.match(ok, /5 totens ativos · 2 inativos/);
  assert.match(ok, /XP potencial: 150 XP \(150 moedas\)/);
  assert.match(ok, /recompensa média: 30 XP/);
  assert.match(ok, /Por faixa: 5× 30 XP\./);
  assert.match(ok, /Limite individual: 400 XP/);
  assert.match(ok, /até 30000 moedas \(200 participantes elegíveis × 150 XP\)/);
  assert.match(ok, /Não é o saldo real/);
  assert.doesNotMatch(ok, /Cada participante poderá receber/);
  const alto = texto(renderToString(React.createElement(OrcamentoPucStops, { orcamento: { ...base, ativos: 20, xpPotencial: 600, excedeLimite: true } })));
  assert.match(alto, /Os totens ativos oferecem 600 XP\. Cada participante poderá receber até 400 XP neste ciclo/);
});

test('impacto no formulário: antes/depois sem contar o mesmo totem duas vezes', () => {
  assert.equal(potencialAposSalvar({ potencialAtual: 570, novoXp: 30 }), 600);
  assert.equal(potencialAposSalvar({ potencialAtual: 570, original: { xp: 50, ativo: true }, novoXp: 30 }), 550);
  assert.equal(potencialAposSalvar({ potencialAtual: 570, original: { xp: 50, ativo: false }, novoXp: 40 }), 570);
  const html = texto(renderToString(React.createElement(ImpactoOrcamento, { orcamento: { xpPotencial: 570, limitePorCiclo: 400 }, original: null, novoXp: 30 })));
  assert.match(html, /Recompensa selecionada: 30 XP \+ 30 moedas/);
  assert.match(html, /XP potencial atual do mapa: 570 XP/);
  assert.match(html, /XP potencial após o cadastro: 600 XP/);
  assert.match(html, /Cada participante poderá receber até 400 XP/);
});

test('novo totem já sugere 30 XP', () => {
  assert.equal(formDoPucStop(null).xp, '30');
});

void act;
