import { randomUUID } from 'node:crypto';
import * as executor from '../src/matching/matching.executor.js';
import { ProgramaEntity } from '../src/programas/entities/programa.entity.js';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import {
  bancoMatchingIsolado,
  semearCenarioMatching,
  servicosMatching,
} from './helpers/matching-postgres.js';
import {
  MatchingConfiguracaoEntity,
  MatchingExecucaoEntity,
  MatchingVinculoEntity,
  MatchingSugestaoEntity,
} from '../src/matching/entities/matching.entity.js';
import { MatchingVinculoEventoEntity } from '../src/matching/entities/grupo.entity.js';
import {
  ChatEntity,
  ChatPeriodoEntity,
  ChatDestinatarioEntity,
  MensagemChatEntity,
} from '../src/chat/entities/chat.entity.js';

describe.skipIf(
  !process.env.MATCHING_TEST_DB_URL ||
    process.env.MATCHING_TEST_DB_ISOLATED !== 'true',
)('Matching: PostgreSQL real e conexões independentes', () => {
  let banco: Awaited<ReturnType<typeof bancoMatchingIsolado>>;
  const autor = 'coord@teste.local';
  const transferir = (padrinhoDestinoId: number) => ({
    padrinhoDestinoId,
    motivo: 'Reorganização justificada',
    operacaoId: randomUUID(),
  });
  beforeEach(async () => {
    banco = await bancoMatchingIsolado();
  }, 90_000);
  afterEach(async () => {
    vi.restoreAllMocks();
    await banco?.limpar();
  }, 30_000);
  async function segundaConexao() {
    await banco.outra.initialize();
    return servicosMatching(banco.outra);
  }

  it.each(['vinculo', 'configuracao', 'encerramento'] as const)(
    'libera o ciclo durante o cálculo e recusa publicação após mudança de %s',
    async (mudanca) => {
      const c = await semearCenarioMatching(banco.dados);
      const origem = (await c.operacoes.vincular(c.a[0].id, c.p[0].id, autor))
        .vinculo;
      const outra = await segundaConexao();
      const grupo = await banco.dados
        .getRepository(ChatEntity)
        .findOneByOrFail({ tipo: 'coletivo', grupoId: origem.grupoId! });
      let iniciou!: () => void, liberar!: () => void;
      const inicio = new Promise<void>((r) => {
          iniciou = r;
        }),
        espera = new Promise<void>((r) => {
          liberar = r;
        });
      const real = executor.alocarMatchingAssincrono;
      vi.spyOn(executor, 'alocarMatchingAssincrono').mockImplementationOnce(
        async (...args) => {
          iniciou();
          await espera;
          return real(...args);
        },
      );
      const rodada = c.matching.executar(c.programa.codigo, autor);
      // Instala o handler antes de liberar o cálculo para não deixar rejeição sem consumidor.
      const resultado = rodada.then(
        (valor) => ({ valor, erro: null }),
        (erro) => ({ valor: null, erro }),
      );
      await inicio;
      try {
        await outra.chat.enviarMensagem(
          grupo.id,
          c.p[0].usuarioId,
          'API disponível durante o cálculo',
          randomUUID(),
        );
        if (mudanca === 'vinculo')
          await outra.operacoes.vincular(c.a[1].id, c.p[1].id, autor);
        else if (mudanca === 'encerramento')
          await banco.outra
            .getRepository(ProgramaEntity)
            .update(c.programa.id, { etapaAtual: 'encerramento' });
        else {
          const config = await outra.matching.obterConfiguracao(
            c.programa.codigo,
          );
          await outra.matching.salvarConfiguracao(
            {
              programa: c.programa.codigo,
              versaoBase: config!.versao,
              liberado: true,
              capacidadePorPadrinho: 4,
              capacidadePorApadrinhado: 1,
              criterios: config!.criterios,
            },
            autor,
          );
        }
      } finally {
        liberar();
      }
      expect((await resultado).erro).toBeInstanceOf(Error);
      expect(
        await banco.dados.getRepository(MatchingSugestaoEntity).count(),
      ).toBe(0);
      expect(
        await banco.dados
          .getRepository(MatchingExecucaoEntity)
          .countBy({ status: 'falha' }),
      ).toBe(1);
    },
    30_000,
  );

  it('aplica as 14 migrações em schema vazio e repetir não altera o banco', async () => {
    expect(await banco.dados.showMigrations()).toBe(false);
    expect(await banco.dados.runMigrations()).toEqual([]);
    const [{ total }] = await banco.dados.query(
      `SELECT count(*)::int AS total FROM "${banco.schema}".migrations`,
    );
    expect(total).toBe(14);
    expect(banco.dados.options.synchronize).toBe(false);
  });
  it('aprovação sugerida e vínculo manual disputam a última vaga entre pools', async () => {
    const { programa, p, a, matching } = await semearCenarioMatching(
      banco.dados,
      1,
      1,
      2,
    );
    const outra = await segundaConexao();
    const rodada = await matching.executar(programa.codigo, autor);
    const sugestao = await banco.dados
      .getRepository(MatchingSugestaoEntity)
      .findOneByOrFail({ execucaoId: rodada.id });
    const aluno = a.find((v) => v.id !== sugestao.apadrinhadoParticipacaoId)!;
    const r = await Promise.allSettled([
      matching.aprovar(sugestao.id, autor),
      outra.operacoes.vincular(aluno.id, p[0].id, 'coord2@teste.local'),
    ]);
    expect(r.filter((v) => v.status === 'fulfilled')).toHaveLength(1);
    expect(
      await banco.dados
        .getRepository(MatchingVinculoEntity)
        .countBy({ ativo: true }),
    ).toBe(1);
    expect(
      await banco.dados.getRepository(ChatEntity).countBy({ tipo: 'privado' }),
    ).toBe(1);
    expect(
      await banco.dados.getRepository(ChatEntity).countBy({ tipo: 'coletivo' }),
    ).toBe(1);
  });
  it('transferências disputam vaga sem perder a origem da operação rejeitada', async () => {
    const { p, a, operacoes } = await semearCenarioMatching(
      banco.dados,
      1,
      3,
      2,
    );
    const v1 = (await operacoes.vincular(a[0].id, p[0].id, autor)).vinculo;
    const v2 = (await operacoes.vincular(a[1].id, p[1].id, autor)).vinculo;
    const outra = await segundaConexao();
    const r = await Promise.allSettled([
      operacoes.transferir(v1.id, transferir(p[2].id), autor),
      outra.operacoes.transferir(v2.id, transferir(p[2].id), autor),
    ]);
    expect(r.filter((v) => v.status === 'fulfilled')).toHaveLength(1);
    const ativos = await banco.dados
      .getRepository(MatchingVinculoEntity)
      .findBy({ ativo: true });
    expect(ativos).toHaveLength(2);
    expect(
      ativos.filter((v) => v.padrinhoParticipacaoId === p[2].id),
    ).toHaveLength(1);
    expect(
      ativos.some((v) => v.id === (r[0].status === 'rejected' ? v1.id : v2.id)),
    ).toBe(true);
  });
  it('UUID concorrente de transferência gera um destino e um evento', async () => {
    const { p, a, operacoes } = await semearCenarioMatching(banco.dados);
    const origem = (await operacoes.vincular(a[0].id, p[0].id, autor)).vinculo;
    const outra = await segundaConexao(),
      dto = transferir(p[1].id);
    const r = await Promise.all([
      operacoes.transferir(origem.id, dto, autor),
      outra.operacoes.transferir(origem.id, dto, autor),
    ]);
    expect(r[0].destino!.id).toBe(r[1].destino!.id);
    expect(
      await banco.dados
        .getRepository(MatchingVinculoEventoEntity)
        .countBy({ operacaoId: dto.operacaoId }),
    ).toBe(1);
    expect(
      await banco.dados
        .getRepository(MatchingVinculoEntity)
        .countBy({ ativo: true }),
    ).toBe(1);
  });
  it('falha no chat faz rollback de vínculo, períodos e auditoria no PostgreSQL', async () => {
    const { p, a, operacoes, chat } = await semearCenarioMatching(banco.dados);
    const origem = (await operacoes.vincular(a[0].id, p[0].id, autor)).vinculo;
    const periodos = await banco.dados.getRepository(ChatPeriodoEntity).find();
    const dto = transferir(p[1].id);
    vi.spyOn(chat, 'criarParaVinculo').mockRejectedValueOnce(
      new Error('Falha controlada no chat'),
    );
    await expect(operacoes.transferir(origem.id, dto, autor)).rejects.toThrow(
      'Falha controlada',
    );
    expect(
      await banco.dados
        .getRepository(MatchingVinculoEntity)
        .findOneByOrFail({ id: origem.id }),
    ).toMatchObject({ ativo: true });
    expect(await banco.dados.getRepository(ChatPeriodoEntity).find()).toEqual(
      periodos,
    );
    expect(
      await banco.dados
        .getRepository(MatchingVinculoEventoEntity)
        .countBy({ operacaoId: dto.operacaoId }),
    ).toBe(0);
    expect(
      (await operacoes.transferir(origem.id, dto, autor)).destino!
        .padrinhoParticipacaoId,
    ).toBe(p[1].id);
  });
  it('entrada, transferência e retorno preservam lacuna, recibos e envio idempotente', async () => {
    const { p, a, operacoes, chat } = await semearCenarioMatching(banco.dados);
    const v = (await operacoes.vincular(a[0].id, p[0].id, autor)).vinculo;
    const grupo = await banco.dados
      .getRepository(ChatEntity)
      .findOneByOrFail({ tipo: 'coletivo', grupoId: v.grupoId! });
    await chat.enviarMensagem(
      grupo.id,
      p[0].usuarioId,
      'Antes da segunda entrada',
      randomUUID(),
    );
    await operacoes.vincular(a[1].id, p[0].id, autor);
    const durante = await chat.enviarMensagem(
      grupo.id,
      p[0].usuarioId,
      'Durante a participação',
      randomUUID(),
    );
    const fora = await operacoes.transferir(v.id, transferir(p[1].id), autor);
    await chat.enviarMensagem(
      grupo.id,
      p[0].usuarioId,
      'Durante a ausência',
      randomUUID(),
    );
    await operacoes.transferir(fora.destino!.id, transferir(p[0].id), autor);
    const retorno = await chat.enviarMensagem(
      grupo.id,
      p[0].usuarioId,
      'Depois do retorno',
      randomUUID(),
    );
    const outra = await segundaConexao();
    await Promise.all([
      chat.listarMensagens(grupo.id, a[0].usuarioId),
      outra.chat.listarMensagens(grupo.id, a[1].usuarioId),
    ]);
    expect(
      (await chat.listarMensagens(grupo.id, a[0].usuarioId)).mensagens.map(
        (m) => m.texto,
      ),
    ).toEqual([
      'Antes da segunda entrada',
      'Durante a participação',
      'Depois do retorno',
    ]);
    expect(
      (await chat.listarMensagens(grupo.id, a[1].usuarioId)).mensagens.map(
        (m) => m.texto,
      ),
    ).toEqual([
      'Durante a participação',
      'Durante a ausência',
      'Depois do retorno',
    ]);
    expect(
      await banco.dados
        .getRepository(ChatDestinatarioEntity)
        .countBy({ mensagemId: retorno.id }),
    ).toBe(2);
    expect(
      (
        await banco.dados
          .getRepository(ChatDestinatarioEntity)
          .findBy({ mensagemId: durante.id })
      ).every((r) => r.lidaEm),
    ).toBe(true);
    const pedido = randomUUID();
    const r = await Promise.all([
      chat.enviarMensagem(grupo.id, p[0].usuarioId, 'Envio repetido', pedido),
      outra.chat.enviarMensagem(
        grupo.id,
        p[0].usuarioId,
        'Envio repetido',
        pedido,
      ),
    ]);
    expect(r[0].id).toBe(r[1].id);
    expect(
      await banco.dados
        .getRepository(MensagemChatEntity)
        .countBy({ clientId: pedido }),
    ).toBe(1);
  });
  it('configurações da mesma versão concorrentes não se sobrescrevem', async () => {
    const { programa, matching } = await semearCenarioMatching(banco.dados);
    const outra = await segundaConexao(),
      base = await matching.obterConfiguracao(programa.codigo);
    const dto = {
      programa: programa.codigo,
      versaoBase: base!.versao,
      liberado: true,
      capacidadePorPadrinho: 3,
      capacidadePorApadrinhado: 1,
      criterios: base!.criterios,
    };
    const r = await Promise.allSettled([
      matching.salvarConfiguracao(dto, autor),
      outra.matching.salvarConfiguracao(
        { ...dto, capacidadePorPadrinho: 4 },
        'outro@teste.local',
      ),
    ]);
    expect(r.filter((v) => v.status === 'fulfilled')).toHaveLength(1);
    expect(
      await banco.dados.getRepository(MatchingConfiguracaoEntity).count(),
    ).toBe(2);
  });
});
