import { ForbiddenException } from '@nestjs/common';
import { criarFeedTeste, coordenador, aluno } from '../../test/helpers/feed.js';

describe('PublicacoesService', () => {
  it('mantém o feed vazio sem conteúdo fictício', async () => {
    const { service } = criarFeedTeste();
    expect(await service.listar(aluno)).toEqual([]);
  });
  it('somente coordenador publica e autoria vem do servidor', async () => {
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
