import { NotFoundException } from '@nestjs/common';
import type { DataSource } from 'typeorm';
import {
  notificacaoNivel,
  notificacaoResgate,
  notificacaoVinculo,
} from './notificacoes.js';
import { NotificacoesService } from './notificacoes.service.js';

const ID = '4a3b2c1d-0e9f-4876-a5b4-c3d2e1f0a9b8';
const MISSAO = '6f1c2b0e-3d7a-4c61-9a52-1b8e0f4d2a77';
const MISSAO_2 = '9d8c7b6a-5f4e-4d3c-8b2a-1f0e9d8c7b6a';
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

interface MissaoVisivel {
  id: string;
  titulo: string;
  xp: number;
}

function banco(
  inicial: Registro[] = [],
  falhar = false,
  missoes: MissaoVisivel[] = [],
) {
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
    if (sql.startsWith('SELECT m."id"')) {
      return missoes.filter(
        (m) =>
          !linhas.some(
            (l) =>
              l.usuario_id === params[0] && l.chave === `${params[2]}${m.id}`,
          ),
      );
    }
    if (sql.startsWith('SELECT "chave"')) {
      return linhas
        .filter(
          (l) =>
            l.usuario_id === params[0] &&
            l.chave.startsWith(String(params[1])),
        )
        .map((l) => ({ chave: l.chave }));
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
      const [usuario_id, ...colunas] = params as [number, ...unknown[]];
      for (let i = 0; i < colunas.length; i += 5) {
        const [tipo, titulo, mensagem, link, chave] = colunas.slice(
          i,
          i + 5,
        ) as [string, string, string, string | null, string];
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
    // Uma a mais para saber se há outra página (`temMais`).
    expect(params).toEqual([7, 6, null]);
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
      service.sincronizarMissoes(7, '2026/2'),
    ).resolves.toBeUndefined();
  });

  it('avisa as missões que o aluno já pode ver no ciclo', async () => {
    const { service, comandos, linhas } = banco([], false, [
      { id: MISSAO, titulo: 'Visite a biblioteca', xp: 80 },
      { id: MISSAO_2, titulo: 'Converse com seu padrinho', xp: 30 },
    ]);
    await service.sincronizarMissoes(7, '2026/2');
    const [sql, params] = comandos[0];
    expect(sql).toContain('"missoes" m');
    expect(sql).toContain('m."ciclo" = $2');
    expect(sql).toContain('m."ativa"');
    expect(sql).toContain('m."inicio" <= now()');
    expect(sql).toContain('m."fim" > now()');
    expect(sql).toContain('NOT EXISTS');
    expect(params).toEqual([7, '2026/2', 'missao-nova:']);
    expect(linhas.map((l) => [l.usuario_id, l.chave, l.mensagem])).toEqual([
      [7, `missao-nova:${MISSAO}`, 'Visite a biblioteca · 80 XP'],
      [7, `missao-nova:${MISSAO_2}`, 'Converse com seu padrinho · 30 XP'],
    ]);
  });

  it('só avisa missões abertas depois que o aluno entrou no ciclo', async () => {
    const { service, comandos } = banco();
    await service.sincronizarMissoes(7, '2026/2');
    const [sql] = comandos[0];
    expect(sql).toContain(
      'GREATEST(m."publicada_em", COALESCE(m."inicio", m."publicada_em")) >= (',
    );
    expect(sql).toContain('min(pa."criado_em") FROM "feed"."participacoes" pa');
    expect(sql).toContain('pa."programa" = $2');
    expect(comandos).toHaveLength(1);
  });

  it('grava os avisos de várias missões num INSERT só', async () => {
    const { service, comandos } = banco([], false, [
      { id: MISSAO, titulo: 'Visite a biblioteca', xp: 80 },
      { id: MISSAO_2, titulo: 'Converse com seu padrinho', xp: 30 },
    ]);
    await service.sincronizarMissoes(7, '2026/2');
    const inserts = comandos.filter(([sql]) => sql.startsWith('INSERT'));
    expect(inserts).toHaveLength(1);
    expect(inserts[0][0]).toContain(
      'VALUES ($1, $2, $3, $4, $5, $6), ($1, $7, $8, $9, $10, $11) ON CONFLICT',
    );
  });

  it('não repete o aviso da mesma missão', async () => {
    const { service, linhas } = banco([], false, [
      { id: MISSAO, titulo: 'Visite a biblioteca', xp: 80 },
    ]);
    await service.sincronizarMissoes(7, '2026/2');
    await service.sincronizarMissoes(7, '2026/2');
    expect(linhas).toHaveLength(1);
  });
});

describe('avisos de vínculo', () => {
  const avisos = (linhas: Registro[]) =>
    linhas.map((l) => [l.usuario_id, l.titulo, l.chave]);

  it('primeiro vínculo do ciclo: um aviso de boas-vindas', async () => {
    const { service, linhas, comandos } = banco();
    await service.sincronizarVinculo(7, '2026/2', 'apadrinhado', [21]);
    await service.sincronizarVinculo(7, '2026/2', 'apadrinhado', [21]);
    expect(avisos(linhas)).toEqual([
      [7, 'Seu padrinho foi definido!', 'vinculo:2026/2:21'],
    ]);
    expect(comandos[0][0]).toContain('starts_with("chave", $2)');
    expect(comandos[0][1]).toEqual([7, 'vinculo:2026/2:']);
  });

  it('trocar de padrinho no mesmo ciclo avisa de novo', async () => {
    const { service, linhas } = banco();
    await service.sincronizarVinculo(7, '2026/2', 'apadrinhado', [21]);
    await service.sincronizarVinculo(7, '2026/2', 'apadrinhado', [35]);
    await service.sincronizarVinculo(7, '2026/2', 'apadrinhado', [35]);
    expect(avisos(linhas)).toEqual([
      [7, 'Seu padrinho foi definido!', 'vinculo:2026/2:21'],
      [7, 'Você tem um novo padrinho!', 'vinculo:2026/2:35'],
    ]);
  });

  it('padrinho: novo apadrinhado no ciclo gera outro aviso; vários de uma vez, um para cada', async () => {
    const um = banco();
    await um.service.sincronizarVinculo(9, '2026/2', 'padrinho', [21]);
    await um.service.sincronizarVinculo(9, '2026/2', 'padrinho', [21, 22]);
    expect(avisos(um.linhas)).toEqual([
      [9, 'Seu apadrinhamento começou!', 'vinculo:2026/2:21'],
      [9, 'Você tem um novo apadrinhado!', 'vinculo:2026/2:22'],
    ]);
    const dois = banco();
    await dois.service.sincronizarVinculo(9, '2026/2', 'padrinho', [21, 22]);
    expect(avisos(dois.linhas)).toEqual([
      [9, 'Você tem um novo apadrinhado!', 'vinculo:2026/2:21'],
      [9, 'Você tem um novo apadrinhado!', 'vinculo:2026/2:22'],
    ]);
  });

  it('aviso de outro ciclo não conta, e sem dupla não consulta o banco', async () => {
    const { service, linhas, comandos } = banco([
      registro({
        id: 'antigo',
        usuario_id: 7,
        tipo: 'VINCULO_CONFIRMADO',
        chave: 'vinculo:2026/1:21',
      }),
    ]);
    await service.sincronizarVinculo(7, '2026/2', 'apadrinhado', []);
    expect(comandos).toHaveLength(0);
    await service.sincronizarVinculo(7, '2026/2', 'apadrinhado', [21]);
    expect(linhas.at(-1)).toMatchObject({
      titulo: 'Seu padrinho foi definido!',
      chave: 'vinculo:2026/2:21',
    });
  });

  it('falha ao avisar vínculo não derruba o sino', async () => {
    const { service } = banco([], true);
    await expect(
      service.sincronizarVinculo(7, '2026/2', 'padrinho', [21]),
    ).resolves.toBeUndefined();
  });
});

describe('textos das notificações', () => {
  it('vínculo: boas-vindas no primeiro, troca de dupla nos seguintes', () => {
    expect(notificacaoVinculo('2026/2', 'apadrinhado', 21)).toEqual({
      tipo: 'VINCULO_CONFIRMADO',
      titulo: 'Seu padrinho foi definido!',
      mensagem:
        'Conheça quem vai te acompanhar neste semestre e mande a primeira mensagem.',
      link: '/dupla?ciclo=2026%2F2',
      chave: 'vinculo:2026/2:21',
    });
    expect(notificacaoVinculo('2026/2', 'apadrinhado', 35, false)).toMatchObject({
      titulo: 'Você tem um novo padrinho!',
      mensagem:
        'A coordenação mudou quem vai te acompanhar neste semestre. Conheça e mande a primeira mensagem.',
    });
    expect(notificacaoVinculo('2026/2', 'padrinho', 21)).toMatchObject({
      titulo: 'Seu apadrinhamento começou!',
    });
    expect(notificacaoVinculo('2026/2', 'padrinho', 22, false)).toMatchObject({
      titulo: 'Você tem um novo apadrinhado!',
      mensagem: 'Veja quem chegou e mande a primeira mensagem.',
    });
  });

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
      mensagem: 'Seu resgate de Caneca Ajuda-aí foi entregue.',
      link: `/lojinha/resgates/${ID}`,
      chave: `resgate-entregue:${ID}`,
    });
    expect(notificacaoResgate('cancelado', resgate)).toMatchObject({
      tipo: 'RESGATE_CANCELADO',
      mensagem:
        'Seu resgate de Caneca Ajuda-aí foi cancelado e as moedas voltaram para a sua carteira.',
      chave: `resgate-cancelado:${ID}`,
    });
  });
});
