import type { MigrationInterface, QueryRunner } from 'typeorm';
import { schemaUsuarios } from '../gamificacao/gamificacao.js';
import { SCHEMA_MAPA, schemaPostgis, SRID } from '../mapa/postgis.js';

export class LocalDoEncontro1795700000000 implements MigrationInterface {
  name = 'LocalDoEncontro1795700000000';

  async up(qr: QueryRunner): Promise<void> {
    const u = schemaUsuarios(qr.connection);
    const geo = await schemaPostgis((sql, params) => qr.query(sql, params));
    const mapa = `"${SCHEMA_MAPA}"`;
    await qr.query(
      `ALTER TABLE ${u}."encontros"
       ADD COLUMN "local_nome" varchar(120),
       ADD COLUMN "local_posicao" ${geo}.geometry(Point, ${SRID})`,
    );
    await qr.query(
      `UPDATE ${u}."encontros" e SET "local_nome" = p."nome", "local_posicao" = p."localizacao"
       FROM ${mapa}."pucstops" p WHERE p."id" = e."pucstop_id"`,
    );
    await qr.query(
      `ALTER TABLE ${u}."encontros"
       ALTER COLUMN "local_nome" SET NOT NULL, ALTER COLUMN "local_posicao" SET NOT NULL`,
    );
    await qr.query(`
      CREATE FUNCTION ${u}."fixar_local_encontro"() RETURNS trigger
      LANGUAGE plpgsql AS $$
      BEGIN
        IF TG_OP = 'INSERT' THEN
          SELECT "nome", "localizacao" INTO NEW."local_nome", NEW."local_posicao"
          FROM ${mapa}."pucstops" WHERE "id" = NEW."pucstop_id" FOR SHARE;
        ELSIF NEW."pucstop_id" IS DISTINCT FROM OLD."pucstop_id" THEN
          SELECT "nome", "localizacao" INTO NEW."local_nome", NEW."local_posicao"
          FROM ${mapa}."pucstops" WHERE "id" = NEW."pucstop_id" FOR SHARE;
        END IF;
        RETURN NEW;
      END;
      $$;
      CREATE TRIGGER "trg_encontro_local" BEFORE INSERT OR UPDATE OF "pucstop_id"
      ON ${u}."encontros" FOR EACH ROW EXECUTE FUNCTION ${u}."fixar_local_encontro"()
    `);
  }

  async down(qr: QueryRunner): Promise<void> {
    const u = schemaUsuarios(qr.connection);
    const [{ usados }] = (await qr.query(
      `SELECT EXISTS (SELECT 1 FROM ${u}."encontros") AS usados`,
    )) as Array<{ usados: boolean }>;
    if (usados && process.env.MIGRATION_DOWN_DESCARTAR_DADOS !== 'true') {
      throw new Error(
        'Rollback recusado: locais aceitos nos encontros seriam descartados.',
      );
    }
    await qr.query(`
      DROP TRIGGER "trg_encontro_local" ON ${u}."encontros";
      DROP FUNCTION ${u}."fixar_local_encontro"();
      ALTER TABLE ${u}."encontros" DROP COLUMN "local_nome", DROP COLUMN "local_posicao";
    `);
  }
}
