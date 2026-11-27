import type { QueryRunner } from 'typeorm';
import { ChatGruposAcesso1794500000000 } from './1794500000000-ChatGruposAcesso.js';

describe('Migração de conversas e acesso temporal', () => {
  it('importa somente privados canônicos, cria coletivos por ID e preserva mensagens', async () => {
    const sql: string[] = [];
    const qr = {
      connection: { options: { schema: 'teste' } },
      query: async (q: string) => sql.push(q),
    } as unknown as QueryRunner;
    await new ChatGruposAcesso1794500000000().up(qr);
    const codigo = sql.join('\n');
    expect(codigo).toContain('"teste".chat_periodos');
    expect(codigo).toContain('uq_chat_grupo');
    expect(codigo).toContain('uq_chat_mensagem_cliente');
    expect(codigo).toContain('v.padrinho_participacao_id');
    expect(codigo).toContain('p.usuario_id<>a.usuario_id');
    const recibos = sql.find((q) =>
      q.startsWith('INSERT INTO "teste".chat_destinatarios'),
    )!;
    expect(recibos).toContain("c.tipo='privado'");
    expect(recibos).toContain('p.participacao_id<>m.remetente_participacao_id');
    expect(codigo).not.toMatch(
      /DELETE FROM|TRUNCATE|DROP TABLE|UPDATE .*mensagens_chat/i,
    );
    expect(codigo).toContain('chat_conciliacao');
  });
  it('escapa o schema e impede reversão destrutiva automática', async () => {
    const sql: string[] = [];
    const qr = {
      connection: { options: { schema: 'a"b' } },
      query: async (q: string) => sql.push(q),
    } as unknown as QueryRunner;
    const migration = new ChatGruposAcesso1794500000000();
    await migration.up(qr);
    expect(sql[0]).toContain('"a""b"');
    await expect(migration.down(qr)).rejects.toThrow(/backup/);
  });
});
