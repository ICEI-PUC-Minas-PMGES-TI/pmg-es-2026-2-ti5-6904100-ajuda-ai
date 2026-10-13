// Verificação SOMENTE LEITURA do banco configurado para a API.
// Não grava nada, não cria schema e não roda synchronize; não imprime segredos.
//
// Uso (em code/back/api, depois de `npm run build`):
//   npm run db:verificar              → usa o .env da API
//   npm run db:verificar -- ../../.env → testa outro arquivo
//
// Etapas: DNS → TCP → login/SSL (como a API conecta) → tabelas do schema →
// "dry-run" do synchronize (lista o SQL que o TypeORM executaria).
import dns from 'node:dns/promises';
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { DataSource } from 'typeorm';

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const arquivo = path.resolve(process.argv[2] ?? path.join(raiz, '.env'));
const env = Object.fromEntries(
  fs
    .readFileSync(arquivo, 'utf8')
    .split(/\r?\n/)
    .filter((l) => /^[A-Z_]+=/.test(l))
    .map((l) => [
      l.slice(0, l.indexOf('=')),
      l.slice(l.indexOf('=') + 1).trim(),
    ]),
);

const host = env.DB_HOST;
const port = Number(env.DB_PORT ?? 5432);
const database = env.DB_DATABASE ?? 'postgres';
const schema = env.DB_SCHEMA ?? 'feed';
const ssl = (env.DB_SSL ?? 'true') === 'true';
const conexao = {
  host,
  port,
  user: env.DB_USERNAME ?? 'postgres',
  password: env.DB_PASSWORD,
  database,
};

console.log(`arquivo: ${arquivo}`);
console.log(
  `alvo: ${host ?? '(DB_HOST ausente)'}:${port}/${database} usuario=${conexao.user} schema=${schema} ` +
    `ssl=${ssl ? 'ativo' : 'desativado'}${env.DB_SSL ? '' : ' (DB_SSL ausente → padrão true)'} ` +
    `synchronize=${env.DB_SYNCHRONIZE ?? '(ausente → padrão false)'} senha=${env.DB_PASSWORD ? '********' : '(AUSENTE)'}`,
);
if (!host) process.exit(1);
const local = [
  'localhost',
  '127.0.0.1',
  '::1',
  'host.docker.internal',
  'postgres',
].includes(host.toLowerCase());
if (env.DB_SYNCHRONIZE === 'true' && !local) {
  console.log(
    'AVISO: DB_SYNCHRONIZE=true com banco remoto — a API se recusa a iniciar assim. Use DB_SYNCHRONIZE=false.',
  );
}

// 1. DNS
try {
  const r = await dns.lookup(host, { all: true });
  console.log(`DNS: OK → ${r.map((a) => `IPv${a.family}`).join(', ')}`);
} catch (e) {
  console.log(`DNS: ERRO ${e.code} — o nome "${host}" não existe/não resolve.`);
  process.exit(1);
}

// 2. TCP
const tcp = await new Promise((ok) => {
  const s = net.connect({ host, port, timeout: 8000 });
  s.on('connect', () => (s.destroy(), ok('OK')));
  s.on(
    'timeout',
    () => (s.destroy(), ok('TIMEOUT (porta bloqueada/inacessível)')),
  );
  s.on('error', (e) => ok(`ERRO ${e.code}`));
});
console.log(`TCP ${port}: ${tcp}`);
if (tcp !== 'OK') process.exit(1);

// 3. Login + SSL exatamente como a API (ssl: true verifica o certificado)
const cliente = new pg.Client({
  ...conexao,
  ssl,
  connectionTimeoutMillis: 10000,
});
try {
  await cliente.connect();
} catch (e) {
  console.log(`LOGIN/SSL: ERRO ${e.code ?? ''} ${e.message}`);
  process.exit(1);
}
const info = (
  await cliente.query(
    `select current_database() db, current_user usr, split_part(version(), ',', 1) v,
            coalesce((select ssl from pg_stat_ssl where pid = pg_backend_pid()), false) ssl`,
  )
).rows[0];
console.log(
  `LOGIN: OK user=${info.usr} | BANCO: ${info.db} | SSL na sessão: ${info.ssl} | ${info.v}`,
);
const tabelas = (
  await cliente.query(
    `select table_name from information_schema.tables
      where table_schema = $1 and table_type = 'BASE TABLE' order by 1`,
    [schema],
  )
).rows.map((r) => r.table_name);
console.log(
  `schema "${schema}": ${tabelas.length ? tabelas.join(', ') : '(não existe ou vazio)'}`,
);
await cliente.end();

// 4. Dry-run do synchronize: o que mudaria no schema se a API subisse com
// DB_SYNCHRONIZE=true. Só lê o catálogo; nada é executado.
const entidades = path
  .join(raiz, 'dist', '**', '*.entity.js')
  .replaceAll('\\', '/');
const ds = new DataSource({
  type: 'postgres',
  ...conexao,
  username: conexao.user,
  ssl,
  schema,
  entities: [entidades],
  synchronize: false,
});
await ds.initialize();
const plano = await ds.driver.createSchemaBuilder().log();
await ds.destroy();
const sqls = plano.upQueries.map((q) => q.query);
const destrutivos = sqls.filter((q) =>
  /\bDROP\b|ALTER COLUMN .* TYPE/i.test(q),
);
console.log(
  `synchronize faria ${sqls.length} comando(s)` +
    (destrutivos.length
      ? `, ${destrutivos.length} DESTRUTIVO(S) (DROP/alteração de tipo):`
      : sqls.length
        ? ':'
        : ' — schema já compatível.'),
);
for (const q of sqls) console.log(`   ${/\bDROP\b/i.test(q) ? '⚠ ' : ''}${q}`);
