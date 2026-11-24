import type { MigrationInterface, QueryRunner } from 'typeorm';
import {
  DESFECHOS_RESGATE,
  MOTIVO_CANCELAMENTO,
} from '../gamificacao/resgates/resgates.js';
import { MOTIVO_AJUSTE_XP } from '../gamificacao/xp/ajustes-xp.js';
import {
  diferencasDeEstrutura,
  marcaCriadoPor,
  migrationRegistrada,
  tabelasExistentes,
} from '../database/estrutura-migrations.js';

const NOME = 'EntregaResgatesEAjustesXp1794200000000';
/** Nome anterior, antes da renomeação para depois da Sprint-6. */
const LEGADA = 'EntregaResgatesEAjustesXp1793600000000';
const SCHEMA = 'gamificacao';
const g = `"${SCHEMA}"`;
const TABELAS = ['resgate_desfechos', 'xp_ajustes'] as const;
const lista = (valores: readonly string[]) =>
  valores.map((v) => `'${v}'`).join(', ');

/**
 * F29 e F26, só inserção (como o ledger e os resgates):
 *
 * - `resgate_desfechos`: entrega ou cancelamento de um resgate. No máximo um
 *   por resgate (UNIQUE), então não há dupla entrega nem duplo estorno. O
 *   cancelamento aponta a movimentação de estorno (também UNIQUE). Sem linha,
 *   o resgate está aguardando entrega.
 * - `xp_ajustes`: ajuste manual de XP pela coordenação, com motivo e
 *   responsável, ligado à movimentação `AJUSTE_ADMIN` do ledger.
 *
 * Era `1793600000000`; renomeada para depois da Sprint-6 (timestamp repetido).
 * Estados aceitos pelo `up`:
 * - nenhuma das tabelas: cria tudo e marca como desta migration;
 * - as duas, idênticas à DDL abaixo (colunas, tipos, nulidade, defaults,
 *   PK/UNIQUE/FK/CHECK com definição, índices e gatilhos): adota, sem mudar;
 * - qualquer outra coisa (só uma tabela, coluna/índice/gatilho faltando ou
 *   diferente): recusa listando as diferenças, sem alterar nada.
 *
 * O `down` só remove tabelas que esta migration criou (marca no COMMENT ou,
 * em bancos anteriores à marca, sem registro da versão antiga). Tabelas
 * adotadas da versão antiga ficam.
 */
export class EntregaResgatesEAjustesXp1794200000000 implements MigrationInterface {
  name = NOME;

  async up(qr: QueryRunner): Promise<void> {
    const schema =
      (qr.connection.options as { schema?: string }).schema ?? 'feed';
    const u = `"${schema.replaceAll('"', '""')}"`;
    const criar = (alvo: string) => criarTabelas(qr, `"${alvo}"`, u);

    const existentes = await tabelasExistentes(qr, SCHEMA, TABELAS);
    if (existentes.length === 0) {
      await criar(SCHEMA);
      for (const tabela of TABELAS) {
        await qr.query(
          `COMMENT ON TABLE ${g}."${tabela}" IS '${marcaCriadoPor(NOME)}'`,
        );
      }
      return;
    }
    if (existentes.length < TABELAS.length) {
      const faltam = TABELAS.filter((t) => !existentes.includes(t));
      throw new Error(
        `Estado parcial em ${SCHEMA}: existe ${existentes.join(', ')}, falta ${faltam.join(', ')}. ` +
          'Nada foi alterado; corrija o banco antes de rodar a migration.',
      );
    }
    const diferencas = await diferencasDeEstrutura(qr, SCHEMA, TABELAS, criar);
    if (diferencas.length > 0) {
      throw new Error(
        `Estrutura existente em ${SCHEMA} difere da esperada; nada foi alterado:\n- ${diferencas.join('\n- ')}`,
      );
    }
    // Idêntica: criada pela versão antiga desta migration. Adota sem marca.
  }

  async down(qr: QueryRunner): Promise<void> {
    const existentes = await tabelasExistentes(qr, SCHEMA, TABELAS);
    if (existentes.length === 0) return;
    const legadaRegistrada = await migrationRegistrada(qr, LEGADA);
    const comentarios = (await qr.query(
      `SELECT c.relname AS tabela, obj_description(c.oid, 'pg_class') AS comentario ` +
        `FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace ` +
        `WHERE n.nspname = $1 AND c.relname = ANY($2::text[])`,
      [SCHEMA, existentes],
    )) as Array<{ tabela: string; comentario: string | null }>;
    const desta = comentarios
      .filter(
        (c) =>
          c.comentario === marcaCriadoPor(NOME) ||
          (c.comentario === null && !legadaRegistrada),
      )
      .map((c) => c.tabela);
    if (desta.length === 0) return;

    const contagens = await Promise.all(
      desta.map(async (tabela) => {
        const [linha] = (await qr.query(
          `SELECT count(*)::int AS total FROM ${g}."${tabela}"`,
        )) as Array<{ total: number }>;
        return linha.total;
      }),
    );
    const total = contagens.reduce((a, b) => a + b, 0);
    if (total > 0) {
      throw new Error(
        `Rollback recusado: ${total} entrega(s), cancelamento(s) ou ajuste(s) de XP seriam descartados.`,
      );
    }
    // xp_ajustes não depende de resgate_desfechos; a ordem só segue a criação.
    for (const tabela of ['xp_ajustes', 'resgate_desfechos']) {
      if (desta.includes(tabela)) await qr.query(`DROP TABLE ${g}."${tabela}"`);
    }
  }
}

/** DDL única: usada para criar e para conferir uma estrutura existente. */
async function criarTabelas(
  qr: QueryRunner,
  s: string,
  u: string,
): Promise<void> {
  await qr.query(
    `CREATE TABLE ${s}."resgate_desfechos" (` +
      `"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(), ` +
      `"resgate_id" uuid NOT NULL, ` +
      `"tipo" character varying(16) NOT NULL, ` +
      `"motivo" text, ` +
      `"movimentacao_estorno_id" bigint, ` +
      `"responsavel_id" integer, ` +
      `"responsavel_email" character varying(254), ` +
      `"criado_em" timestamptz NOT NULL DEFAULT now(), ` +
      `CONSTRAINT "uq_resgate_desfechos_resgate" UNIQUE ("resgate_id"), ` +
      `CONSTRAINT "uq_resgate_desfechos_estorno" UNIQUE ("movimentacao_estorno_id"), ` +
      `CONSTRAINT "fk_resgate_desfechos_resgate" FOREIGN KEY ("resgate_id") REFERENCES ${g}."resgates"("id") ON DELETE RESTRICT, ` +
      `CONSTRAINT "fk_resgate_desfechos_estorno" FOREIGN KEY ("movimentacao_estorno_id") REFERENCES ${g}."xp_movimentacoes"("id") ON DELETE RESTRICT, ` +
      `CONSTRAINT "fk_resgate_desfechos_responsavel" FOREIGN KEY ("responsavel_id") REFERENCES ${u}."usuarios"("id") ON DELETE RESTRICT, ` +
      `CONSTRAINT "ck_resgate_desfechos_tipo" CHECK ("tipo" IN (${lista(DESFECHOS_RESGATE)})), ` +
      // Cancelar exige motivo e estorno; entregar não tem nenhum dos dois.
      `CONSTRAINT "ck_resgate_desfechos_cancelamento" CHECK (("tipo" = 'cancelado') = ("motivo" IS NOT NULL AND "movimentacao_estorno_id" IS NOT NULL)), ` +
      `CONSTRAINT "ck_resgate_desfechos_entrega" CHECK ("tipo" = 'cancelado' OR ("motivo" IS NULL AND "movimentacao_estorno_id" IS NULL)), ` +
      `CONSTRAINT "ck_resgate_desfechos_motivo" CHECK ("motivo" IS NULL OR char_length(btrim("motivo")) BETWEEN ${MOTIVO_CANCELAMENTO.min} AND ${MOTIVO_CANCELAMENTO.max}), ` +
      `CONSTRAINT "ck_resgate_desfechos_responsavel" CHECK ("responsavel_id" IS NOT NULL OR "responsavel_email" IS NOT NULL))`,
  );

  await qr.query(
    `CREATE TABLE ${s}."xp_ajustes" (` +
      `"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(), ` +
      `"usuario_id" integer NOT NULL, ` +
      `"movimentacao_id" bigint NOT NULL, ` +
      `"quantidade" integer NOT NULL, ` +
      `"motivo" text NOT NULL, ` +
      `"chave_idempotencia" uuid NOT NULL, ` +
      `"responsavel_id" integer, ` +
      `"responsavel_email" character varying(254), ` +
      `"criado_em" timestamptz NOT NULL DEFAULT now(), ` +
      `CONSTRAINT "uq_xp_ajustes_movimentacao" UNIQUE ("movimentacao_id"), ` +
      `CONSTRAINT "uq_xp_ajustes_chave" UNIQUE ("chave_idempotencia"), ` +
      `CONSTRAINT "fk_xp_ajustes_usuario" FOREIGN KEY ("usuario_id") REFERENCES ${u}."usuarios"("id") ON DELETE RESTRICT, ` +
      `CONSTRAINT "fk_xp_ajustes_movimentacao" FOREIGN KEY ("movimentacao_id") REFERENCES ${g}."xp_movimentacoes"("id") ON DELETE RESTRICT, ` +
      `CONSTRAINT "fk_xp_ajustes_responsavel" FOREIGN KEY ("responsavel_id") REFERENCES ${u}."usuarios"("id") ON DELETE RESTRICT, ` +
      `CONSTRAINT "ck_xp_ajustes_quantidade" CHECK ("quantidade" <> 0), ` +
      `CONSTRAINT "ck_xp_ajustes_motivo" CHECK (char_length(btrim("motivo")) BETWEEN ${MOTIVO_AJUSTE_XP.min} AND ${MOTIVO_AJUSTE_XP.max}), ` +
      `CONSTRAINT "ck_xp_ajustes_responsavel" CHECK ("responsavel_id" IS NOT NULL OR "responsavel_email" IS NOT NULL))`,
  );
  await qr.query(
    `CREATE INDEX "idx_xp_ajustes_usuario" ON ${s}."xp_ajustes" ("usuario_id", "criado_em" DESC)`,
  );

  for (const tabela of TABELAS) {
    await qr.query(
      `CREATE TRIGGER "tg_${tabela}_somente_insercao" BEFORE UPDATE OR DELETE ON ${s}."${tabela}" ` +
        `FOR EACH ROW EXECUTE FUNCTION ${g}."somente_insercao"()`,
    );
    await qr.query(
      `CREATE TRIGGER "tg_${tabela}_sem_truncate" BEFORE TRUNCATE ON ${s}."${tabela}" ` +
        `FOR EACH STATEMENT EXECUTE FUNCTION ${g}."somente_insercao"()`,
    );
  }
}
