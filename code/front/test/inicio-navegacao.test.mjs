import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createServer } from 'vite';

globalThis.window ??= globalThis;
const storage = new Map();
globalThis.localStorage = { getItem: k => storage.get(k) || null, setItem: (k, v) => storage.set(k, v), removeItem: k => storage.delete(k) };
const server = await createServer({ server: { middlewareMode: true }, appType: 'custom' });
after(() => server.close());
const { atalhosInicio, primeiroNome } = await server.ssrLoadModule('/src/pages/aluno/InicioAlunoPage.jsx');

test('saudação usa só o primeiro nome', () => {
  assert.equal(primeiroNome('  Maria Clara Souza '), 'Maria');
  assert.equal(primeiroNome(''), '');
  assert.equal(primeiroNome(undefined), '');
});

test('início sem participação mostra só conversas e mapa', () => {
  const rotas = atalhosInicio({ resolucao: {} }).map(a => a.to);
  assert.deepEqual(rotas, ['/aluno/chat', '/aluno/mapa']);
});

test('participante ativo vê feed, padrinho e lojinha', () => {
  const atalhos = atalhosInicio({ resolucao: { participante: true, ativo: true }, papel: 'padrinho' });
  assert.deepEqual(atalhos.map(a => a.to), ['/aluno/feed', '/aluno/padrinho', '/aluno/chat', '/aluno/lojinha', '/aluno/mapa']);
  assert.equal(atalhos[1].titulo, 'Meus apadrinhados');
});

test('menu da coordenação não repete rota', () => {
  const fonte = readFileSync(new URL('../src/pages/coordenacao/CoordLayout.jsx', import.meta.url), 'utf8');
  const nav = fonte.slice(fonte.indexOf('const NAV = ['), fonte.indexOf('];', fonte.indexOf('const NAV = [')));
  const rotas = [...nav.matchAll(/to: '([^']+)'/g)].map(m => m[1]);
  assert.ok(rotas.length >= 15);
  assert.equal(new Set(rotas).size, rotas.length, `rotas repetidas: ${rotas}`);
});

test('rotas do App não se repetem', () => {
  const fonte = readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8');
  const coord = fonte.slice(fonte.indexOf('path="/coordenacao"'), fonte.indexOf('path="*"'));
  const caminhos = [...coord.matchAll(/path="([^"]+)"/g)].map(m => m[1]);
  assert.equal(new Set(caminhos).size, caminhos.length, `rotas repetidas: ${caminhos}`);
});
