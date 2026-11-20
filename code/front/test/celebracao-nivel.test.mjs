import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import React from 'react';
import { renderToString } from 'react-dom/server';

const storage = new Map();
globalThis.localStorage = { getItem: (k) => storage.get(k) ?? null, setItem: (k, v) => storage.set(k, String(v)), removeItem: (k) => storage.delete(k) };
const server = await createServer({ server: { middlewareMode: true }, appType: 'custom' });
after(() => server.close());
const texto = (html) => html.replaceAll('<!-- -->', '');

const {
  default: CelebracaoNivel, gerarParticulas, TEMPOS_CELEBRACAO, TITULO_CELEBRACAO,
} = await server.ssrLoadModule('/src/components/levelup/CelebracaoNivel.jsx');
const {
  deveCelebrar, marcarExibida, enviarConfirmacao, lerGuarda, VALIDADE_GUARDA_MS,
} = await server.ssrLoadModule('/src/components/levelup/celebracaoAluno.js');
const { lerProgresso, ouvirProgresso } = await server.ssrLoadModule('/src/components/levelup/progressoAluno.js');
const { SONS_CONQUISTA, somSilenciado, definirSomSilenciado, ouvirSilenciado } = await server.ssrLoadModule('/src/components/levelup/sonsConquista.js');
const { faixaDoNivel, lerSimulacaoSalva, CHAVE_SIMULACAO } = await server.ssrLoadModule('/src/pages/aluno/QaGamificacaoPage.jsx');
const { ProgressoCarregado } = await server.ssrLoadModule('/src/pages/aluno/PerfilAlunoPage.jsx');

const NIVEIS = [
  { numero: 1, nome: 'Primeiro passo', xpMinimo: 0 },
  { numero: 2, nome: 'Curiosidade', xpMinimo: 50 },
  { numero: 3, nome: 'Exploração', xpMinimo: 150 },
  { numero: 10, nome: 'Lenda da PUC', xpMinimo: 2600 },
];

function memoria() {
  const m = new Map();
  return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) };
}

test('animação usa o emblema REAL do nível, título e nome', () => {
  for (const numero of [1, 5, 10]) {
    const html = texto(renderToString(React.createElement(CelebracaoNivel, { nivel: { numero, nome: 'Nome' } })));
    const id = String(numero).padStart(2, '0');
    assert.match(html, new RegExp(`src="/gamificacao/nivel_${id}.png"`));
    assert.ok(html.includes(TITULO_CELEBRACAO));
    assert.match(html, new RegExp(`Nível ${numero} · Nome`));
    assert.match(html, /role="dialog"/);
    assert.match(html, /aria-modal="true"/);
    assert.match(html, />Continuar</);
    assert.doesNotMatch(html, /Pré-visualização/);
  }
});

test('nível sem arte própria (níveis futuros) mostra o número, sem imagem genérica', () => {
  const html = texto(renderToString(React.createElement(CelebracaoNivel, { nivel: { numero: 11 } })));
  assert.doesNotMatch(html, /<img/);
  assert.match(html, /emblema-nivel-fallback">11</);
  assert.match(html, /Nível 11</);
});

test('subida de vários níveis e modo de teste aparecem no texto', () => {
  const html = texto(renderToString(React.createElement(CelebracaoNivel, { nivel: { numero: 5, nome: 'Conexão' }, niveisAvancados: 3, teste: true })));
  assert.match(html, /Você avançou 3 níveis de uma vez/);
  assert.match(html, /Pré-visualização · sem XP real/);
});

test('linha do tempo dentro de 2,5–4 s e sons em ordem (giro → conquista → brilho)', () => {
  assert.ok(TEMPOS_CELEBRACAO.fim >= 2500 && TEMPOS_CELEBRACAO.fim <= 4000);
  assert.ok(TEMPOS_CELEBRACAO.giro < TEMPOS_CELEBRACAO.revelacao);
  assert.ok(TEMPOS_CELEBRACAO.revelacao < TEMPOS_CELEBRACAO.brilho);
  const css = readFileSync(fileURLToPath(new URL('../src/components/levelup/celebracao-nivel.css', import.meta.url)), 'utf8');
  assert.match(css, /prefers-reduced-motion: reduce/);
  assert.match(css, /\.lvl-reduzido/);
  assert.match(css, /lvl-giro 1000ms 650ms/);
});

test('partículas determinísticas por nível (comparação estável) e dentro do palco', () => {
  const a = gerarParticulas(4);
  assert.deepEqual(a, gerarParticulas(4));
  assert.notDeepEqual(a, gerarParticulas(5));
  assert.equal(a.length, 32);
  for (const p of a) {
    assert.ok(Math.hypot(p.dx, p.dy) <= 0.86, 'partícula fora do alcance');
    assert.ok(['estrela', 'faisca', 'confete'].includes(p.tipo));
  }
});

test('os três sons existem e são WAV (compartilhados com o app)', () => {
  for (const caminho of Object.values(SONS_CONQUISTA)) {
    const arquivo = fileURLToPath(new URL(`../../mobile/assets${caminho}`, import.meta.url));
    assert.equal(existsSync(arquivo), true, arquivo);
    assert.equal(readFileSync(arquivo).subarray(0, 4).toString(), 'RIFF');
  }
});

test('silenciar fica salvo e avisa quem ouve', () => {
  const vistos = [];
  const parar = ouvirSilenciado((m) => vistos.push(m));
  definirSomSilenciado(true);
  assert.equal(somSilenciado(), true);
  definirSomSilenciado(false);
  assert.equal(somSilenciado(), false);
  parar();
  assert.deepEqual(vistos, [true, false]);
});

test('celebra só quando o servidor indica conquista nova', () => {
  assert.equal(deveCelebrar(null, null), false);
  assert.equal(deveCelebrar({ de: 2, para: 2 }, null), false);
  assert.equal(deveCelebrar({ de: 1, para: 2 }, null), true);
  assert.equal(deveCelebrar({ de: 2, para: 5, niveisAvancados: 3 }, null), true);
});

test('não repete a mesma conquista (recarregar a página / confirmação pendente)', () => {
  const armazenamento = memoria();
  const agora = 1_000_000;
  marcarExibida('Aluno@PUC.br', 3, armazenamento, agora);
  const guarda = lerGuarda('aluno@puc.br', armazenamento);
  assert.equal(guarda.nivel, 3);
  assert.equal(guarda.pendente, true);
  assert.equal(deveCelebrar({ de: 2, para: 3 }, guarda, agora + 1000), false);
  // Nível maior que o já exibido: celebra.
  assert.equal(deveCelebrar({ de: 3, para: 4 }, guarda, agora + 1000), true);
  // Expirada a guarda, vale o servidor (ex.: conta demo reiniciada).
  assert.equal(deveCelebrar({ de: 2, para: 3 }, guarda, agora + VALIDADE_GUARDA_MS + 1), true);
  // Marca nunca retrocede.
  marcarExibida('aluno@puc.br', 2, armazenamento, agora);
  assert.equal(lerGuarda('aluno@puc.br', armazenamento).nivel, 3);
});

test('confirmação offline fica pendente e é reenviada depois', async () => {
  const armazenamento = memoria();
  marcarExibida('a@puc.br', 4, armazenamento);
  const enviados = [];
  const falha = Object.assign(new Error('sem rede'), { status: 0 });
  assert.equal(await enviarConfirmacao('a@puc.br', async () => { throw falha; }, armazenamento), false);
  assert.equal(lerGuarda('a@puc.br', armazenamento).pendente, true);
  assert.equal(await enviarConfirmacao('a@puc.br', async (n) => { enviados.push(n); }, armazenamento), true);
  assert.deepEqual(enviados, [4]);
  assert.equal(lerGuarda('a@puc.br', armazenamento).pendente, false);
  // Nada pendente: não envia de novo (sem confirmações duplicadas).
  assert.equal(await enviarConfirmacao('a@puc.br', async (n) => { enviados.push(n); }, armazenamento), false);
  assert.deepEqual(enviados, [4]);
});

test('leituras simultâneas do progresso viram uma requisição e avisam quem ouve', async () => {
  let chamadas = 0;
  const recebidos = [];
  const parar = ouvirProgresso((d) => recebidos.push(d.xpAcumulado));
  const carregar = () => { chamadas += 1; return Promise.resolve({ xpAcumulado: 60 }); };
  const [a, b] = await Promise.all([lerProgresso(carregar), lerProgresso(carregar)]);
  parar();
  assert.equal(chamadas, 1);
  assert.equal(a, b);
  assert.deepEqual(recebidos, [60]);
});

test('painel de QA: faixa de XP de qualquer nível da tabela real', () => {
  assert.deepEqual(faixaDoNivel(NIVEIS, 2), { numero: 2, nome: 'Curiosidade', xpMinimo: 50, proximoXp: 150, proximoNome: 'Exploração' });
  assert.equal(faixaDoNivel(NIVEIS, 10).proximoXp, null);
  assert.equal(faixaDoNivel(NIVEIS, 99), null);
});

test('painel de QA: simulação é temporária (sessionStorage) e reiniciável', () => {
  const armazenamento = memoria();
  assert.equal(lerSimulacaoSalva(armazenamento), null);
  armazenamento.setItem(CHAVE_SIMULACAO, JSON.stringify({ nivel: 7, progresso: 30 }));
  assert.deepEqual(lerSimulacaoSalva(armazenamento), { nivel: 7, progresso: 30 });
  armazenamento.setItem(CHAVE_SIMULACAO, '{quebrado');
  assert.equal(lerSimulacaoSalva(armazenamento), null);
});

test('perfil simulado usa o mesmo cartão do perfil real, com selo de simulação', () => {
  const dados = {
    simulado: true, xpAcumulado: 600, moedas: 600,
    nivel: { numero: 5, nome: 'Conexão', progresso: 40, maximo: false, xpRestante: 150, proximoNome: 'Parceria' },
  };
  const simulado = texto(renderToString(React.createElement(ProgressoCarregado, { dados, simulado: true })));
  assert.match(simulado, /Simulação · não altera seu progresso/);
  assert.match(simulado, /\/gamificacao\/nivel_05.png/);
  assert.match(simulado, /Nível 5 · Conexão/);
  assert.match(simulado, /aria-valuenow="40"/);
  assert.match(simulado, /Faltam 150 XP para Parceria/);
  const real = texto(renderToString(React.createElement(ProgressoCarregado, { dados })));
  assert.doesNotMatch(real, /Simulação/);
});

test('cliente: rotas do painel de QA e confirmação de celebração', () => {
  const fonte = readFileSync(fileURLToPath(new URL('../src/api/client.js', import.meta.url)), 'utf8');
  assert.match(fonte, /'\/me\/xp\/celebracoes', \{ method: 'POST', body: \{ nivel \}/);
  assert.match(fonte, /'\/qa\/gamificacao\/acesso'/);
  assert.match(fonte, /\/qa\/gamificacao\/simulacao\?/);
  // O painel não tem rota de escrita.
  assert.doesNotMatch(fonte, /\/qa\/gamificacao[^'`]*', \{ method: '(POST|PUT|PATCH|DELETE)'/);
});

test('atalho do painel só aparece com liberação do servidor; rota redireciona sem ela', () => {
  const layout = readFileSync(fileURLToPath(new URL('../src/pages/aluno/AlunoLayout.jsx', import.meta.url)), 'utf8');
  assert.match(layout, /\.\.\.\(qaLiberado \? \[\{to: '\/aluno\/testes-gamificacao'/);
  const pagina = readFileSync(fileURLToPath(new URL('../src/pages/aluno/QaGamificacaoPage.jsx', import.meta.url)), 'utf8');
  assert.match(pagina, /\(qaConferido && !qaLiberado\) \|\| negado\) return <Navigate to="\/aluno\/perfil"/);
});
