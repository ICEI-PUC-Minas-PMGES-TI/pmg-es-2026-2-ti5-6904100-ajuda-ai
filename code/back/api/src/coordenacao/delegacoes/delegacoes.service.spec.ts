import type { ExecutionContext } from '@nestjs/common';
import { GUARDS_METADATA } from '@nestjs/common/constants.js';
import type { Reflector } from '@nestjs/core';
import type { DataSource } from 'typeorm';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard.js';
import { PucStopsAdminController } from '../../gamificacao/pucstops/pucstops-admin.controller.js';
import { MapaLocaisAdminController } from '../../mapa/mapa.controller.js';
import { DELEGACAO_KEY, DelegacaoGuard } from './delegacao.guard.js';
import {
  ehFuncionalidadeDelegavel,
  FUNCIONALIDADES_DELEGAVEIS,
} from './delegacoes.js';
import { DelegacoesService } from './delegacoes.service.js';

const COORDENADORA = 'renata@pucminas.edu.br';
const ALUNO = 12;

function prepararServico() {
  const query = vi.fn();
  const dados = { options: { schema: 'feed' }, query };
  return {
    query,
    servico: new DelegacoesService(dados as unknown as DataSource),
  };
}

function aluno() {
  return {
    perfil: 'padrinho',
    sub: String(ALUNO),
    email: 'aluno@pucminas.edu.br',
  };
}

function contexto(user: unknown): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
    getHandler: () => undefined,
    getClass: () => undefined,
  } as unknown as ExecutionContext;
}

function prepararGuard(
  funcionalidade: string | undefined,
  temDelegacao = false,
  usuarioId: number | null = ALUNO,
) {
  const reflector = {
    getAllAndOverride: vi.fn(() => funcionalidade),
  } as unknown as Reflector;
  const delegacoes = {
    temDelegacao: vi.fn(async () => temDelegacao),
  } as unknown as DelegacoesService;
  const dados = {
    options: { schema: 'feed' },
    query: vi.fn(async () =>
      usuarioId === null
        ? []
        : [{ id: usuarioId, email: 'aluno@pucminas.edu.br' }],
    ),
  } as unknown as DataSource;
  return {
    delegacoes,
    guard: new DelegacaoGuard(reflector, delegacoes, dados),
  };
}

describe(DelegacoesService.name, () => {
  it('lista a partir de usuarios, não de participacoes', async () => {
    const { query, servico } = prepararServico();
    query.mockResolvedValueOnce([
      {
        id: ALUNO,
        nome: 'Ana',
        email: 'ana@pucminas.edu.br',
        curso: 'Engenharia de Software',
        periodo: 3,
        status_cadastro: 'aprovado',
        papel: null,
        status: null,
        programa: null,
        delegacoes: ['mapa'],
      },
    ]);

    const [aluno] = await servico.listar();

    expect(query.mock.calls[0][0]).toContain('FROM "feed"."usuarios" us');
    expect(query.mock.calls[0][0]).toContain('LEFT JOIN LATERAL');
    expect(String(query.mock.calls[0][0])).toContain(
      'FROM "feed"."participacoes" p',
    );
    expect(aluno.participacaoAtual).toBeNull();
    expect(aluno.delegacoes).toEqual(['mapa']);
  });

  it('conceder grava quem concedeu a partir do token', async () => {
    const { query, servico } = prepararServico();
    query
      .mockResolvedValueOnce([{ id: ALUNO }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          id: ALUNO,
          nome: 'Ana',
          email: 'ana@pucminas.edu.br',
          curso: 'ES',
          periodo: 3,
          status_cadastro: 'aprovado',
          papel: null,
          status: null,
          programa: null,
          delegacoes: ['mapa'],
        },
      ])
      .mockResolvedValueOnce([]);

    await servico.conceder(ALUNO, 'mapa', COORDENADORA);

    const insercao = query.mock.calls.find(([sql]) =>
      String(sql).includes('INSERT INTO "feed"."delegacoes"'),
    );
    expect(insercao?.[1]).toEqual([ALUNO, 'mapa', COORDENADORA]);
  });

  it('recusa conceder duas vezes a mesma funcionalidade', async () => {
    const { query, servico } = prepararServico();
    query.mockResolvedValueOnce([{ id: ALUNO }]).mockRejectedValueOnce(
      Object.assign(new Error('duplicada'), {
        driverError: { code: '23505', constraint: 'uq_delegacao_ativa' },
      }),
    );

    await expect(
      servico.conceder(ALUNO, 'mapa', COORDENADORA),
    ).rejects.toMatchObject({ response: { motivo: 'ja-delegado' } });
  });

  it('revogar marca a linha existente em vez de apagá-la', async () => {
    const { query, servico } = prepararServico();
    query
      .mockResolvedValueOnce([{ id: 1 }])
      .mockResolvedValueOnce([
        {
          id: ALUNO,
          nome: 'Ana',
          email: 'ana@pucminas.edu.br',
          curso: 'ES',
          periodo: 3,
          status_cadastro: 'aprovado',
          papel: null,
          status: null,
          programa: null,
          delegacoes: [],
        },
      ])
      .mockResolvedValueOnce([]);

    await servico.revogar(ALUNO, 'mapa', COORDENADORA);

    const [sql, parametros] = query.mock.calls[0];
    expect(String(sql)).toContain('UPDATE');
    expect(String(sql)).toContain('"revogado_por" = $3');
    expect(String(sql)).not.toContain('DELETE');
    expect(parametros).toEqual([ALUNO, 'mapa', COORDENADORA]);
  });

  it.each([
    ['sem linhas', [] as unknown],
    ['no formato [linhas, total] do PostgreSQL', [[], 0] as unknown],
  ])('revogar o que não está ativo é 404 (%s)', async (_caso, retorno) => {
    const { query, servico } = prepararServico();
    query.mockResolvedValueOnce(retorno);

    await expect(
      servico.revogar(ALUNO, 'mapa', COORDENADORA),
    ).rejects.toMatchObject({ status: 404 });
  });
});

describe(DelegacaoGuard.name, () => {
  it('deixa a coordenação passar sem consultar delegação', async () => {
    const { delegacoes, guard } = prepararGuard('mapa');

    await expect(
      guard.canActivate(contexto({ perfil: 'coordenador' })),
    ).resolves.toBe(true);
    expect(delegacoes.temDelegacao).not.toHaveBeenCalled();
  });

  it('deixa passar o aluno com a funcionalidade delegada', async () => {
    const { guard } = prepararGuard('mapa', true);

    await expect(guard.canActivate(contexto(aluno()))).resolves.toBe(true);
  });

  it('barra o aluno sem a delegação daquela funcionalidade', async () => {
    const { guard } = prepararGuard('mapa', false);

    await expect(guard.canActivate(contexto(aluno()))).rejects.toMatchObject({
      status: 403,
    });
  });

  it('barra qualquer aluno em rota sem @PermiteDelegacao', async () => {
    const { delegacoes, guard } = prepararGuard(undefined, true);

    await expect(guard.canActivate(contexto(aluno()))).rejects.toMatchObject({
      status: 403,
    });
    expect(delegacoes.temDelegacao).not.toHaveBeenCalled();
  });

  it('barra quem tem token sem usuário correspondente', async () => {
    const { guard } = prepararGuard('mapa', true, null);

    await expect(guard.canActivate(contexto(aluno()))).rejects.toMatchObject({
      status: 403,
    });
  });

  it('consulta a delegação a cada requisição, sem cache', async () => {
    const { delegacoes, guard } = prepararGuard('mapa', true);
    const pedido = contexto(aluno());

    await guard.canActivate(pedido);
    await guard.canActivate(pedido);

    expect(delegacoes.temDelegacao).toHaveBeenCalledTimes(2);
  });
});

describe('metadado de delegação', () => {
  it('usa a mesma chave que o guard lê', () => {
    expect(DELEGACAO_KEY).toBe('delegacao');
  });
});

describe('rotas administrativas delegáveis', () => {
  it.each([
    ['PucStops', PucStopsAdminController],
    ['locais do mapa', MapaLocaisAdminController],
  ])('%s exige coordenação ou a delegação de mapa', (_nome, controller) => {
    expect(Reflect.getMetadata(DELEGACAO_KEY, controller)).toBe('mapa');
    expect(Reflect.getMetadata(GUARDS_METADATA, controller)).toEqual([
      JwtAuthGuard,
      DelegacaoGuard,
    ]);
  });

  it('a lista de funcionalidades delegáveis é fechada', () => {
    expect(FUNCIONALIDADES_DELEGAVEIS).toEqual(['mapa', 'chats']);
    expect(ehFuncionalidadeDelegavel('feed')).toBe(false);
  });
});
