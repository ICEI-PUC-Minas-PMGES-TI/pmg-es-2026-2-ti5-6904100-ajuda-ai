import type { MigrationInterface, QueryRunner } from 'typeorm';
import { SCHEMA_MAPA } from '../mapa/postgis.js';

const IDS = [
  'ca160000-0000-4000-8000-000000000016',
  'ca290000-0000-4000-8000-000000000029',
];

/**
 * Cadastra as duas cantinas oficiais trazidas do mapa PUCMaps. O vínculo usa
 * a chave estável do prédio, por isso continua válido quando uma nova versão
 * do mapa é importada. Horários ficam vazios até a coordenação confirmá-los.
 */
export class RestaurantesOficiaisCampus1793700000000 implements MigrationInterface {
  name = 'RestaurantesOficiaisCampus1793700000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const m = `"${SCHEMA_MAPA}"`;
    await queryRunner.query(
      `WITH oficiais("id", "predio_id", "nome") AS (VALUES ` +
        `($1::uuid, 'P16'::varchar, 'Cantina - Prédio 16'::varchar), ` +
        `($2::uuid, 'P29'::varchar, 'Cantina - Prédio 29'::varchar)) ` +
        `INSERT INTO ${m}."restaurantes" ("id", "nome", "descricao", "predio_id", "horarios", "ativo", "criado_por") ` +
        `SELECT o."id", o."nome", '', o."predio_id", '[]'::jsonb, true, NULL ` +
        `FROM oficiais o WHERE EXISTS (` +
        `SELECT 1 FROM ${m}."predios" p JOIN ${m}."versoes" v ON v."id" = p."versao_id" ` +
        `WHERE v."status" = 'ativa' AND p."id" = o."predio_id"` +
        `) AND NOT EXISTS (` +
        `SELECT 1 FROM ${m}."restaurantes" r WHERE r."predio_id" = o."predio_id"` +
        `) ON CONFLICT ("id") DO NOTHING`,
      IDS,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const m = `"${SCHEMA_MAPA}"`;
    const [{ total }] = (await queryRunner.query(
      `SELECT count(*)::int AS total FROM ${m}."cardapios" WHERE "restaurante_id" = ANY($1::uuid[])`,
      [IDS],
    )) as Array<{ total: number }>;
    if (total > 0) {
      throw new Error(
        'Rollback recusado: as cantinas oficiais já possuem cardápios.',
      );
    }
    await queryRunner.query(
      `DELETE FROM ${m}."restaurantes" WHERE "id" = ANY($1::uuid[]) AND "criado_por" IS NULL`,
      [IDS],
    );
  }
}
