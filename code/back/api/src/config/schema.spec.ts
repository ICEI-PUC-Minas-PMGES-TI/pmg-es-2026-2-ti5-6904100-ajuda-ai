import { describe, expect, it, vi } from 'vitest';
import { garantirSchema, nomeSchemaSeguro } from './schema.js';

describe('nomeSchemaSeguro', () => {
  it('padrão feed e nomes simples', () => {
    expect(nomeSchemaSeguro(undefined)).toBe('feed');
    expect(nomeSchemaSeguro(' feed_homolog ')).toBe('feed_homolog');
  });
  it('recusa aspas, espaços, ponto e injeção', () => {
    for (const ruim of ['feed"; DROP SCHEMA public; --', 'a b', 'a.b', '1abc', '', 'x'.repeat(64)]) {
      expect(() => nomeSchemaSeguro(ruim)).toThrow(/DB_SCHEMA inválido/);
    }
  });
});

describe('garantirSchema', () => {
  it('banco novo: consulta e cria uma única vez', async () => {
    const executar = vi
      .fn()
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });
    expect(await garantirSchema(executar, 'feed')).toBe(true);
    expect(executar).toHaveBeenCalledTimes(2);
    expect(executar.mock.calls[1][0]).toBe('CREATE SCHEMA IF NOT EXISTS "feed"');
  });
  it('schema existente: só lê, nada é escrito', async () => {
    const executar = vi.fn().mockResolvedValueOnce({ rows: [{ '?column?': 1 }] });
    expect(await garantirSchema(executar, 'feed')).toBe(false);
    expect(executar).toHaveBeenCalledTimes(1);
    expect(executar.mock.calls[0][0]).toMatch(/^SELECT/);
  });
  it('nome inválido falha antes de qualquer SQL', async () => {
    const executar = vi.fn();
    await expect(garantirSchema(executar, 'x"y')).rejects.toThrow();
    expect(executar).not.toHaveBeenCalled();
  });
});
