import { ForbiddenException } from '@nestjs/common';
import type { DataSource, QueryRunner } from 'typeorm';
import {
  ehViolacaoUnica,
  registrarMovimentacao,
  travarCarteira,
  usuarioDoToken,
} from './gamificacao.js';

/** DataSource falso com a tabela `usuarios` em memória. */
function fonte(usuarios: Array<{ id: number; email: string }>) {
  const consultas: unknown[][] = [];
  const ds = {
    options: { schema: 'feed' },
    query: async (sql: string, parametros: unknown[]) => {
      consultas.push(parametros);
      expect(sql).toContain('"feed"."usuarios"');
      return usuarios.filter((u) => u.id === parametros[0]);
    },
  } as unknown as DataSource;
  return { ds, consultas };
}

describe('usuarioDoToken', () => {
  const banco = [
    { id: 1, email: 'camila@pucminas.edu.br' },
    { id: 3, email: 'ana.beatriz@pucminas.edu.br' },
  ];

  it('sub = usuarios.id com o mesmo e-mail', async () => {
    const { ds } = fonte(banco);
    await expect(
      usuarioDoToken(ds, { sub: '1', email: 'Camila@pucminas.edu.br' }),
    ).resolves.toBe(1);
  });

  it('coordenador mockado (sub "3" de outro e-mail) não vira a aluna 3', async () => {
    const { ds } = fonte(banco);
    await expect(
      usuarioDoToken(ds, { sub: '3', email: 'renata@pucminas.edu.br' }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it.each([
    '',
    'abc',
    '0',
    '-1',
    '1.5',
    '99999999999',
    ' 1',
    'camila@pucminas.edu.br',
  ])('sub inválido %j: 403 sem consultar o banco', async (sub) => {
    const { ds, consultas } = fonte(banco);
    await expect(
      usuarioDoToken(ds, { sub, email: 'camila@pucminas.edu.br' }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(consultas).toEqual([]);
  });

  it('usuário inexistente: 403', async () => {
    const { ds } = fonte(banco);
    await expect(
      usuarioDoToken(ds, { sub: '42', email: 'x@pucminas.edu.br' }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});

describe('ledger', () => {
  const semTransacao = {
    isTransactionActive: false,
    query: vi.fn(),
  } as unknown as QueryRunner;

  it('movimentação e trava exigem transação aberta', async () => {
    await expect(travarCarteira(semTransacao, 1)).rejects.toThrow(/transação/);
    await expect(
      registrarMovimentacao(semTransacao, {
        usuarioId: 1,
        quantidade: 10,
        tipo: 'PUCSTOP_CLAIM',
        referenciaTipo: null,
        referenciaId: null,
        descricao: 'x',
        chaveIdempotencia: 'x',
      }),
    ).rejects.toThrow(/transação/);
    expect(semTransacao.query).not.toHaveBeenCalled();
  });

  it.each([0, 1.5, Number.NaN])(
    'quantidade %s recusada',
    async (quantidade) => {
      await expect(
        registrarMovimentacao(semTransacao, {
          usuarioId: 1,
          quantidade,
          tipo: 'AJUSTE_ADMIN',
          referenciaTipo: null,
          referenciaId: null,
          descricao: 'x',
          chaveIdempotencia: 'x',
        }),
      ).rejects.toThrow(/Quantidade/);
    },
  );

  it('reconhece violação de UNIQUE pelo nome da constraint', () => {
    const erro = { driverError: { code: '23505', constraint: 'uq_x' } };
    expect(ehViolacaoUnica(erro)).toBe(true);
    expect(ehViolacaoUnica(erro, 'uq_x')).toBe(true);
    expect(ehViolacaoUnica(erro, 'uq_y')).toBe(false);
    expect(ehViolacaoUnica({ code: '23503' })).toBe(false);
    expect(ehViolacaoUnica(undefined)).toBe(false);
  });
});
