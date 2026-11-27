import type { MigrationInterface, QueryRunner } from 'typeorm';
import { SCHEMA_MAPA } from '../mapa/postgis.js';

function schemaUsuarios(queryRunner: QueryRunner): string {
  const options = queryRunner.connection.options as { schema?: string };
  return `"${(options.schema ?? 'feed').replaceAll('"', '""')}"`;
}

const m = `"${SCHEMA_MAPA}"`;

export class CriaEncontros1795400000000 implements MigrationInterface {
  name = 'CriaEncontros1795400000000';

  async up(qr: QueryRunner): Promise<void> {
    const u = schemaUsuarios(qr);
    await qr.query(`
      CREATE TABLE ${u}."encontros" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "programa" character varying(20) NOT NULL,
        "organizador_id" integer NOT NULL,
        "pucstop_id" uuid NOT NULL,
        "inicio" TIMESTAMP WITH TIME ZONE NOT NULL,
        "fim" TIMESTAMP WITH TIME ZONE NOT NULL,
        "descricao" character varying(1000),
        "status" character varying(20) NOT NULL DEFAULT 'agendado',
        "cancelado_em" TIMESTAMP WITH TIME ZONE,
        "cancelado_por" character varying(120),
        "criado_em" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "atualizado_em" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "pk_encontros" PRIMARY KEY ("id"),
        CONSTRAINT "ck_encontros_periodo" CHECK ("fim" > "inicio"),
        CONSTRAINT "ck_encontros_status" CHECK ("status" IN ('agendado', 'cancelado')),
        CONSTRAINT "ck_encontros_cancelamento"
          CHECK (("status" = 'cancelado') = ("cancelado_em" IS NOT NULL)),
        CONSTRAINT "fk_encontros_organizador" FOREIGN KEY ("organizador_id")
          REFERENCES ${u}."usuarios"("id") ON DELETE RESTRICT,
        CONSTRAINT "fk_encontros_pucstop" FOREIGN KEY ("pucstop_id")
          REFERENCES ${m}."pucstops"("id") ON DELETE RESTRICT
      )
    `);
    await qr.query(
      `CREATE INDEX "idx_encontros_organizador" ON ${u}."encontros" ("organizador_id", "inicio" DESC)`,
    );
    await qr.query(
      `CREATE INDEX "idx_encontros_programa" ON ${u}."encontros" ("programa", "inicio" DESC)`,
    );

    await qr.query(`
      CREATE TABLE ${u}."encontro_convites" (
        "id" SERIAL NOT NULL,
        "encontro_id" uuid NOT NULL,
        "apadrinhado_id" integer NOT NULL,
        "resposta" character varying(20) NOT NULL DEFAULT 'pendente',
        "respondido_em" TIMESTAMP WITH TIME ZONE,
        CONSTRAINT "pk_encontro_convites" PRIMARY KEY ("id"),
        CONSTRAINT "uq_encontro_convite" UNIQUE ("encontro_id", "apadrinhado_id"),
        CONSTRAINT "ck_encontro_convites_resposta"
          CHECK ("resposta" IN ('pendente', 'aceito', 'recusado')),
        CONSTRAINT "ck_encontro_convites_respondido"
          CHECK (("resposta" = 'pendente') = ("respondido_em" IS NULL)),
        CONSTRAINT "fk_encontro_convites_encontro" FOREIGN KEY ("encontro_id")
          REFERENCES ${u}."encontros"("id") ON DELETE CASCADE,
        CONSTRAINT "fk_encontro_convites_apadrinhado" FOREIGN KEY ("apadrinhado_id")
          REFERENCES ${u}."usuarios"("id") ON DELETE RESTRICT
      )
    `);
    await qr.query(
      `CREATE INDEX "idx_encontro_convites_apadrinhado" ON ${u}."encontro_convites" ("apadrinhado_id")`,
    );

    await qr.query(`
      CREATE TABLE ${u}."encontro_presencas" (
        "id" SERIAL NOT NULL,
        "encontro_id" uuid NOT NULL,
        "usuario_id" integer NOT NULL,
        "distancia_metros" integer NOT NULL,
        "confirmado_em" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "pk_encontro_presencas" PRIMARY KEY ("id"),
        CONSTRAINT "uq_encontro_presenca" UNIQUE ("encontro_id", "usuario_id"),
        CONSTRAINT "ck_encontro_presencas_distancia" CHECK ("distancia_metros" >= 0),
        CONSTRAINT "fk_encontro_presencas_encontro" FOREIGN KEY ("encontro_id")
          REFERENCES ${u}."encontros"("id") ON DELETE RESTRICT,
        CONSTRAINT "fk_encontro_presencas_usuario" FOREIGN KEY ("usuario_id")
          REFERENCES ${u}."usuarios"("id") ON DELETE RESTRICT
      )
    `);
    await qr.query(
      `CREATE INDEX "idx_encontro_presencas_usuario" ON ${u}."encontro_presencas" ("usuario_id")`,
    );

    await qr.query(`
      CREATE TABLE ${u}."encontro_realizacoes" (
        "encontro_id" uuid NOT NULL,
        "realizado_em" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "pk_encontro_realizacoes" PRIMARY KEY ("encontro_id"),
        CONSTRAINT "fk_encontro_realizacoes_encontro" FOREIGN KEY ("encontro_id")
          REFERENCES ${u}."encontros"("id") ON DELETE RESTRICT
      )
    `);
  }

  async down(qr: QueryRunner): Promise<void> {
    const u = schemaUsuarios(qr);
    const [{ total }] = (await qr.query(
      `SELECT count(*)::int AS total FROM ${u}."encontros"`,
    )) as Array<{ total: number }>;
    if (total > 0 && process.env.MIGRATION_DOWN_DESCARTAR_DADOS !== 'true') {
      throw new Error(
        'Rollback recusado: encontros e seus convites ou presenças seriam descartados.',
      );
    }
    await qr.query(`DROP TABLE ${u}."encontro_realizacoes"`);
    await qr.query(`DROP TABLE ${u}."encontro_presencas"`);
    await qr.query(`DROP TABLE ${u}."encontro_convites"`);
    await qr.query(`DROP TABLE ${u}."encontros"`);
  }
}
