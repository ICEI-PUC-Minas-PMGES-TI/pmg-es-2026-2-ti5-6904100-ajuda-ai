import type { QueryRunner } from 'typeorm';
import {
  COLUNAS_CHAT,
  CriaChats1792700000000,
  TABELAS_CHAT,
} from './1792700000000-CriaChats.js';

function runner(tabelas: string[], colunasCompletas = true) {
  const executado: string[] = [];
  const qr = {
    connection: { options: { schema: 'feed' } },
    query: async (sql: string) => {
      if (sql.includes('information_schema.tables'))
        return tabelas.map((table_name) => ({ table_name }));
      if (sql.includes('information_schema.columns'))
        return colunasCompletas
          ? Object.entries(COLUNAS_CHAT).flatMap(([table_name, colunas]) =>
              colunas.map((column_name) => ({ table_name, column_name })),
            )
          : [{ table_name: 'chats', column_name: 'id' }];
      executado.push(sql);
      return [];
    },
  } as unknown as QueryRunner;
  return { qr, executado };
}

describe('CriaChats', () => {
  const migration = new CriaChats1792700000000();

  it('cria chats, participantes e mensagens com estados e recibos', async () => {
    const { qr, executado } = runner([]);
    await migration.up(qr);
    const sql = executado.join('\n');
    for (const tabela of TABELAS_CHAT)
      expect(sql).toContain(`CREATE TABLE "feed"."${tabela}"`);
    expect(sql).toContain('"matching_vinculo_id"');
    expect(sql).toContain("('enviada', 'entregue', 'lida')");
    expect(sql).toContain('"entregue_em"');
    expect(sql).toContain('"lida_em"');
  });

  it('não recria as tabelas se a migração já estiver aplicada', async () => {
    const { qr, executado } = runner([...TABELAS_CHAT]);
    await migration.up(qr);
    expect(executado).toEqual([]);
  });

  it('recusa um estado parcial do schema', async () => {
    const { qr, executado } = runner(['chats']);
    await expect(migration.up(qr)).rejects.toThrow(/estado parcial/);
    expect(executado).toEqual([]);
  });

  it('recusa estrutura existente com colunas ausentes', async () => {
    const { qr, executado } = runner([...TABELAS_CHAT], false);
    await expect(migration.up(qr)).rejects.toThrow(/colunas ausentes/);
    expect(executado).toEqual([]);
  });
});
