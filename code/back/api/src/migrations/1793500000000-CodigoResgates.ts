import type { MigrationInterface, QueryRunner } from 'typeorm';

const g = '"gamificacao"';

export class CodigoResgates1793500000000 implements MigrationInterface {
  name = 'CodigoResgates1793500000000';

  async up(qr: QueryRunner): Promise<void> {
    await qr.query(
      `ALTER TABLE ${g}."resgates" ADD "codigo" varchar(10) NOT NULL ` +
        `DEFAULT upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10))`,
    );
    await qr.query(
      `ALTER TABLE ${g}."resgates" ADD CONSTRAINT "uq_resgate_codigo" UNIQUE ("codigo")`,
    );
  }

  async down(qr: QueryRunner): Promise<void> {
    await qr.query(
      `ALTER TABLE ${g}."resgates" DROP CONSTRAINT "uq_resgate_codigo", DROP COLUMN "codigo"`,
    );
  }
}
