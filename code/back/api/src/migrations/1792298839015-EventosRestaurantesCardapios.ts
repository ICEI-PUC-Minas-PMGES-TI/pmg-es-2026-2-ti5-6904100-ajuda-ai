import type { MigrationInterface, QueryRunner } from 'typeorm';
import {
  CARDAPIO_TAMANHO_MAX,
  DESCRICAO_MAX,
  DURACAO_EVENTO_MAX_DIAS,
  NOME_RESTAURANTE,
  TIPOS_CARDAPIO,
  TITULO_EVENTO,
  VIGENCIA_CARDAPIO_MAX_DIAS,
} from '../campus/campus.js';
import { SCHEMA_MAPA, SRID, schemaPostgis } from '../mapa/postgis.js';

/** Schema configurado no DataSource (DB_SCHEMA; padrão `feed`), já entre aspas. */
function schemaUsuarios(queryRunner: QueryRunner): string {
  const options = queryRunner.connection.options as { schema?: string };
  return `"${(options.schema ?? 'feed').replaceAll('"', '""')}"`;
}

/**
 * Eventos, restaurantes e cardápios do campus (Tarefa 11,
 * docs/tecnico/mapa/eventos-cantinas.md). Conteúdo da coordenação no schema
 * `mapa`, como `mapa.pucstops`: sem `versao_id`, criado e editado sem
 * publicar versão nova do mapa. Nada é importado do PUCMaps (lá as tabelas
 * estavam vazias).
 *
 * Local (evento opcional, restaurante obrigatório): exatamente uma forma —
 * `predio_id` (chave estável do campus, ex. `P16`), `area_id` (UUID da área)
 * ou `localizacao` (ponto). Sem FK para prédio/área: são por versão; a API
 * confere na versão ativa ao gravar e resolve nome/posição nela ao ler.
 * Não duplica geometria de prédio/área.
 *
 * `cardapios`: arquivo (imagem/PDF) no container público `restaurant-menus`,
 * com vigência. A linha só existe com o blob gravado; remover apaga os dois.
 *
 * "Excluir" evento/restaurante é `ativo = false` (como PucStops); FKs sem
 * cascata para `usuarios` e para `restaurantes`.
 */
export class EventosRestaurantesCardapios1792298839015 implements MigrationInterface {
  name = 'EventosRestaurantesCardapios1792298839015';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const geo = await schemaPostgis((sql, p) => queryRunner.query(sql, p));
    const m = `"${SCHEMA_MAPA}"`;
    const u = schemaUsuarios(queryRunner);
    const ponto = `${geo}.geometry(Point, ${SRID})`;
    const local = (tabela: string, obrigatorio: boolean) =>
      `"predio_id" character varying(64), ` +
      `"area_id" uuid, ` +
      `"localizacao" ${ponto}, ` +
      `CONSTRAINT "ck_${tabela}_local" CHECK (num_nonnulls("predio_id", "area_id", "localizacao") ${obrigatorio ? '= 1' : '<= 1'}), ` +
      `CONSTRAINT "ck_${tabela}_predio_id" CHECK ("predio_id" IS NULL OR "predio_id" ~ '^[A-Za-z0-9_]{1,64}$'), ` +
      `CONSTRAINT "ck_${tabela}_localizacao" CHECK ("localizacao" IS NULL OR (${geo}.ST_IsValid("localizacao") ` +
      `AND NOT ${geo}.ST_IsEmpty("localizacao") AND ${geo}.ST_X("localizacao") BETWEEN -180 AND 180 ` +
      `AND ${geo}.ST_Y("localizacao") BETWEEN -90 AND 90))`;
    const auditoria = (tabela: string) =>
      `"ativo" boolean NOT NULL DEFAULT true, ` +
      `"criado_por" integer, ` +
      `"criado_em" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), ` +
      `"atualizado_em" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), ` +
      `CONSTRAINT "fk_${tabela}_criado_por" FOREIGN KEY ("criado_por") REFERENCES ${u}."usuarios"("id") ON DELETE RESTRICT`;

    await queryRunner.query(
      `CREATE TABLE ${m}."eventos" (` +
        `"id" uuid NOT NULL DEFAULT gen_random_uuid(), ` +
        `"titulo" character varying(${TITULO_EVENTO.max}) NOT NULL, ` +
        `"descricao" text NOT NULL DEFAULT '', ` +
        `"inicio" TIMESTAMP WITH TIME ZONE NOT NULL, ` +
        `"fim" TIMESTAMP WITH TIME ZONE NOT NULL, ` +
        `${local('eventos', false)}, ` +
        `${auditoria('eventos')}, ` +
        `CONSTRAINT "pk_eventos" PRIMARY KEY ("id"), ` +
        `CONSTRAINT "ck_eventos_titulo" CHECK (char_length(btrim("titulo")) >= ${TITULO_EVENTO.min}), ` +
        `CONSTRAINT "ck_eventos_descricao" CHECK (char_length("descricao") <= ${DESCRICAO_MAX}), ` +
        `CONSTRAINT "ck_eventos_periodo" CHECK ("fim" > "inicio" AND "fim" - "inicio" <= interval '${DURACAO_EVENTO_MAX_DIAS} days'))`,
    );
    // Lista pública: ativos que ainda não acabaram, por início.
    await queryRunner.query(
      `CREATE INDEX "idx_eventos_publicos" ON ${m}."eventos" ("fim", "inicio") WHERE "ativo"`,
    );

    await queryRunner.query(
      `CREATE TABLE ${m}."restaurantes" (` +
        `"id" uuid NOT NULL DEFAULT gen_random_uuid(), ` +
        `"nome" character varying(${NOME_RESTAURANTE.max}) NOT NULL, ` +
        `"descricao" text NOT NULL DEFAULT '', ` +
        `${local('restaurantes', true)}, ` +
        // [{ "dia": 0..6 (0 = domingo), "abre": "HH:mm", "fecha": "HH:mm" }], validado na API.
        `"horarios" jsonb NOT NULL DEFAULT '[]', ` +
        `${auditoria('restaurantes')}, ` +
        `CONSTRAINT "pk_restaurantes" PRIMARY KEY ("id"), ` +
        `CONSTRAINT "ck_restaurantes_nome" CHECK (char_length(btrim("nome")) >= ${NOME_RESTAURANTE.min}), ` +
        `CONSTRAINT "ck_restaurantes_descricao" CHECK (char_length("descricao") <= ${DESCRICAO_MAX}), ` +
        `CONSTRAINT "ck_restaurantes_horarios" CHECK (jsonb_typeof("horarios") = 'array' AND jsonb_array_length("horarios") <= 21))`,
    );

    const tipos = TIPOS_CARDAPIO.map((t) => `'${t}'`).join(', ');
    await queryRunner.query(
      `CREATE TABLE ${m}."cardapios" (` +
        `"id" uuid NOT NULL, ` +
        `"restaurante_id" uuid NOT NULL, ` +
        `"valido_de" date NOT NULL, ` +
        `"valido_ate" date NOT NULL, ` +
        `"arquivo" character varying(255) NOT NULL, ` +
        `"tipo_conteudo" character varying(40) NOT NULL, ` +
        `"tamanho_bytes" integer NOT NULL, ` +
        `"criado_por" integer, ` +
        `"criado_em" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), ` +
        `CONSTRAINT "pk_cardapios" PRIMARY KEY ("id"), ` +
        `CONSTRAINT "uq_cardapios_arquivo" UNIQUE ("arquivo"), ` +
        `CONSTRAINT "fk_cardapios_restaurante" FOREIGN KEY ("restaurante_id") REFERENCES ${m}."restaurantes"("id") ON DELETE RESTRICT, ` +
        `CONSTRAINT "fk_cardapios_criado_por" FOREIGN KEY ("criado_por") REFERENCES ${u}."usuarios"("id") ON DELETE RESTRICT, ` +
        `CONSTRAINT "ck_cardapios_vigencia" CHECK ("valido_ate" >= "valido_de" AND "valido_ate" - "valido_de" < ${VIGENCIA_CARDAPIO_MAX_DIAS}), ` +
        `CONSTRAINT "ck_cardapios_tipo" CHECK ("tipo_conteudo" IN (${tipos})), ` +
        `CONSTRAINT "ck_cardapios_tamanho" CHECK ("tamanho_bytes" > 0 AND "tamanho_bytes" <= ${CARDAPIO_TAMANHO_MAX}), ` +
        // Nome determinístico: restaurantes/<restaurante>/cardapios/<id>.<ext>.
        `CONSTRAINT "ck_cardapios_arquivo" CHECK ("arquivo" = 'restaurantes/' || "restaurante_id" || '/cardapios/' || "id" || '.' || ` +
        `CASE "tipo_conteudo" WHEN 'image/png' THEN 'png' WHEN 'image/jpeg' THEN 'jpg' WHEN 'image/webp' THEN 'webp' ELSE 'pdf' END))`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_cardapios_vigencia" ON ${m}."cardapios" ("restaurante_id", "valido_de", "valido_ate")`,
    );
  }

  /**
   * Recusa apagar conteúdo cadastrado. Os arquivos de cardápio ficam no
   * Azure: apagar as linhas não apaga os blobs. Para descartar mesmo assim
   * (banco de teste): MIGRATION_DOWN_DESCARTAR_DADOS=true.
   */
  public async down(queryRunner: QueryRunner): Promise<void> {
    const m = `"${SCHEMA_MAPA}"`;
    const [{ total }] = (await queryRunner.query(
      `SELECT (SELECT count(*)::int FROM ${m}."eventos") + (SELECT count(*)::int FROM ${m}."restaurantes") + ` +
        `(SELECT count(*)::int FROM ${m}."cardapios") AS total`,
    )) as Array<{ total: number }>;
    if (total > 0 && process.env.MIGRATION_DOWN_DESCARTAR_DADOS !== 'true') {
      throw new Error(
        `Rollback recusado: ${total} evento(s)/restaurante(s)/cardápio(s) seriam apagados ` +
          '(os arquivos de cardápio continuariam no Azure). Faça backup e rode com ' +
          'MIGRATION_DOWN_DESCARTAR_DADOS=true se quiser mesmo descartar.',
      );
    }
    await queryRunner.query(`DROP TABLE ${m}."cardapios"`);
    await queryRunner.query(`DROP TABLE ${m}."restaurantes"`);
    await queryRunner.query(`DROP TABLE ${m}."eventos"`);
  }
}
