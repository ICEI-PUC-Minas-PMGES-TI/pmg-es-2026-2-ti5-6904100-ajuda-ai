import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { ParticipacoesService } from '../participacoes/participacoes.service.js';
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

  describe('feed por ciclo (DP-01)', () => {
    function postDeOutroCiclo(tabelas: Record<string, any[]>) {
      tabelas.PublicacaoEntity.push({
        id: 900,
        autor: 'Renata Martins',
        iniciais: 'RM',
        descricaoAutor: 'Coordenação do programa',
        categoria: 'Comunicados',
        texto: 'Aviso do semestre passado',
        imagens: [],
        ownerId: coordenador.email,
        programaCodigo: '2020/1',
        criadoEm: new Date('2020-03-01'),
      });
    }

    it('a publicação nova nasce no ciclo atual', async () => {
      const { service, tabelas } = criarFeedTeste();
      await service.criar({ texto: 'Novo' }, coordenador);
      expect(tabelas.PublicacaoEntity[0].programaCodigo).toBe(
        ParticipacoesService.programaAtual(),
      );
    });

    it('post de outro semestre não aparece nem abre para participantes', async () => {
      const { service, tabelas } = criarFeedTeste();
      await service.criar({ texto: 'Do semestre atual' }, coordenador);
      postDeOutroCiclo(tabelas);
      for (const usuario of [aluno, padrinho]) {
        const textos = (await service.listar(usuario)).map((p) => p.texto);
        expect(textos).toEqual(['Do semestre atual']);
        await expect(service.obter(900, usuario)).rejects.toThrow(
          NotFoundException,
        );
        await expect(service.curtir(900, 1, usuario)).rejects.toThrow(
          NotFoundException,
        );
        await expect(service.comentar(900, 'oi', usuario)).rejects.toThrow(
          NotFoundException,
        );
        await expect(service.curtidores(900, usuario)).rejects.toThrow(
          NotFoundException,
        );
        await expect(
          service.curtidoresComentario(900, 1, usuario),
        ).rejects.toThrow(NotFoundException);
      }
      expect(tabelas.CurtidaEntity).toHaveLength(0);
    });

    it('a coordenação ainda alcança o post antigo para moderar', async () => {
      const { service, tabelas } = criarFeedTeste();
      postDeOutroCiclo(tabelas);
      expect((await service.obter(900, coordenador)).texto).toBe(
        'Aviso do semestre passado',
      );
      expect((await service.remover(900, coordenador)).removido).toBe(true);
    });

    it('a coordenação consulta um semestre anterior; os demais não', async () => {
      const { service, tabelas } = criarFeedTeste();
      await service.criar({ texto: 'Do semestre atual' }, coordenador);
      postDeOutroCiclo(tabelas);
      const antigos = await service.listar(coordenador, '2020/1');
      expect(antigos.map((p) => p.texto)).toEqual([
        'Aviso do semestre passado',
      ]);
      // Sem parâmetro (ou com o atual) vem o semestre atual.
      expect((await service.listar(coordenador)).map((p) => p.texto)).toEqual([
        'Do semestre atual',
      ]);
      expect(
        (
          await service.listar(
            coordenador,
            ParticipacoesService.programaAtual(),
          )
        ).map((p) => p.texto),
      ).toEqual(['Do semestre atual']);
      for (const usuario of [aluno, padrinho])
        await expect(service.listar(usuario, '2020/1')).rejects.toThrow(
          ForbiddenException,
        );
      await expect(service.listar(coordenador, '2020-1')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('lista os semestres com publicações, o atual sempre incluído', async () => {
      const { service, tabelas } = criarFeedTeste();
      postDeOutroCiclo(tabelas);
      const { atual, semestres } = await service.ciclos();
      expect(atual).toBe(ParticipacoesService.programaAtual());
      expect(semestres).toEqual([atual, '2020/1']);
    });

    it('semestre anterior é só leitura: sem editar, curtir ou comentar, mas pode remover', async () => {
      const { service, tabelas } = criarFeedTeste();
      postDeOutroCiclo(tabelas);
      const [post] = await service.listar(coordenador, '2020/1');
      expect(post.cicloAtual).toBe(false);
      expect(post.podeInteragir).toBe(false);
      await expect(service.curtir(900, 1, coordenador)).rejects.toThrow(
        ForbiddenException,
      );
      await expect(service.comentar(900, 'oi', coordenador)).rejects.toThrow(
        ForbiddenException,
      );
      await expect(
        service.atualizar(900, { texto: 'editado' }, coordenador),
      ).rejects.toThrow(ForbiddenException);
      expect((await service.remover(900, coordenador)).removido).toBe(true);
    });

    it('linha sem ciclo (banco local antigo) continua visível', async () => {
      const { service, tabelas } = criarFeedTeste();
      postDeOutroCiclo(tabelas);
      tabelas.PublicacaoEntity[0].programaCodigo = null;
      expect(await service.listar(aluno)).toHaveLength(1);
    });
  });

  describe('quem curtiu', () => {
    it('lista quem curtiu o post com nome e selo da coordenação', async () => {
      const { service } = criarFeedTeste();
      const post = await service.criar({ texto: 'Aviso' }, coordenador);
      await service.curtir(post.id, 1, aluno);
      await service.curtir(post.id, 1, padrinho);
      await service.curtir(post.id, 1, coordenador);
      const lista = await service.curtidores(post.id, aluno);
      expect(lista).toHaveLength(3);
      expect(lista.map((c) => c.autor.nome).sort()).toEqual([
        'Camila Duarte',
        'Pedro Santos',
        'Renata Martins',
      ]);
      expect(lista.filter((c) => c.coordenacao)).toHaveLength(1);
      expect(lista.find((c) => c.coordenacao)?.autor.nome).toBe(
        'Renata Martins',
      );
    });

    it('o feed traz até 3 curtidores recentes (sem requisição por post)', async () => {
      const { service } = criarFeedTeste();
      const sem = await service.criar({ texto: 'Sem curtidas' }, coordenador);
      expect(sem.curtidoresRecentes).toEqual([]);
      const post = await service.criar({ texto: 'Aviso' }, coordenador);
      await service.curtir(post.id, 1, aluno);
      await service.curtir(post.id, 1, padrinho);
      const dois = (await service.obter(post.id, aluno)).curtidoresRecentes;
      expect(dois.map((c) => c.nome).sort()).toEqual([
        'Camila Duarte',
        'Pedro Santos',
      ]);
      await service.curtir(post.id, 1, coordenador);
      const lista = await service.listar(aluno);
      const doPost = lista.find((p) => p.id === post.id)!;
      expect(doPost.curtidas).toBe(3);
      expect(doPost.curtidoresRecentes).toHaveLength(3);
      expect(doPost.curtidoresRecentes.some((c) => c.coordenacao)).toBe(true);
      // Descurtir sai dos recentes.
      await service.curtir(post.id, -1, aluno);
      const depois = (await service.obter(post.id, padrinho))
        .curtidoresRecentes;
      expect(depois.map((c) => c.nome)).not.toContain('Camila Duarte');
    });

    it('descurtir tira a pessoa da lista', async () => {
      const { service } = criarFeedTeste();
      const post = await service.criar({ texto: 'Aviso' }, coordenador);
      await service.curtir(post.id, 1, aluno);
      await service.curtir(post.id, -1, aluno);
      expect(await service.curtidores(post.id, aluno)).toEqual([]);
    });

    it('post inexistente é 404', async () => {
      const { service } = criarFeedTeste();
      await expect(service.curtidores(999, aluno)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('curtidas de comentário: lista e selo curtidoPelaCoordenacao', async () => {
      const { service } = criarFeedTeste();
      const post = await service.criar({ texto: 'Aviso' }, coordenador);
      const c = (await service.comentar(post.id, 'Oi', aluno))
        .comentariosDetalhes[0];
      expect(c.curtidoPelaCoordenacao).toBe(false);
      await service.curtirComentario(post.id, c.id, 1, padrinho);
      expect(
        (await service.obter(post.id, aluno)).comentariosDetalhes[0]
          .curtidoPelaCoordenacao,
      ).toBe(false);
      await service.curtirComentario(post.id, c.id, 1, coordenador);
      const detalhe = (await service.obter(post.id, aluno))
        .comentariosDetalhes[0];
      expect(detalhe.curtidoPelaCoordenacao).toBe(true);
      expect(detalhe.curtidas).toBe(2);
      const lista = await service.curtidoresComentario(post.id, c.id, aluno);
      expect(lista.map((x) => x.autor.nome).sort()).toEqual([
        'Pedro Santos',
        'Renata Martins',
      ]);
      expect(lista.filter((x) => x.coordenacao)).toHaveLength(1);
      await expect(
        service.curtidoresComentario(post.id, 9999, aluno),
      ).rejects.toThrow(NotFoundException);
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
