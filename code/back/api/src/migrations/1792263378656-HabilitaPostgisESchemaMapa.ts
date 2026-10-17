import type { MigrationInterface, QueryRunner } from 'typeorm';
import {
  SCHEMA_EXTENSOES,
  SCHEMA_MAPA,
  schemaDaExtensao,
} from '../mapa/postgis.js';

/**
 * Extensões e schema do domínio de mapa (ADR-0005).
 *
 * - `postgis`: obrigatório. Instalado em `extensions` (padrão do Supabase,
 *   onde o `search_path` do papel `postgres` já inclui esse schema). Se já
 *   existir em outro schema (imagem local `postgis/postgis` instala em
 *   `public`), é mantido onde está.
 * - `unaccent`: para a futura busca remota; mesmo critério.
 * - `pgrouting`: NÃO instalado (rotas ficam para outra fase).
 * - schema `mapa`: separado de `feed`; nada de `feed` é movido.
 */
export class HabilitaPostgisESchemaMapa1792263378656 implements MigrationInterface {
  name = 'HabilitaPostgisESchemaMapa1792263378656';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const consultar = (sql: string, p?: unknown[]) => queryRunner.query(sql, p);
    await queryRunner.query(
      `CREATE SCHEMA IF NOT EXISTS "${SCHEMA_EXTENSOES}"`,
    );
    for (const extensao of ['postgis', 'unaccent']) {
      if (!(await schemaDaExtensao(consultar, extensao))) {
        await queryRunner.query(
          `CREATE EXTENSION IF NOT EXISTS "${extensao}" WITH SCHEMA "${SCHEMA_EXTENSOES}"`,
        );
      }
    }
    await queryRunner.query(`CREATE SCHEMA IF NOT EXISTS "${SCHEMA_MAPA}"`);
  }

  /**
   * Remove só o schema `mapa`, e só se estiver vazio (sem CASCADE). As
   * extensões ficam: podem ter existido antes desta migration ou ser usadas
   * por outros schemas do mesmo banco.
   */
  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP SCHEMA IF EXISTS "${SCHEMA_MAPA}" RESTRICT`);
  }
}
