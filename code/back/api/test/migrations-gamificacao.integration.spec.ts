/**
 * Migrations renomeadas da gamificação (1794100000000, 1794200000000) e o
 * programa da troca nos resgates (1794300000000) contra PostgreSQL REAL,
 * com fixtures de banco novo, legado completo, legado parcial e dados
 * legados. Pulado sem MAPA_TEST_DB_URL (banco `migrations_gamificacao`,
 * apagado ao fim).
 */
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { DataSource, type MigrationInterface, type QueryRunner } from 'typeorm';
import { BaselineFeed1791900000000 } from '../src/migrations/1791900000000-BaselineFeed.js';
import { UsuariosERequisitosPadrinho1791944105933 } from '../src/migrations/1791944105933-UsuariosERequisitosPadrinho.js';
import { HabilitaPostgisESchemaMapa1792263378656 } from '../src/migrations/1792263378656-HabilitaPostgisESchemaMapa.js';
import { CriaTabelasMapa1792263378657 } from '../src/migrations/1792263378657-CriaTabelasMapa.js';
import { PucStopsEXpGlobal1792279161187 } from '../src/migrations/1792279161187-PucStopsEXpGlobal.js';
import { LojinhaResgates1792800000000 } from '../src/migrations/1792800000000-LojinhaResgates.js';
import { LojinhaRecompensas1792900000000 } from '../src/migrations/1792900000000-LojinhaRecompensas.js';
import { CodigoResgates1793500000000 } from '../src/migrations/1793500000000-CodigoResgates.js';
import { GamificacaoNiveisMoedasCiclos1794000000000 } from '../src/migrations/1794000000000-GamificacaoNiveisMoedasCiclos.js';
import { ProgramaRecompensasFk1794100000000 } from '../src/migrations/1794100000000-ProgramaRecompensasFk.js';
import { EntregaResgatesEAjustesXp1794200000000 } from '../src/migrations/1794200000000-EntregaResgatesEAjustesXp.js';
import { ResgatesProgramaDaTroca1794300000000 } from '../src/migrations/1794300000000-ResgatesProgramaDaTroca.js';
import { marcaCriadoPor } from '../src/database/estrutura-migrations.js';

const URL_TESTE = process.env.MAPA_TEST_DB_URL;
const BANCO = 'migrations_gamificacao';

/** Estado anterior às três migrations sob teste. */
const BASE: Array<new () => MigrationInterface> = [
  BaselineFeed1791900000000,
  UsuariosERequisitosPadrinho1791944105933,
  HabilitaPostgisESchemaMapa1792263378656,
  CriaTabelasMapa1792263378657,
  PucStopsEXpGlobal1792279161187,
  LojinhaResgates1792800000000,
  LojinhaRecompensas1792900000000,
  CodigoResgates1793500000000,
  GamificacaoNiveisMoedasCiclos1794000000000,
];

async function admin(sql: string): Promise<void> {
  const c = new pg.Client({ connectionString: URL_TESTE });
  await c.connect();
  try {
    await c.query(sql);
  } finally {
    await c.end();
  }
}

describe.skipIf(!URL_TESTE)(
  'Migrations da gamificação com banco novo, legado e parcial',
  () => {
    let ds: DataSource;

    /** Banco do zero com `BASE` aplicada (e o que mais vier em `extras`). */
    async function novoBanco(
      extras: Array<new () => MigrationInterface> = [],
    ): Promise<void> {
      await ds?.destroy();
      await admin(`DROP DATABASE IF EXISTS ${BANCO} WITH (FORCE)`);
      await admin(`CREATE DATABASE ${BANCO}`);
      const url = new URL(URL_TESTE!);
      url.pathname = `/${BANCO}`;
      ds = new DataSource({
        type: 'postgres',
        url: url.toString(),
        schema: 'feed',
        migrations: [...BASE, ...extras],
        migrationsTableName: 'migrations',
        installExtensions: false,
      });
      await ds.initialize();
      await ds.query('CREATE SCHEMA IF NOT EXISTS feed');
      await ds.runMigrations({ transaction: 'all' });
      await ds.query(
        `INSERT INTO feed.programas (codigo, titulo, etapa_atual) VALUES ` +
          `('2026/1', 'Programa 2026/1', 'encerrado'), ('2026/2', 'Programa 2026/2', 'inscricoes')`,
      );
    }

    /** Roda `corpo` numa transação e desfaz tudo no fim. */
    async function semEfeito(
      corpo: (qr: QueryRunner) => Promise<void>,
    ): Promise<void> {
      const qr = ds.createQueryRunner();
      await qr.startTransaction();
      try {
        await corpo(qr);
      } finally {
        await qr.rollbackTransaction();
        await qr.release();
      }
    }

    /** Roda `corpo` numa transação e confirma. */
    async function confirmado<T>(
      corpo: (qr: QueryRunner) => Promise<T>,
    ): Promise<T> {
      const qr = ds.createQueryRunner();
      await qr.startTransaction();
      try {
        const r = await corpo(qr);
        await qr.commitTransaction();
        return r;
      } catch (erro) {
        await qr.rollbackTransaction();
        throw erro;
      } finally {
        await qr.release();
      }
    }

    const registrar = (nome: string) =>
      ds.query(
        `INSERT INTO feed.migrations ("timestamp", "name") VALUES ($1, $2)`,
        [Number(/\d{13}$/.exec(nome)![0]), nome],
      );

    const comentarioTabela = async (tabela: string) =>
      (
        (await ds.query(
          `SELECT obj_description(to_regclass($1), 'pg_class') AS c`,
          [`gamificacao.${tabela}`],
        )) as Array<{ c: string | null }>
      )[0].c;

    const existe = async (sql: string, parametros: unknown[] = []) =>
      ((await ds.query(sql, parametros)) as unknown[]).length > 0;
    const temTabela = (tabela: string) =>
      existe(
        `SELECT 1 FROM information_schema.tables WHERE table_schema = 'gamificacao' AND table_name = $1`,
        [tabela],
      );
    const temFk = () =>
      existe(
        `SELECT 1 FROM pg_constraint WHERE conrelid = 'gamificacao.recompensas'::regclass AND conname = 'fk_recompensas_programa'`,
      );
    const temIndice = () =>
      existe(
        `SELECT 1 FROM pg_indexes WHERE schemaname = 'gamificacao' AND indexname = 'idx_recompensas_programa'`,
      );
    const semSchemaTemporario = async () =>
      expect(
        await existe(
          `SELECT 1 FROM pg_namespace WHERE nspname LIKE '\\_confere\\_%'`,
        ),
      ).toBe(false);

    /**
     * Banco em que as versões ANTIGAS (1793700000000/1793600000000) já
     * rodaram: mesma estrutura, sem a marca nova, com o nome antigo
     * registrado na tabela de migrations.
     */
    async function legadoCompleto(): Promise<void> {
      await novoBanco();
      await confirmado(async (qr) => {
        await new ProgramaRecompensasFk1794100000000().up(qr);
        await new EntregaResgatesEAjustesXp1794200000000().up(qr);
        await qr.query(
          `COMMENT ON CONSTRAINT "fk_recompensas_programa" ON gamificacao.recompensas IS NULL`,
        );
        await qr.query(
          `COMMENT ON INDEX gamificacao."idx_recompensas_programa" IS NULL`,
        );
        await qr.query(
          `COMMENT ON TABLE gamificacao.resgate_desfechos IS NULL`,
        );
        await qr.query(`COMMENT ON TABLE gamificacao.xp_ajustes IS NULL`);
      });
      await registrar('ProgramaRecompensasFk1793700000000');
      await registrar('EntregaResgatesEAjustesXp1793600000000');
    }

    afterAll(async () => {
      await ds?.destroy();
      if (URL_TESTE)
        await admin(`DROP DATABASE IF EXISTS ${BANCO} WITH (FORCE)`);
    });

    describe('banco novo', () => {
      beforeAll(async () => {
        await novoBanco([
          ProgramaRecompensasFk1794100000000,
          EntregaResgatesEAjustesXp1794200000000,
          ResgatesProgramaDaTroca1794300000000,
        ]);
      });

      it('cria tudo marcado como desta migration; down remove; up recria igual', async () => {
        const marcaEntrega = marcaCriadoPor(
          'EntregaResgatesEAjustesXp1794200000000',
        );
        expect(await comentarioTabela('resgate_desfechos')).toBe(marcaEntrega);
        expect(await comentarioTabela('xp_ajustes')).toBe(marcaEntrega);
        expect(await temFk()).toBe(true);
        expect(await temIndice()).toBe(true);

        await confirmado(async (qr) => {
          await new ResgatesProgramaDaTroca1794300000000().down(qr);
          await new EntregaResgatesEAjustesXp1794200000000().down(qr);
          await new ProgramaRecompensasFk1794100000000().down(qr);
        });
        expect(await temTabela('resgate_desfechos')).toBe(false);
        expect(await temTabela('xp_ajustes')).toBe(false);
        expect(await temFk()).toBe(false);
        expect(await temIndice()).toBe(false);

        await confirmado(async (qr) => {
          await new ProgramaRecompensasFk1794100000000().up(qr);
          await new EntregaResgatesEAjustesXp1794200000000().up(qr);
          await new ResgatesProgramaDaTroca1794300000000().up(qr);
        });
        expect(await temTabela('xp_ajustes')).toBe(true);
        expect(await temFk()).toBe(true);
        await semSchemaTemporario();
      });
    });

    describe('legado completo (versões antigas registradas)', () => {
      beforeAll(legadoCompleto);

      it('adota sem alterar nada e o down preserva o que não criou', async () => {
        const antes = await ds.query(
          `SELECT conname, pg_get_constraintdef(oid) AS def FROM pg_constraint ` +
            `WHERE connamespace = 'gamificacao'::regnamespace ORDER BY conname`,
        );
        await confirmado(async (qr) => {
          await new ProgramaRecompensasFk1794100000000().up(qr);
          await new EntregaResgatesEAjustesXp1794200000000().up(qr);
        });
        expect(
          await ds.query(
            `SELECT conname, pg_get_constraintdef(oid) AS def FROM pg_constraint ` +
              `WHERE connamespace = 'gamificacao'::regnamespace ORDER BY conname`,
          ),
        ).toEqual(antes);
        expect(await comentarioTabela('xp_ajustes')).toBeNull();
        await semSchemaTemporario();

        await confirmado(async (qr) => {
          await new EntregaResgatesEAjustesXp1794200000000().down(qr);
          await new ProgramaRecompensasFk1794100000000().down(qr);
        });
        expect(await temTabela('resgate_desfechos')).toBe(true);
        expect(await temTabela('xp_ajustes')).toBe(true);
        expect(await temFk()).toBe(true);
        expect(await temIndice()).toBe(true);
      });
    });

    describe('legado parcial ou divergente: recusa listando, sem alterar nada', () => {
      beforeAll(legadoCompleto);

      it.each([
        [
          'gatilho de só-inserção faltando',
          `DROP TRIGGER "tg_xp_ajustes_sem_truncate" ON gamificacao.xp_ajustes`,
          /xp_ajustes: falta gatilho tg_xp_ajustes_sem_truncate/,
        ],
        [
          'gatilho desabilitado',
          `ALTER TABLE gamificacao.resgate_desfechos DISABLE TRIGGER "tg_resgate_desfechos_somente_insercao"`,
          /resgate_desfechos: sobra gatilho tg_resgate_desfechos_somente_insercao .* desabilitado/,
        ],
        [
          'índice faltando',
          `DROP INDEX gamificacao."idx_xp_ajustes_usuario"`,
          /xp_ajustes: falta indice idx_xp_ajustes_usuario/,
        ],
        [
          'CHECK faltando',
          `ALTER TABLE gamificacao.resgate_desfechos DROP CONSTRAINT "ck_resgate_desfechos_motivo"`,
          /resgate_desfechos: falta constraint ck_resgate_desfechos_motivo/,
        ],
        [
          'coluna com outro tipo',
          `ALTER TABLE gamificacao.resgate_desfechos ALTER COLUMN "responsavel_email" TYPE varchar(100)`,
          /resgate_desfechos: falta coluna responsavel_email character varying\(254\)/,
        ],
        [
          'coluna a mais',
          `ALTER TABLE gamificacao.xp_ajustes ADD COLUMN "extra" integer`,
          /xp_ajustes: sobra coluna extra integer/,
        ],
        [
          'FK com outra ação',
          `ALTER TABLE gamificacao.xp_ajustes DROP CONSTRAINT "fk_xp_ajustes_usuario", ` +
            `ADD CONSTRAINT "fk_xp_ajustes_usuario" FOREIGN KEY ("usuario_id") REFERENCES feed.usuarios("id") ON DELETE CASCADE`,
          /xp_ajustes: falta constraint fk_xp_ajustes_usuario .*ON DELETE RESTRICT/,
        ],
        [
          'UNIQUE da chave faltando',
          `ALTER TABLE gamificacao.xp_ajustes DROP CONSTRAINT "uq_xp_ajustes_chave"`,
          /xp_ajustes: falta constraint uq_xp_ajustes_chave/,
        ],
        [
          'só uma das tabelas',
          `DROP TABLE gamificacao.xp_ajustes`,
          /Estado parcial em gamificacao: existe resgate_desfechos, falta xp_ajustes/,
        ],
      ])('entrega/ajustes: %s', async (_caso, dano, esperado) => {
        await semEfeito(async (qr) => {
          await qr.query(dano);
          await expect(
            new EntregaResgatesEAjustesXp1794200000000().up(qr),
          ).rejects.toThrow(esperado);
          // Recusou sem consertar: o dano continua lá, nada novo criado.
          const depois = (await qr.query(
            `SELECT count(*)::int AS n FROM pg_namespace WHERE nspname LIKE '\\_confere\\_%'`,
          )) as Array<{ n: number }>;
          expect(depois[0].n).toBe(0);
        });
      });

      it.each([
        [
          'FK com ON DELETE CASCADE',
          `ALTER TABLE gamificacao.recompensas DROP CONSTRAINT "fk_recompensas_programa", ` +
            `ADD CONSTRAINT "fk_recompensas_programa" FOREIGN KEY ("programa_codigo") REFERENCES feed.programas("codigo") ON DELETE CASCADE ON UPDATE CASCADE`,
          /fk_recompensas_programa sem ON DELETE RESTRICT/,
        ],
        [
          'FK NOT VALID',
          `ALTER TABLE gamificacao.recompensas DROP CONSTRAINT "fk_recompensas_programa", ` +
            `ADD CONSTRAINT "fk_recompensas_programa" FOREIGN KEY ("programa_codigo") REFERENCES feed.programas("codigo") ON DELETE RESTRICT ON UPDATE CASCADE NOT VALID`,
          /fk_recompensas_programa está NOT VALID/,
        ],
        [
          'constraint com o nome, mas CHECK',
          `ALTER TABLE gamificacao.recompensas DROP CONSTRAINT "fk_recompensas_programa", ` +
            `ADD CONSTRAINT "fk_recompensas_programa" CHECK (true)`,
          /fk_recompensas_programa existe, mas não é FOREIGN KEY/,
        ],
        [
          'índice sem o predicado',
          `DROP INDEX gamificacao."idx_recompensas_programa"; ` +
            `CREATE INDEX "idx_recompensas_programa" ON gamificacao.recompensas ("programa_codigo")`,
          /idx_recompensas_programa com predicado ausente/,
        ],
        [
          'índice em outra coluna',
          `DROP INDEX gamificacao."idx_recompensas_programa"; ` +
            `CREATE INDEX "idx_recompensas_programa" ON gamificacao.recompensas ("nome") WHERE "programa_codigo" IS NOT NULL`,
          /idx_recompensas_programa cobre \(nome\)/,
        ],
      ])('programa das recompensas: %s', async (_caso, dano, esperado) => {
        await semEfeito(async (qr) => {
          for (const sql of dano.split('; ')) await qr.query(sql);
          await expect(
            new ProgramaRecompensasFk1794100000000().up(qr),
          ).rejects.toThrow(esperado);
        });
      });

      it('programa das recompensas: completa só o que falta e o down remove só isso', async () => {
        await semEfeito(async (qr) => {
          await qr.query(`DROP INDEX gamificacao."idx_recompensas_programa"`);
          await new ProgramaRecompensasFk1794100000000().up(qr);
          const [indice] = (await qr.query(
            `SELECT obj_description(to_regclass('gamificacao.idx_recompensas_programa'), 'pg_class') AS c`,
          )) as Array<{ c: string | null }>;
          expect(indice.c).toBe(
            marcaCriadoPor('ProgramaRecompensasFk1794100000000'),
          );
          await new ProgramaRecompensasFk1794100000000().down(qr);
          const [restou] = (await qr.query(
            `SELECT to_regclass('gamificacao.idx_recompensas_programa') AS indice, ` +
              `EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_recompensas_programa' ` +
              `AND conrelid = 'gamificacao.recompensas'::regclass) AS fk`,
          )) as Array<{ indice: string | null; fk: boolean }>;
          // Índice criado agora sai; a FK adotada da versão antiga fica.
          expect(restou).toEqual({ indice: null, fk: true });
        });
      });

      it('recompensas órfãs: recusa listando código e recompensas, sem criar a FK', async () => {
        await semEfeito(async (qr) => {
          await qr.query(
            `ALTER TABLE gamificacao.recompensas DROP CONSTRAINT "fk_recompensas_programa"`,
          );
          await qr.query(
            `INSERT INTO gamificacao.recompensas (nome, descricao, custo_xp, condicoes_retirada, estoque_ilimitado, programa_codigo) ` +
              `VALUES ('Squeeze', 'Azul', 10, 'Secretaria', true, '2025/9'), ('Boné', 'Preto', 10, 'Secretaria', true, '2025/9')`,
          );
          await expect(
            new ProgramaRecompensasFk1794100000000().up(qr),
          ).rejects.toThrow(/- 2025\/9: 2 recompensa\(s\) \(Boné, Squeeze\)/);
          const [fk] = (await qr.query(
            `SELECT count(*)::int AS n FROM pg_constraint WHERE conname = 'fk_recompensas_programa'`,
          )) as Array<{ n: number }>;
          expect(fk.n).toBe(0);
        });
      });
    });

    describe('programa da troca nos resgates legados', () => {
      let usuarios: Record<'ana' | 'bia' | 'caio' | 'davi', number>;
      let resgates: Record<string, string>;

      beforeAll(async () => {
        await novoBanco([
          ProgramaRecompensasFk1794100000000,
          EntregaResgatesEAjustesXp1794200000000,
        ]);
        const usuario = async (nome: string) =>
          (
            (await ds.query(
              `INSERT INTO feed.usuarios (nome, email, curso, periodo, tipo_participacao, status_cadastro) ` +
                `VALUES ($1, $2, 'ES', 2, 'apadrinhado', 'aprovado') RETURNING id`,
              [nome, `${nome}@pucminas.edu.br`],
            )) as Array<{ id: number }>
          )[0].id;
        usuarios = {
          ana: await usuario('ana'),
          bia: await usuario('bia'),
          caio: await usuario('caio'),
          davi: await usuario('davi'),
        };
        const participacao = (quem: string, programa: string, em: string) =>
          ds.query(
            `INSERT INTO feed.participacoes (usuario_id, programa, papel, status, criado_em) VALUES ($1, $2, 'apadrinhado', 'concluido', $3)`,
            [quem, programa, em],
          );
        // ana: participou de 2026/1 e de 2026/2 (por id e por e-mail).
        await participacao(
          String(usuarios.ana),
          '2026/1',
          '2026-02-01T12:00:00Z',
        );
        await participacao(
          'ana@pucminas.edu.br',
          '2026/2',
          '2026-08-01T12:00:00Z',
        );
        // caio: só 2026/1, mas trocou no segundo semestre.
        await participacao(
          'caio@pucminas.edu.br',
          '2026/1',
          '2026-02-01T12:00:00Z',
        );
        // davi: a participação é posterior à troca.
        await participacao(
          'davi@pucminas.edu.br',
          '2026/2',
          '2026-10-01T12:00:00Z',
        );
        // programa que não existe em `programas` (sem FK em participacoes).
        await participacao(
          'bia@pucminas.edu.br',
          '1999/1',
          '2026-01-01T12:00:00Z',
        );

        const recompensa = async (nome: string, programa: string | null) => {
          const [{ id }] = (await ds.query(
            `INSERT INTO gamificacao.recompensas (nome, descricao, custo_xp, condicoes_retirada, estoque_ilimitado, programa_codigo) ` +
              `VALUES ($1, 'x', 10, 'Secretaria', true, $2) RETURNING id`,
            [nome, programa],
          )) as Array<{ id: string }>;
          await ds.query(
            `INSERT INTO gamificacao.recompensa_versoes (recompensa_id, versao, nome, descricao, custo_xp, condicoes_retirada, criado_por_email) ` +
              `VALUES ($1, 1, $2, 'x', 10, 'Secretaria', 'teste')`,
            [id, nome],
          );
          return id;
        };
        const restrita = await recompensa('Restrita 2026/1', '2026/1');
        const aberta = await recompensa('Aberta', null);

        const resgate = async (
          usuarioId: number,
          recompensaId: string,
          em: string,
        ) => {
          const id = randomUUID();
          await ds.transaction(async (m) => {
            await m.query(
              `INSERT INTO gamificacao.xp_carteiras (usuario_id, saldo) VALUES ($1, 0) ON CONFLICT DO NOTHING`,
              [usuarioId],
            );
            const [mov] = (await m.query(
              `INSERT INTO gamificacao.xp_movimentacoes (usuario_id, quantidade, xp_quantidade, tipo, referencia_tipo, referencia_id, descricao, chave_idempotencia, saldo_apos) ` +
                `VALUES ($1, 10, 10, 'AJUSTE_ADMIN', NULL, NULL, 'crédito', $2, 10) RETURNING id`,
              [usuarioId, `c-${id}`],
            )) as Array<{ id: string }>;
            const [deb] = (await m.query(
              `INSERT INTO gamificacao.xp_movimentacoes (usuario_id, quantidade, xp_quantidade, tipo, referencia_tipo, referencia_id, descricao, chave_idempotencia, saldo_apos) ` +
                `VALUES ($1, -10, 0, 'RECOMPENSA', 'RESGATE', $2, 'Resgate', $3, 0) RETURNING id`,
              [usuarioId, id, `r-${id}`],
            )) as Array<{ id: string }>;
            void mov;
            await m.query(
              `INSERT INTO gamificacao.resgates (id, usuario_id, recompensa_id, versao, movimentacao_id, chave_idempotencia, nome, descricao, custo_xp, condicoes_retirada, criado_em) ` +
                `VALUES ($1, $2, $3, 1, $4, $5, 'R', 'x', 10, 'Secretaria', $6)`,
              [id, usuarioId, recompensaId, deb.id, randomUUID(), em],
            );
          });
          return id;
        };
        resgates = {
          restrita: await resgate(
            usuarios.bia,
            restrita,
            '2026-09-10T12:00:00Z',
          ),
          anaSemestre2: await resgate(
            usuarios.ana,
            aberta,
            '2026-09-10T12:00:00Z',
          ),
          anaSemestre1: await resgate(
            usuarios.ana,
            aberta,
            '2026-03-10T12:00:00Z',
          ),
          caio: await resgate(usuarios.caio, aberta, '2026-09-10T12:00:00Z'),
          davi: await resgate(usuarios.davi, aberta, '2026-09-10T12:00:00Z'),
          bia: await resgate(usuarios.bia, aberta, '2026-09-10T12:00:00Z'),
        };
        await confirmado((qr) =>
          new ResgatesProgramaDaTroca1794300000000().up(qr),
        );
      });

      it('preenche com a melhor evidência e marca como inferido', async () => {
        const linhas = (await ds.query(
          `SELECT id, programa_codigo AS codigo, programa_inferido AS inferido FROM gamificacao.resgates`,
        )) as Array<{ id: string; codigo: string | null; inferido: boolean }>;
        const de = (id: string) => {
          const l = linhas.find((x) => x.id === id)!;
          return { codigo: l.codigo, inferido: l.inferido };
        };
        // Recompensa restrita: o programa dela.
        expect(de(resgates.restrita)).toEqual({
          codigo: '2026/1',
          inferido: true,
        });
        // Aberta: a participação do semestre da troca, por id ou e-mail.
        expect(de(resgates.anaSemestre2)).toEqual({
          codigo: '2026/2',
          inferido: true,
        });
        expect(de(resgates.anaSemestre1)).toEqual({
          codigo: '2026/1',
          inferido: true,
        });
        // Sem participação no semestre: a mais recente anterior à troca.
        expect(de(resgates.caio)).toEqual({ codigo: '2026/1', inferido: true });
        // Participação posterior ou em programa inexistente: sem programa.
        expect(de(resgates.davi)).toEqual({ codigo: null, inferido: false });
        expect(de(resgates.bia)).toEqual({ codigo: null, inferido: false });
      });

      it('mantém o resgate só-inserção e a FK com o programa', async () => {
        await expect(
          ds.query(`UPDATE gamificacao.resgates SET programa_codigo = NULL`),
        ).rejects.toThrow();
        await expect(
          ds.query(`DELETE FROM feed.programas WHERE codigo = '2026/1'`),
        ).rejects.toThrow(/fk_re/);
      });

      it('down só sai sem programa gravado na troca; senão recusa', async () => {
        await confirmado(async (qr) => {
          await new ResgatesProgramaDaTroca1794300000000().down(qr);
          await new ResgatesProgramaDaTroca1794300000000().up(qr);
        });
        await ds.query(
          `ALTER TABLE gamificacao.resgates DISABLE TRIGGER "tg_resgates_somente_insercao"`,
        );
        await ds.query(
          `UPDATE gamificacao.resgates SET programa_inferido = false WHERE id = $1`,
          [resgates.restrita],
        );
        await ds.query(
          `ALTER TABLE gamificacao.resgates ENABLE TRIGGER "tg_resgates_somente_insercao"`,
        );
        await expect(
          confirmado((qr) =>
            new ResgatesProgramaDaTroca1794300000000().down(qr),
          ),
        ).rejects.toThrow(/Rollback recusado: 1 resgate/);
      });
    });
  },
);
