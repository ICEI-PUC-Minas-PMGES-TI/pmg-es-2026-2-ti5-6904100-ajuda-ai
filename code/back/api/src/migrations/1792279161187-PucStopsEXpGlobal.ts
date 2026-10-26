import type { MigrationInterface, QueryRunner } from 'typeorm';
import {
  NOME_PUCSTOP_MAX,
  RAIO_PUCSTOP,
  SCHEMA_GAMIFICACAO,
  TIPOS_MOVIMENTACAO_XP,
  XP_PUCSTOP,
} from '../gamificacao/gamificacao.js';
import { SCHEMA_MAPA, SRID, schemaPostgis } from '../mapa/postgis.js';

/** Schema configurado no DataSource (DB_SCHEMA; padrão `feed`), já entre aspas. */
function schemaUsuarios(queryRunner: QueryRunner): string {
  const options = queryRunner.connection.options as { schema?: string };
  return `"${(options.schema ?? 'feed').replaceAll('"', '""')}"`;
}

/**
 * PucStops e XP global (ADR-0002, docs/tecnico/gamificacao/xp.md).
 *
 * - `mapa.pucstops`: conteúdo administrativo da coordenação (CRUD em
 *   `/coordenacao/pucstops`), com raio e XP decididos no servidor. Id UUID
 *   gerado pelo banco; sem `versao_id`: a posição é escolhida pela
 *   coordenação, não vem de uma versão importada do mapa, e a coleta precisa
 *   valer para sempre. Nada é importado do PUCMaps. "Excluir" é `ativo =
 *   false`; nunca DELETE (as coletas seguram a linha com RESTRICT).
 *   `criado_por` é `usuarios.id` quando quem criou existe em `usuarios`
 *   (o coordenador mockado não existe: fica NULL).
 * - schema `gamificacao` (domínio do usuário, não do mapa):
 *   - `xp_movimentacoes`: ledger imutável, fonte de verdade do XP; aceita
 *     débito futuro (quantidade negativa), mas coleta de PucStop é sempre
 *     positiva; `chave_idempotencia` única;
 *   - `xp_carteiras`: saldo materializado (= soma do ledger), travado por linha
 *     em cada movimentação; nunca negativo;
 *   - `pucstop_coletas`: uma por usuário e PucStop (coleta única, sem
 *     cooldown), com o XP efetivamente concedido: editar o XP do PucStop não
 *     muda coletas antigas. Sem coordenada do usuário.
 * - FKs para `usuarios.id` (nunca e-mail), sem cascata: histórico de XP não
 *   some com um DELETE.
 * - Ledger e coletas só aceitam INSERT (trigger recusa UPDATE/DELETE/TRUNCATE).
 */
export class PucStopsEXpGlobal1792279161187 implements MigrationInterface {
  name = 'PucStopsEXpGlobal1792279161187';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const geo = await schemaPostgis((sql, p) => queryRunner.query(sql, p));
    const m = `"${SCHEMA_MAPA}"`;
    const g = `"${SCHEMA_GAMIFICACAO}"`;
    const u = schemaUsuarios(queryRunner);
    const tipos = TIPOS_MOVIMENTACAO_XP.map((t) => `'${t}'`).join(', ');

    await queryRunner.query(
      `CREATE TABLE ${m}."pucstops" (` +
        `"id" uuid NOT NULL DEFAULT gen_random_uuid(), ` +
        `"nome" character varying(${NOME_PUCSTOP_MAX}) NOT NULL, ` +
        `"localizacao" ${geo}.geometry(Point, ${SRID}) NOT NULL, ` +
        `"raio_metros" double precision NOT NULL, ` +
        `"xp" integer NOT NULL, ` +
        `"ativo" boolean NOT NULL DEFAULT true, ` +
        `"criado_por" integer, ` +
        `"criado_em" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), ` +
        `"atualizado_em" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), ` +
        `CONSTRAINT "pk_pucstops" PRIMARY KEY ("id"), ` +
        `CONSTRAINT "fk_pucstops_criado_por" FOREIGN KEY ("criado_por") REFERENCES ${u}."usuarios"("id") ON DELETE RESTRICT, ` +
        `CONSTRAINT "ck_pucstops_nome" CHECK (btrim("nome") <> ''), ` +
        // Mesmos limites da validação da API (gamificacao.ts).
        `CONSTRAINT "ck_pucstops_raio" CHECK ("raio_metros" >= ${RAIO_PUCSTOP.min} AND "raio_metros" <= ${RAIO_PUCSTOP.max}), ` +
        `CONSTRAINT "ck_pucstops_xp" CHECK ("xp" >= ${XP_PUCSTOP.min} AND "xp" <= ${XP_PUCSTOP.max}), ` +
        `CONSTRAINT "ck_pucstops_localizacao_valida" CHECK (${geo}.ST_IsValid("localizacao") AND NOT ${geo}.ST_IsEmpty("localizacao") ` +
        `AND ${geo}.ST_X("localizacao") BETWEEN -180 AND 180 AND ${geo}.ST_Y("localizacao") BETWEEN -90 AND 90))`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_pucstops_localizacao" ON ${m}."pucstops" USING GIST ("localizacao")`,
    );

    await queryRunner.query(`CREATE SCHEMA "${SCHEMA_GAMIFICACAO}"`);

    await queryRunner.query(
      `CREATE TABLE ${g}."xp_carteiras" (` +
        `"usuario_id" integer NOT NULL, ` +
        `"saldo" integer NOT NULL DEFAULT 0, ` +
        `"atualizado_em" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), ` +
        `CONSTRAINT "pk_xp_carteiras" PRIMARY KEY ("usuario_id"), ` +
        `CONSTRAINT "fk_xp_carteiras_usuario" FOREIGN KEY ("usuario_id") REFERENCES ${u}."usuarios"("id") ON DELETE RESTRICT, ` +
        `CONSTRAINT "ck_xp_carteiras_saldo" CHECK ("saldo" >= 0))`,
    );

    await queryRunner.query(
      `CREATE TABLE ${g}."xp_movimentacoes" (` +
        `"id" bigint GENERATED ALWAYS AS IDENTITY, ` +
        `"usuario_id" integer NOT NULL, ` +
        `"quantidade" integer NOT NULL, ` +
        `"tipo" character varying(32) NOT NULL, ` +
        `"referencia_tipo" character varying(32), ` +
        `"referencia_id" character varying(64), ` +
        `"descricao" character varying(200) NOT NULL, ` +
        `"chave_idempotencia" character varying(160) NOT NULL, ` +
        `"saldo_apos" integer NOT NULL, ` +
        `"criado_em" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), ` +
        `CONSTRAINT "pk_xp_movimentacoes" PRIMARY KEY ("id"), ` +
        `CONSTRAINT "uq_xp_movimentacoes_chave" UNIQUE ("chave_idempotencia"), ` +
        `CONSTRAINT "fk_xp_movimentacoes_usuario" FOREIGN KEY ("usuario_id") REFERENCES ${u}."usuarios"("id") ON DELETE RESTRICT, ` +
        `CONSTRAINT "ck_xp_movimentacoes_quantidade" CHECK ("quantidade" <> 0), ` +
        `CONSTRAINT "ck_xp_movimentacoes_tipo" CHECK ("tipo" IN (${tipos})), ` +
        `CONSTRAINT "ck_xp_movimentacoes_pucstop_positivo" CHECK ("tipo" <> 'PUCSTOP_CLAIM' OR "quantidade" > 0), ` +
        `CONSTRAINT "ck_xp_movimentacoes_referencia" CHECK (("referencia_tipo" IS NULL) = ("referencia_id" IS NULL)), ` +
        `CONSTRAINT "ck_xp_movimentacoes_saldo_apos" CHECK ("saldo_apos" >= 0))`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_xp_movimentacoes_usuario" ON ${g}."xp_movimentacoes" ("usuario_id", "id" DESC)`,
    );

    await queryRunner.query(
      `CREATE TABLE ${g}."pucstop_coletas" (` +
        `"id" bigint GENERATED ALWAYS AS IDENTITY, ` +
        `"usuario_id" integer NOT NULL, ` +
        `"pucstop_id" uuid NOT NULL, ` +
        `"movimentacao_id" bigint NOT NULL, ` +
        `"xp" integer NOT NULL, ` +
        `"coletado_em" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), ` +
        `CONSTRAINT "pk_pucstop_coletas" PRIMARY KEY ("id"), ` +
        `CONSTRAINT "uq_pucstop_coletas_usuario_pucstop" UNIQUE ("usuario_id", "pucstop_id"), ` +
        `CONSTRAINT "uq_pucstop_coletas_movimentacao" UNIQUE ("movimentacao_id"), ` +
        `CONSTRAINT "fk_pucstop_coletas_usuario" FOREIGN KEY ("usuario_id") REFERENCES ${u}."usuarios"("id") ON DELETE RESTRICT, ` +
        `CONSTRAINT "fk_pucstop_coletas_pucstop" FOREIGN KEY ("pucstop_id") REFERENCES ${m}."pucstops"("id") ON DELETE RESTRICT, ` +
        `CONSTRAINT "fk_pucstop_coletas_movimentacao" FOREIGN KEY ("movimentacao_id") REFERENCES ${g}."xp_movimentacoes"("id") ON DELETE RESTRICT, ` +
        `CONSTRAINT "ck_pucstop_coletas_xp" CHECK ("xp" > 0))`,
    );

    // Trilha auditável: só INSERT. Correção de XP = nova movimentação (AJUSTE_ADMIN).
    // `search_path` vazio: a função não resolve nomes pelo caminho de quem a
    // dispara (aviso function_search_path_mutable do Supabase).
    await queryRunner.query(
      `CREATE FUNCTION ${g}."somente_insercao"() RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$ ` +
        `BEGIN RAISE EXCEPTION '% é somente inserção (%)', TG_TABLE_NAME, TG_OP USING ERRCODE = 'restrict_violation'; END $$`,
    );
    for (const tabela of ['xp_movimentacoes', 'pucstop_coletas']) {
      await queryRunner.query(
        `CREATE TRIGGER "tg_${tabela}_somente_insercao" BEFORE UPDATE OR DELETE ON ${g}."${tabela}" ` +
          `FOR EACH ROW EXECUTE FUNCTION ${g}."somente_insercao"()`,
      );
      await queryRunner.query(
        `CREATE TRIGGER "tg_${tabela}_sem_truncate" BEFORE TRUNCATE ON ${g}."${tabela}" ` +
          `FOR EACH STATEMENT EXECUTE FUNCTION ${g}."somente_insercao"()`,
      );
    }
  }

  /**
   * Recusa apagar XP já concedido ou PucStops cadastrados. Para descartar mesmo
   * assim (banco de teste): MIGRATION_DOWN_DESCARTAR_DADOS=true.
   */
  public async down(queryRunner: QueryRunner): Promise<void> {
    const m = `"${SCHEMA_MAPA}"`;
    const g = `"${SCHEMA_GAMIFICACAO}"`;
    const [{ movimentacoes, pucstops }] = (await queryRunner.query(
      `SELECT (SELECT count(*)::int FROM ${g}."xp_movimentacoes") AS movimentacoes, ` +
        `(SELECT count(*)::int FROM ${m}."pucstops") AS pucstops`,
    )) as Array<{ movimentacoes: number; pucstops: number }>;
    if (
      (movimentacoes > 0 || pucstops > 0) &&
      process.env.MIGRATION_DOWN_DESCARTAR_DADOS !== 'true'
    ) {
      throw new Error(
        `Rollback recusado: ${movimentacoes} movimentação(ões) de XP e ${pucstops} PucStop(s) seriam apagados. ` +
          'Faça backup e rode com MIGRATION_DOWN_DESCARTAR_DADOS=true se quiser mesmo descartar.',
      );
    }
    // DROP TABLE não dispara os triggers de linha/TRUNCATE.
    await queryRunner.query(`DROP TABLE ${g}."pucstop_coletas"`);
    await queryRunner.query(`DROP TABLE ${g}."xp_movimentacoes"`);
    await queryRunner.query(`DROP TABLE ${g}."xp_carteiras"`);
    await queryRunner.query(`DROP FUNCTION ${g}."somente_insercao"()`);
    await queryRunner.query(`DROP SCHEMA ${g} RESTRICT`);
    await queryRunner.query(`DROP TABLE ${m}."pucstops"`);
  }
}
