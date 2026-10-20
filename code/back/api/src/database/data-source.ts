import { existsSync } from 'node:fs';
import { DataSource } from 'typeorm';
import { opcoesSsl } from '../config/seguranca.js';

/**
 * DataSource do CLI de migrations (`npm run migration:*`, a partir de
 * code/back/api). Lê o mesmo `.env` e usa o mesmo TLS da API; nunca faz
 * synchronize nem roda migrations sozinho — só o comando explícito.
 */
if (existsSync('.env')) process.loadEnvFile('.env');

function exigir(chave: string): string {
  const valor = process.env[chave]?.trim();
  if (!valor) throw new Error(`${chave} ausente no .env da API.`);
  return valor;
}

export default new DataSource({
  type: 'postgres',
  host: exigir('DB_HOST'),
  port: Number(process.env.DB_PORT ?? 5432),
  username: process.env.DB_USERNAME ?? 'postgres',
  password: exigir('DB_PASSWORD'),
  database: process.env.DB_DATABASE ?? 'postgres',
  schema: process.env.DB_SCHEMA ?? 'feed',
  ssl: opcoesSsl(process.env.DB_SSL, process.env.DB_SSL_CA),
  entities: ['dist/**/*.entity.js'],
  migrations: ['dist/migrations/*.js'],
  migrationsTableName: 'migrations',
  synchronize: false,
  migrationsRun: false,
});
