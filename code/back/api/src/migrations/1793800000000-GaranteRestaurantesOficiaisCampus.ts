import type { MigrationInterface, QueryRunner } from 'typeorm';
import { SCHEMA_MAPA } from '../mapa/postgis.js';

const IDS = [
  'ca160000-0000-4000-8000-000000000016',
  'ca290000-0000-4000-8000-000000000029',
];

/**
 * Correção idempotente da migration 179370: uma instalação limpa executa as
 * migrations antes de importar o mapa e, nesse caso, ainda não há P16/P29 na
 * versão ativa. `restaurantes.predio_id` é uma chave estável sem FK para uma
 * versão, então é seguro semear antes da importação.
 */
export class GaranteRestaurantesOficiaisCampus1793800000000 implements MigrationInterface {
  name = 'GaranteRestaurantesOficiaisCampus1793800000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const m = `"${SCHEMA_MAPA}"`;
    await queryRunner.query(
      `WITH oficiais("id", "predio_id", "nome") AS (VALUES ` +
        `($1::uuid, 'P16'::varchar, 'Cantina - Prédio 16'::varchar), ` +
        `($2::uuid, 'P29'::varchar, 'Cantina - Prédio 29'::varchar)) ` +
        `INSERT INTO ${m}."restaurantes" ("id", "nome", "descricao", "predio_id", "horarios", "ativo", "criado_por") ` +
        `SELECT o."id", o."nome", '', o."predio_id", '[]'::jsonb, true, NULL ` +
        `FROM oficiais o WHERE NOT EXISTS (` +
        `SELECT 1 FROM ${m}."restaurantes" r WHERE r."predio_id" = o."predio_id"` +
        `) ON CONFLICT ("id") DO NOTHING`,
      IDS,
    );
  }

  /**
   * A correção pode ter apenas reconhecido registros criados pela migration
   * anterior ou pela coordenação. Por isso o rollback não tenta apagar dados
   * cuja autoria não consegue distinguir.
   */
  public async down(_queryRunner: QueryRunner): Promise<void> {}
}
