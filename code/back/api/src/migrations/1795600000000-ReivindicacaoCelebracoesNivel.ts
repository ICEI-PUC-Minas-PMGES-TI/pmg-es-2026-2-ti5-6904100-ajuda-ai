import type { MigrationInterface, QueryRunner } from 'typeorm';

const g = '"gamificacao"';
const T = `${g}."celebracoes_nivel"`;

/**
 * Reivindicação atômica da celebração de nível: dois aparelhos que leem a
 * mesma conquista pendente disputam uma reserva curta no servidor, e só quem
 * a ganha exibe a animação. A reserva expira sozinha (`reivindicado_ate`),
 * então um app fechado antes de exibir não perde a conquista: ela volta a
 * ficar disponível. Estado de apresentação, como a tabela: não mexe em XP,
 * moedas nem coletas.
 *
 * Só acrescenta duas colunas anuláveis (sem default, sem reescrever linhas),
 * numa migration à parte para não alterar a `CelebracoesNivel1795500000000`
 * que já pode ter sido aplicada. `IF NOT EXISTS` / `IF EXISTS` a tornam
 * repetível. Exige a tabela de `CelebracoesNivel1795500000000` (que roda antes).
 *
 * Revisar antes de executar no banco compartilhado.
 */
export class ReivindicacaoCelebracoesNivel1795600000000
  implements MigrationInterface
{
  name = 'ReivindicacaoCelebracoesNivel1795600000000';

  async up(qr: QueryRunner): Promise<void> {
    await qr.query(
      `ALTER TABLE ${T} ` +
        `ADD COLUMN IF NOT EXISTS "reivindicado_por" text, ` +
        `ADD COLUMN IF NOT EXISTS "reivindicado_ate" TIMESTAMP WITH TIME ZONE`,
    );
  }

  async down(qr: QueryRunner): Promise<void> {
    // Se a tabela já foi removida (down da migration anterior), nada a fazer.
    await qr.query(
      `ALTER TABLE IF EXISTS ${T} ` +
        `DROP COLUMN IF EXISTS "reivindicado_por", ` +
        `DROP COLUMN IF EXISTS "reivindicado_ate"`,
    );
  }
}
