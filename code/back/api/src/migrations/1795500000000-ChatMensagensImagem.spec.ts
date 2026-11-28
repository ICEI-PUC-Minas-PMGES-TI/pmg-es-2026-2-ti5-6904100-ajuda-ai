import type { QueryRunner } from 'typeorm';
import { ChatMensagensImagem1795500000000 } from './1795500000000-ChatMensagensImagem.js';

function runner(
  imagens = 0,
  colunas: Array<{ column_name: string }> = [],
) {
  const executado: string[] = [];
  const qr = {
    connection: { options: { schema: 'feed' } },
    query: async (sql: string) => {
      if (sql.includes('information_schema.columns')) return colunas;
      if (sql.includes('SELECT count(*)'))
        return [{ imagens }];
      executado.push(sql);
      return [];
    },
  } as unknown as QueryRunner;
  return { qr, executado };
}

describe('ChatMensagensImagem', () => {
  const migration = new ChatMensagensImagem1795500000000();

  it('adiciona a chave privada da imagem às mensagens', async () => {
    const { qr, executado } = runner();
    await migration.up(qr);
    expect(executado).toEqual([
      'ALTER TABLE "feed"."mensagens_chat" ADD COLUMN "imagem_chave" varchar(1024)',
    ]);
  });

  it('não duplica a coluna caso uma migração anterior já a tenha criado', async () => {
    const { qr, executado } = runner(0, [{ column_name: 'imagem_chave' }]);
    await migration.up(qr);
    expect(executado).toEqual([]);
  });

  it('recusa rollback quando existem mensagens com imagens', async () => {
    await expect(migration.down(runner(2, [{ column_name: 'imagem_chave' }]).qr))
      .rejects.toThrow(/2 mensagem\(ns\) possuem imagem/);
  });

  it('remove a coluna somente quando não há imagens', async () => {
    const { qr, executado } = runner(0, [{ column_name: 'imagem_chave' }]);
    await migration.down(qr);
    expect(executado).toEqual([
      'ALTER TABLE "feed"."mensagens_chat" DROP COLUMN "imagem_chave"',
    ]);
  });
});
