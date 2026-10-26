import type { QueryRunner } from 'typeorm';
import {
  BaselineFeed1791900000000,
  TABELAS_BASELINE,
} from './1791900000000-BaselineFeed.js';
import { UsuariosERequisitosPadrinho1791944105933 } from './1791944105933-UsuariosERequisitosPadrinho.js';
import { VersoesEEncerramentoFormularios1792400000000 } from './1792400000000-VersoesEEncerramentoFormularios.js';
import {
  COLUNAS_MATCHING,
  MatchingF11F121792500000000,
  TABELAS_MATCHING,
} from './1792500000000-MatchingF11F12.js';
import {
  CatalogoCriteriosMatching1792600000000,
  COLUNAS_CATALOGO_CRITERIOS,
  TABELAS_CATALOGO_CRITERIOS,
} from './1792600000000-CatalogoCriteriosMatching.js';

/** QueryRunner falso: responde o catálogo com as colunas dadas e grava o SQL. */
function runner(colunas: Array<[string, string]>) {
  const executado: string[] = [];
  const qr = {
    connection: { options: { schema: 'feed' } },
    query: async (sql: string) => {
      if (sql.includes('information_schema.columns')) {
        return colunas.map(([table_name, column_name]) => ({
          table_name,
          column_name,
        }));
      }
      executado.push(sql);
      return [];
    },
  } as unknown as QueryRunner;
  return { qr, executado };
}

const todasDaBaseline = (): Array<[string, string]> =>
  Object.entries(TABELAS_BASELINE).flatMap(([t, cs]) =>
    cs.map((c): [string, string] => [t, c]),
  );

describe('BaselineFeed', () => {
  const baseline = new BaselineFeed1791900000000();

  it('banco novo: cria as 7 tabelas, sem usuarios nem requisitos_padrinho', async () => {
    const { qr, executado } = runner([]);
    await baseline.up(qr);
    const criadas = executado
      .map((sql) => /CREATE TABLE "feed"\."(\w+)"/.exec(sql)?.[1])
      .filter(Boolean);
    expect(criadas.sort()).toEqual(Object.keys(TABELAS_BASELINE).sort());
    expect(executado.join()).not.toMatch(/usuarios|requisitos_padrinho/);
  });

  it('banco existente (Supabase/synchronize): reconhece e não altera nada', async () => {
    const { qr, executado } = runner([
      ...todasDaBaseline(),
      ['programas', 'requisitos_padrinho'],
      ['usuarios', 'id'],
    ]);
    await baseline.up(qr);
    expect(executado).toEqual([]);
  });

  it('estado parcial: falha sem executar nada', async () => {
    const { qr, executado } = runner(
      todasDaBaseline().filter(
        ([t, c]) => t !== 'curtidas' && !(t === 'avisos' && c === 'publico'),
      ),
    );
    await expect(baseline.up(qr)).rejects.toThrow(
      /avisos sem publico; tabela curtidas ausente/,
    );
    expect(executado).toEqual([]);
  });

  it('não tem rollback destrutivo', async () => {
    await expect(baseline.down()).rejects.toThrow(/não é revertida/);
  });
});

describe('UsuariosERequisitosPadrinho (proteção para bancos de synchronize)', () => {
  const migration = new UsuariosERequisitosPadrinho1791944105933();
  const usuarios: Array<[string, string]> = [
    'id',
    'nome',
    'email',
    'curso',
    'periodo',
    'turno',
    'interesses',
    'tipo_participacao',
    'status_cadastro',
    'motivo_rejeicao',
    'analisado_em',
    'analisado_por',
    'criado_em',
    'atualizado_em',
  ].map((c) => ['usuarios', c]);

  it('aplica normalmente num banco que veio da baseline', async () => {
    const { qr, executado } = runner([]);
    await migration.up(qr);
    expect(executado.join()).toMatch(/CREATE TABLE "feed"\."usuarios"/);
    expect(executado.join()).toMatch(/ADD "requisitos_padrinho" jsonb/);
  });

  it('pula quando as duas mudanças já existem com a estrutura esperada', async () => {
    const { qr, executado } = runner([
      ...usuarios,
      ['programas', 'requisitos_padrinho'],
    ]);
    await migration.up(qr);
    expect(executado).toEqual([]);
  });

  it('estado parcial falha (usuarios sem coluna, ou só uma das mudanças)', async () => {
    await expect(migration.up(runner(usuarios.slice(1)).qr)).rejects.toThrow(
      /estado parcial/,
    );
    await expect(
      migration.up(runner([['programas', 'requisitos_padrinho']]).qr),
    ).rejects.toThrow(/estado parcial/);
    await expect(migration.up(runner(usuarios).qr)).rejects.toThrow(
      /estado parcial/,
    );
  });
});

describe('VersoesEEncerramentoFormularios', () => {
  const migration = new VersoesEEncerramentoFormularios1792400000000();
  const colunas: Array<[string, string]> = [
    ['formularios', 'versao'],
    ['formularios', 'encerrado_em'],
  ];

  it('banco da baseline: adiciona as colunas e marca os publicados como versão 1', async () => {
    const { qr, executado } = runner([]);
    await migration.up(qr);
    expect(executado).toHaveLength(2);
    expect(executado[0]).toMatch(
      /ALTER TABLE "feed"\."formularios" ADD "versao" integer NOT NULL DEFAULT 0, ADD "encerrado_em" TIMESTAMP WITH TIME ZONE/,
    );
    expect(executado[1]).toMatch(
      /UPDATE "feed"\."formularios" SET "versao" = 1 WHERE "publicado" = true/,
    );
  });

  it('banco criado por synchronize: reconhece as colunas e não altera nada', async () => {
    const { qr, executado } = runner(colunas);
    await migration.up(qr);
    expect(executado).toEqual([]);
  });

  it('estado parcial falha sem alterar nada', async () => {
    const { qr, executado } = runner(colunas.slice(0, 1));
    await expect(migration.up(qr)).rejects.toThrow(/estado parcial/);
    expect(executado).toEqual([]);
  });

  describe('rollback', () => {
    const comFormularios = (usados: number) => {
      const executado: string[] = [];
      const qr = {
        connection: { options: { schema: 'feed' } },
        query: async (sql: string) => {
          executado.push(sql);
          return sql.startsWith('SELECT count') ? [{ usados }] : [];
        },
      } as unknown as QueryRunner;
      return { qr, executado };
    };

    afterEach(() => {
      delete process.env.MIGRATION_DOWN_DESCARTAR_DADOS;
    });

    it('recusa descartar versões/encerramentos já registrados', async () => {
      const { qr, executado } = comFormularios(2);
      await expect(migration.down(qr)).rejects.toThrow(/Rollback recusado/);
      expect(executado).toHaveLength(1);
    });

    it('sem dados a perder, remove as colunas; com a variável, descarta mesmo assim', async () => {
      const vazio = comFormularios(0);
      await migration.down(vazio.qr);
      expect(vazio.executado[1]).toMatch(
        /DROP COLUMN "encerrado_em", DROP COLUMN "versao"/,
      );

      process.env.MIGRATION_DOWN_DESCARTAR_DADOS = 'true';
      const forcado = comFormularios(2);
      await migration.down(forcado.qr);
      expect(forcado.executado).toHaveLength(2);
    });
  });
});

describe('MatchingF11F12', () => {
  const migration = new MatchingF11F121792500000000();

  function runnerTabelas(tabelas: string[], colunasCompletas = true) {
    const executado: string[] = [];
    const qr = {
      connection: { options: { schema: 'feed' } },
      query: async (sql: string) => {
        if (sql.includes('information_schema.tables'))
          return tabelas.map((table_name) => ({ table_name }));
        if (sql.includes('information_schema.columns'))
          return colunasCompletas
            ? Object.entries(COLUNAS_MATCHING).flatMap(
                ([table_name, colunas]) =>
                  colunas.map((column_name) => ({
                    table_name,
                    column_name,
                  })),
              )
            : [{ table_name: 'matching_configuracoes', column_name: 'id' }];
        executado.push(sql);
        return [];
      },
    } as unknown as QueryRunner;
    return { qr, executado };
  }

  it('cria persistência e converte grupos legados sem apagá-los', async () => {
    const { qr, executado } = runnerTabelas([]);
    await migration.up(qr);
    expect(executado.join('\n')).toMatch(
      /CREATE TABLE "feed"\."matching_configuracoes"/,
    );
    expect(executado.join('\n')).toMatch(
      /CREATE UNIQUE INDEX "uq_matching_vinculo_par_ativo"/,
    );
    expect(executado.join('\n')).toMatch(
      /INSERT INTO "feed"\."matching_vinculos"/,
    );
    expect(executado.join('\n')).not.toMatch(
      /UPDATE\s+"feed"\."participacoes"|DELETE\s+FROM\s+"feed"\."participacoes"/,
    );
  });

  it('reconhece synchronize completo e recusa estado parcial', async () => {
    const completo = runnerTabelas([...TABELAS_MATCHING]);
    await migration.up(completo.qr);
    expect(completo.executado).toEqual([]);
    const parcial = runnerTabelas([TABELAS_MATCHING[0]]);
    await expect(migration.up(parcial.qr)).rejects.toThrow(/estado parcial/);
    expect(parcial.executado).toEqual([]);
    await expect(
      migration.up(runnerTabelas([...TABELAS_MATCHING], false).qr),
    ).rejects.toThrow(/colunas ausentes/);
  });
});

describe('CatalogoCriteriosMatching', () => {
  const migration = new CatalogoCriteriosMatching1792600000000();

  function runnerTabelas(tabelas: string[], colunasCompletas = true) {
    const executado: string[] = [];
    const qr = {
      connection: { options: { schema: 'feed' } },
      query: async (sql: string, params?: unknown[]) => {
        if (sql.includes('information_schema.tables'))
          return tabelas.map((table_name) => ({ table_name }));
        if (sql.includes('information_schema.columns'))
          return colunasCompletas
            ? Object.entries(COLUNAS_CATALOGO_CRITERIOS).flatMap(
                ([table_name, colunas]) =>
                  colunas.map((column_name) => ({
                    table_name,
                    column_name,
                  })),
              )
            : [{ table_name: 'matching_criterios', column_name: 'id' }];
        if (sql.includes('SELECT "id" FROM') && params) return [{ id: 1 }];
        executado.push(sql);
        if (sql.includes('RETURNING')) return [{ id: 1 }];
        return [];
      },
    } as unknown as QueryRunner;
    return { qr, executado };
  }

  it('cria catálogo e sementes sem apagar dados', async () => {
    const { qr, executado } = runnerTabelas([]);
    await migration.up(qr);
    const sql = executado.join('\n');
    expect(sql).toMatch(/CREATE TABLE "feed"\."matching_criterios"/);
    expect(sql).toMatch(/matching_criterio_versoes/);
    expect(sql).toMatch(/INSERT INTO "feed"\."matching_criterios"/);
    expect(sql).toMatch(/INSERT INTO "feed"\."matching_criterio_versoes"/);
  });

  it('é idempotente quando o catálogo já existe', async () => {
    const completo = runnerTabelas([...TABELAS_CATALOGO_CRITERIOS]);
    await migration.up(completo.qr);
    expect(completo.executado).toEqual([]);
  });
});
