import { existsSync } from 'node:fs';
import pg from 'pg';
import { garantirSchema } from '../config/schema.js';
import { opcoesSsl } from '../config/seguranca.js';

/**
 * Garante que o schema (`DB_SCHEMA`, padrão `feed`) exista antes das
 * migrations. Idempotente: com o schema já criado, só lê e não escreve.
 * Usa as mesmas variáveis e o mesmo TLS do `.env` da API. Executado por
 * `npm run migration:run` e por `npm run db:preparar`.
 */
if (existsSync('.env')) process.loadEnvFile('.env');

async function preparar() {
  const senha = process.env.DB_PASSWORD?.trim();
  const host = process.env.DB_HOST?.trim();
  if (!host || !senha) {
    throw new Error('DB_HOST e DB_PASSWORD são obrigatórios (veja o .env da API).');
  }
  const cliente = new pg.Client({
    host,
    port: Number(process.env.DB_PORT ?? 5432),
    user: process.env.DB_USERNAME ?? 'postgres',
    password: senha,
    database: process.env.DB_DATABASE ?? 'postgres',
    ssl: opcoesSsl(process.env.DB_SSL, process.env.DB_SSL_CA),
  });
  await cliente.connect();
  try {
    const criou = await garantirSchema(
      (sql, parametros) => cliente.query(sql, parametros as unknown[]),
      process.env.DB_SCHEMA,
    );
    const schema = process.env.DB_SCHEMA?.trim() || 'feed';
    console.log(
      criou
        ? `Schema "${schema}" criado.`
        : `Schema "${schema}" já existia: nada foi alterado.`,
    );
  } finally {
    await cliente.end();
  }
}

preparar().catch((erro: unknown) => {
  console.error(erro instanceof Error ? erro.message : erro);
  process.exit(1);
});
