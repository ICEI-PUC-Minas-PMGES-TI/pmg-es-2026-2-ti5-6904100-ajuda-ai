import type { NestExpressApplication } from '@nestjs/platform-express';
import type { DataSource } from 'typeorm';
import type { AmbienteApp } from './config/ambiente.js';

const INICIO = Date.now();

/** Executa a consulta com prazo; nunca devolve a mensagem do banco ao cliente. */
export async function bancoResponde(
  dataSource: Pick<DataSource, 'query' | 'isInitialized'>,
  prazoMs = 3000,
): Promise<boolean> {
  if (!dataSource.isInitialized) return false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      dataSource.query('SELECT 1').then(() => true),
      new Promise<boolean>((resolve) => {
        timer = setTimeout(() => resolve(false), prazoMs);
      }),
    ]);
  } catch {
    return false;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/**
 * Sondas para o orquestrador e para o monitoramento, fora dos módulos Nest
 * (não exigem autenticação e não expõem dados):
 * - GET /health        → processo vivo (liveness);
 * - GET /health/ready  → banco respondendo (readiness). 503 se não.
 */
export function registrarSaude(
  app: NestExpressApplication,
  dataSource: Pick<DataSource, 'query' | 'isInitialized'>,
  ambiente: AmbienteApp,
) {
  const http = app.getHttpAdapter().getInstance();
  const versao = process.env.APP_VERSION || 'local';
  http.get('/health', (_req: unknown, res: { json: (corpo: unknown) => void }) => {
    res.json({
      status: 'ok',
      ambiente,
      versao,
      ativoHaSegundos: Math.round((Date.now() - INICIO) / 1000),
    });
  });
  http.get(
    '/health/ready',
    async (
      _req: unknown,
      res: { status: (codigo: number) => { json: (corpo: unknown) => void } },
    ) => {
      const banco = await bancoResponde(dataSource);
      res.status(banco ? 200 : 503).json({
        status: banco ? 'ok' : 'indisponivel',
        banco: banco ? 'ok' : 'falhou',
        versao,
      });
    },
  );
}
