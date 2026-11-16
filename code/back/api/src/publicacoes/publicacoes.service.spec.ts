import { ForbiddenException } from '@nestjs/common';
import {
  criarFeedTeste,
  coordenador,
  aluno,
  padrinho,
  somenteMapa,
} from '../../test/helpers/feed.js';

describe('PublicacoesService', () => {
  it('mantém o feed vazio sem conteúdo fictício', async () => {
    const { service } = criarFeedTeste();
    expect(await service.listar(aluno)).toEqual([]);
  });
  it('coordenador publica e autoria vem do servidor; apadrinhado não publica', async () => {
    const { service, tabelas } = criarFeedTeste();
    await expect(service.criar({ texto: 'Teste' }, aluno)).rejects.toThrow(
      ForbiddenException,
    );
    const post = await service.criar({ texto: 'Comunicado' }, coordenador);
    expect(post.autor).toBe('Renata Martins');
    expect(post.podeAdministrar).toBe(true);
    expect(tabelas.FeedOutboxEntity[0].evento.tipo).toBe('feed.post.created');
    expect(JSON.stringify(tabelas.FeedOutboxEntity)).not.toContain(
      coordenador.email,
    );
    expect((await service.listar(aluno))[0].podeAdministrar).toBe(false);
  });
  it('padrinho publica com autoria e categoria próprias sem ganhar administração', async () => {
    const { service, tabelas } = criarFeedTeste();
    const post = await service.criar(
      { texto: 'Dica', categoria: 'Campus' },
      padrinho,
    );
    expect(post).toMatchObject({
      autor: 'Pedro Santos',
      descricaoAutor: 'Padrinho do programa',
      categoria: 'Campus',
      isOwn: true,
      podeAdministrar: false,
      podeInteragir: true,
    });
    expect(tabelas.FeedOutboxEntity[0].evento.tipo).toBe('feed.post.created');
    expect((await service.obter(post.id, coordenador)).podeAdministrar).toBe(
      true,
    );
    await expect(
      service.atualizar(post.id, { texto: 'X' }, padrinho),
    ).rejects.toThrow(ForbiddenException);
    // O autor exclui o próprio post (DP-21), mas não edita.
    expect(post.podeExcluir).toBe(true);
    expect((await service.remover(post.id, padrinho)).removido).toBe(true);
  });

  it('padrinho não exclui post de outra pessoa; apadrinhado não exclui nem o da coordenação', async () => {
    const { service } = criarFeedTeste();
    const daCoord = await service.criar({ texto: 'Aviso' }, coordenador);
    const doPadrinho = await service.criar({ texto: 'Dica' }, padrinho);
    expect(daCoord.podeExcluir).toBe(true);
    expect((await service.obter(daCoord.id, padrinho)).podeExcluir).toBe(false);
    expect((await service.obter(doPadrinho.id, aluno)).podeExcluir).toBe(false);
    expect((await service.obter(doPadrinho.id, coordenador)).podeExcluir).toBe(
      true,
    );
    await expect(service.remover(daCoord.id, padrinho)).rejects.toThrow(
      ForbiddenException,
    );
    await expect(service.remover(doPadrinho.id, aluno)).rejects.toThrow(
      ForbiddenException,
    );
    expect((await service.remover(doPadrinho.id, coordenador)).removido).toBe(
      true,
    );
  });

  it.each([padrinho, aluno])(
    '$perfil interage e exclui o próprio comentário',
    async (usuario) => {
      const { service } = criarFeedTeste();
      const post = await service.criar({ texto: 'Teste' }, coordenador);
      const comentada = await service.comentar(
        post.id,
        'Meu comentário',
        usuario,
      );
      const c = comentada.comentariosDetalhes[0];
      expect(c.podeExcluir).toBe(true);
      expect((await service.curtir(post.id, 1, usuario)).curtidas).toBe(1);
      expect((await service.curtir(post.id, -1, usuario)).curtidas).toBe(0);
      expect(
        (await service.curtirComentario(post.id, c.id, 1, usuario))
          .comentariosDetalhes[0].curtidas,
      ).toBe(1);
      // O padrinho modera o apadrinhado (RN-002); o contrário não vale.
      const outro = usuario === padrinho ? aluno : null;
      if (outro) {
        expect(
          (await service.obter(post.id, outro)).comentariosDetalhes[0]
            .podeExcluir,
        ).toBe(false);
        await expect(
          service.removerComentario(post.id, c.id, outro),
        ).rejects.toThrow(ForbiddenException);
      }
      expect(
        (await service.removerComentario(post.id, c.id, usuario)).comentarios,
      ).toBe(0);
    },
  );

  describe('moderação do padrinho nos comentários (RN-002)', () => {
    async function comentarioDoApadrinhado() {
      const feed = criarFeedTeste();
      const post = await feed.service.criar({ texto: 'Aviso' }, coordenador);
      const c = (await feed.service.comentar(post.id, 'Oi', aluno))
        .comentariosDetalhes[0];
      return { ...feed, post, c };
    }

    it('padrinho exclui comentário do próprio apadrinhado e vê podeExcluir', async () => {
      const { service, post, c } = await comentarioDoApadrinhado();
      expect(
        (await service.obter(post.id, padrinho)).comentariosDetalhes[0]
          .podeExcluir,
      ).toBe(true);
      expect(
        (await service.removerComentario(post.id, c.id, padrinho)).comentarios,
      ).toBe(0);
    });

    it('conta real (perfil nenhuma no JWT) também modera', async () => {
      const { service, post, c } = await comentarioDoApadrinhado();
      const real = { ...padrinho, perfil: 'nenhuma' as const };
      expect(
        (await service.removerComentario(post.id, c.id, real)).comentarios,
      ).toBe(0);
    });

    it.each([
      [
        'padrinho de outro grupo',
        (t: any) => (t.ParticipacaoEntity[0].grupo = 'Grupo 02'),
      ],
      [
        'vínculo encerrado',
        (t: any) => (t.ParticipacaoEntity[0].status = 'concluido'),
      ],
      [
        'apadrinhado sem grupo',
        (t: any) => (t.ParticipacaoEntity[1].grupo = null),
      ],
    ])(
      'padrinho sem vínculo ativo com o autor não exclui: %s',
      async (_n, preparar) => {
        const { service, tabelas, post, c } = await comentarioDoApadrinhado();
        preparar(tabelas);
        expect(
          (await service.obter(post.id, padrinho)).comentariosDetalhes[0]
            .podeExcluir,
        ).toBe(false);
        await expect(
          service.removerComentario(post.id, c.id, padrinho),
        ).rejects.toThrow(ForbiddenException);
      },
    );

    it('apadrinhado não exclui comentário de outro apadrinhado nem do padrinho', async () => {
      const { service, post } = await comentarioDoApadrinhado();
      const doPadrinho = (await service.comentar(post.id, 'Dica', padrinho))
        .comentariosDetalhes[1];
      await expect(
        service.removerComentario(post.id, doPadrinho.id, aluno),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  it('somente mapa pode consultar, mas não publicar/comentar/curtir; conserva exclusão própria', async () => {
    const { service } = criarFeedTeste();
    const post = await service.criar({ texto: 'Teste' }, coordenador);
    expect((await service.listar(somenteMapa))[0].podeInteragir).toBe(false);
    await expect(service.criar({ texto: 'X' }, somenteMapa)).rejects.toThrow(
      ForbiddenException,
    );
    await expect(service.comentar(post.id, 'X', somenteMapa)).rejects.toThrow(
      ForbiddenException,
    );
    await expect(service.curtir(post.id, 1, somenteMapa)).rejects.toThrow(
      ForbiddenException,
    );
    const c = (await service.comentar(post.id, 'Anterior', aluno))
      .comentariosDetalhes[0];
    await expect(
      service.curtirComentario(post.id, c.id, 1, somenteMapa),
    ).rejects.toThrow(ForbiddenException);
    expect(
      (
        await service.removerComentario(post.id, c.id, {
          ...aluno,
          perfil: 'nenhuma',
        })
      ).comentarios,
    ).toBe(0);
  });
  it('aluno comenta, curte e descurte com eventos na mesma transação', async () => {
    const { service, tabelas } = criarFeedTeste();
    const post = await service.criar({ texto: 'Comunicado' }, coordenador);
    expect(
      (await service.comentar(post.id, 'Olá', aluno)).comentariosTexto,
    ).toEqual(['Olá']);
    expect((await service.curtir(post.id, 1, aluno)).curtidas).toBe(1);
    await service.curtir(post.id, 1, aluno);
    expect((await service.curtir(post.id, -1, aluno)).curtidas).toBe(0);
    expect(tabelas.FeedOutboxEntity.map((v: any) => v.evento.tipo)).toEqual([
      'feed.post.created',
      'feed.comment.created',
      'feed.like.updated',
      'feed.like.updated',
    ]);
  });
  it('edita e exclui sem conceder administração ao aluno', async () => {
    const { service, tabelas } = criarFeedTeste();
    const post = await service.criar({ texto: 'Antes' }, coordenador);
    await expect(
      service.atualizar(post.id, { texto: 'Outro' }, aluno),
    ).rejects.toThrow(ForbiddenException);
    await expect(service.remover(post.id, aluno)).rejects.toThrow(
      ForbiddenException,
    );
    expect(
      (await service.atualizar(post.id, { texto: 'Depois' }, coordenador))
        .texto,
    ).toBe('Depois');
    await service.remover(post.id, coordenador);
    expect(await service.listar(aluno)).toEqual([]);
    expect(tabelas.FeedOutboxEntity.map((v: any) => v.evento.tipo)).toContain(
      'feed.post.deleted',
    );
  });
  it('comentário só pode ser removido pelo autor ou pela administração', async () => {
    const { service } = criarFeedTeste();
    const post = await service.criar({ texto: 'Teste' }, coordenador);
    const res = await service.comentar(post.id, 'Texto', aluno);
    const id = res.comentariosDetalhes[0].id;
    await expect(
      service.removerComentario(post.id, id, {
        ...aluno,
        email: 'outro@pucminas.edu.br',
      }),
    ).rejects.toThrow(ForbiddenException);
    expect(
      (await service.removerComentario(post.id, id, aluno)).comentarios,
    ).toBe(0);
  });
  it('rollback da operação também remove o evento quando a outbox falha', async () => {
    const { service, tabelas, repos } = criarFeedTeste();
    repos.FeedOutboxEntity.save = async () => {
      throw new Error('Falha DB');
    };
    await expect(
      service.criar({ texto: 'Teste' }, coordenador),
    ).rejects.toThrow('Falha DB');
    expect(tabelas.PublicacaoEntity).toHaveLength(0);
    expect(tabelas.FeedOutboxEntity).toHaveLength(0);
  });
  it('rejeita comentário vazio e mídias arbitrárias sem gravar eventos', async () => {
    const { service, tabelas, midias } = criarFeedTeste();
    const post = await service.criar({ texto: 'Teste' }, coordenador);
    await expect(service.comentar(post.id, ' ', aluno)).rejects.toThrow();
    midias.validar = async () => {
      throw new Error('Mídia inválida');
    };
    await expect(
      service.criar({ imagens: ['data:image/png;base64,abc'] }, coordenador),
    ).rejects.toThrow();
    expect(tabelas.FeedOutboxEntity).toHaveLength(1);
  });
});
