/**
 * Aplica SÓ a migration CelebracoesNivel1794100000000 (animação de novo
 * nível), sem rodar as outras migrations pendentes do banco — que são de
 * outras frentes e dependem de decisão própria. O registro é gravado na
 * tabela de migrations do TypeORM, então um `migration:run` futuro não a
 * reaplica e continua aplicando só as demais.
 *
 *   npm run celebracoes:aplicar                         # pré-voo, SÓ LEITURA
 *   npm run celebracoes:aplicar -- --confirmar=<DB_HOST>
 *   npm run celebracoes:aplicar -- --reverter --confirmar=<DB_HOST>
 *
 * - Sem `--confirmar` nada é gravado (transação READ ONLY): mostra o alvo,
 *   o estado e quantas linhas o backfill criaria.
 * - `--confirmar=` precisa repetir o DB_HOST do `.env`: evita gravar no banco
 *   errado por engano.
 * - Escrita numa única transação (tabela + backfill + registro), com
 *   `lock_timeout`: ou tudo, ou nada.
 * - Reverter: remove a tabela e o registro (XP, moedas e ledger não mudam).
 */
import { DataSource } from 'typeorm';
import { nivelDe } from '../gamificacao/economia.js';
import { CelebracoesNivel1794100000000 } from '../migrations/1794100000000-CelebracoesNivel.js';

const NOME = 'CelebracoesNivel1794100000000';
const TIMESTAMP = 1794100000000;

function argumento(nome: string): string | undefined {
  const prefixo = `--${nome}=`;
  return process.argv.find((a) => a.startsWith(prefixo))?.slice(prefixo.length);
}

async function principal() {
  const confirmar = argumento('confirmar');
  const reverter = process.argv.includes('--reverter');
  const base = (await import('../database/data-source.js')).default;
  const opcoes = base.options as { host?: string; schema?: string; database?: string };
  const host = String(opcoes.host ?? '');
  const s = `"${(opcoes.schema ?? 'feed').replaceAll('"', '""')}"`;
  console.log(`alvo: ${host}/${opcoes.database} schema=${opcoes.schema ?? 'feed'}`);
  if (confirmar !== undefined && confirmar !== host) {
    console.error(`--confirmar=${confirmar} não confere com DB_HOST (${host}). Nada foi feito.`);
    process.exit(1);
  }

  const ds: DataSource = await base.initialize();
  const qr = ds.createQueryRunner();
  await qr.connect();
  try {
    const escrever = confirmar !== undefined;
    await qr.startTransaction();
    if (!escrever) await qr.query('SET TRANSACTION READ ONLY');
    await qr.query(`SET LOCAL lock_timeout = '5s'`);
    await qr.query(`SET LOCAL statement_timeout = '60s'`);

    const [estado] = (await qr.query(
      `SELECT to_regclass('gamificacao.celebracoes_nivel') IS NOT NULL AS tabela, ` +
        `to_regclass('gamificacao.xp_carteiras') IS NOT NULL AS carteiras, ` +
        `to_regclass('${s.replaceAll('"', '')}.usuarios') IS NOT NULL AS usuarios, ` +
        `EXISTS (SELECT 1 FROM ${s}."migrations" WHERE "name" = $1) AS registrada`,
      [NOME],
    )) as Array<{ tabela: boolean; carteiras: boolean; usuarios: boolean; registrada: boolean }>;
    console.log(
      `tabela celebracoes_nivel: ${estado.tabela ? 'existe' : 'não existe'}; ` +
        `registro em migrations: ${estado.registrada ? 'sim' : 'não'}`,
    );
    if (!estado.carteiras || !estado.usuarios) {
      throw new Error('Pré-requisito ausente: gamificacao.xp_carteiras ou usuarios.');
    }

    if (reverter) {
      if (!estado.tabela && !estado.registrada) {
        console.log('Nada a reverter.');
        await qr.rollbackTransaction();
        return;
      }
      if (!escrever) {
        console.log('Pré-voo: reverter removeria a tabela e o registro. Use --confirmar=<DB_HOST>.');
        await qr.rollbackTransaction();
        return;
      }
      if (estado.tabela) await new CelebracoesNivel1794100000000().down(qr);
      await qr.query(`DELETE FROM ${s}."migrations" WHERE "name" = $1`, [NOME]);
      await qr.commitTransaction();
      console.log('Revertida: tabela removida e registro apagado. XP e moedas intactos.');
      return;
    }

    if (estado.tabela || estado.registrada) {
      console.log(
        estado.tabela && estado.registrada
          ? 'Já aplicada. Nada a fazer.'
          : 'Estado inconsistente (tabela sem registro ou registro sem tabela). Nada foi feito: revise antes.',
      );
      await qr.rollbackTransaction();
      if (!(estado.tabela && estado.registrada)) process.exitCode = 1;
      return;
    }

    // Pré-voo: o que o backfill vai gravar (só contagens).
    const carteiras = (await qr.query(
      `SELECT c."xp_acumulado" FROM gamificacao."xp_carteiras" c`,
    )) as Array<{ xp_acumulado: number }>;
    const porNivel = new Map<number, number>();
    for (const c of carteiras) {
      const n = nivelDe(c.xp_acumulado).numero;
      if (n > 1) porNivel.set(n, (porNivel.get(n) ?? 0) + 1);
    }
    const [{ orfas }] = (await qr.query(
      `SELECT count(*)::int AS orfas FROM gamificacao."xp_carteiras" c ` +
        `LEFT JOIN ${s}."usuarios" u ON u."id" = c."usuario_id" WHERE u."id" IS NULL`,
    )) as Array<{ orfas: number }>;
    const total = [...porNivel.values()].reduce((a, b) => a + b, 0);
    console.log(
      `backfill: ${total} linha(s) em gamificacao.celebracoes_nivel ` +
        `(${[...porNivel.entries()].sort((a, b) => a[0] - b[0]).map(([n, q]) => `nível ${n}: ${q}`).join(', ') || 'nenhuma'}); ` +
        `carteiras sem usuário: ${orfas}`,
    );
    if (orfas > 0) throw new Error('Há carteiras sem usuário: a FK falharia. Nada foi feito.');

    if (!escrever) {
      console.log('Pré-voo OK (nada gravado). Para aplicar: --confirmar=' + host);
      await qr.rollbackTransaction();
      return;
    }

    await new CelebracoesNivel1794100000000().up(qr);
    await qr.query(
      `INSERT INTO ${s}."migrations" ("timestamp", "name") VALUES ($1, $2)`,
      [TIMESTAMP, NOME],
    );
    const [{ linhas }] = (await qr.query(
      `SELECT count(*)::int AS linhas FROM gamificacao."celebracoes_nivel"`,
    )) as Array<{ linhas: number }>;
    if (linhas !== total) {
      throw new Error(`Backfill gravou ${linhas} linha(s), esperado ${total}. Desfeito.`);
    }
    await qr.commitTransaction();
    console.log(`Aplicada: tabela criada, ${linhas} linha(s) de backfill, registro gravado.`);
  } catch (erro) {
    if (qr.isTransactionActive) await qr.rollbackTransaction();
    console.error(`Falhou e foi desfeito: ${(erro as Error).message}`);
    process.exitCode = 1;
  } finally {
    await qr.release();
    await ds.destroy();
  }
}

await principal();
