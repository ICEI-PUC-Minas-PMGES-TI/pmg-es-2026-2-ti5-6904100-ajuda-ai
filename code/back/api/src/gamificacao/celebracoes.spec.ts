import {
  CelebracaoIndisponivelError,
  celebracaoPara,
  confirmarCelebracao,
  nivelCelebrado,
} from './celebracoes.js';
import { NIVEIS, nivelDe } from './economia.js';
import { XpService } from './xp/xp.service.js';
import { CelebracoesNivel1795500000000 } from '../migrations/1795500000000-CelebracoesNivel.js';
import { LIMIARES_NIVEIS_V1, sqlNivelDe } from './celebracoes-sql.js';
import type { DataSource, QueryRunner } from 'typeorm';

/**
 * Banco em memória só com o que a celebração usa: XP acumulado por usuário
 * e a tabela `celebracoes_nivel` (com a semântica GREATEST do upsert).
 */
function bancoFalso(xp: Record<number, number>, celebrados: Record<number, number> = {}) {
  const sqls: string[] = [];
  const executor = {
    sqls,
    celebrados,
    xp,
    query: vi.fn(async (sql: string, params: unknown[] = []) => {
      sqls.push(sql);
      const [id, valor] = params as [number, number];
      if (sql.includes('FROM "gamificacao"."xp_carteiras"')) {
        return id in xp ? [{ xp_acumulado: xp[id], saldo: xp[id], atualizado_em: new Date() }] : [];
      }
      if (sql.startsWith('SELECT "nivel_celebrado"')) {
        return id in celebrados ? [{ nivel_celebrado: celebrados[id] }] : [];
      }
      if (sql.startsWith('INSERT INTO "gamificacao"."celebracoes_nivel"')) {
        celebrados[id] = Math.max(celebrados[id] ?? 0, valor);
        return [{ nivel_celebrado: celebrados[id] }];
      }
      if (sql.includes('"pucstop_coletas"') || sql.includes('"xp_movimentacoes"')) {
        return [{ totens: 0, geral: 0, semana: 0 }];
      }
      throw new Error(`SQL inesperado: ${sql}`);
    }),
  };
  return executor;
}

describe('celebração de nível: regra pura', () => {
  it('sem subida, nada a celebrar (inclusive ao recarregar a página)', () => {
    expect(celebracaoPara(3, 3)).toBeNull();
    expect(celebracaoPara(1, 1)).toBeNull();
  });

  it('subida de um nível: celebra o nível novo com o nome real', () => {
    expect(celebracaoPara(2, 1)).toEqual({
      de: 1,
      para: 2,
      nome: 'Curiosidade',
      niveisAvancados: 1,
    });
  });

  it('subida de vários níveis de uma vez: UMA celebração do nível final', () => {
    expect(celebracaoPara(5, 2)).toEqual({
      de: 2,
      para: 5,
      nome: 'Conexão',
      niveisAvancados: 3,
    });
  });

  it('XP reduzido por correção (nível abaixo do celebrado): sem celebração', () => {
    expect(celebracaoPara(4, 6)).toBeNull();
  });

  it('tabela ausente (migration pendente): sem celebração, sem erro', () => {
    expect(celebracaoPara(7, null)).toBeNull();
  });

  it.each(NIVEIS.slice(1).map((n) => [n.numero, n.nome] as const))(
    'nível %i tem celebração com o nome da tabela real (%s)',
    (numero, nome) => {
      expect(celebracaoPara(numero, numero - 1)?.nome).toBe(nome);
    },
  );
});

describe('celebração de nível: leitura e confirmação', () => {
  it('sem linha, o nível celebrado é 1 (todo aluno começa no nível 1)', async () => {
    expect(await nivelCelebrado(bancoFalso({ 7: 60 }), 7)).toBe(1);
  });

  it('tabela ausente (42P01) vira null; outros erros propagam', async () => {
    const ausente = { query: async () => Promise.reject({ code: '42P01' }) };
    expect(await nivelCelebrado(ausente, 1)).toBeNull();
    const outro = { query: async () => Promise.reject(new Error('rede')) };
    await expect(nivelCelebrado(outro, 1)).rejects.toThrow('rede');
  });

  it('confirma até o nível real e é idempotente', async () => {
    const banco = bancoFalso({ 7: 160 }); // nível 3
    expect(await confirmarCelebracao(banco, 7, 3)).toEqual({ nivelCelebrado: 3 });
    expect(await confirmarCelebracao(banco, 7, 3)).toEqual({ nivelCelebrado: 3 });
    expect(banco.celebrados[7]).toBe(3);
  });

  it('pedir um nível acima do real não adianta (limitado ao XP de verdade)', async () => {
    const banco = bancoFalso({ 7: 60 }); // nível 2
    expect(await confirmarCelebracao(banco, 7, 10)).toEqual({ nivelCelebrado: 2 });
  });

  it('nunca retrocede: confirmar um nível menor mantém o maior', async () => {
    const banco = bancoFalso({ 7: 600 }, { 7: 5 });
    expect(await confirmarCelebracao(banco, 7, 2)).toEqual({ nivelCelebrado: 5 });
  });

  it('o upsert usa GREATEST e não toca em XP, moedas nem ledger', async () => {
    const banco = bancoFalso({ 7: 600 });
    await confirmarCelebracao(banco, 7, 5);
    const escrita = banco.sqls.filter((s) => !s.startsWith('SELECT'));
    expect(escrita).toHaveLength(1);
    expect(escrita[0]).toMatch(/GREATEST/);
    expect(escrita.join()).not.toMatch(/xp_carteiras|xp_movimentacoes|pucstop_coletas/);
  });

  it('confirmar sem a tabela informa indisponibilidade', async () => {
    const banco = {
      query: async (sql: string) =>
        sql.startsWith('SELECT')
          ? [{ xp_acumulado: 100 }]
          : Promise.reject({ driverError: { code: '42P01' } }),
    };
    await expect(confirmarCelebracao(banco, 1, 2)).rejects.toBeInstanceOf(
      CelebracaoIndisponivelError,
    );
  });
});

describe('GET /me/xp devolve a celebração pendente', () => {
  it('detecta a transição e some depois da confirmação', async () => {
    const banco = bancoFalso({ 9: 320 }, { 9: 2 }); // nível 4, celebrou o 2
    const servico = new XpService(banco as unknown as DataSource);
    const antes = await servico.resumo(9);
    expect(antes.nivel.numero).toBe(4);
    expect(antes.celebracao).toEqual({
      de: 2,
      para: 4,
      nome: 'Descoberta',
      niveisAvancados: 2,
    });
    await servico.confirmarCelebracao(9, antes.celebracao!.para);
    const depois = await servico.resumo(9);
    expect(depois.celebracao).toBeNull();
    // Nível, XP e moedas continuam os mesmos: a confirmação não concede nada.
    expect(depois.nivel).toEqual(antes.nivel);
    expect(depois.xpAcumulado).toBe(antes.xpAcumulado);
    expect(depois.moedas).toBe(antes.moedas);
  });
});

describe('migration CelebracoesNivel', () => {
  it('a cópia congelada dos limiares é igual à tabela atual de níveis', () => {
    expect([...LIMIARES_NIVEIS_V1]).toEqual(NIVEIS.map((n) => n.xpMinimo));
  });

  it('o CASE do backfill classifica como nivelDe em todas as bordas', () => {
    const sql = sqlNivelDe('x');
    const avaliar = (xp: number) => {
      for (const m of sql.matchAll(/WHEN x >= (\d+) THEN (\d+)/g)) {
        if (xp >= Number(m[1])) return Number(m[2]);
      }
      return 1;
    };
    for (const n of NIVEIS) {
      for (const xp of [n.xpMinimo - 1, n.xpMinimo, n.xpMinimo + 1]) {
        if (xp < 0) continue;
        expect(avaliar(xp)).toBe(nivelDe(xp).numero);
      }
    }
    expect(avaliar(99_999)).toBe(10);
  });

  it('cria só a tabela nova e preenche o nível atual; down a remove', async () => {
    const executado: string[] = [];
    let existe = false;
    let comentario: string | null = null;
    const qr = {
      connection: { options: { schema: 'feed' } },
      query: async (sql: string) => {
        if (sql.includes('to_regclass')) return [{ existe }];
        if (sql.includes('obj_description')) return [{ comentario }];
        executado.push(sql);
        if (sql.startsWith('CREATE TABLE')) existe = true;
        const marca = /^COMMENT ON TABLE .* IS '(.*)'$/.exec(sql);
        if (marca) comentario = marca[1];
        return [];
      },
    } as unknown as QueryRunner;
    const migration = new CelebracoesNivel1795500000000();
    await migration.up(qr);
    expect(executado[0]).toMatch(/CREATE TABLE "gamificacao"\."celebracoes_nivel"/);
    expect(executado[0]).toMatch(/REFERENCES "feed"\."usuarios"/);
    expect(executado[1]).toMatch(/^INSERT INTO "gamificacao"\."celebracoes_nivel"/);
    expect(executado[2]).toMatch(/^COMMENT ON TABLE "gamificacao"\."celebracoes_nivel"/);
    // Nada além da tabela nova é alterado.
    expect(executado).toHaveLength(3);
    for (const sql of executado) expect(sql).not.toMatch(/^(ALTER|UPDATE|DELETE|DROP)/);
    executado.length = 0;
    await migration.down(qr);
    expect(executado).toEqual(['DROP TABLE "gamificacao"."celebracoes_nivel"']);
  });
});
