import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityManager, In } from 'typeorm';
import { randomUUID } from 'node:crypto';
import { detectarTipoCardapio } from '../campus/cardapios/cardapio-arquivo.js';
import { MatchingVinculoEntity } from '../matching/entities/matching.entity.js';
import { ParticipacaoEntity } from '../participacoes/entities/participacao.entity.js';
import { ProgramaEntity } from '../programas/entities/programa.entity.js';
import { AzureBlobStorageService } from '../storage/azure-blob-storage.service.js';
import { ChatCacheService } from './chat-cache.service.js';
import { novoEventoChat } from './chat-evento.js';
import { ChatStreamService } from './chat-stream.service.js';
import {
  ChatEntity,
  ChatOutboxEntity,
  ChatParticipanteEntity,
  EstadoMensagemChat,
  MensagemChatEntity,
} from './entities/chat.entity.js';

export interface ParticipanteDoChat {
  id: number;
  participacaoId: number;
  nome: string;
  curso: string;
  email: string;
  papel: string;
}

export interface MensagemChatResposta {
  id: number;
  chatId: number;
  remetenteParticipacaoId: number;
  texto: string;
  imagemUrl: string | null;
  estado: EstadoMensagemChat;
  entregueEm: Date | null;
  lidaEm: Date | null;
  criadaEm: Date;
}

export interface ResumoChat {
  id: number;
  programaId: number;
  programa: string;
  minhaParticipacaoId: number;
  titulo: string | null;
  atualizadoEm: Date;
  participantes: ParticipanteDoChat[];
  ultimaMensagem: MensagemChatResposta | null;
  naoLidas: number;
}

@Injectable()
export class ChatService {
  private readonly logger = new Logger(ChatService.name);

  constructor(
    @InjectDataSource() private readonly dados: DataSource,
    private readonly storage: AzureBlobStorageService,
    private readonly cache: ChatCacheService,
    private readonly stream: ChatStreamService,
  ) {}

  private nome(participacao: ParticipacaoEntity): string {
    return participacao.respostas?.nome?.trim() || participacao.usuarioId;
  }

  private async participacoesDoUsuario(
    manager: EntityManager,
    email: string,
  ): Promise<ParticipacaoEntity[]> {
    if (!email?.trim())
      throw new ForbiddenException('Usuário sem identidade válida.');
    return manager.getRepository(ParticipacaoEntity).find({
      where: { usuarioId: email.trim().toLowerCase() },
    });
  }

  private async exigirMembro(
    manager: EntityManager,
    chatId: number,
    email: string,
  ): Promise<ChatParticipanteEntity> {
    const participacoes = await this.participacoesDoUsuario(manager, email);
    if (!participacoes.length)
      throw new NotFoundException('Conversa não encontrada.');
    const membro = await manager.getRepository(ChatParticipanteEntity).findOne({
      where: {
        chatId,
        participacaoId: In(participacoes.map((p) => p.id)),
        chat: { ativo: true },
      },
      relations: { participacao: true },
    });
    if (!membro) throw new NotFoundException('Conversa não encontrada.');
    return membro;
  }

  private async exigirVinculoAtivo(
    manager: EntityManager,
    chatId: number,
  ): Promise<void> {
    const chat = await manager.getRepository(ChatEntity).findOne({
      where: { id: chatId },
    });
    if (!chat) throw new NotFoundException('Conversa não encontrada.');
    if (chat.matchingVinculoId == null) return;

    const vinculo = await manager
      .getRepository(MatchingVinculoEntity)
      .findOne({ where: { id: chat.matchingVinculoId } });
    if (!vinculo?.ativo) {
      throw new ConflictException(
        'Não é possível enviar mensagens: o vínculo associado foi encerrado.',
      );
    }
  }

  private participantes(
    membros: ChatParticipanteEntity[],
  ): ParticipanteDoChat[] {
    return membros.map((membro) => ({
      id: membro.id,
      participacaoId: membro.participacaoId,
      nome: this.nome(membro.participacao),
      curso: membro.participacao.respostas?.curso?.trim() || 'Aluno',
      email: membro.participacao.usuarioId,
      papel: membro.participacao.papel,
    }));
  }

  private async apresentarMensagem(
    mensagem: MensagemChatEntity,
  ): Promise<MensagemChatResposta> {
    return {
      id: mensagem.id,
      chatId: mensagem.chatId,
      remetenteParticipacaoId: mensagem.remetenteParticipacaoId,
      texto: mensagem.texto,
      imagemUrl: mensagem.imagemChave
        ? this.storage.sasLeitura(
            'chat',
            mensagem.imagemChave.slice('chat/'.length),
          ).url
        : null,
      estado: mensagem.estado,
      entregueEm: mensagem.entregueEm,
      lidaEm: mensagem.lidaEm,
      criadaEm: mensagem.criadaEm,
    };
  }

  private async registrarEntrega(
    manager: EntityManager,
    chatId: number,
    meusIds: number[],
  ): Promise<void> {
    if (!meusIds.length) return;
    const resultado = await manager
      .getRepository(MensagemChatEntity)
      .createQueryBuilder()
      .update()
      .set({ estado: 'entregue', entregueEm: new Date() })
      .where('"chat_id" = :chatId', { chatId })
      .andWhere('"remetente_participacao_id" NOT IN (:...meusIds)', {
        meusIds,
      })
      .andWhere('"estado" = :estado', { estado: 'enviada' })
      .execute();
    if (resultado.affected) this.cache.invalidar(chatId);
  }

  private async resumo(
    manager: EntityManager,
    chat: ChatEntity,
    meusIds: number[],
  ): Promise<ResumoChat> {
    const [ultima, naoLidas] = await Promise.all([
      manager.getRepository(MensagemChatEntity).findOne({
        where: { chatId: chat.id },
        order: { id: 'DESC' },
      }),
      meusIds.length
        ? manager
            .getRepository(MensagemChatEntity)
            .createQueryBuilder('mensagem')
            .where('mensagem.chat_id = :chatId', { chatId: chat.id })
            .andWhere(
              'mensagem.remetente_participacao_id NOT IN (:...meusIds)',
              {
                meusIds,
              },
            )
            .andWhere('mensagem.estado != :lida', { lida: 'lida' })
            .getCount()
        : Promise.resolve(0),
    ]);
    const ultimaMensagem = ultima
      ? await this.apresentarMensagem(ultima)
      : null;
    return {
      id: chat.id,
      programaId: chat.programaId,
      programa: chat.programa?.codigo ?? '',
      minhaParticipacaoId: meusIds[0] ?? 0,
      titulo: chat.titulo,
      atualizadoEm: chat.atualizadoEm,
      participantes: this.participantes(chat.participantes),
      ultimaMensagem,
      naoLidas,
    };
  }

  async listar(email: string): Promise<ResumoChat[]> {
    const manager = this.dados.manager;
    const participacoes = await this.participacoesDoUsuario(manager, email);
    if (!participacoes.length) return [];
    const meusIds = participacoes.map((participacao) => participacao.id);
    const chats = await manager
      .getRepository(ChatEntity)
      .createQueryBuilder('chat')
      .innerJoin('chat.participantes', 'membroAtual')
      .innerJoin('membroAtual.participacao', 'minhaParticipacao')
      .leftJoinAndSelect('chat.participantes', 'membro')
      .leftJoinAndSelect('membro.participacao', 'participacao')
      .leftJoinAndSelect('chat.programa', 'programa')
      .where('minhaParticipacao.id IN (:...meusIds)', { meusIds })
      .andWhere('chat.ativo = true')
      .orderBy('chat.atualizadoEm', 'DESC')
      .getMany();
    const unicos = [...new Map(chats.map((chat) => [chat.id, chat])).values()];
    return Promise.all(
      unicos.map(async (chat) => {
        const idsNoChat = chat.participantes.map(
          (membro) => membro.participacaoId,
        );
        const idsDoUsuario = meusIds.filter((id) => idsNoChat.includes(id));
        await this.registrarEntrega(manager, chat.id, idsDoUsuario);
        return this.resumo(manager, chat, idsDoUsuario);
      }),
    );
  }

  async listarMensagens(
    chatId: number,
    email: string,
    antesDe?: number,
  ): Promise<{ mensagens: MensagemChatResposta[]; temMais: boolean }> {
    if (
      antesDe !== undefined &&
      (!Number.isSafeInteger(antesDe) || antesDe < 1)
    )
      throw new BadRequestException('Cursor de mensagem inválido.');
    const manager = this.dados.manager;
    const membro = await this.exigirMembro(manager, chatId, email);
    const participacoes = await this.participacoesDoUsuario(manager, email);
    const meusIds = participacoes
      .filter((participacao) => participacao.id === membro.participacaoId)
      .map((participacao) => participacao.id);
    const leitura = await manager
      .getRepository(MensagemChatEntity)
      .createQueryBuilder()
      .update()
      .set({
        estado: 'lida',
        entregueEm: new Date(),
        lidaEm: new Date(),
      })
      .where('"chat_id" = :chatId', { chatId })
      .andWhere('"remetente_participacao_id" NOT IN (:...meusIds)', { meusIds })
      .andWhere('"estado" IN (:...estados)', {
        estados: ['enviada', 'entregue'],
      })
      .execute();
    if (leitura.affected) this.cache.invalidar(chatId);

    if (antesDe === undefined) {
      const emCache = this.cache.obter(chatId);
      if (emCache) {
        return {
          mensagens: await Promise.all(
            emCache.mensagens.map((mensagem) =>
              this.apresentarMensagem(mensagem),
            ),
          ),
          temMais: emCache.temMais,
        };
      }
    }

    const versaoCache = this.cache.versaoAtual();
    const consulta = manager
      .getRepository(MensagemChatEntity)
      .createQueryBuilder('mensagem')
      .where('mensagem.chat_id = :chatId', { chatId });
    if (antesDe !== undefined) {
      consulta.andWhere('mensagem.id < :antesDe', { antesDe });
    }
    const resultados = await consulta
      .orderBy('mensagem.id', 'DESC')
      .take(51)
      .getMany();
    const temMais = resultados.length > 50;
    const mensagens = resultados.slice(0, 50).reverse();
    if (antesDe === undefined)
      this.cache.salvarSeAtual(chatId, mensagens, temMais, versaoCache);
    return {
      mensagens: await Promise.all(
        mensagens.map((mensagem) => this.apresentarMensagem(mensagem)),
      ),
      temMais,
    };
  }

  async enviarMensagem(
    chatId: number,
    email: string,
    texto: string,
  ): Promise<MensagemChatResposta> {
    const conteudo = texto.trim();
    if (!conteudo)
      throw new BadRequestException('A mensagem não pode ser vazia.');
    if (conteudo.length > 4000)
      throw new BadRequestException(
        'A mensagem excede o limite de 4000 caracteres.',
      );
    const resposta = await this.dados.transaction(async (manager) => {
      const membro = await this.exigirMembro(manager, chatId, email);
      await this.exigirVinculoAtivo(manager, chatId);
      const mensagem = manager.getRepository(MensagemChatEntity).create({
        chatId,
        remetenteParticipacaoId: membro.participacaoId,
        texto: conteudo,
        imagemChave: null,
        estado: 'enviada' satisfies EstadoMensagemChat,
        entregueEm: null,
        lidaEm: null,
      });
      const salva = await manager
        .getRepository(MensagemChatEntity)
        .save(mensagem);
      await manager
        .getRepository(ChatEntity)
        .update({ id: chatId }, { atualizadoEm: new Date() });
      const outbox = manager.getRepository(ChatOutboxEntity);
      const evento = novoEventoChat(chatId, salva.id);
      await outbox.save(
        outbox.create({
          id: evento.id,
          evento,
          publicadoEm: null,
        }),
      );
      return this.apresentarMensagem(salva);
    });
    this.cache.invalidar(chatId);
    return resposta;
  }

  async enviarImagem(
    chatId: number,
    email: string,
    arquivo: Buffer | undefined,
  ): Promise<MensagemChatResposta> {
    if (!arquivo?.length || arquivo.length > 5 * 1024 * 1024)
      throw new BadRequestException('Envie uma imagem de até 5 MB.');
    const tipo = detectarTipoCardapio(arquivo);
    if (tipo !== 'image/png' && tipo !== 'image/jpeg' && tipo !== 'image/webp')
      throw new BadRequestException('Envie uma imagem PNG, JPEG ou WebP.');
    const extensao =
      tipo === 'image/png' ? 'png' : tipo === 'image/jpeg' ? 'jpg' : 'webp';

    await this.exigirMembro(this.dados.manager, chatId, email);
    await this.exigirVinculoAtivo(this.dados.manager, chatId);
    const nome = `chats/${chatId}/${randomUUID()}.${extensao}`;
    const blob = await this.storage.enviar('chat', nome, arquivo, tipo, {
      cacheControl: 'private, no-store',
    });

    try {
      const resposta = await this.dados.transaction(async (manager) => {
        const membro = await this.exigirMembro(manager, chatId, email);
        await this.exigirVinculoAtivo(manager, chatId);
        const repo = manager.getRepository(MensagemChatEntity);
        const mensagem = await repo.save(
          repo.create({
            chatId,
            remetenteParticipacaoId: membro.participacaoId,
            texto: 'Imagem',
            imagemChave: blob.chave,
            estado: 'enviada',
            entregueEm: null,
            lidaEm: null,
          }),
        );
        await manager
          .getRepository(ChatEntity)
          .update({ id: chatId }, { atualizadoEm: new Date() });
        const outbox = manager.getRepository(ChatOutboxEntity);
        const evento = novoEventoChat(chatId, mensagem.id);
        await outbox.save(
          outbox.create({
            id: evento.id,
            evento,
            publicadoEm: null,
          }),
        );
        return this.apresentarMensagem(mensagem);
      });
      this.cache.invalidar(chatId);
      return resposta;
    } catch (erro) {
      try {
        await this.storage.excluir('chat', nome);
      } catch {
        this.logger.warn(
          `Não foi possível remover a imagem órfã do chat ${chatId}.`,
        );
      }
      throw erro;
    }
  }

  async observarMensagens(chatId: number, email: string, expiraEm: number) {
    await this.exigirMembro(this.dados.manager, chatId, email);
    return this.stream.observar(chatId, expiraEm, () =>
      this.exigirMembro(this.dados.manager, chatId, email).then(() => {}),
    );
  }

  /** Cria o chat e seus dois participantes na transação do matching. */
  async criarParaVinculo(
    manager: EntityManager,
    matchingVinculoId: number,
  ): Promise<ChatEntity> {
    return ChatService.criarParaVinculoNaTransacao(manager, matchingVinculoId);
  }

  static async criarParaVinculoNaTransacao(
    manager: EntityManager,
    matchingVinculoId: number,
  ): Promise<ChatEntity> {
    const vinculo = await manager
      .getRepository(MatchingVinculoEntity)
      .createQueryBuilder('vinculo')
      .setLock('pessimistic_write')
      .where('vinculo.id = :id', { id: matchingVinculoId })
      .getOne();
    if (!vinculo || !vinculo.ativo)
      throw new NotFoundException('Vínculo ativo do matching não encontrado.');
    const chats = manager.getRepository(ChatEntity);
    const existente = await chats.findOne({
      where: { matchingVinculoId: vinculo.id },
    });
    if (existente) return existente;

    const participacoes = manager.getRepository(ParticipacaoEntity);
    const padrinho = await participacoes.findOne({
      where: { id: vinculo.padrinhoParticipacaoId },
    });
    const apadrinhado = await participacoes.findOne({
      where: { id: vinculo.apadrinhadoParticipacaoId },
    });
    const programa = await manager.getRepository(ProgramaEntity).findOne({
      where: { id: vinculo.programaId },
    });
    if (
      !padrinho ||
      !apadrinhado ||
      !programa ||
      padrinho.programa !== programa.codigo ||
      apadrinhado.programa !== programa.codigo ||
      padrinho.papel !== 'padrinho' ||
      apadrinhado.papel !== 'apadrinhado' ||
      padrinho.status !== 'em_andamento' ||
      apadrinhado.status !== 'em_andamento'
    )
      throw new BadRequestException(
        'O vínculo precisa ter um padrinho e um apadrinhado ativos.',
      );

    const chat = await chats.save(
      chats.create({
        programaId: vinculo.programaId,
        matchingVinculoId: vinculo.id,
        titulo: null,
        ativo: true,
      }),
    );
    await manager.getRepository(ChatParticipanteEntity).save([
      manager.getRepository(ChatParticipanteEntity).create({
        chatId: chat.id,
        participacaoId: padrinho.id,
      }),
      manager.getRepository(ChatParticipanteEntity).create({
        chatId: chat.id,
        participacaoId: apadrinhado.id,
      }),
    ]);
    return chat;
  }

  async buscarParticipantes(
    chatId: number,
    email: string,
  ): Promise<ParticipanteDoChat[]> {
    const manager = this.dados.manager;
    await this.exigirMembro(manager, chatId, email);
    const membros = await manager.getRepository(ChatParticipanteEntity).find({
      where: { chatId },
      relations: { participacao: true },
    });
    return this.participantes(membros);
  }
}
