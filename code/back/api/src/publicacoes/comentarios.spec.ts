import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { criarFeedTeste, aluno, coordenador } from '../../test/helpers/feed.js';
import { FeedRabbitService } from './feed-rabbit.service.js';
import { FeedStreamService } from './feed-stream.service.js';
import { ConfigService } from '@nestjs/config';
import type { ConsumeMessage } from 'amqplib';

describe('threads e curtidas de comentários', () => {
  it('retorna identidade explícita e foto sem expor e-mail ou cadastro', async () => {
    const { service, midias } = criarFeedTeste();
    midias.fotoAutor = async (id) =>
      `https://storage.test/usuarios/${id}/avatar.img?sig=teste`;
    const p = await service.criar({ texto: 'Teste' }, coordenador);
    const r = await service.comentar(p.id, 'Olá', aluno);
    expect(r.comentariosDetalhes[0]).toMatchObject({
      autor: {
        id: 'usuario:1',
        nome: 'Camila Duarte',
        fotoUrl: expect.stringContaining('/usuarios/1/avatar.img'),
      },
      paiId: null,
      criadoEm: expect.any(Date),
      curtidas: 0,
      curtidoPorMim: false,
      podeExcluir: true,
    });
    expect(Object.keys(r.comentariosDetalhes[0].autor).sort()).toEqual([
      'fotoUrl',
      'id',
      'nome',
    ]);
    expect(JSON.stringify(r.comentariosDetalhes)).not.toContain(aluno.email);
  });
  it('coordenação exclui comentário alheio e outro aluno recebe 403', async () => {
    const { service } = criarFeedTeste();
    const p = await service.criar({ texto: 'Teste' }, coordenador);
    const r = await service.comentar(p.id, 'Texto', aluno);
    const id = r.comentariosDetalhes[0].id;
    expect(
      (await service.obter(p.id, coordenador)).comentariosDetalhes[0]
        .podeExcluir,
    ).toBe(true);
    await expect(
      service.removerComentario(p.id, id, {
        ...aluno,
        email: 'outra@pucminas.edu.br',
      }),
    ).rejects.toThrow(ForbiddenException);
    expect(
      (await service.removerComentario(p.id, id, coordenador)).comentarios,
    ).toBe(0);
  });
  it('normaliza resposta de resposta na raiz e rejeita pai de outra publicação', async () => {
    const { service } = criarFeedTeste();
    const p = await service.criar({ texto: 'Teste' }, coordenador);
    const raiz = (await service.comentar(p.id, 'Raiz', aluno))
      .comentariosDetalhes[0];
    const resposta = (
      await service.comentar(p.id, 'Resposta', coordenador, raiz.id)
    ).comentariosDetalhes[1];
    const r = await service.comentar(
      p.id,
      '@Renata Obrigada',
      aluno,
      resposta.id,
    );
    expect(r.comentariosDetalhes.map((c) => c.paiId)).toEqual([
      null,
      raiz.id,
      raiz.id,
    ]);
    const outro = await service.criar({ texto: 'Outro' }, coordenador);
    await expect(
      service.comentar(outro.id, 'Inválida', aluno, raiz.id),
    ).rejects.toThrow(NotFoundException);
    await expect(service.comentar(p.id, 'Inválida', aluno, -1)).rejects.toThrow(
      BadRequestException,
    );
    expect(
      (await service.removerComentario(p.id, raiz.id, coordenador)).comentarios,
    ).toBe(0);
  });
  it('curtidas de comentário são independentes e idempotentes, com evento específico', async () => {
    const { service, tabelas } = criarFeedTeste();
    const p = await service.criar({ texto: 'Teste' }, coordenador);
    const id = (await service.comentar(p.id, 'Texto', aluno))
      .comentariosDetalhes[0].id;
    await service.curtirComentario(p.id, id, 1, aluno);
    const r = await service.curtirComentario(p.id, id, 1, aluno);
    expect(r.curtidas).toBe(0);
    expect(r.comentariosDetalhes[0]).toMatchObject({
      curtidas: 1,
      curtidoPorMim: true,
    });
    expect(
      (await service.obter(p.id, coordenador)).comentariosDetalhes[0]
        .curtidoPorMim,
    ).toBe(false);
    await service.curtirComentario(p.id, id, -1, aluno);
    const final = await service.curtirComentario(p.id, id, -1, aluno);
    expect(final.comentariosDetalhes[0].curtidas).toBe(0);
    expect(
      tabelas.FeedOutboxEntity.filter(
        (e) => e.evento.tipo === 'feed.comment.like.updated',
      ),
    ).toHaveLength(2);
    await expect(
      service.curtirComentario(p.id, id + 50, 1, aluno),
    ).rejects.toThrow(NotFoundException);
  });
  it('evento novo atravessa o consumidor RabbitMQ e chega ao SSE sem dados pessoais', async () => {
    const { service, tabelas } = criarFeedTeste();
    const p = await service.criar({ texto: 'Teste' }, coordenador);
    const id = (await service.comentar(p.id, 'Texto', aluno))
      .comentariosDetalhes[0].id;
    await service.curtirComentario(p.id, id, 1, aluno);
    const evento = tabelas.FeedOutboxEntity.at(-1).evento;
    const stream = new FeedStreamService();
    const recebidos: unknown[] = [];
    const sub = stream
      .observar(Date.now() + 10000)
      .subscribe((v) => recebidos.push(v));
    new FeedRabbitService(new ConfigService({}), stream).consumir(
      { ack: vi.fn(), nack: vi.fn() },
      { content: Buffer.from(JSON.stringify(evento)) } as ConsumeMessage,
    );
    expect(recebidos).toContainEqual({
      type: 'feed.comment.like.updated',
      id: evento.id,
      data: evento,
    });
    expect(JSON.stringify(evento)).not.toContain(aluno.email);
    sub.unsubscribe();
    stream.onModuleDestroy();
  });
});
