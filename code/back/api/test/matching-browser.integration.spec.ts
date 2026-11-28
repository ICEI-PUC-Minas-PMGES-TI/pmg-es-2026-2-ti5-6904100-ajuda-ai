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
  it('conversa entre contas, transfere pela coordenação e acompanha rodada após timeout', async () => {
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
    // A resposta do POST se perde, mas a execução persistida continua e termina.
    let resultadoRodada: any;
    let consultasRodada = 0;
    await coord.route('**/coordenacao/matching/executar', async (rota: any) => {
      const resposta = await rota.fetch();
      resultadoRodada = await resposta.json();
      await new Promise((r) => setTimeout(r, 13_000));
      await rota.fulfill({ response: resposta }).catch(() => undefined);
    });
    await coord.route(
      '**/coordenacao/matching/execucoes?**',
      async (rota: any) => {
        const resposta = await rota.fetch();
        const rodadas = await resposta.json();
        consultasRodada++;
        await rota.fulfill({
          response: resposta,
          json:
            consultasRodada <= 2
              ? rodadas.map((r: any) =>
                  r.id === resultadoRodada?.id
                    ? { ...r, status: 'executando' }
                    : r,
                )
              : rodadas,
        });
      },
    );
    const inicioRodada = Date.now();
    await coord
      .getByRole('button', { name: 'Gerar sugestões', exact: true })
      .click();
    await coord
      .getByRole('button', { name: 'Executar matching', exact: true })
      .click();
    await coord
      .getByText('Acompanhando a execução do matching até a conclusão…', {
        exact: true,
      })
      .waitFor();
    await coord
      .getByText('Rodada concluída. Sugestões atualizadas.', { exact: true })
      .waitFor();
    expect(Date.now() - inicioRodada).toBeGreaterThanOrEqual(12_000);
    expect(resultadoRodada.status).toBe('concluida');
    expect(consultasRodada).toBeGreaterThanOrEqual(3);
    expect(await coord.locator('.dash-inline-error').count()).toBe(0);
    await coord.unroute('**/coordenacao/matching/executar');
    await coord.unroute('**/coordenacao/matching/execucoes?**');
    let perderPedido = true;
    const operacoes: string[] = [];
    await coord.route('**/coordenacao/matching/executar', async (rota: any) => {
      operacoes.push(rota.request().postDataJSON().operacaoId);
      if (perderPedido) await rota.abort('failed');
      else await rota.continue();
    });
    await coord.route(
      '**/coordenacao/matching/execucoes?**',
      async (rota: any) => {
        const resposta = await rota.fetch();
        const rodadas = await resposta.json();
        await rota.fulfill({
          response: resposta,
          json: [
            {
              ...resultadoRodada,
              id: 99999,
              operacaoId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
              status: 'concluida',
            },
            ...rodadas,
          ],
        });
      },
    );
    await coord
      .getByRole('button', { name: 'Gerar sugestões', exact: true })
      .click();
    await coord
      .getByRole('button', { name: 'Executar matching', exact: true })
      .click();
    await coord
      .locator('.dash-inline-error')
      .filter({ hasText: 'A execução não foi confirmada.' })
      .waitFor({ timeout: 25000 });
    expect(
      await coord
        .getByRole('button', { name: 'Gerar sugestões', exact: true })
        .isEnabled(),
    ).toBe(true);
    expect(
      await coord
        .getByText('Rodada concluída. Sugestões atualizadas.', { exact: true })
        .count(),
    ).toBe(0);
    perderPedido = false;
    await coord
      .getByRole('button', { name: 'Gerar sugestões', exact: true })
      .click();
    await coord
      .getByRole('button', { name: 'Executar matching', exact: true })
      .click();
    await coord.getByText(/Execução concluída:/).waitFor();
    expect(operacoes).toHaveLength(2);
    expect(operacoes[0]).toBe(operacoes[1]);

    // A confirmação local expira, mas o ciclo ainda precisa acompanhar outra rodada.
    await coord.unroute('**/coordenacao/matching/execucoes?**');
    perderPedido = true;
    const inicioConcorrencia = Date.now();
    const consultasCiclo: number[] = [];
    let observouFimExterno = false;
    await coord.route(
      '**/coordenacao/matching/execucoes?**',
      async (rota: any) => {
        const resposta = await rota.fetch();
        const rodadas = await resposta.json();
        const tempo = Date.now() - inicioConcorrencia;
        consultasCiclo.push(tempo);
        const terminou = tempo >= 18_000;
        observouFimExterno ||= terminou;
        await rota.fulfill({
          response: resposta,
          json: [
            {
              ...resultadoRodada,
              id: 99998,
              operacaoId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
              status: terminou ? 'falha' : 'executando',
              erro: terminou ? 'Rodada externa encerrada.' : null,
            },
            ...rodadas,
          ],
        });
      },
    );
    await coord
      .getByRole('button', { name: 'Gerar sugestões', exact: true })
      .click();
    await coord
      .getByRole('button', { name: 'Executar matching', exact: true })
      .click();
    await coord
      .getByRole('button', { name: 'Executando…', exact: true })
      .waitFor();
    await coord
      .getByRole('button', { name: 'Gerar sugestões', exact: true })
      .waitFor({ timeout: 25_000 });
    expect(observouFimExterno).toBe(true);
    expect(
      consultasCiclo.filter((t) => t >= 15_000).length,
    ).toBeGreaterThanOrEqual(2);
    expect(
      await coord
        .getByText('Rodada concluída. Sugestões atualizadas.', { exact: true })
        .count(),
    ).toBe(0);
    perderPedido = false;
    await coord
      .getByRole('button', { name: 'Gerar sugestões', exact: true })
      .click();
    await coord
      .getByRole('button', { name: 'Executar matching', exact: true })
      .click();
    await coord.getByText(/Execução concluída:/).waitFor();
    expect(operacoes).toHaveLength(4);
    expect(operacoes[2]).toBe(operacoes[3]);
    expect(operacoes[2]).not.toBe(operacoes[0]);

    // Resposta de envio aparece antes da próxima consulta: 101 não pode ser pulada.
    let enviada = false;
    const cursoresChat: string[] = [];
    const mensagem = (id: number, texto: string) => ({
      id,
      texto,
      estado: 'enviada',
      remetenteParticipacaoId: c.a[0].id,
      remetenteNome: 'Aluno 0',
      criadaEm: new Date().toISOString(),
    });
    await aluno.route(/\/chats\/\d+\/mensagens(?:\?|$)/, async (rota: any) => {
      if (rota.request().method() === 'POST') {
        enviada = true;
        await rota.fulfill({ json: mensagem(102, 'Meu envio concorrente') });
        return;
      }
      const resposta = await rota.fetch();
      const pagina = await resposta.json();
      const cursor = new URL(rota.request().url()).searchParams.get('depoisDe');
      if (enviada) cursoresChat.push(cursor ?? 'inicial');
      await rota.fulfill({
        response: resposta,
        json: {
          ...pagina,
          temMais: false,
          mensagens:
            cursor == null
              ? [mensagem(100, 'Antes do envio concorrente')]
              : cursor === '100' && enviada
                ? [
                    mensagem(101, 'Recebida durante envio'),
                    mensagem(102, 'Meu envio concorrente'),
                  ]
                : [],
        },
      });
    });
    await aluno
      .getByRole('button')
      .filter({ has: aluno.locator('strong', { hasText: 'Padrinho 1' }) })
      .click();
    await aluno
      .locator('.chat-bubble p', { hasText: 'Antes do envio concorrente' })
      .waitFor();
    await aluno.getByLabel('Digite uma mensagem').fill('Meu envio concorrente');
    await aluno
      .getByRole('button', { name: 'Enviar mensagem', exact: true })
      .click();
    await aluno
      .locator('.chat-bubble p', { hasText: 'Recebida durante envio' })
      .waitFor();
    expect(cursoresChat[0]).toBe('100');
    expect(
      await aluno
        .locator('.chat-bubble p', { hasText: 'Meu envio concorrente' })
        .count(),
    ).toBe(1);
    expect(falhas).toEqual([]);
  }, 120_000);
});
