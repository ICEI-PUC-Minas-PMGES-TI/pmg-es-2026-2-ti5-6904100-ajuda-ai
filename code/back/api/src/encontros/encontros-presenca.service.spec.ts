import type { DataSource } from 'typeorm';
import {
  CHECKIN_ANTECEDENCIA_MIN,
  RAIO_EVENTO_METROS,
} from '../gamificacao/missoes/missoes.js';
import { PRECISAO_MAXIMA_METROS } from '../gamificacao/pucstops/pucstops.service.js';
import type { RegrasXpService } from '../gamificacao/regras-xp/regras-xp.service.js';
import { EncontrosPresencaService } from './encontros-presenca.service.js';
import { ACAO_XP_ENCONTRO } from './encontros.js';

const ENCONTRO = '6f1c2b0e-3d7a-4c61-9a52-1b8e0f4d2a77';
const PADRINHO = 7;
const APADRINHADO = 9;

const leitura = { latitude: -19.92, longitude: -43.99, accuracy: 10 };

const regraVigente = {
  regraId: 1,
  versao: 1,
  valorXp: 20,
  elegibilidade: 'todos' as 'todos' | 'padrinho' | 'apadrinhado',
  limiteRepeticoes: null as number | null,
};

function encontroAgora(extra: Record<string, unknown> = {}) {
  const agora = Date.now();
  return {
    id: ENCONTRO,
    programa: '2026/2',
    organizador_id: PADRINHO,
    inicio: new Date(agora - 10 * 60_000),
    fim: new Date(agora + 50 * 60_000),
    status: 'agendado',
    convidado: false,
    aceito: false,
    distancia: 12,
    dentro: true,
    ...extra,
  };
}

interface Cenario {
  encontro?: Record<string, unknown>;
  regra?: typeof regraVigente | null;
  presentes?: number[];
  jaCreditados?: number[];
  creditosNoCiclo?: number;
  organizadorPresente?: boolean;
  convidadoPresente?: boolean;
  realizacaoNova?: boolean;
}

function prepararServico(cenario: Cenario = {}) {
  const {
    encontro = encontroAgora(),
    regra = regraVigente,
    presentes = [PADRINHO],
    jaCreditados = [],
    creditosNoCiclo = 0,
    organizadorPresente = true,
    convidadoPresente = false,
    realizacaoNova = true,
  } = cenario;

  const creditados: number[] = [];
  const travadas: number[] = [];
  const query = vi.fn(async (sql: string, parametros: unknown[] = []) => {
    const tem = (trecho: string) => sql.includes(trecho);
    if (tem('FROM "feed"."encontros" WHERE "id" = $1 FOR UPDATE')) {
      return [{ id: ENCONTRO }];
    }
    if (tem('ST_DWithin')) return [encontro];
    if (tem('xp_carteiras') && tem('INSERT INTO')) return [];
    if (tem('xp_carteiras') && tem('FOR UPDATE')) {
      travadas.push(parametros[0] as number);
      return [{ saldo: 0 }];
    }
    if (tem('xp_carteiras') && tem('UPDATE')) return [{ xp_acumulado: 60 }];
    if (tem('"xp_acumulado"') && tem('SELECT')) {
      return [{ saldo: 0, xp_acumulado: 0 }];
    }
    if (tem('encontro_presencas') && tem('INSERT INTO')) {
      return [{ confirmado_em: new Date() }];
    }
    if (tem('AS "organizador"')) {
      return [
        { organizador: organizadorPresente, convidados: convidadoPresente },
      ];
    }
    if (tem('encontro_realizacoes') && tem('INSERT INTO')) {
      return realizacaoNova ? [{ encontro_id: ENCONTRO }] : [];
    }
    if (tem('encontro_presencas') && tem('ORDER BY "usuario_id"')) {
      return presentes.map((usuario_id) => ({ usuario_id }));
    }
    if (tem('"chave_idempotencia" = $1')) {
      const chave = String(parametros[0]);
      return jaCreditados.some((id) => chave.endsWith(`usuario:${id}`))
        ? [{ existe: 1 }]
        : [];
    }
    if (tem('AS creditados')) return [{ creditados: creditosNoCiclo }];
    if (tem('AS totens')) return [{ totens: 0, geral: 0, semana: 0 }];
    if (tem('xp_movimentacoes') && tem('INSERT INTO')) {
      creditados.push(parametros[0] as number);
      return [{ id: '1', criado_em: new Date() }];
    }
    return [];
  });

  const qr = {
    connect: vi.fn(async () => undefined),
    startTransaction: vi.fn(async () => undefined),
    commitTransaction: vi.fn(async () => undefined),
    rollbackTransaction: vi.fn(async () => undefined),
    release: vi.fn(async () => undefined),
    isTransactionActive: true,
    query,
  };
  const configuracoesVigentes = vi.fn(async () =>
    regra ? [{ ...regra, acao: ACAO_XP_ENCONTRO, combinavelCom: [] }] : [],
  );
  const avisos: number[] = [];
  const servico = new EncontrosPresencaService(
    {
      options: { schema: 'feed' },
      createQueryRunner: () => qr,
    } as unknown as DataSource,
    { configuracoesVigentes } as unknown as RegrasXpService,
    {
      criar: vi.fn(async (usuarioId: number) => {
        avisos.push(usuarioId);
      }),
    } as never,
    {
      missoesCumpridasPorEncontro: vi.fn(async () => []),
      registrarMissoesDeEncontro: vi.fn(async () => undefined),
    } as never,
  );
  (servico as unknown as { geo: Promise<string> }).geo =
    Promise.resolve('"public"');
  return {
    query,
    creditados,
    travadas,
    avisos,
    configuracoesVigentes,
    servico,
  };
}

describe(EncontrosPresencaService.name, () => {
  it('recusa leitura com precisão insuficiente antes de gravar presença', async () => {
    const { query, servico } = prepararServico();

    await expect(
      servico.confirmar(PADRINHO, ENCONTRO, {
        ...leitura,
        accuracy: PRECISAO_MAXIMA_METROS + 1,
      }),
    ).rejects.toMatchObject({ response: { motivo: 'precisao-insuficiente' } });
    expect(
      query.mock.calls.some(([sql]) =>
        sql.includes('INSERT INTO "feed"."encontro_presencas"'),
      ),
    ).toBe(false);
  });

  it('recusa quem está fora do raio do PucStop', async () => {
    const { servico } = prepararServico({
      encontro: encontroAgora({ dentro: false, distancia: 240 }),
    });

    await expect(
      servico.confirmar(PADRINHO, ENCONTRO, leitura),
    ).rejects.toMatchObject({
      response: {
        motivo: 'fora-do-local',
        distanciaMetros: 240,
        raioMetros: RAIO_EVENTO_METROS,
      },
    });
  });

  it('recusa confirmação antes da janela abrir', async () => {
    const daquiAPouco = Date.now() + (CHECKIN_ANTECEDENCIA_MIN + 30) * 60_000;
    const { servico } = prepararServico({
      encontro: encontroAgora({
        inicio: new Date(daquiAPouco),
        fim: new Date(daquiAPouco + 3_600_000),
      }),
    });

    await expect(
      servico.confirmar(PADRINHO, ENCONTRO, leitura),
    ).rejects.toMatchObject({ response: { motivo: 'fora-da-janela' } });
  });

  it('recusa convidado que não aceitou o convite', async () => {
    const { servico } = prepararServico({
      encontro: encontroAgora({ convidado: true, aceito: false }),
    });

    await expect(
      servico.confirmar(APADRINHADO, ENCONTRO, leitura),
    ).rejects.toMatchObject({ response: { motivo: 'convite-nao-aceito' } });
  });

  it('recusa presença em encontro cancelado', async () => {
    const { servico } = prepararServico({
      encontro: encontroAgora({ status: 'cancelado' }),
    });

    await expect(
      servico.confirmar(PADRINHO, ENCONTRO, leitura),
    ).rejects.toMatchObject({ response: { motivo: 'encontro-cancelado' } });
  });

  it('não dá o encontro por realizado só com o padrinho presente', async () => {
    const { configuracoesVigentes, creditados, servico } = prepararServico({
      convidadoPresente: false,
    });

    const presenca = await servico.confirmar(PADRINHO, ENCONTRO, leitura);

    expect(presenca.encontroRealizado).toBe(false);
    expect(presenca.xpGanho).toBe(0);
    expect(creditados).toEqual([]);
    expect(configuracoesVigentes).not.toHaveBeenCalled();
  });

  it('credita padrinho e apadrinhado quando o segundo confirma', async () => {
    const { creditados, servico } = prepararServico({
      encontro: encontroAgora({ convidado: true, aceito: true }),
      convidadoPresente: true,
      presentes: [PADRINHO, APADRINHADO],
    });

    const presenca = await servico.confirmar(APADRINHADO, ENCONTRO, leitura);

    expect(presenca.encontroRealizado).toBe(true);
    expect(creditados).toEqual([PADRINHO, APADRINHADO]);
    expect(presenca.xpGanho).toBe(regraVigente.valorXp);
  });

  it('pula quem já recebeu o XP deste encontro', async () => {
    const { creditados, servico } = prepararServico({
      encontro: encontroAgora({ convidado: true, aceito: true }),
      convidadoPresente: true,
      presentes: [PADRINHO, APADRINHADO],
      jaCreditados: [PADRINHO],
    });

    await servico.confirmar(APADRINHADO, ENCONTRO, leitura);

    expect(creditados).toEqual([APADRINHADO]);
  });

  it('não credita ninguém sem regra de XP ativa para a ação', async () => {
    const { creditados, configuracoesVigentes, servico } = prepararServico({
      regra: null,
      convidadoPresente: true,
    });

    const presenca = await servico.confirmar(PADRINHO, ENCONTRO, leitura);

    expect(presenca.encontroRealizado).toBe(true);
    expect(presenca.xpGanho).toBe(0);
    expect(creditados).toEqual([]);
    expect(configuracoesVigentes).toHaveBeenCalledWith(
      [ACAO_XP_ENCONTRO, 'MISSAO_ENCONTRO'],
      expect.objectContaining({ isTransactionActive: true }),
    );
  });

  it('exige GPS com motivo, e não um 400 genérico', async () => {
    const { query, servico } = prepararServico();

    await expect(
      servico.confirmar(PADRINHO, ENCONTRO, { accuracy: 10 }),
    ).rejects.toMatchObject({
      status: 422,
      response: { motivo: 'localizacao-obrigatoria' },
    });
    await expect(
      servico.confirmar(PADRINHO, ENCONTRO, {
        latitude: -19.92,
        longitude: -43.99,
      }),
    ).rejects.toMatchObject({
      status: 422,
      response: { motivo: 'localizacao-obrigatoria' },
    });
    expect(
      query.mock.calls.some(([sql]) =>
        sql.includes('INSERT INTO "feed"."encontro_presencas"'),
      ),
    ).toBe(false);
  });

  it('trava o encontro antes de ler a resposta do convite', async () => {
    const { query, servico } = prepararServico({
      encontro: encontroAgora({ convidado: true, aceito: true }),
      convidadoPresente: true,
      presentes: [PADRINHO, APADRINHADO],
    });

    await servico.confirmar(APADRINHADO, ENCONTRO, leitura);

    const trava = query.mock.calls.findIndex(([sql]) =>
      String(sql).includes('FOR UPDATE'),
    );
    const convite = query.mock.calls.findIndex(([sql]) =>
      String(sql).includes(`c."resposta" = 'aceito'`),
    );
    expect(trava).toBeGreaterThanOrEqual(0);
    expect(trava).toBeLessThan(convite);
  });

  it('trava a carteira antes de contar o limite de repetições', async () => {
    const { query, servico } = prepararServico({
      regra: { ...regraVigente, limiteRepeticoes: 1 },
      convidadoPresente: true,
    });

    await servico.confirmar(PADRINHO, ENCONTRO, leitura);

    const trava = query.mock.calls.findIndex(
      ([sql]) =>
        String(sql).includes('xp_carteiras') &&
        String(sql).includes('FOR UPDATE'),
    );
    const contagem = query.mock.calls.findIndex(([sql]) =>
      String(sql).includes('AS creditados'),
    );
    expect(trava).toBeGreaterThanOrEqual(0);
    expect(trava).toBeLessThan(contagem);
  });

  it('respeita o limite de repetições já atingido no ciclo', async () => {
    const { creditados, servico } = prepararServico({
      regra: { ...regraVigente, limiteRepeticoes: 1 },
      convidadoPresente: true,
      creditosNoCiclo: 1,
    });

    const presenca = await servico.confirmar(PADRINHO, ENCONTRO, leitura);

    expect(creditados).toEqual([]);
    expect(presenca).toMatchObject({
      xpGanho: 0,
      xpConfigurado: regraVigente.valorXp,
      limiteAtingido: true,
    });
  });

  it('trava as carteiras sempre na ordem crescente de usuário', async () => {
    const { travadas, servico } = prepararServico({
      encontro: encontroAgora({ convidado: true, aceito: true }),
      convidadoPresente: true,
      presentes: [PADRINHO, APADRINHADO],
    });

    await servico.confirmar(APADRINHADO, ENCONTRO, leitura);

    expect(travadas).toEqual([...travadas].sort((a, b) => a - b));
  });

  it('não credita retroativo quando a realização já existia', async () => {
    const { creditados, servico } = prepararServico({
      encontro: encontroAgora({ convidado: true, aceito: true }),
      convidadoPresente: true,
      presentes: [PADRINHO, APADRINHADO, 11],
      realizacaoNova: false,
    });

    const presenca = await servico.confirmar(11, ENCONTRO, leitura);

    expect(presenca.encontroRealizado).toBe(true);
    expect(creditados).toEqual([11]);
  });

  it('avisa a subida de nível de quem confirmou antes', async () => {
    const { avisos, servico } = prepararServico({
      encontro: encontroAgora({ convidado: true, aceito: true }),
      convidadoPresente: true,
      presentes: [PADRINHO, APADRINHADO],
    });

    await servico.confirmar(APADRINHADO, ENCONTRO, leitura);

    expect(avisos).toEqual([PADRINHO, APADRINHADO]);
  });

  it('respeita a elegibilidade configurada na regra', async () => {
    const { creditados, servico } = prepararServico({
      regra: { ...regraVigente, elegibilidade: 'apadrinhado' },
      convidadoPresente: true,
      presentes: [PADRINHO],
    });

    const presenca = await servico.confirmar(PADRINHO, ENCONTRO, leitura);

    expect(presenca.xpGanho).toBe(0);
    expect(creditados).toEqual([]);
  });
});
