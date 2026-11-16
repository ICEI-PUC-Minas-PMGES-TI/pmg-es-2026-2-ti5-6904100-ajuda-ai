import type { QueryRunner } from 'typeorm';
import { ChatTempoRealImagens1793900000000 } from './1793900000000-ChatTempoRealImagens.js';

function runner(
  pendentes = 0,
  imagens = 0,
  colunas: Array<{ table_name: string; column_name: string }> = [],
) {
  const executado: string[] = [];
  const qr = {
    connection: { options: { schema: 'feed' } },
    query: async (sql: string) => {
      if (sql.includes('information_schema.columns')) return colunas;
      if (sql.includes('SELECT (SELECT count(*)'))
        return [{ pendentes, imagens }];
      executado.push(sql);
      return [];
    },
  } as unknown as QueryRunner;
  return { qr, executado };
}

describe('ChatTempoRealImagens', () => {
  const migration = new ChatTempoRealImagens1793900000000();

  it('adiciona a chave privada da imagem e a outbox do RabbitMQ', async () => {
    const { qr, executado } = runner();
    await migration.up(qr);
    expect(executado.join('\n')).toContain(
      'ADD COLUMN "imagem_chave" varchar(1024)',
    );
    expect(executado.join('\n')).toContain('CREATE TABLE "feed"."chat_outbox"');
    expect(executado.join('\n')).toContain('idx_chat_outbox_pendente');
  });

  it('não duplica alterações já criadas pelo synchronize local', async () => {
    const { qr, executado } = runner(0, 0, [
      { table_name: 'mensagens_chat', column_name: 'imagem_chave' },
      ...['id', 'evento', 'publicado_em', 'criado_em'].map((column_name) => ({
        table_name: 'chat_outbox',
        column_name,
      })),
    ]);
    await migration.up(qr);
    expect(executado).toEqual([]);
  });

  it('recusa rollback quando existem eventos ou imagens', async () => {
    await expect(migration.down(runner(1).qr)).rejects.toThrow(
      /aguardam entrega/,
    );
    await expect(migration.down(runner(0, 1).qr)).rejects.toThrow(
      /mensagem\(ns\) possuem imagem/,
    );
  });

  it('remove a coluna e a outbox vazia no rollback', async () => {
    const { qr, executado } = runner();
    await migration.down(qr);
    expect(executado.join('\n')).toContain('DROP TABLE "feed"."chat_outbox"');
    expect(executado.join('\n')).toContain('DROP COLUMN "imagem_chave"');
  });
});
