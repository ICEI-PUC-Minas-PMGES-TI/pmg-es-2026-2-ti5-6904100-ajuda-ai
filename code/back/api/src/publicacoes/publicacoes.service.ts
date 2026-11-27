import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, In, IsNull, Repository } from 'typeorm';
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
  CurtidorDto,
} from './publicacoes.dto.js';
import { FeedOutboxEntity } from './entities/feed-outbox.entity.js';
import { PublicacaoEntity } from './entities/publicacao.entity.js';
import { novoEventoFeed, type TipoEventoFeed } from './feed-evento.js';
import { FeedMidiasService } from './feed-midias.service.js';
import { FeedPolicy } from './feed-policy.js';
import { ParticipacoesService } from '../participacoes/participacoes.service.js';
import { ProgramaEntity } from '../programas/entities/programa.entity.js';

interface DadosPublicacao {
  texto?: string;
  categoria?: string;
  imagens?: string[];
}

/** O que foi gravado no feed, entregue a quem reage ao commit (F32). */
export type AoGravarNoFeed = (gravado: {
  programa: string | null;
}) => Promise<unknown>;

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

  /**
   * Feed do ciclo atual. A coordenação pode pedir um semestre anterior
   * (`programa`, ex.: 2026/1) para consulta; para os demais o parâmetro é
   * recusado, e o feed deles é sempre o do semestre atual.
   */
  async listar(usuario: AccessTokenPayload, programa?: string) {
    await this.policy.exigirLeitura(usuario);
    const atual = ParticipacoesService.programaAtual();
    const pedido = programa?.trim();
    if (pedido && pedido !== atual) {
      if (!this.policy.podeAdministrar(usuario))
        throw new ForbiddenException(
          'Só a coordenação consulta semestres anteriores.',
        );
      if (!/^\d{4}\/[12]$/.test(pedido))
        throw new BadRequestException(
          'Semestre inválido. Use AAAA/1 ou AAAA/2.',
        );
    }
    const itens = await this.publicacoes.find({
      // Feed por ciclo: só o semestre pedido (padrão, o atual — DP-01). Linhas
      // sem ciclo (banco local antigo, antes da migration) contam como atual.
      where:
        pedido && pedido !== atual
          ? { programaCodigo: pedido }
          : [{ programaCodigo: atual }, { programaCodigo: IsNull() }],
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
    await this.policy.exigirLeitura(usuario);
    const item = await this.publicacoes.findOne({
      where: { id },
      relations: { curtidas: true, comentarios: true },
    });
    if (!item) throw new NotFoundException('Publicação não encontrada.');
    this.exigirDoCicloAtual(item, usuario);
    return this.apresentar(
      item,
      usuario,
      await this.autores([item]),
      await this.permissoesDe(usuario),
    );
  }

  /**
   * `aoGravar`: chamado logo depois do commit, com o que foi gravado, antes
   * de reler a publicação para a resposta. Quem chama (conquistas, F32)
   * reage ao que foi persistido mesmo que a releitura falhe (ex.: o ciclo
   * fechou no intervalo).
   */
  async criar(
    corpo: DadosPublicacao,
    usuario: AccessTokenPayload,
    aoGravar?: AoGravarNoFeed,
  ) {
    await this.policy.exigirPublicacao(usuario);
    const valores = this.validar(corpo);
    await this.midias.validar(valores.imagens, usuario.email);
    const autor =
      buscarCoordenadorPorEmail(usuario.email) ??
      (await this.usuarios.buscarPorEmail(usuario.email));
    if (!autor) throw new ForbiddenException('Autor não encontrado.');
    const gravado = await this.dados.transaction(async (manager) => {
      await this.bloquearCiclo(manager, usuario);
      await this.policy.exigirPublicacao(usuario, manager);
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
          programaCodigo: ParticipacoesService.programaAtual(),
        }),
      );
      await this.evento(
        manager,
        'feed.post.created',
        item.id,
        item.programaCodigo,
      );
      return { id: item.id, programa: item.programaCodigo ?? null };
    });
    await aoGravar?.({ programa: gravado.programa });
    return this.obter(gravado.id, usuario);
  }

  async atualizar(
    id: number,
    corpo: DadosPublicacao,
    usuario: AccessTokenPayload,
  ) {
    this.policy.exigirAdministracao(usuario);
    await this.alterar(
      id,
      'feed.post.updated',
      usuario,
      async (manager, item) => {
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
      },
    );
    return this.obter(id, usuario);
  }

  /** Coordenação exclui qualquer post; o autor exclui o próprio (DP-21). */
  async remover(id: number, usuario: AccessTokenPayload) {
    await this.alterar(
      id,
      'feed.post.deleted',
      usuario,
      async (manager, item) => {
        if (!this.policy.podeExcluirPublicacao(usuario, item.ownerId))
          throw new ForbiddenException(
            'Você não pode excluir esta publicação.',
          );
        await manager.getRepository(PublicacaoEntity).remove(item);
      },
    );
    return { removido: true };
  }

  /** `aoGravar`: como em `criar`, com o ciclo do post comentado. */
  async comentar(
    id: number,
    texto: string,
    usuario: AccessTokenPayload,
    paiId?: number,
    aoGravar?: AoGravarNoFeed,
  ) {
    await this.policy.exigirInteracao(usuario);
    const comentario = texto?.trim();
    if (!comentario || comentario.length > 2000)
      throw new BadRequestException(
        'O comentário deve ter entre 1 e 2000 caracteres.',
      );
    let programa: string | null = null;
    await this.alterar(
      id,
      'feed.comment.created',
      usuario,
      async (manager, item) => {
        programa = item.programaCodigo ?? null;
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
      },
    );
    await aoGravar?.({ programa });
    return this.obter(id, usuario);
  }

  async removerComentario(
    id: number,
    comentarioId: number,
    usuario: AccessTokenPayload,
  ) {
    await this.alterar(id, 'feed.comment.deleted', usuario, async (manager) => {
      const repo = manager.getRepository(ComentarioEntity);
      const comentario = await repo.findOne({
        where: { id: comentarioId, publicacaoId: id },
      });
      if (!comentario)
        throw new NotFoundException('Comentário não encontrado.');
      const apadrinhados = await this.policy.apadrinhadosDe(usuario, manager);
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
    await this.alterar(id, 'feed.like.updated', usuario, async (manager) => {
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

  /**
   * Semestres com publicações (mais novo primeiro), sempre incluindo o atual:
   * alimenta o seletor de semestre da coordenação.
   */
  async ciclos(): Promise<{ atual: string; semestres: string[] }> {
    const atual = ParticipacoesService.programaAtual();
    const linhas = await this.publicacoes.find({
      select: { programaCodigo: true },
    });
    const todos = new Set<string>([atual]);
    for (const l of linhas) if (l.programaCodigo) todos.add(l.programaCodigo);
    return { atual, semestres: [...todos].sort().reverse() };
  }

  /** Quem curtiu o post (participantes do ciclo e coordenação). */
  async curtidores(
    id: number,
    usuario: AccessTokenPayload,
  ): Promise<CurtidorDto[]> {
    await this.policy.exigirLeitura(usuario);
    const existe = await this.publicacoes.findOne({ where: { id } });
    if (!existe) throw new NotFoundException('Publicação não encontrada.');
    this.exigirDoCicloAtual(existe, usuario);
    const curtidas = await this.dados.getRepository(CurtidaEntity).find({
      where: { publicacaoId: id },
      order: { criadoEm: 'DESC', id: 'DESC' },
    });
    return this.curtidoresDe(
      curtidas.map((c) => ({ email: c.usuarioId, quando: c.criadoEm })),
    );
  }

  /** Quem curtiu o comentário. */
  async curtidoresComentario(
    id: number,
    comentarioId: number,
    usuario: AccessTokenPayload,
  ): Promise<CurtidorDto[]> {
    await this.policy.exigirLeitura(usuario);
    const post = await this.publicacoes.findOne({ where: { id } });
    if (!post) throw new NotFoundException('Publicação não encontrada.');
    this.exigirDoCicloAtual(post, usuario);
    const comentario = await this.dados
      .getRepository(ComentarioEntity)
      .findOne({ where: { id: comentarioId, publicacaoId: id } });
    if (!comentario) throw new NotFoundException('Comentário não encontrado.');
    const curtidas = await this.dados
      .getRepository(CurtidaComentarioEntity)
      .find({
        where: { comentarioId },
        order: { criadoEm: 'DESC', id: 'DESC' },
      });
    return this.curtidoresDe(
      curtidas.map((c) => ({ email: c.usuarioId, quando: c.criadoEm })),
    );
  }

  private async curtidoresDe(
    itens: Array<{ email: string; quando: Date }>,
  ): Promise<CurtidorDto[]> {
    const autores = await this.autoresPorEmails(itens.map((i) => i.email));
    return itens.map(({ email, quando }) => ({
      autor: autores.get(email)!,
      curtidoEm: quando,
      coordenacao: Boolean(buscarCoordenadorPorEmail(email)),
    }));
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
    await this.alterar(
      id,
      'feed.comment.like.updated',
      usuario,
      async (manager) => {
        const comentario = await manager
          .getRepository(ComentarioEntity)
          .findOne({
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
      },
    );
    return this.obter(id, usuario);
  }

  private async alterar(
    id: number,
    tipo: TipoEventoFeed,
    usuario: AccessTokenPayload,
    acao: (
      manager: EntityManager,
      item: PublicacaoEntity,
    ) => Promise<void | false>,
  ) {
    await this.dados.transaction(async (manager) => {
      // Mesma ordem das movimentações do matching: ciclo antes da publicação.
      await this.bloquearCiclo(manager, usuario);
      await this.policy.exigirInteracao(usuario, manager);
      // Serializa alterações concorrentes da publicação, inclusive curtidas repetidas.
      const item = await manager.getRepository(PublicacaoEntity).findOne({
        where: { id },
        lock: { mode: 'pessimistic_write' },
      });
      if (!item) throw new NotFoundException('Publicação não encontrada.');
      this.exigirDoCicloAtual(item, usuario);
      // Semestre encerrado: a coordenação só consulta e remove (moderação);
      // editar, curtir e comentar ficam para o semestre atual.
      if (
        !this.ehDoCicloAtual(item) &&
        tipo !== 'feed.post.deleted' &&
        tipo !== 'feed.comment.deleted'
      )
        throw new ForbiddenException(
          'Este semestre já encerrou: a publicação só pode ser consultada ou removida.',
        );
      if ((await acao(manager, item)) !== false)
        await this.evento(manager, tipo, id, item.programaCodigo);
    });
  }

  private async bloquearCiclo(
    manager: EntityManager,
    usuario: AccessTokenPayload,
  ) {
    const ciclo = await manager.getRepository(ProgramaEntity).findOne({
      where: { codigo: ParticipacoesService.programaAtual() },
      lock: { mode: 'pessimistic_write' },
    });
    if (!ciclo && !this.policy.podeAdministrar(usuario))
      throw new ForbiddenException('O ciclo atual não está disponível.');
  }

  private async evento(
    manager: EntityManager,
    tipo: TipoEventoFeed,
    id: number,
    programa?: string | null,
  ) {
    const evento = novoEventoFeed(
      tipo,
      id,
      programa ?? ParticipacoesService.programaAtual(),
    );
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

  /** Autores de comentários e das curtidas mais recentes, numa só consulta. */
  private async autores(itens: PublicacaoEntity[]) {
    return this.autoresPorEmails(
      itens.flatMap((p) => [
        ...(p.comentarios ?? []).map((c) => c.autorId),
        ...this.ultimasCurtidas(p).map((c) => c.usuarioId),
      ]),
    );
  }

  /** As curtidas mais recentes (até 3): alimentam "Curtido por ..." no card. */
  private ultimasCurtidas(item: PublicacaoEntity) {
    return [...(item.curtidas ?? [])]
      .sort(
        (a, b) => b.criadoEm.getTime() - a.criadoEm.getTime() || b.id - a.id,
      )
      .slice(0, 3);
  }

  private async autoresPorEmails(todos: string[]) {
    const emails = [...new Set(todos)];
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

  /**
   * O feed é do ciclo atual: publicação de outro semestre some para quem não
   * administra (404, como se não existisse). A coordenação ainda a alcança
   * para moderar. Linhas sem ciclo (banco local antigo) passam.
   */
  private ehDoCicloAtual(item: PublicacaoEntity) {
    return (
      !item.programaCodigo ||
      item.programaCodigo === ParticipacoesService.programaAtual()
    );
  }

  private exigirDoCicloAtual(
    item: PublicacaoEntity,
    usuario: AccessTokenPayload,
  ) {
    if (
      item.programaCodigo &&
      item.programaCodigo !== ParticipacoesService.programaAtual() &&
      !this.policy.podeAdministrar(usuario)
    )
      throw new NotFoundException('Publicação não encontrada.');
  }

  /** Uma consulta por requisição, reaproveitada em todos os posts da lista. */
  private async permissoesDe(usuario: AccessTokenPayload) {
    return this.policy.contexto(usuario);
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
      curtidoPelaCoordenacao: likes.some(
        (v) =>
          v.comentarioId === c.id &&
          Boolean(buscarCoordenadorPorEmail(v.usuarioId)),
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
      // Poucos nomes junto do feed: o card mostra "Curtido por X e outras N
      // pessoas" sem uma requisição por post. A lista completa é sob demanda.
      curtidoresRecentes: this.ultimasCurtidas(item).map((c) => {
        const autor = autores.get(c.usuarioId);
        return {
          nome: autor?.nome ?? 'Usuário indisponível',
          fotoUrl: autor?.fotoUrl ?? null,
          coordenacao: Boolean(buscarCoordenadorPorEmail(c.usuarioId)),
        };
      }),
      curtidoPeloUsuario: curtidas.some((c) => c.usuarioId === usuario.email),
      comentarios: comentarios.length,
      comentariosTexto: comentarios.map((c) => c.texto),
      comentariosDetalhes: detalhes,
      isOwn: item.ownerId === usuario.email,
      podeExcluir: this.policy.podeExcluirPublicacao(usuario, item.ownerId),
      podeAdministrar: this.policy.podeAdministrar(usuario),
      // Semestre anterior (visto pela coordenação): só leitura.
      cicloAtual: this.ehDoCicloAtual(item),
      programa: item.programaCodigo,
      podeInteragir: permissoes.podeInteragir && this.ehDoCicloAtual(item),
    };
  }
}
