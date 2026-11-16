import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, In, Repository } from 'typeorm';
import { createHash } from 'node:crypto';
import type { AccessTokenPayload } from '../auth/authenticated-request.js';
import { buscarCoordenadorPorEmail } from '../dados/dados.js';
import { UsuariosService } from '../usuarios/usuarios.service.js';
import { ComentarioEntity } from './entities/comentario.entity.js';
import { CurtidaEntity } from './entities/curtida.entity.js';
import { CurtidaComentarioEntity } from './entities/curtida-comentario.entity.js';
import type {
  AutorComentarioDto,
  ComentarioRespostaDto,
} from './publicacoes.dto.js';
import { FeedOutboxEntity } from './entities/feed-outbox.entity.js';
import { PublicacaoEntity } from './entities/publicacao.entity.js';
import { novoEventoFeed, type TipoEventoFeed } from './feed-evento.js';
import { FeedMidiasService } from './feed-midias.service.js';
import { FeedPolicy } from './feed-policy.js';

interface DadosPublicacao {
  texto?: string;
  categoria?: string;
  imagens?: string[];
}

@Injectable()
export class PublicacoesService {
  constructor(
    @InjectRepository(PublicacaoEntity)
    private readonly publicacoes: Repository<PublicacaoEntity>,
    @InjectDataSource() private readonly dados: DataSource,
    private readonly policy: FeedPolicy,
    private readonly usuarios: UsuariosService,
    private readonly midias: FeedMidiasService,
  ) {}

  async listar(usuario: AccessTokenPayload) {
    const itens = await this.publicacoes.find({
      relations: { curtidas: true, comentarios: true },
      order: { criadoEm: 'DESC', id: 'DESC' },
    });
    const autores = await this.autores(itens);
    const permissoes = await this.permissoesDe(usuario);
    return Promise.all(
      itens.map((item) => this.apresentar(item, usuario, autores, permissoes)),
    );
  }

  async obter(id: number, usuario: AccessTokenPayload) {
    const item = await this.publicacoes.findOne({
      where: { id },
      relations: { curtidas: true, comentarios: true },
    });
    if (!item) throw new NotFoundException('Publicação não encontrada.');
    return this.apresentar(
      item,
      usuario,
      await this.autores([item]),
      await this.permissoesDe(usuario),
    );
  }

  async criar(corpo: DadosPublicacao, usuario: AccessTokenPayload) {
    await this.policy.exigirPublicacao(usuario);
    const valores = this.validar(corpo);
    await this.midias.validar(valores.imagens, usuario.email);
    const autor =
      buscarCoordenadorPorEmail(usuario.email) ??
      (await this.usuarios.buscarPorEmail(usuario.email));
    if (!autor) throw new ForbiddenException('Autor não encontrado.');
    const id = await this.dados.transaction(async (manager) => {
      const repo = manager.getRepository(PublicacaoEntity);
      const item = await repo.save(
        repo.create({
          ...valores,
          autor: autor.nome,
          iniciais: autor.nome
            .split(/\s+/)
            .filter(Boolean)
            .slice(0, 2)
            .map((p) => p[0])
            .join('')
            .toUpperCase(),
          descricaoAutor: this.policy.podeAdministrar(usuario)
            ? 'Coordenação do programa'
            : 'Padrinho do programa',
          ownerId: usuario.email,
        }),
      );
      await this.evento(manager, 'feed.post.created', item.id);
      return item.id;
    });
    return this.obter(id, usuario);
  }

  async atualizar(
    id: number,
    corpo: DadosPublicacao,
    usuario: AccessTokenPayload,
  ) {
    this.policy.exigirAdministracao(usuario);
    await this.alterar(id, 'feed.post.updated', async (manager, item) => {
      const valores = this.validar({
        texto: corpo.texto ?? item.texto,
        categoria: corpo.categoria ?? item.categoria,
        imagens: corpo.imagens ?? item.imagens,
      });
      const novas = valores.imagens.filter(
        (chave) => !item.imagens.includes(chave),
      );
      await this.midias.validar(novas, usuario.email);
      Object.assign(item, valores);
      await manager.getRepository(PublicacaoEntity).save(item);
    });
    return this.obter(id, usuario);
  }

  /** Coordenação exclui qualquer post; o autor exclui o próprio (DP-21). */
  async remover(id: number, usuario: AccessTokenPayload) {
    await this.alterar(id, 'feed.post.deleted', async (manager, item) => {
      if (!this.policy.podeExcluirPublicacao(usuario, item.ownerId))
        throw new ForbiddenException('Você não pode excluir esta publicação.');
      await manager.getRepository(PublicacaoEntity).remove(item);
    });
    return { removido: true };
  }

  async comentar(
    id: number,
    texto: string,
    usuario: AccessTokenPayload,
    paiId?: number,
  ) {
    await this.policy.exigirInteracao(usuario);
    const comentario = texto?.trim();
    if (!comentario || comentario.length > 2000)
      throw new BadRequestException(
        'O comentário deve ter entre 1 e 2000 caracteres.',
      );
    await this.alterar(id, 'feed.comment.created', async (manager) => {
      const repo = manager.getRepository(ComentarioEntity);
      let raiz: number | null = null;
      if (paiId != null) {
        if (!Number.isSafeInteger(paiId) || paiId < 1)
          throw new BadRequestException('Comentário pai inválido.');
        const pai = await repo.findOne({
          where: { id: paiId, publicacaoId: id },
        });
        if (!pai)
          throw new NotFoundException(
            'Comentário pai não encontrado nesta publicação.',
          );
        // Responder a uma resposta mantém a profundidade em apenas um nível.
        raiz = pai.paiId ?? pai.id;
      }
      await repo.save(
        repo.create({
          publicacaoId: id,
          autorId: usuario.email,
          texto: comentario,
          paiId: raiz,
        }),
      );
    });
    return this.obter(id, usuario);
  }

  async removerComentario(
    id: number,
    comentarioId: number,
    usuario: AccessTokenPayload,
  ) {
    await this.alterar(id, 'feed.comment.deleted', async (manager) => {
      const repo = manager.getRepository(ComentarioEntity);
      const comentario = await repo.findOne({
        where: { id: comentarioId, publicacaoId: id },
      });
      if (!comentario)
        throw new NotFoundException('Comentário não encontrado.');
      const apadrinhados = await this.policy.apadrinhadosDe(usuario);
      if (
        !this.policy.podeExcluirComentario(
          usuario,
          comentario.autorId,
          apadrinhados,
        )
      )
        throw new ForbiddenException('Você não pode excluir este comentário.');
      await repo.remove(comentario);
    });
    return this.obter(id, usuario);
  }

  async curtir(id: number, delta: number, usuario: AccessTokenPayload) {
    await this.policy.exigirInteracao(usuario);
    if (delta !== 1 && delta !== -1)
      throw new BadRequestException(
        'A ação precisa ser curtir (1) ou descurtir (-1).',
      );
    await this.alterar(id, 'feed.like.updated', async (manager) => {
      const repo = manager.getRepository(CurtidaEntity);
      const existente = await repo.findOne({
        where: { publicacaoId: id, usuarioId: usuario.email },
      });
      if (delta === 1 && !existente) {
        await repo.save(
          repo.create({ publicacaoId: id, usuarioId: usuario.email }),
        );
      } else if (delta === -1 && existente) await repo.remove(existente);
      else return false;
    });
    return this.obter(id, usuario);
  }

  async curtirComentario(
    id: number,
    comentarioId: number,
    delta: number,
    usuario: AccessTokenPayload,
  ) {
    await this.policy.exigirInteracao(usuario);
    if (delta !== 1 && delta !== -1)
      throw new BadRequestException('Ação de curtida inválida.');
    await this.alterar(id, 'feed.comment.like.updated', async (manager) => {
      const comentario = await manager.getRepository(ComentarioEntity).findOne({
        where: { id: comentarioId, publicacaoId: id },
      });
      if (!comentario)
        throw new NotFoundException('Comentário não encontrado.');
      const repo = manager.getRepository(CurtidaComentarioEntity);
      const existente = await repo.findOne({
        where: { comentarioId, usuarioId: usuario.email },
      });
      if (delta === 1 && !existente)
        await repo.save(
          repo.create({ comentarioId, usuarioId: usuario.email }),
        );
      else if (delta === -1 && existente) await repo.remove(existente);
      else return false;
    });
    return this.obter(id, usuario);
  }

  private async alterar(
    id: number,
    tipo: TipoEventoFeed,
    acao: (
      manager: EntityManager,
      item: PublicacaoEntity,
    ) => Promise<void | false>,
  ) {
    await this.dados.transaction(async (manager) => {
      // Serializa alterações concorrentes da publicação, inclusive curtidas repetidas.
      const item = await manager.getRepository(PublicacaoEntity).findOne({
        where: { id },
        lock: { mode: 'pessimistic_write' },
      });
      if (!item) throw new NotFoundException('Publicação não encontrada.');
      if ((await acao(manager, item)) !== false)
        await this.evento(manager, tipo, id);
    });
  }

  private async evento(
    manager: EntityManager,
    tipo: TipoEventoFeed,
    id: number,
  ) {
    const evento = novoEventoFeed(tipo, id);
    await manager
      .getRepository(FeedOutboxEntity)
      .save({ id: evento.id, evento, publicadoEm: null });
  }

  private validar(corpo: DadosPublicacao) {
    const texto = corpo.texto?.trim() ?? '';
    const categoria = corpo.categoria?.trim() || 'Comunicados';
    const imagens = corpo.imagens ?? [];
    if (
      texto.length > 10000 ||
      categoria.length > 80 ||
      !Array.isArray(imagens) ||
      imagens.length > 10 ||
      imagens.some((v) => typeof v !== 'string') ||
      (!texto && !imagens.length)
    )
      throw new BadRequestException(
        'Informe texto (até 10000 caracteres) ou até 10 imagens.',
      );
    return { texto, categoria, imagens: [...new Set(imagens)] };
  }

  private async autores(itens: PublicacaoEntity[]) {
    const emails = [
      ...new Set(
        itens.flatMap((p) => (p.comentarios ?? []).map((c) => c.autorId)),
      ),
    ];
    const usuarios = await this.usuarios.buscarAutoresPorEmails(emails);
    const autores = new Map<string, AutorComentarioDto>();
    await Promise.all(
      emails.map(async (email) => {
        const coordenador = buscarCoordenadorPorEmail(email);
        const usuario = usuarios.find((u) => u.email === email);
        autores.set(
          email,
          coordenador
            ? {
                id: `coordenador:${coordenador.id}`,
                nome: coordenador.nome,
                fotoUrl: coordenador.fotoUrl ?? null,
              }
            : usuario
              ? {
                  id: `usuario:${usuario.id}`,
                  nome: usuario.nome,
                  fotoUrl: await this.midias.fotoAutor(usuario.id),
                }
              : {
                  id: `indisponivel:${createHash('sha256').update(email).digest('hex').slice(0, 24)}`,
                  nome: 'Usuário indisponível',
                  fotoUrl: null,
                },
        );
      }),
    );
    return autores;
  }

  /** Uma consulta por requisição, reaproveitada em todos os posts da lista. */
  private async permissoesDe(usuario: AccessTokenPayload) {
    const [podeInteragir, apadrinhados] = await Promise.all([
      this.policy.podeInteragir(usuario),
      this.policy.apadrinhadosDe(usuario),
    ]);
    return { podeInteragir, apadrinhados };
  }

  private async apresentar(
    item: PublicacaoEntity,
    usuario: AccessTokenPayload,
    autores: Map<string, AutorComentarioDto>,
    permissoes: { podeInteragir: boolean; apadrinhados: Set<string> },
  ) {
    const curtidas = item.curtidas ?? [];
    const comentarios = [...(item.comentarios ?? [])].sort(
      (a, b) => a.criadoEm.getTime() - b.criadoEm.getTime() || a.id - b.id,
    );
    const minutos = Math.max(
      0,
      Math.floor((Date.now() - item.criadoEm.getTime()) / 60_000),
    );
    const likes = comentarios.length
      ? await this.dados.getRepository(CurtidaComentarioEntity).find({
          where: { comentarioId: In(comentarios.map((c) => c.id)) },
        })
      : [];
    const detalhes: ComentarioRespostaDto[] = comentarios.map((c) => ({
      id: c.id,
      texto: c.texto,
      paiId: c.paiId ?? null,
      criadoEm: c.criadoEm,
      autor: autores.get(c.autorId)!,
      podeExcluir: this.policy.podeExcluirComentario(
        usuario,
        c.autorId,
        permissoes.apadrinhados,
      ),
      curtidas: likes.filter((v) => v.comentarioId === c.id).length,
      curtidoPorMim: likes.some(
        (v) => v.comentarioId === c.id && v.usuarioId === usuario.email,
      ),
    }));
    return {
      id: item.id,
      autor: item.autor,
      iniciais: item.iniciais,
      descricaoAutor: item.descricaoAutor,
      criadoEm: item.criadoEm,
      tempo:
        minutos < 1
          ? 'agora'
          : minutos < 60
            ? `há ${minutos} min`
            : minutos < 1440
              ? `há ${Math.floor(minutos / 60)} h`
              : `há ${Math.floor(minutos / 1440)} dias`,
      categoria: item.categoria,
      texto: item.texto,
      imagens: this.midias.urls(item.imagens),
      midias: item.imagens,
      curtidas: curtidas.length,
      curtidoPeloUsuario: curtidas.some((c) => c.usuarioId === usuario.email),
      comentarios: comentarios.length,
      comentariosTexto: comentarios.map((c) => c.texto),
      comentariosDetalhes: detalhes,
      isOwn: item.ownerId === usuario.email,
      podeExcluir: this.policy.podeExcluirPublicacao(usuario, item.ownerId),
      podeAdministrar: this.policy.podeAdministrar(usuario),
      podeInteragir: permissoes.podeInteragir,
    };
  }
}
