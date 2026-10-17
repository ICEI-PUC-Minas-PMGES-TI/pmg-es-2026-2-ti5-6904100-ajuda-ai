import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { DataSource } from 'typeorm';
import { ehBancoLocal, opcoesSsl } from '../config/seguranca.js';
import {
  ImportacaoRecusadaError,
  importarSnapshot,
  relatorioMapa,
} from '../mapa/importacao/importar-snapshot.js';
import {
  SnapshotInvalidoError,
  validarSnapshot,
} from '../mapa/importacao/snapshot.js';

/**
 * Importa um snapshot do mapa no banco do `.env` (ou das variáveis DB_* do
 * ambiente, que têm precedência). Não roda migrations nem synchronize.
 *
 *   npm run mapa:importar -- scripts/mapa/dados/pucmaps-12.json [--ativar]
 *   npm run mapa:importar -- --relatorio
 *
 * Banco remoto (ex.: Supabase) exige `--confirmar-remoto`: o alvo é sempre
 * impresso antes (host/banco, sem senha).
 */
async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const conhecidos = new Set(['--ativar', '--confirmar-remoto', '--relatorio']);
  const desconhecidos = args.filter(
    (a) => a.startsWith('--') && !conhecidos.has(a),
  );
  if (desconhecidos.length)
    throw new Error(`argumento desconhecido: ${desconhecidos.join(' ')}`);
  const arquivo = args.find((a) => !a.startsWith('--'));
  const relatorio = args.includes('--relatorio');
  if (!arquivo && !relatorio) {
    throw new Error(
      'uso: importar-mapa <snapshot.json> [--ativar] [--confirmar-remoto] | --relatorio',
    );
  }

  if (existsSync('.env')) process.loadEnvFile('.env');
  const host = process.env.DB_HOST?.trim();
  if (!host) throw new Error('DB_HOST ausente.');
  const local = ehBancoLocal(host);
  console.log(
    `alvo: ${host}:${process.env.DB_PORT ?? 5432}/${process.env.DB_DATABASE ?? 'postgres'} ` +
      `(${local ? 'local' : 'REMOTO'})`,
  );
  if (!local && !relatorio && !args.includes('--confirmar-remoto')) {
    throw new Error(
      'Banco remoto: repita com --confirmar-remoto depois de conferir o alvo.',
    );
  }

  // Valida o arquivo antes de abrir conexão.
  const snapshot = arquivo
    ? validarSnapshot(JSON.parse(readFileSync(resolve(arquivo), 'utf8')))
    : null;

  const dataSource = new DataSource({
    type: 'postgres',
    host,
    port: Number(process.env.DB_PORT ?? 5432),
    username: process.env.DB_USERNAME ?? 'postgres',
    password: process.env.DB_PASSWORD,
    database: process.env.DB_DATABASE ?? 'postgres',
    ssl: opcoesSsl(process.env.DB_SSL, process.env.DB_SSL_CA),
    entities: [],
    synchronize: false,
    migrationsRun: false,
    installExtensions: false,
  });
  await dataSource.initialize();
  try {
    if (snapshot) {
      const r = await importarSnapshot(dataSource, snapshot, {
        ativar: args.includes('--ativar'),
      });
      console.log(
        `${r.situacao === 'importada' ? 'importada' : 'já importada (mesmo hash; nada reescrito)'}: ` +
          `${r.codigo} status=${r.status} id=${r.versaoId} ${JSON.stringify(r.contagens)}`,
      );
    }
    console.log(JSON.stringify(await relatorioMapa(dataSource), null, 2));
  } finally {
    await dataSource.destroy();
  }
}

main().catch((erro: unknown) => {
  if (
    erro instanceof SnapshotInvalidoError ||
    erro instanceof ImportacaoRecusadaError
  ) {
    console.error(erro.message);
  } else {
    // Erros do driver podem trazer detalhes da conexão; só o essencial.
    const e = erro as { message?: string; code?: string };
    console.error(
      `falha: ${e.code ? `[${e.code}] ` : ''}${e.message ?? String(erro)}`,
    );
  }
  process.exit(1);
});
