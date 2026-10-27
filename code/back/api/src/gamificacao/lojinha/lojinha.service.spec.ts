import { ConflictException } from '@nestjs/common';
import type { DataSource, QueryRunner } from 'typeorm';
import { LojinhaService } from './lojinha.service.js';

function banco(estoque: number | null, saldo: number, anterior = false) {
  const comandos: string[] = [];
  const qr = {
    isTransactionActive: true,
    connect: async () => {},
    startTransaction: async () => {},
    commitTransaction: async () => {
      comandos.push('COMMIT');
    },
    rollbackTransaction: async () => {
      comandos.push('ROLLBACK');
    },
    release: async () => {},
    query: async (sql: string) => {
      comandos.push(sql);
      if (sql.includes('SELECT "saldo" FROM')) return [{ saldo }];
      if (sql.includes('FROM "gamificacao"."resgates"'))
        return anterior
          ? [
              {
                id: 'anterior',
                recompensaId: 'item',
                nome: 'Caneca',
                descricao: 'Azul',
                custoXp: 30,
                condicoesRetirada: 'Secretaria',
                criadoEm: new Date(),
                saldoApos: 70,
              },
            ]
          : [];
      if (sql.includes('FROM "gamificacao"."recompensas"')) {
        return [
          {
            id: 'item',
            nome: 'Caneca',
            descricao: 'Azul',
            custoXp: 30,
            estoque,
            condicoesRetirada: 'Secretaria',
            publicada: true,
          },
        ];
      }
      if (sql.includes('INSERT INTO "gamificacao"."xp_movimentacoes"')) {
        return [{ id: '42', criado_em: new Date() }];
      }
      if (sql.includes('INSERT INTO "gamificacao"."resgates"')) {
        return [
          {
            id: 'resgate',
            recompensaId: 'item',
            nome: 'Caneca',
            descricao: 'Azul',
            custoXp: 30,
            condicoesRetirada: 'Secretaria',
            criadoEm: new Date(),
          },
        ];
      }
      return [];
    },
  } as unknown as QueryRunner;
  const db = { createQueryRunner: () => qr } as unknown as DataSource;
  return { service: new LojinhaService(db), comandos };
}

describe('LojinhaService.resgatar', () => {
  const chave = '123e4567-e89b-42d3-a456-426614174000';

  it('registra débito, estoque e resgate na mesma transação', async () => {
    const { service, comandos } = banco(1, 100);
    const resgate = await service.resgatar(7, 'item', chave);
    expect(resgate.saldoApos).toBe(70);
    expect(comandos.some((sql) => sql.includes('FOR UPDATE'))).toBe(true);
    expect(
      comandos.some((sql) => sql.includes('"estoque" = "estoque" - 1')),
    ).toBe(true);
    expect(comandos.at(-1)).toBe('COMMIT');
  });

  it('desfaz a operação quando o estoque acaba', async () => {
    const { service, comandos } = banco(0, 100);
    await expect(service.resgatar(7, 'item', chave)).rejects.toThrow(
      ConflictException,
    );
    expect(comandos).toContain('ROLLBACK');
    expect(
      comandos.some((sql) =>
        sql.includes('INSERT INTO "gamificacao"."xp_movimentacoes"'),
      ),
    ).toBe(false);
  });

  it('não debita quando o saldo é insuficiente', async () => {
    const { service, comandos } = banco(1, 10);
    await expect(service.resgatar(7, 'item', chave)).rejects.toThrow(
      'Saldo de XP insuficiente.',
    );
    expect(comandos).toContain('ROLLBACK');
    expect(
      comandos.some((sql) => sql.includes('"estoque" = "estoque" - 1')),
    ).toBe(false);
  });

  it('repetição da chave devolve o resgate anterior sem novo débito', async () => {
    const { service, comandos } = banco(0, 150, true);
    const resgate = await service.resgatar(7, 'item', chave);
    expect(resgate.id).toBe('anterior');
    expect(resgate.saldoApos).toBe(70);
    expect(resgate.saldoAtual).toBe(150);
    expect(comandos.at(-1)).toBe('COMMIT');
    expect(
      comandos.some((sql) =>
        sql.includes('INSERT INTO "gamificacao"."xp_movimentacoes"'),
      ),
    ).toBe(false);
  });
});
