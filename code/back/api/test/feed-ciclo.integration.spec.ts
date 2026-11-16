/**
 * Migration FeedPorCiclo contra PostgreSQL REAL, em schema isolado e apagado
 * ao fim. Pulado sem FEED_TEST_DB_URL (mesmo banco local de feed.integration).
 */
import { DataSource } from 'typeorm';
import { ComentarioEntity } from '../src/publicacoes/entities/comentario.entity.js';
import { CurtidaComentarioEntity } from '../src/publicacoes/entities/curtida-comentario.entity.js';
import { CurtidaEntity } from '../src/publicacoes/entities/curtida.entity.js';
import { FeedOutboxEntity } from '../src/publicacoes/entities/feed-outbox.entity.js';
import { PublicacaoEntity } from '../src/publicacoes/entities/publicacao.entity.js';
import { FeedPorCiclo1793900000000 } from '../src/migrations/1793900000000-FeedPorCiclo.js';

const db = process.env.FEED_TEST_DB_URL;

describe.skipIf(!db)('FeedPorCiclo (PostgreSQL isolado)', () => {
  const schema = `feed_ciclo_${Date.now()}`;
  let dados: DataSource;

  const colunas = async () =>
    (await dados.query(
      `SELECT column_name, is_nullable FROM information_schema.columns
       WHERE table_schema = $1 AND table_name = 'publicacoes' AND column_name = 'programa_codigo'`,
      [schema],
    )) as Array<{ column_name: string; is_nullable: string }>;

  beforeAll(async () => {
    dados = new DataSource({
      type: 'postgres',
      url: db,
      schema,
      entities: [
        PublicacaoEntity,
        ComentarioEntity,
        CurtidaEntity,
        CurtidaComentarioEntity,
        FeedOutboxEntity,
      ],
      synchronize: false,
    });
    await dados.initialize();
    await dados.query(`CREATE SCHEMA "${schema}"`);
    await dados.synchronize();
    // Estado anterior à migration: sem a coluna.
    await dados.query(
      `ALTER TABLE "${schema}".publicacoes DROP COLUMN programa_codigo`,
    );
  });

  afterAll(async () => {
    if (dados?.isInitialized) {
      await dados.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
      await dados.destroy();
    }
  });

  it('classifica as publicações antigas pelo semestre da criação e fecha a coluna', async () => {
    const inserir = (texto: string, quando: string) =>
      dados.query(
        `INSERT INTO "${schema}".publicacoes
         (autor, iniciais, descricao_autor, categoria, texto, owner_id, criado_em)
         VALUES ('A', 'A', 'Programa', 'Comunicados', $1, 'a', $2)`,
        [texto, quando],
      );
    await inserir('jan', '2026-01-15T12:00:00-03:00');
    await inserir('jun', '2026-06-30T23:00:00-03:00');
    // 01h de 1º/jul em Brasília ainda é 30/jun às 04h UTC... e já é julho local.
    await inserir('jul', '2026-07-01T01:00:00-03:00');
    await inserir('dez', '2026-12-31T22:00:00-03:00');
    await inserir('antigo', '2025-09-10T10:00:00-03:00');

    const runner = dados.createQueryRunner();
    try {
      await new FeedPorCiclo1793900000000().up(runner);
    } finally {
      await runner.release();
    }

    const linhas = (await dados.query(
      `SELECT texto, programa_codigo FROM "${schema}".publicacoes ORDER BY texto`,
    )) as Array<{ texto: string; programa_codigo: string }>;
    expect(
      Object.fromEntries(linhas.map((l) => [l.texto, l.programa_codigo])),
    ).toEqual({
      antigo: '2025/2',
      dez: '2026/2',
      jan: '2026/1',
      jul: '2026/2',
      jun: '2026/1',
    });
    expect(await colunas()).toEqual([
      { column_name: 'programa_codigo', is_nullable: 'NO' },
    ]);
    const [indice] = (await dados.query(
      `SELECT indexname FROM pg_indexes WHERE schemaname = $1 AND indexname = 'idx_publicacoes_programa'`,
      [schema],
    )) as Array<{ indexname: string }>;
    expect(indice?.indexname).toBe('idx_publicacoes_programa');
  });

  it('quem insere sem informar o ciclo (versão antiga) recebe o semestre atual', async () => {
    await dados.query(`INSERT INTO "${schema}".publicacoes
      (autor, iniciais, descricao_autor, categoria, texto, owner_id)
      VALUES ('A', 'A', 'Programa', 'Comunicados', 'sem ciclo', 'a')`);
    const [linha] = (await dados.query(
      `SELECT programa_codigo FROM "${schema}".publicacoes WHERE texto = 'sem ciclo'`,
    )) as Array<{ programa_codigo: string }>;
    expect(linha.programa_codigo).toMatch(/^\d{4}\/[12]$/);
  });

  it('o rollback remove a coluna e o índice', async () => {
    const runner = dados.createQueryRunner();
    try {
      await new FeedPorCiclo1793900000000().down(runner);
    } finally {
      await runner.release();
    }
    expect(await colunas()).toEqual([]);
    // E a migration pode subir de novo.
    const runner2 = dados.createQueryRunner();
    try {
      await new FeedPorCiclo1793900000000().up(runner2);
    } finally {
      await runner2.release();
    }
    expect(await colunas()).toHaveLength(1);
  });
});
