import type { QueryRunner } from 'typeorm';
import {
  BaselineFeed1791900000000,
  TABELAS_BASELINE,
} from './1791900000000-BaselineFeed.js';
import { UsuariosERequisitosPadrinho1791944105933 } from './1791944105933-UsuariosERequisitosPadrinho.js';

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
