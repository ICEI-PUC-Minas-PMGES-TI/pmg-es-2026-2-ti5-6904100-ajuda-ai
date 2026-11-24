import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  bancoMatchingIsolado,
  semearCenarioMatching,
} from './helpers/matching-postgres.js';
import { apiMatchingIsolada } from './helpers/matching-http.js';

/** Browser/runtime são opcionais e externos aos manifests da aplicação. */
describe.skipIf(
  !process.env.MATCHING_BROWSER_MODULE ||
    !process.env.MATCHING_BROWSER_EXECUTABLE ||
    !process.env.MATCHING_TEST_DB_URL ||
    process.env.MATCHING_TEST_DB_ISOLATED !== 'true',
)('Web real com três sessões e PostgreSQL', () => {
  let banco: Awaited<ReturnType<typeof bancoMatchingIsolado>>;
  let api: Awaited<ReturnType<typeof apiMatchingIsolada>>;
  let browser: any, vite: any;
  const falhas: string[] = [];
  afterEach(async () => {
    await browser?.close();
    await vite?.close();
    await api?.app.close();
    await banco?.limpar();
  }, 30_000);
  it('conversa entre contas, preserva rascunho na atualização e transfere pela coordenação', async () => {
    banco = await bancoMatchingIsolado();
    const c = await semearCenarioMatching(banco.dados);
    await c.operacoes.vincular(c.a[0].id, c.p[0].id, 'coord@teste.local');
    await c.operacoes.vincular(c.a[1].id, c.p[0].id, 'coord@teste.local');
    await c.operacoes.vincular(c.a[2].id, c.p[1].id, 'coord@teste.local');
    api = await apiMatchingIsolada(banco.dados);
    const front = resolve('../../front');
    const { createServer } = await import(
      /* @vite-ignore */ pathToFileURL(
        resolve(front, 'node_modules/vite/dist/node/index.js'),
      ).href
    );
    vite = await createServer({
      root: front,
      define: {
        'import.meta.env.VITE_API_URL': JSON.stringify(await api.app.getUrl()),
      },
      server: { host: '127.0.0.1', port: 0 },
    });
    await vite.listen();
    const url = `http://127.0.0.1:${vite.httpServer.address().port}`;
    const { chromium } = createRequire(import.meta.url)(
      process.env.MATCHING_BROWSER_MODULE!,
    );
    browser = await chromium.launch({
      executablePath: process.env.MATCHING_BROWSER_EXECUTABLE,
      headless: true,
    });
    async function sessao(email: string, coord = false) {
      const contexto = await browser.newContext({
        viewport: { width: 1440, height: 1000 },
      });
      const jwt = api.token(email, coord ? 'coordenador' : 'nenhuma');
      await contexto.addInitScript(
        ({ email, jwt, coord }: any) => {
          if (coord) {
            localStorage.setItem('ajudaai.accessToken', jwt);
            localStorage.setItem(
              'ajudaai.usuario',
              JSON.stringify({
                nome: 'Coordenação',
                email,
                perfil: 'coordenador',
              }),
            );
          } else
            localStorage.setItem(
              'ajudaai.aluno.token',
              JSON.stringify({
                email,
                accessToken: jwt,
                expiraEm: Date.now() + 3600_000,
              }),
            );
        },
        { email, jwt, coord },
      );
      const page = await contexto.newPage();
      page.on('pageerror', (e: Error) => falhas.push(e.message));
      return page;
    }
    const aluno = await sessao(c.a[0].usuarioId),
      padrinho = await sessao(c.p[0].usuarioId),
      coord = await sessao('coord@teste.local', true);
    await Promise.all([
      aluno.goto(`${url}/aluno/chat`),
      padrinho.goto(`${url}/aluno/chat`),
    ]);
    await aluno
      .getByRole('button')
      .filter({ has: aluno.locator('strong', { hasText: 'Padrinho 0' }) })
      .click();
    await aluno.getByLabel('Digite uma mensagem').fill('Olá, padrinho.');
    await aluno
      .getByRole('button', { name: 'Enviar mensagem', exact: true })
      .click();
    await padrinho
      .getByRole('button')
      .filter({ has: padrinho.locator('strong', { hasText: 'Aluno 0' }) })
      .click();
    await padrinho
      .locator('.chat-bubble p', { hasText: 'Olá, padrinho.' })
      .waitFor();
    await padrinho.getByLabel('Digite uma mensagem').fill('Olá, já recebi.');
    await padrinho
      .getByRole('button', { name: 'Enviar mensagem', exact: true })
      .click();
    await aluno
      .locator('.chat-bubble p', { hasText: 'Olá, já recebi.' })
      .waitFor();
    await aluno.getByLabel('Digite uma mensagem').fill('Rascunho preservado');
    await Promise.all([
      aluno.waitForResponse(
        (r: any) =>
          r.url().includes('/participacoes/situacao') && r.status() === 200,
      ),
      aluno.evaluate(() => window.dispatchEvent(new Event('focus'))),
    ]);
    await aluno.getByText('Atualização conectada', { exact: true }).waitFor();
    expect(await aluno.getByLabel('Digite uma mensagem').inputValue()).toBe(
      'Rascunho preservado',
    );

    await coord.goto(
      `${url}/coordenacao/matching?programa=${encodeURIComponent(c.programa.codigo)}`,
    );
    await coord
      .getByRole('button', { name: 'Transferir Aluno 0', exact: true })
      .click();
    await coord.getByLabel('Padrinho destino').selectOption(String(c.p[1].id));
    await coord
      .getByLabel('Motivo da transferência')
      .fill('Acompanhamento mais adequado');
    await coord
      .getByRole('button', { name: 'Confirmar transferência', exact: true })
      .click();
    await coord.getByRole('dialog').waitFor({ state: 'hidden' });
    await aluno
      .getByLabel('Digite uma mensagem')
      .waitFor({ state: 'attached' });
    await aluno.waitForFunction(
      () =>
        document.querySelector<HTMLTextAreaElement>('#chat-message')
          ?.disabled === true,
    );
    expect(await aluno.locator('.chat-bubble p').allTextContents()).toEqual([
      'Olá, padrinho.',
      'Olá, já recebi.',
    ]);
    await aluno.reload();
    await aluno
      .getByRole('button')
      .filter({ has: aluno.locator('strong', { hasText: 'Padrinho 1' }) })
      .waitFor();
    expect(falhas).toEqual([]);
  }, 120_000);
});
