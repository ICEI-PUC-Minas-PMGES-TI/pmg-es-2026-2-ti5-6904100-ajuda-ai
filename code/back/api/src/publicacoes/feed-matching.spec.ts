import { randomUUID } from 'node:crypto';
import { ForbiddenException } from '@nestjs/common';
import {
  criarFeedTeste,
  padrinho,
  aluno,
  coordenador,
} from '../../test/helpers/feed.js';
import { cenarioMatching } from '../../test/helpers/matching-cenario.js';
import { ParticipacoesService } from '../participacoes/participacoes.service.js';
import { PermissoesAlunoService } from '../participacoes/permissoes-aluno.service.js';
import { ProgramasService } from '../programas/programas.service.js';
import { FeedPolicy } from './feed-policy.js';
import { FeedStreamService } from './feed-stream.service.js';
import { novoEventoFeed } from './feed-evento.js';

describe('Feed e matching canônicos', () => {
  it('transferência real do domínio troca moderação e publicação sem renovar a identidade', async () => {
    const c = cenarioMatching({
      padrinhos: 2,
      alunos: 2,
      capacidade: 3,
      chatReal: true,
    });
    const participacoes = new ParticipacoesService(
      c.repos.ParticipacaoEntity,
      c.repos.ProgramaEntity,
      c.dados,
    );
    const policy = new FeedPolicy(
      new PermissoesAlunoService(
        participacoes,
        new ProgramasService(c.repos.ProgramaEntity),
      ),
    );
    const usuario = (id: number) => ({
      ...padrinho,
      perfil: 'nenhuma' as const,
      email: c.participantes.find((p) => p.id === id)!.usuarioId,
    });
    const antigo = usuario(1),
      novo = usuario(2),
      apadrinhado = usuario(100);
    await c.operacoes.vincular(100, 1, coordenador.email);
    await c.operacoes.vincular(101, 1, coordenador.email);
    expect(await policy.apadrinhadosDe(antigo)).toEqual(
      new Set([apadrinhado.email, usuario(101).email]),
    );
    const antes = await policy.resumo(antigo);
    await c.operacoes.transferir(
      c.vinculos.find((v) => v.apadrinhadoParticipacaoId === 100)!.id,
      {
        padrinhoDestinoId: 2,
        motivo: 'Ajustar acompanhamento',
        operacaoId: randomUUID(),
      },
      coordenador.email,
    );
    expect(await policy.apadrinhadosDe(antigo)).toEqual(
      new Set([usuario(101).email]),
    );
    expect(await policy.apadrinhadosDe(novo)).toEqual(
      new Set([apadrinhado.email]),
    );
    expect((await policy.resumo(antigo)).revisao).not.toBe(antes.revisao);
    expect(await policy.podePublicar(antigo)).toBe(true);
    await c.operacoes.transferir(
      c.vinculos.find((v) => v.apadrinhadoParticipacaoId === 101 && v.ativo)!
        .id,
      {
        padrinhoDestinoId: 2,
        motivo: 'Concluir reorganização',
        operacaoId: randomUUID(),
      },
      coordenador.email,
    );
    expect(await policy.resumo(antigo)).toMatchObject({
      podeLer: true,
      podeInteragir: true,
      podePublicar: false,
    });
    expect(await policy.apadrinhadosDe(antigo)).toEqual(new Set());
    expect(await policy.podePublicar(novo)).toBe(true);
  });

  it('grupo ausente ou divergente não retira autoridade de um vínculo canônico válido', async () => {
    const { policy, tabelas } = criarFeedTeste();
    tabelas.ParticipacaoEntity[0].grupo = null;
    tabelas.ParticipacaoEntity[1].grupo = 'Outro rótulo';
    expect(await policy.podePublicar(padrinho)).toBe(true);
    expect(await policy.apadrinhadosDe(padrinho)).toEqual(
      new Set([aluno.email]),
    );
    tabelas.MatchingVinculoEntity[0].ativo = false;
    tabelas.ParticipacaoEntity[0].grupo = tabelas.ParticipacaoEntity[1].grupo =
      'Mesmo nome';
    expect(await policy.podePublicar(padrinho)).toBe(false);
    expect(await policy.apadrinhadosDe(padrinho)).toEqual(new Set());
  });

  it.each([
    'outro ciclo no vínculo',
    'outro ciclo na pessoa',
    'mesma conta',
    'papel divergente',
    'participação encerrada',
  ])('recusa relação divergente: %s', async (caso) => {
    const { policy, tabelas } = criarFeedTeste();
    if (caso === 'outro ciclo no vínculo')
      tabelas.MatchingVinculoEntity[0].programaId = 999;
    if (caso === 'outro ciclo na pessoa')
      tabelas.ParticipacaoEntity[1].programa = '2020/1';
    if (caso === 'mesma conta')
      tabelas.ParticipacaoEntity[1].usuarioId = padrinho.email;
    if (caso === 'papel divergente')
      tabelas.ParticipacaoEntity[1].papel = 'padrinho';
    if (caso === 'participação encerrada')
      tabelas.ParticipacaoEntity[1].terminoEm = new Date();
    expect(await policy.podePublicar(padrinho)).toBe(false);
    expect(await policy.apadrinhadosDe(padrinho)).toEqual(new Set());
  });

  it.each(['analise', 'inscricoes', 'encerramento', 'reabertas'])(
    'publicação não atravessa ciclo inválido: %s',
    async (etapa) => {
      const { policy, tabelas } = criarFeedTeste();
      if (etapa === 'reabertas')
        tabelas.ProgramaEntity[0].inscricoesAbertas = true;
      else tabelas.ProgramaEntity[0].etapaAtual = etapa;
      expect(await policy.podePublicar(padrinho)).toBe(false);
      expect(await policy.podeLer(padrinho)).toBe(etapa !== 'encerramento');
    },
  );

  it('perda de vínculo depois da verificação inicial impede persistência e evento', async () => {
    const { service, dados, tabelas } = criarFeedTeste();
    const transacao = dados.transaction.bind(dados);
    vi.spyOn(dados, 'transaction').mockImplementationOnce((async (
      acao: any,
    ) => {
      tabelas.MatchingVinculoEntity[0].ativo = false;
      return transacao(acao);
    }) as any);
    await expect(
      service.criar({ texto: 'Envio concorrente' }, padrinho),
    ).rejects.toThrow(ForbiddenException);
    expect(tabelas.PublicacaoEntity).toHaveLength(0);
    expect(tabelas.FeedOutboxEntity).toHaveLength(0);
  });

  it('transferência preserva autoria e conteúdo e corta a exclusão pelo antigo padrinho', async () => {
    const { service, tabelas } = criarFeedTeste();
    const p = await service.criar({ texto: 'Publicação original' }, padrinho);
    const c = (await service.comentar(p.id, 'Comentário original', aluno))
      .comentariosDetalhes[0];
    const conteudo = structuredClone([
      tabelas.PublicacaoEntity,
      tabelas.ComentarioEntity,
    ]);
    tabelas.MatchingVinculoEntity[0].ativo = false;
    expect(
      (await service.obter(p.id, padrinho)).comentariosDetalhes[0].podeExcluir,
    ).toBe(false);
    await expect(
      service.removerComentario(p.id, c.id, padrinho),
    ).rejects.toThrow(ForbiddenException);
    expect([tabelas.PublicacaoEntity, tabelas.ComentarioEntity]).toEqual(
      conteudo,
    );
    expect(
      (await service.obter(p.id, aluno)).comentariosDetalhes[0].podeExcluir,
    ).toBe(true);
  });

  it('revogação bloqueia leituras e exclusões diretas mesmo com autoria própria', async () => {
    const { service, tabelas } = criarFeedTeste();
    const p = await service.criar({ texto: 'Anterior' }, padrinho);
    const c = (await service.comentar(p.id, 'Anterior', padrinho))
      .comentariosDetalhes[0];
    tabelas.ParticipacaoEntity[0].status = 'nao_aprovado';
    for (const acao of [
      () => service.listar(padrinho),
      () => service.obter(p.id, padrinho),
      () => service.curtidores(p.id, padrinho),
      () => service.curtidoresComentario(p.id, c.id, padrinho),
      () => service.remover(p.id, padrinho),
      () => service.removerComentario(p.id, c.id, padrinho),
    ]) {
      await expect(acao()).rejects.toThrow(ForbiddenException);
    }
    expect(tabelas.PublicacaoEntity).toHaveLength(1);
    expect(tabelas.ComentarioEntity).toHaveLength(1);
  });

  it('eventos persistem o ciclo inclusive na exclusão, sem identidade ou texto', async () => {
    const { service, tabelas } = criarFeedTeste();
    const p = await service.criar({ texto: 'Conteúdo reservado' }, padrinho);
    await service.remover(p.id, padrinho);
    for (const row of tabelas.FeedOutboxEntity) {
      expect(row.evento.programaCodigo).toBe(tabelas.ProgramaEntity[0].codigo);
      expect(JSON.stringify(row.evento)).not.toContain('Conteúdo reservado');
      expect(JSON.stringify(row.evento)).not.toContain(padrinho.email);
    }
  });
});

describe('Stream do feed revalida acesso e escopo', () => {
  afterEach(() => vi.useRealTimers());
  it('rajada durante autorização pede ressincronização completa em vez de perder IDs', async () => {
    vi.useFakeTimers();
    const { policy } = criarFeedTeste();
    const p = await policy.resumo(aluno);
    let liberar!: (valor: typeof p) => void;
    let consultas = 0;
    const stream = new FeedStreamService();
    const eventos: any[] = [];
    const sub = stream
      .observarAutorizado(Date.now() + 60000, () =>
        ++consultas === 1
          ? new Promise((resolve) => {
              liberar = resolve;
            })
          : Promise.resolve(p),
      )
      .subscribe((e) => eventos.push(e));
    for (let id = 1; id <= 3; id++)
      stream.receber(novoEventoFeed('feed.post.created', id, p.programa));
    liberar(p);
    await vi.advanceTimersByTimeAsync(1);
    expect(eventos.at(-1).type).toBe('feed.ready');
    expect(eventos.filter((e) => e.type === 'feed.ready')).toHaveLength(2);
    sub.unsubscribe();
    stream.onModuleDestroy();
  });
  it('revogação encerra stream aberto sem esperar outro evento nem JWT expirar', async () => {
    vi.useFakeTimers();
    const { policy, tabelas } = criarFeedTeste();
    const stream = new FeedStreamService();
    const eventos: any[] = [];
    const fim = vi.fn();
    stream
      .observarAutorizado(Date.now() + 60_000, () => policy.resumo(padrinho))
      .subscribe({ next: (e) => eventos.push(e), complete: fim });
    await vi.advanceTimersByTimeAsync(1);
    tabelas.ParticipacaoEntity[0].status = 'nao_aprovado';
    await vi.advanceTimersByTimeAsync(2000);
    expect(eventos.at(-1)).toMatchObject({ type: 'feed.access' });
    expect(fim).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
    stream.onModuleDestroy();
  });
  it('relação transferida muda revisão sem retirar leitura e não vaza eventos de outro ciclo', async () => {
    vi.useFakeTimers();
    const { policy, tabelas } = criarFeedTeste();
    const stream = new FeedStreamService();
    const eventos: any[] = [];
    const sub = stream
      .observarAutorizado(Date.now() + 60_000, () => policy.resumo(padrinho))
      .subscribe((e) => eventos.push(e));
    await vi.advanceTimersByTimeAsync(1);
    stream.receber(novoEventoFeed('feed.post.created', 10, '2020/1'));
    await vi.advanceTimersByTimeAsync(1);
    stream.receber(novoEventoFeed('feed.post.created', 11));
    await vi.advanceTimersByTimeAsync(1);
    stream.receber(
      novoEventoFeed('feed.post.created', 12, tabelas.ProgramaEntity[0].codigo),
    );
    await vi.advanceTimersByTimeAsync(1);
    expect(
      eventos
        .filter((e) => e.type === 'feed.post.created')
        .map((e) => e.data.publicacaoId),
    ).toEqual([12]);
    tabelas.MatchingVinculoEntity[0].ativo = false;
    await vi.advanceTimersByTimeAsync(2000);
    expect(
      eventos.filter((e) => e.type === 'feed.permissions').at(-1).data,
    ).toMatchObject({ podePublicar: false, podeLer: true });
    sub.unsubscribe();
    expect(vi.getTimerCount()).toBe(0);
    stream.onModuleDestroy();
  });
  it('semestre solicitado não concede acesso a aluno; coordenação recebe só o semestre selecionado', async () => {
    vi.useFakeTimers();
    const { policy } = criarFeedTeste();
    const stream = new FeedStreamService();
    const alunoEventos: any[] = [],
      coordEventos: any[] = [];
    stream
      .observarAutorizado(
        Date.now() + 60000,
        () => policy.resumo(aluno),
        '2020/1',
      )
      .subscribe((e) => alunoEventos.push(e));
    const sub = stream
      .observarAutorizado(
        Date.now() + 60000,
        () => policy.resumo(coordenador),
        '2020/1',
      )
      .subscribe((e) => coordEventos.push(e));
    await vi.advanceTimersByTimeAsync(1);
    expect(alunoEventos).toEqual([
      { type: 'feed.access', data: { revogado: true } },
    ]);
    stream.receber(novoEventoFeed('feed.like.updated', 33, '2020/1'));
    await vi.advanceTimersByTimeAsync(1);
    expect(coordEventos.at(-1).data.publicacaoId).toBe(33);
    sub.unsubscribe();
    stream.onModuleDestroy();
  });
});
