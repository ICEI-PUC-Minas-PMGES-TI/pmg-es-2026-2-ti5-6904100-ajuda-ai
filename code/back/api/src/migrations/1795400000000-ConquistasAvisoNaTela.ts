import type { MigrationInterface, QueryRunner } from 'typeorm';
import { SCHEMA_GAMIFICACAO } from '../gamificacao/gamificacao.js';

/**
 * Aviso na tela das conquistas (F32): `conquistas_desbloqueios_vistos`
 * registra quando o aluno já viu o aviso "Nova!" de um desbloqueio na
 * coleção. Assim o aviso sai mesmo quando o desbloqueio veio de outra rota
 * (feed, missão, totem) e não da consulta à coleção.
 *
 * Tabela à parte, só de inserção, para `conquistas_desbloqueios` continuar
 * imutável. PK no desbloqueio: o aviso é mostrado uma vez só, mesmo com duas
 * consultas simultâneas (`INSERT ... ON CONFLICT DO NOTHING RETURNING`).
 * Desbloqueios anteriores a esta migration ficam como já vistos.
 */
export class ConquistasAvisoNaTela1795400000000 implements MigrationInterface {
  name = 'ConquistasAvisoNaTela1795400000000';

  async up(qr: QueryRunner): Promise<void> {
    const g = `"${SCHEMA_GAMIFICACAO}"`;
    await qr.query(
      `CREATE TABLE ${g}."conquistas_desbloqueios_vistos" (` +
        `"desbloqueio_id" uuid NOT NULL, ` +
        `"visto_em" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), ` +
        `CONSTRAINT "pk_conquistas_desbloqueios_vistos" PRIMARY KEY ("desbloqueio_id"), ` +
        `CONSTRAINT "fk_conquistas_desbloqueios_vistos_desbloqueio" FOREIGN KEY ("desbloqueio_id") ` +
        `REFERENCES ${g}."conquistas_desbloqueios"("id") ON DELETE RESTRICT)`,
    );
    await qr.query(
      `CREATE TRIGGER "tg_conquistas_desbloqueios_vistos_somente_insercao" BEFORE UPDATE OR DELETE ON ${g}."conquistas_desbloqueios_vistos" ` +
        `FOR EACH ROW EXECUTE FUNCTION ${g}."somente_insercao"()`,
    );
    await qr.query(
      `INSERT INTO ${g}."conquistas_desbloqueios_vistos" ("desbloqueio_id", "visto_em") ` +
        `SELECT "id", "criado_em" FROM ${g}."conquistas_desbloqueios"`,
    );
  }

  async down(qr: QueryRunner): Promise<void> {
    // Só perde a marca de "aviso já visto"; desbloqueios e XP ficam.
    await qr.query(
      `DROP TABLE "${SCHEMA_GAMIFICACAO}"."conquistas_desbloqueios_vistos"`,
    );
  }
}
