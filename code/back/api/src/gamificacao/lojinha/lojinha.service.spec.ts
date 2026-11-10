import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import type { DataSource, QueryRunner } from 'typeorm';
import { type Aluno, LojinhaService } from './lojinha.service.js';

interface Cenario {
  /** Disponível agora; `null` = ilimitado. */
  estoque: number | null;
  saldo: number;
  anterior?: boolean;
  visivel?: boolean;
  limitePorAluno?: number | null;
  resgatesFeitos?: number;
  ativo?: boolean;
}

function banco({
  estoque,
  saldo,
  anterior = false,
  visivel = true,
  limitePorAluno = null,
  resgatesFeitos = 0,
  ativo = true,
}: Cenario) {
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
      if (sql.startsWith('SELECT 1 FROM') && sql.includes('"participacoes"'))
        return ativo ? [{}] : [];
      if (sql.includes('SELECT "saldo" FROM')) return [{ saldo }];
      if (sql.includes('FROM "gamificacao"."resgates" r JOIN'))
        return anterior
          ? [
              {
                id: 'anterior',
                recompensaId: 'item',
                versao: 1,
                nome: 'Caneca',
                descricao: 'Azul',
                custoXp: 30,
                condicoesRetirada: 'Secretaria',
                criadoEm: new Date(),
                saldoApos: 70,
              },
            ]
          : [];
      if (sql.includes('FROM "gamificacao"."recompensas" r WHERE r."id"')) {
        return visivel
          ? [
              {
                id: 'item',
                nome: 'Caneca',
                descricao: 'Azul',
                imagemUrl: null,
                custoXp: 30,
                estoque,
                condicoesRetirada: 'Secretaria',
                limitePorAluno,
                resgatesFeitos,
                disponivelAte: null,
                versao: 2,
              },
            ]
          : [];
      }
      if (sql.includes('INSERT INTO "gamificacao"."xp_movimentacoes"')) {
        return [{ id: '42', criado_em: new Date() }];
      }
      if (sql.includes('INSERT INTO "gamificacao"."resgates"')) {
        return [
          {
            id: 'resgate',
            recompensaId: 'item',
            versao: 2,
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
  const db = {
    options: { schema: 'feed' },
    createQueryRunner: () => qr,
    query: (sql: string) => qr.query(sql),
  } as unknown as DataSource;
  return { service: new LojinhaService(db), comandos };
}

const debitou = (comandos: string[]) =>
  comandos.some((sql) =>
    sql.includes('INSERT INTO "gamificacao"."xp_movimentacoes"'),
  );
const comprometeu = (comandos: string[]) =>
  comandos.some((sql) =>
    sql.includes('"estoque_comprometido" = "estoque_comprometido" + 1'),
  );

describe('LojinhaService.resgatar', () => {
  const chave = '123e4567-e89b-42d3-a456-426614174000';
  const aluno: Aluno = {
    id: 7,
    email: 'a@pucminas.edu.br',
    perfil: 'apadrinhado',
  };
  const vista = { versao: 2, custoXp: 30 };

  it('registra débito, estoque comprometido e resgate (com versão) na mesma transação', async () => {
    const { service, comandos } = banco({ estoque: 1, saldo: 100 });
    const resgate = await service.resgatar(aluno, 'item', chave, vista);
    expect(resgate).toMatchObject({ saldoApos: 70, versao: 2 });
    expect(comandos.some((sql) => sql.includes('FOR UPDATE'))).toBe(true);
    expect(comprometeu(comandos)).toBe(true);
    expect(comandos.at(-1)).toBe('COMMIT');
  });

  it('preço ou versão mudaram depois da revisão: 409 e nada é debitado', async () => {
    for (const visto of [
      { versao: 1, custoXp: 30 },
      { versao: 2, custoXp: 50 },
    ]) {
      const { service, comandos } = banco({ estoque: 5, saldo: 100 });
      await expect(
        service.resgatar(aluno, 'item', chave, visto),
      ).rejects.toThrow(ConflictException);
      expect(comandos).toContain('ROLLBACK');
      expect(debitou(comandos)).toBe(false);
      expect(comprometeu(comandos)).toBe(false);
    }
  });

  it('estoque ilimitado também conta o resgate como comprometido', async () => {
    const { service, comandos } = banco({ estoque: null, saldo: 100 });
    await service.resgatar(aluno, 'item', chave, vista);
    expect(comprometeu(comandos)).toBe(true);
  });

  it('desfaz a operação quando o estoque acaba', async () => {
    const { service, comandos } = banco({ estoque: 0, saldo: 100 });
    await expect(service.resgatar(aluno, 'item', chave, vista)).rejects.toThrow(
      ConflictException,
    );
    expect(comandos).toContain('ROLLBACK');
    expect(debitou(comandos)).toBe(false);
  });

  it('recompensa fora da vigência, do público ou despublicada: 404', async () => {
    const { service, comandos } = banco({
      estoque: 5,
      saldo: 100,
      visivel: false,
    });
    await expect(service.resgatar(aluno, 'item', chave, vista)).rejects.toThrow(
      NotFoundException,
    );
    expect(debitou(comandos)).toBe(false);
  });

  it('respeita o limite por aluno', async () => {
    const { service, comandos } = banco({
      estoque: 5,
      saldo: 100,
      limitePorAluno: 1,
      resgatesFeitos: 1,
    });
    await expect(service.resgatar(aluno, 'item', chave, vista)).rejects.toThrow(
      /limite de resgates/,
    );
    expect(debitou(comandos)).toBe(false);
  });

  it('não debita quando o saldo é insuficiente', async () => {
    const { service, comandos } = banco({ estoque: 1, saldo: 10 });
    await expect(service.resgatar(aluno, 'item', chave, vista)).rejects.toThrow(
      'Saldo de XP insuficiente.',
    );
    expect(comandos).toContain('ROLLBACK');
    expect(comprometeu(comandos)).toBe(false);
  });

  it('repetição da chave devolve o resgate anterior sem novo débito', async () => {
    const { service, comandos } = banco({
      estoque: 0,
      saldo: 150,
      anterior: true,
    });
    const resgate = await service.resgatar(aluno, 'item', chave, vista);
    expect(resgate.id).toBe('anterior');
    expect(resgate.saldoApos).toBe(70);
    expect(resgate.saldoAtual).toBe(150);
    expect(comandos.at(-1)).toBe('COMMIT');
    expect(debitou(comandos)).toBe(false);
  });

  it('sem participação ativa: 403 e nada é debitado', async () => {
    const { service, comandos } = banco({
      estoque: 5,
      saldo: 100,
      ativo: false,
    });
    await expect(service.resgatar(aluno, 'item', chave, vista)).rejects.toThrow(
      ForbiddenException,
    );
    expect(comandos).toContain('ROLLBACK');
    expect(debitou(comandos)).toBe(false);
  });

  it('sem participação ativa, lista e detalhe também recusam', async () => {
    const { service } = banco({ estoque: 5, saldo: 100, ativo: false });
    await expect(service.listar(aluno)).rejects.toThrow(ForbiddenException);
    await expect(service.detalhe(aluno, 'item')).rejects.toThrow(
      ForbiddenException,
    );
  });
});
