import { HTTP_CODE_METADATA } from '@nestjs/common/constants.js';
import type { DataSource } from 'typeorm';
import type { NotificacoesService } from '../notificacoes/notificacoes.service.js';
import { EncontrosController } from './encontros.controller.js';
import { recusa } from './encontros.js';
import { EncontrosService } from './encontros.service.js';

const PUCSTOP = '8f14e45f-ceea-467a-9c35-1b0b9c3f1a2b';
const ENCONTRO = '6f1c2b0e-3d7a-4c61-9a52-1b8e0f4d2a77';
const PADRINHO = 7;
const APADRINHADO = 9;

const inicio = new Date('2026-12-03T18:00:00.000Z');
const fim = new Date('2026-12-03T19:00:00.000Z');

function prepararServico() {
  const query = vi.fn();
  const manager = { query };
  const criar = vi.fn(async (_id: number, _aviso: unknown) => undefined);
  const dados = {
    options: { schema: 'feed' },
    query,
    manager,
    transaction: vi.fn(async (executar: (m: typeof manager) => unknown) =>
      executar(manager),
    ),
  };
  return {
    query,
    criar,
    servico: new EncontrosService(
      dados as unknown as DataSource,
      {
        criarParaUsuarios: async (
          _executor: unknown,
          usuarios: number[],
          aviso: unknown,
        ) => {
          for (const id of usuarios) await criar(id, aviso);
        },
      } as unknown as NotificacoesService,
    ),
  };
}

function linhaEncontro(extra: Record<string, unknown> = {}) {
  return {
    id: ENCONTRO,
    programa: '2026/2',
    organizador_id: PADRINHO,
    organizador_nome: 'Thiago',
    organizador_presenca: null,
    pucstop_id: PUCSTOP,
    pucstop_nome: 'Totem da Praça',
    pucstop_ativo: true,
    inicio,
    fim,
    descricao: null,
    status: 'agendado',
    cancelado_em: null,
    realizado: false,
    convites: [
      {
        usuarioId: APADRINHADO,
        nome: 'Camila',
        resposta: 'aceito',
        respondidoEm: '2026-12-01T12:00:00.000Z',
        presenteEm: null,
      },
    ],
    ...extra,
  };
}

const novo = {
  pucstopId: PUCSTOP,
  inicio: inicio.toISOString(),
  fim: fim.toISOString(),
  apadrinhadoIds: [APADRINHADO],
};

describe(EncontrosService.name, () => {
  it('recusa convidado sem vínculo ativo com o padrinho', async () => {
    const { query, servico } = prepararServico();
    query.mockResolvedValueOnce([{ id: APADRINHADO }]);

    await expect(
      servico.criar(PADRINHO, { ...novo, apadrinhadoIds: [APADRINHADO, 99] }),
    ).rejects.toMatchObject({
      response: { motivo: 'nao-vinculado', apadrinhadoIds: [99] },
    });
  });

  it('recusa PucStop desativado ao marcar o encontro', async () => {
    const { query, servico } = prepararServico();
    query
      .mockResolvedValueOnce([{ id: APADRINHADO }])
      .mockResolvedValueOnce([{ id: PUCSTOP, ativo: false }]);

    await expect(servico.criar(PADRINHO, novo)).rejects.toMatchObject({
      response: { motivo: 'pucstop-inativo' },
    });
  });

  it('recusa período invertido antes de tocar no banco', async () => {
    const { query, servico } = prepararServico();

    await expect(
      servico.criar(PADRINHO, { ...novo, fim: novo.inicio }),
    ).rejects.toMatchObject({ response: { motivo: 'periodo-invalido' } });
    expect(query).not.toHaveBeenCalled();
  });

  it('avisa os convidados ao criar o encontro', async () => {
    const { query, criar, servico } = prepararServico();
    query
      .mockResolvedValueOnce([{ id: APADRINHADO }])
      .mockResolvedValueOnce([{ id: PUCSTOP, ativo: true }])
      .mockResolvedValueOnce([{ id: ENCONTRO }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([linhaEncontro()]);

    const encontro = await servico.criar(PADRINHO, novo);

    expect(encontro.id).toBe(ENCONTRO);
    expect(criar).toHaveBeenCalledWith(
      APADRINHADO,
      expect.objectContaining({
        tipo: 'CONVITE_ENCONTRO',
        chave: `encontro-convite:${ENCONTRO}`,
      }),
    );
  });

  it('reabre os convites e avisa quando o horário muda', async () => {
    const { query, criar, servico } = prepararServico();
    const outroInicio = new Date('2026-12-04T18:00:00.000Z');
    query
      .mockResolvedValueOnce([
        {
          id: ENCONTRO,
          organizador_id: PADRINHO,
          pucstop_id: PUCSTOP,
          inicio,
          fim,
          descricao: null,
          status: 'agendado',
        },
      ])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([linhaEncontro({ inicio: outroInicio })]);

    await servico.editar(PADRINHO, ENCONTRO, {
      inicio: outroInicio.toISOString(),
      fim: new Date('2026-12-04T19:00:00.000Z').toISOString(),
    });

    const reabertura = query.mock.calls.find(([sql]) =>
      String(sql).includes(`SET "resposta" = 'pendente'`),
    );
    expect(reabertura).toBeDefined();
    expect(criar).toHaveBeenCalledWith(
      APADRINHADO,
      expect.objectContaining({ tipo: 'ENCONTRO_ALTERADO' }),
    );
  });

  it('não reabre convites quando só a descrição muda', async () => {
    const { query, criar, servico } = prepararServico();
    query
      .mockResolvedValueOnce([
        {
          id: ENCONTRO,
          organizador_id: PADRINHO,
          pucstop_id: PUCSTOP,
          inicio,
          fim,
          descricao: null,
          status: 'agendado',
        },
      ])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([linhaEncontro()]);

    await servico.editar(PADRINHO, ENCONTRO, { descricao: 'Levar caderno' });

    expect(
      query.mock.calls.some(([sql]) =>
        String(sql).includes(`SET "resposta" = 'pendente'`),
      ),
    ).toBe(false);
    expect(criar).not.toHaveBeenCalled();
  });

  it('não deixa mudar data ou local depois de alguém confirmar presença', async () => {
    const { query, servico } = prepararServico();
    query
      .mockResolvedValueOnce([
        {
          id: ENCONTRO,
          organizador_id: PADRINHO,
          pucstop_id: PUCSTOP,
          inicio,
          fim,
          descricao: null,
          status: 'agendado',
        },
      ])
      .mockResolvedValueOnce([{ '?column?': 1 }]);

    await expect(
      servico.editar(PADRINHO, ENCONTRO, {
        inicio: new Date('2026-12-05T18:00:00.000Z').toISOString(),
        fim: new Date('2026-12-05T19:00:00.000Z').toISOString(),
      }),
    ).rejects.toMatchObject({
      response: { motivo: 'encontro-com-presenca' },
    });
  });

  it('cancela sem apagar o encontro e avisa os convidados', async () => {
    const { query, criar, servico } = prepararServico();
    query
      .mockResolvedValueOnce([
        {
          id: ENCONTRO,
          organizador_id: PADRINHO,
          pucstop_id: PUCSTOP,
          inicio,
          fim,
          descricao: null,
          status: 'agendado',
        },
      ])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        linhaEncontro({ status: 'cancelado', cancelado_em: new Date() }),
      ]);

    const encontro = await servico.cancelar(
      PADRINHO,
      ENCONTRO,
      'thiago@pucminas.edu.br',
    );

    expect(encontro.status).toBe('cancelado');
    const update = query.mock.calls.find(([sql]) =>
      String(sql).includes(`SET "status" = 'cancelado'`),
    );
    expect(update).toBeDefined();
    expect(
      query.mock.calls.some(([sql]) => String(sql).includes('DELETE')),
    ).toBe(false);
    expect(criar).toHaveBeenCalledWith(
      APADRINHADO,
      expect.objectContaining({ tipo: 'ENCONTRO_CANCELADO' }),
    );
  });

  it('impede que um convidado altere o encontro do padrinho', async () => {
    const { query, servico } = prepararServico();
    query
      .mockResolvedValueOnce([
        {
          id: ENCONTRO,
          organizador_id: PADRINHO,
          pucstop_id: PUCSTOP,
          inicio,
          fim,
          descricao: null,
          status: 'agendado',
        },
      ])
      .mockResolvedValueOnce([{ '?column?': 1 }]);

    await expect(
      servico.editar(APADRINHADO, ENCONTRO, { descricao: 'tentativa' }),
    ).rejects.toMatchObject({ status: 403 });
  });

  it('não deixa responder convite depois de confirmar presença', async () => {
    const { query, servico } = prepararServico();
    query
      .mockResolvedValueOnce([{ id: ENCONTRO }])
      .mockResolvedValueOnce([
        { status: 'agendado', resposta: 'aceito', presenca: 1 },
      ]);

    await expect(
      servico.responder(APADRINHADO, ENCONTRO, { resposta: 'recusado' }),
    ).rejects.toMatchObject({
      response: { motivo: 'encontro-em-andamento' },
    });
  });

  it('não deixa responder convite de encontro cancelado', async () => {
    const { query, servico } = prepararServico();
    query
      .mockResolvedValueOnce([{ id: ENCONTRO }])
      .mockResolvedValueOnce([
        { status: 'cancelado', resposta: 'pendente', presenca: null },
      ]);

    await expect(
      servico.responder(APADRINHADO, ENCONTRO, { resposta: 'aceito' }),
    ).rejects.toMatchObject({ response: { motivo: 'encontro-cancelado' } });
  });
});

describe('contrato HTTP dos encontros', () => {
  it('cada motivo sai no status que o app espera', () => {
    const status = (motivo: Parameters<typeof recusa>[0]) =>
      recusa(motivo, 'mensagem').getStatus();

    expect(status('nao-vinculado')).toBe(403);
    expect(status('encontro-cancelado')).toBe(409);
    expect(status('encontro-com-presenca')).toBe(409);
    expect(status('encontro-em-andamento')).toBe(409);
    expect(status('convite-nao-aceito')).toBe(409);
    expect(status('pucstop-inativo')).toBe(422);
    expect(status('fora-da-janela')).toBe(422);
    expect(status('fora-do-local')).toBe(422);
    expect(status('localizacao-obrigatoria')).toBe(422);
  });

  it('o corpo do erro leva o motivo e os detalhes', () => {
    const erro = recusa('fora-do-local', 'longe', {
      distanciaMetros: 240,
      raioMetros: 60,
    });
    expect(erro.getResponse()).toMatchObject({
      statusCode: 422,
      motivo: 'fora-do-local',
      distanciaMetros: 240,
      raioMetros: 60,
    });
  });

  it.each(['cancelar', 'responder', 'confirmarPresenca'])(
    '%s responde 200',
    (metodo) => {
      expect(
        Reflect.getMetadata(
          HTTP_CODE_METADATA,
          EncontrosController.prototype[
            metodo as keyof EncontrosController
          ] as object,
        ),
      ).toBe(200);
    },
  );
});
