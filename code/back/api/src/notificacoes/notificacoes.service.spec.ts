import { NotFoundException } from '@nestjs/common';
import type { DataSource } from 'typeorm';
import {
  notificacaoMissaoNova,
  notificacaoNivel,
  notificacaoResgate,
} from './notificacoes.js';
import { NotificacoesService } from './notificacoes.service.js';

const ID = '4a3b2c1d-0e9f-4876-a5b4-c3d2e1f0a9b8';
const CRIADO = new Date('2026-11-17T15:20:41.000Z');
const LIDA = new Date('2026-11-17T15:30:00.000Z');

interface Registro {
  id: string;
  usuario_id: number;
  tipo: string;
  titulo: string;
  mensagem: string;
  link: string | null;
  chave: string;
  lida_em: Date | null;
  criado_em: Date;
}

function banco(inicial: Registro[] = [], falhar = false) {
  const linhas = [...inicial];
  const comandos: Array<[string, unknown[]]> = [];
  const query = async (sql: string, params: unknown[] = []) => {
    comandos.push([sql, params]);
    if (falhar) throw new Error('banco fora');
    if (sql.startsWith('SELECT count(*)')) {
      const total = linhas.filter(
        (l) => l.usuario_id === params[0] && l.lida_em === null,
      ).length;
      return [{ total }];
    }
    if (sql.startsWith('SELECT "id"')) {
      return linhas
        .filter((l) => l.usuario_id === params[0])
        .slice(0, Number(params[1]));
    }
    if (sql.startsWith('UPDATE') && sql.includes('"id" = $1')) {
      const alvo = linhas.filter(
        (l) => l.id === params[0] && l.usuario_id === params[1],
      );
      for (const l of alvo) l.lida_em ??= LIDA;
      return [alvo.map((l) => ({ id: l.id, lida_em: l.lida_em })), alvo.length];
    }
    if (sql.startsWith('UPDATE')) {
      const alvo = linhas.filter(
        (l) => l.usuario_id === params[0] && l.lida_em === null,
      );
      for (const l of alvo) l.lida_em = LIDA;
      return [alvo.map((l) => ({ id: l.id })), alvo.length];
    }
    if (sql.startsWith('INSERT INTO') && sql.includes('VALUES')) {
      const [usuario_id, tipo, titulo, mensagem, link, chave] = params as [
        number,
        string,
        string,
        string,
        string | null,
        string,
      ];
      if (
        !linhas.some((l) => l.usuario_id === usuario_id && l.chave === chave)
      ) {
        linhas.push({
          id: `n${linhas.length}`,
          usuario_id,
          tipo,
          titulo,
          mensagem,
          link,
          chave,
          lida_em: null,
          criado_em: CRIADO,
        });
      }
      return [];
    }
    return [];
  };
  const db = { options: { schema: 'feed' }, query } as unknown as DataSource;
  return { service: new NotificacoesService(db), linhas, comandos };
}

function registro(parcial: Partial<Registro>): Registro {
  return {
    id: ID,
    usuario_id: 7,
    tipo: 'NIVEL_SUBIU',
    titulo: 'Você subiu para o nível 5!',
    mensagem: 'Agora você é Conexão.',
    link: '/perfil',
    chave: 'nivel:5',
    lida_em: null,
    criado_em: CRIADO,
    ...parcial,
  };
}

describe('NotificacoesService', () => {
  it('lista só as do próprio usuário, com a contagem de não lidas', async () => {
    const { service } = banco([
      registro({}),
      registro({ id: 'b', chave: 'x', lida_em: LIDA }),
      registro({ id: 'c', usuario_id: 8, chave: 'y' }),
    ]);
    const r = await service.listar(7);
    expect(r.naoLidas).toBe(1);
    expect(r.itens.map((i) => i.id)).toEqual([ID, 'b']);
    expect(r.itens[0]).toEqual({
      id: ID,
      tipo: 'NIVEL_SUBIU',
      titulo: 'Você subiu para o nível 5!',
      mensagem: 'Agora você é Conexão.',
      link: '/perfil',
      lida: false,
      lidaEm: null,
      criadoEm: CRIADO.toISOString(),
    });
    expect(r.itens[1]).toMatchObject({
      lida: true,
      lidaEm: LIDA.toISOString(),
    });
    expect(r.itens[0]).not.toHaveProperty('chave');
    expect(r.itens[0]).not.toHaveProperty('usuarioId');
  });

  it('respeita o limite pedido', async () => {
    const { service, comandos } = banco();
    await service.listar(7, 5);
    const [, params] = comandos.find(([sql]) => sql.startsWith('SELECT "id"'))!;
    expect(params).toEqual([7, 5]);
  });

  it('marca como lida e devolve a nova contagem', async () => {
    const { service } = banco([
      registro({}),
      registro({ id: 'b', chave: 'x' }),
    ]);
    const r = await service.marcarLida(7, ID);
    expect(r).toEqual({
      id: ID,
      lida: true,
      lidaEm: LIDA.toISOString(),
      naoLidas: 1,
    });
  });

  it('marcar como lida é idempotente e mantém o lidaEm original', async () => {
    const antes = new Date('2026-11-10T00:00:00.000Z');
    const { service, comandos } = banco([registro({ lida_em: antes })]);
    const r = await service.marcarLida(7, ID);
    expect(r.lidaEm).toBe(antes.toISOString());
    const [sql] = comandos.find(([s]) => s.startsWith('UPDATE'))!;
    expect(sql).toContain('COALESCE("lida_em", now())');
  });

  it('não marca a notificação de outro usuário (404)', async () => {
    const { service, linhas } = banco([registro({ usuario_id: 8 })]);
    await expect(service.marcarLida(7, ID)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(linhas[0].lida_em).toBeNull();
  });

  it('id malformado é 404 sem ir ao banco', async () => {
    const { service, comandos } = banco();
    await expect(service.marcarLida(7, 'abc')).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(comandos).toEqual([]);
  });

  it('marca todas as não lidas do próprio usuário', async () => {
    const { service, linhas } = banco([
      registro({}),
      registro({ id: 'b', chave: 'x' }),
      registro({ id: 'c', usuario_id: 8, chave: 'y' }),
    ]);
    expect(await service.marcarTodas(7)).toEqual({
      atualizadas: 2,
      naoLidas: 0,
    });
    expect(linhas[2].lida_em).toBeNull();
  });

  it('criar não duplica o mesmo evento (chave única)', async () => {
    const { service, linhas, comandos } = banco();
    await service.criar(7, notificacaoNivel(500));
    await service.criar(7, notificacaoNivel(500));
    expect(linhas).toHaveLength(1);
    expect(comandos[0][0]).toContain(
      'ON CONFLICT ("usuario_id", "chave") DO NOTHING',
    );
  });

  it('falha ao notificar nunca derruba a operação principal', async () => {
    const { service } = banco([], true);
    await expect(
      service.criar(7, notificacaoNivel(500)),
    ).resolves.toBeUndefined();
    await expect(
      service.criarParaParticipantes(
        '2026/2',
        notificacaoMissaoNova({ id: ID, titulo: 'X', xp: 10 }),
      ),
    ).resolves.toBeUndefined();
  });

  it('missão nova vai só para participantes ativos do ciclo', async () => {
    const { service, comandos } = banco();
    await service.criarParaParticipantes(
      '2026/2',
      notificacaoMissaoNova({ id: ID, titulo: 'Visite a biblioteca', xp: 80 }),
    );
    const [sql, params] = comandos[0];
    expect(sql).toContain('"participacoes"');
    expect(sql).toContain('"termino_em" IS NULL');
    expect(sql).toContain("IN ('aprovado', 'em_andamento')");
    expect(params).toEqual([
      '2026/2',
      'MISSAO_NOVA',
      'Nova missão disponível',
      'Visite a biblioteca · 80 XP',
      '/missoes',
      `missao-nova:${ID}`,
    ]);
  });
});

describe('textos das notificações', () => {
  it('nível: nome atual e quanto falta para o próximo', () => {
    expect(notificacaoNivel(500)).toEqual({
      tipo: 'NIVEL_SUBIU',
      titulo: 'Você subiu para o nível 5!',
      mensagem: 'Agora você é Conexão. Faltam 250 XP para Parceria.',
      link: '/perfil',
      chave: 'nivel:5',
    });
  });

  it('resgate entregue e cancelado', () => {
    const resgate = { id: ID, nome: 'Caneca Ajuda-aí' };
    expect(notificacaoResgate('entregue', resgate)).toMatchObject({
      tipo: 'RESGATE_ENTREGUE',
      link: `/lojinha/resgates/${ID}`,
      chave: `resgate-entregue:${ID}`,
    });
    expect(notificacaoResgate('cancelado', resgate)).toMatchObject({
      tipo: 'RESGATE_CANCELADO',
      chave: `resgate-cancelado:${ID}`,
    });
  });
});
