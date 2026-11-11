import type { MigrationInterface, QueryRunner } from 'typeorm';
import { SCHEMA_MAPA, SRID, schemaPostgis } from '../mapa/postgis.js';

/**
 * Tabelas do domínio geográfico no schema `mapa` (ADR-0005). Origem: entidades
 * `map_versions`, `buildings`, `rooms`, `areas`, `graph_nodes` e `graph_edges`
 * do PUCMaps, portadas para o padrão do banco do Ajuda-aí (português,
 * snake_case) e para identidade estável por versão:
 *
 * - toda linha pertence a uma `versoes.id`; a chave é (versao_id, id);
 * - FKs compostas garantem que nó, aresta, sala e prédio são da mesma versão
 *   (sem aresta pendurada nem referência cruzada entre versões);
 * - nenhuma FK em cascata: versão é histórico, apagar exige decisão explícita;
 * - geometrias PostGIS em SRID 4326, tipo fixo por coluna e validade checada;
 * - no máximo uma versão `ativa` (índice único parcial).
 *
 * Fora daqui de propósito: rotas pré-calculadas, `routingId` do pgRouting,
 * estilo de render/tiles e flags de processamento do pipeline antigo.
 */
export class CriaTabelasMapa1792263378657 implements MigrationInterface {
  name = 'CriaTabelasMapa1792263378657';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const g = await schemaPostgis((sql, p) => queryRunner.query(sql, p));
    const m = `"${SCHEMA_MAPA}"`;
    const ponto = `${g}.geometry(Point, ${SRID})`;
    const poligono = `${g}.geometry(Polygon, ${SRID})`;
    const linha = `${g}.geometry(LineString, ${SRID})`;
    const valido = (coluna: string) =>
      `("${coluna}" IS NULL OR ${g}.ST_IsValid("${coluna}"))`;

    await queryRunner.query(
      `CREATE TABLE ${m}."versoes" (` +
        `"id" uuid NOT NULL, ` +
        `"codigo" character varying(64) NOT NULL, ` +
        `"status" character varying(20) NOT NULL DEFAULT 'pronta', ` +
        `"origem" jsonb NOT NULL, ` +
        `"hash_dados" character(64) NOT NULL, ` +
        `"versao_assets" character varying(64), ` +
        `"metadados" jsonb NOT NULL DEFAULT '{}', ` +
        `"criado_em" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), ` +
        `"ativada_em" TIMESTAMP WITH TIME ZONE, ` +
        `CONSTRAINT "pk_versoes" PRIMARY KEY ("id"), ` +
        `CONSTRAINT "uq_versoes_codigo" UNIQUE ("codigo"), ` +
        `CONSTRAINT "ck_versoes_status" CHECK ("status" IN ('pronta', 'ativa', 'arquivada')), ` +
        `CONSTRAINT "ck_versoes_ativada_em" CHECK ("status" <> 'ativa' OR "ativada_em" IS NOT NULL), ` +
        `CONSTRAINT "ck_versoes_hash_dados" CHECK ("hash_dados" ~ '^[0-9a-f]{64}$'))`,
    );
    // Uma única versão ativa por banco.
    await queryRunner.query(
      `CREATE UNIQUE INDEX "uq_versoes_uma_ativa" ON ${m}."versoes" ((true)) WHERE "status" = 'ativa'`,
    );

    await queryRunner.query(
      `CREATE TABLE ${m}."predios" (` +
        `"versao_id" uuid NOT NULL, ` +
        `"id" character varying(64) NOT NULL, ` +
        `"id_origem" uuid, ` +
        `"osm_id" character varying(32), ` +
        `"codigo" character varying(32), ` +
        `"nome" character varying(160), ` +
        `"tipo" character varying(32), ` +
        `"altura" double precision, ` +
        `"altura_base" double precision, ` +
        `"entradas" jsonb NOT NULL DEFAULT '[]', ` +
        `"localizacao" ${ponto} NOT NULL, ` +
        `"poligono" ${poligono}, ` +
        `CONSTRAINT "pk_predios" PRIMARY KEY ("versao_id", "id"), ` +
        `CONSTRAINT "uq_predios_id_origem" UNIQUE ("versao_id", "id_origem"), ` +
        `CONSTRAINT "fk_predios_versao" FOREIGN KEY ("versao_id") REFERENCES ${m}."versoes"("id") ON DELETE RESTRICT, ` +
        `CONSTRAINT "ck_predios_poligono_valido" CHECK ${valido('poligono')}, ` +
        `CONSTRAINT "ck_predios_altura" CHECK ("altura" IS NULL OR "altura" >= 0))`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_predios_codigo" ON ${m}."predios" ("versao_id", "codigo")`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_predios_poligono" ON ${m}."predios" USING GIST ("poligono")`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_predios_localizacao" ON ${m}."predios" USING GIST ("localizacao")`,
    );

    await queryRunner.query(
      `CREATE TABLE ${m}."salas" (` +
        `"versao_id" uuid NOT NULL, ` +
        `"id" uuid NOT NULL, ` +
        `"predio_id" character varying(64) NOT NULL, ` +
        `"nome" character varying(160) NOT NULL, ` +
        `"andar" integer NOT NULL, ` +
        `"capacidade" integer NOT NULL, ` +
        `"tipo" character varying(32) NOT NULL, ` +
        `"localizacao" ${ponto} NOT NULL, ` +
        `CONSTRAINT "pk_salas" PRIMARY KEY ("versao_id", "id"), ` +
        `CONSTRAINT "fk_salas_predio" FOREIGN KEY ("versao_id", "predio_id") REFERENCES ${m}."predios"("versao_id", "id") ON DELETE RESTRICT, ` +
        `CONSTRAINT "ck_salas_capacidade" CHECK ("capacidade" >= 0))`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_salas_predio" ON ${m}."salas" ("versao_id", "predio_id")`,
    );

    await queryRunner.query(
      `CREATE TABLE ${m}."areas" (` +
        `"versao_id" uuid NOT NULL, ` +
        `"id" uuid NOT NULL, ` +
        `"nome" character varying(160) NOT NULL, ` +
        `"tipo" character varying(32) NOT NULL, ` +
        `"entradas" jsonb NOT NULL DEFAULT '[]', ` +
        `"localizacao" ${ponto} NOT NULL, ` +
        `"poligono" ${poligono}, ` +
        `CONSTRAINT "pk_areas" PRIMARY KEY ("versao_id", "id"), ` +
        `CONSTRAINT "fk_areas_versao" FOREIGN KEY ("versao_id") REFERENCES ${m}."versoes"("id") ON DELETE RESTRICT, ` +
        `CONSTRAINT "ck_areas_poligono_valido" CHECK ${valido('poligono')})`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_areas_poligono" ON ${m}."areas" USING GIST ("poligono")`,
    );

    await queryRunner.query(
      `CREATE TABLE ${m}."nos_grafo" (` +
        `"versao_id" uuid NOT NULL, ` +
        `"id" uuid NOT NULL, ` +
        `"predio_id" character varying(64), ` +
        `"sala_id" uuid, ` +
        `"nivel" numeric(5,2) NOT NULL DEFAULT 0, ` +
        `"camada" integer NOT NULL DEFAULT 0, ` +
        `"localizacao" ${ponto} NOT NULL, ` +
        `CONSTRAINT "pk_nos_grafo" PRIMARY KEY ("versao_id", "id"), ` +
        `CONSTRAINT "fk_nos_grafo_versao" FOREIGN KEY ("versao_id") REFERENCES ${m}."versoes"("id") ON DELETE RESTRICT, ` +
        `CONSTRAINT "fk_nos_grafo_predio" FOREIGN KEY ("versao_id", "predio_id") REFERENCES ${m}."predios"("versao_id", "id") ON DELETE RESTRICT, ` +
        `CONSTRAINT "fk_nos_grafo_sala" FOREIGN KEY ("versao_id", "sala_id") REFERENCES ${m}."salas"("versao_id", "id") ON DELETE RESTRICT)`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_nos_grafo_predio" ON ${m}."nos_grafo" ("versao_id", "predio_id") WHERE "predio_id" IS NOT NULL`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_nos_grafo_localizacao" ON ${m}."nos_grafo" USING GIST ("localizacao")`,
    );

    await queryRunner.query(
      `CREATE TABLE ${m}."arestas_grafo" (` +
        `"versao_id" uuid NOT NULL, ` +
        `"id" uuid NOT NULL, ` +
        `"no_origem_id" uuid NOT NULL, ` +
        `"no_destino_id" uuid NOT NULL, ` +
        `"distancia_m" double precision NOT NULL, ` +
        `"tempo_caminhada_s" integer NOT NULL, ` +
        `"acessivel" boolean NOT NULL, ` +
        `"gerada" boolean NOT NULL DEFAULT false, ` +
        `"camada" integer NOT NULL DEFAULT 0, ` +
        `"geometria" ${linha}, ` +
        `CONSTRAINT "pk_arestas_grafo" PRIMARY KEY ("versao_id", "id"), ` +
        `CONSTRAINT "fk_arestas_grafo_versao" FOREIGN KEY ("versao_id") REFERENCES ${m}."versoes"("id") ON DELETE RESTRICT, ` +
        `CONSTRAINT "fk_arestas_grafo_origem" FOREIGN KEY ("versao_id", "no_origem_id") REFERENCES ${m}."nos_grafo"("versao_id", "id") ON DELETE RESTRICT, ` +
        `CONSTRAINT "fk_arestas_grafo_destino" FOREIGN KEY ("versao_id", "no_destino_id") REFERENCES ${m}."nos_grafo"("versao_id", "id") ON DELETE RESTRICT, ` +
        `CONSTRAINT "ck_arestas_grafo_distancia" CHECK ("distancia_m" >= 0), ` +
        `CONSTRAINT "ck_arestas_grafo_tempo" CHECK ("tempo_caminhada_s" >= 0), ` +
        `CONSTRAINT "ck_arestas_grafo_sem_laco" CHECK ("no_origem_id" <> "no_destino_id"), ` +
        `CONSTRAINT "ck_arestas_grafo_geometria_valida" CHECK ${valido('geometria')})`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_arestas_grafo_origem" ON ${m}."arestas_grafo" ("versao_id", "no_origem_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_arestas_grafo_destino" ON ${m}."arestas_grafo" ("versao_id", "no_destino_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_arestas_grafo_geometria" ON ${m}."arestas_grafo" USING GIST ("geometria")`,
    );
  }

  /**
   * Recusa apagar versões importadas (são histórico). Para descartar mesmo
   * assim: MIGRATION_DOWN_DESCARTAR_DADOS=true.
   */
  public async down(queryRunner: QueryRunner): Promise<void> {
    const m = `"${SCHEMA_MAPA}"`;
    const [{ versoes }] = (await queryRunner.query(
      `SELECT count(*)::int AS versoes FROM ${m}."versoes"`,
    )) as Array<{ versoes: number }>;
    if (versoes > 0 && process.env.MIGRATION_DOWN_DESCARTAR_DADOS !== 'true') {
      throw new Error(
        `Rollback recusado: ${versoes} versão(ões) do mapa seriam apagadas. ` +
          'Faça backup e rode com MIGRATION_DOWN_DESCARTAR_DADOS=true se quiser mesmo descartar.',
      );
    }
    for (const tabela of [
      'arestas_grafo',
      'nos_grafo',
      'areas',
      'salas',
      'predios',
      'versoes',
    ]) {
      await queryRunner.query(`DROP TABLE ${m}."${tabela}"`);
    }
  }
}
