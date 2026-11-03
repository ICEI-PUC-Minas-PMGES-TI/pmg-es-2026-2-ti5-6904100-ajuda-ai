import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityManager, In } from 'typeorm';
import { MatchingVinculoEntity } from '../matching/entities/matching.entity.js';
import { ParticipacaoEntity } from '../participacoes/entities/participacao.entity.js';
import { ProgramaEntity } from '../programas/entities/programa.entity.js';
import {
  ChatEntity,
  ChatParticipanteEntity,
  EstadoMensagemChat,
  MensagemChatEntity,
} from './entities/chat.entity.js';

export interface ParticipanteDoChat {
  id: number;
  participacaoId: number;
  nome: string;
  email: string;
  papel: string;
}

export interface ResumoChat {
  id: number;
  programaId: number;
  titulo: string | null;
  atualizadoEm: Date;
  participantes: ParticipanteDoChat[];
  ultimaMensagem: MensagemChatEntity | null;
  naoLidas: number;
}

@Injectable()
export class ChatService {
  constructor(@InjectDataSource() private readonly dados: DataSource) {}

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

  private participantes(
    membros: ChatParticipanteEntity[],
  ): ParticipanteDoChat[] {
    return membros.map((membro) => ({
      id: membro.id,
      participacaoId: membro.participacaoId,
      nome: this.nome(membro.participacao),
      email: membro.participacao.usuarioId,
      papel: membro.participacao.papel,
    }));
  }

  private async registrarEntrega(
    manager: EntityManager,
    chatId: number,
    meusIds: number[],
  ): Promise<void> {
    if (!meusIds.length) return;
    await manager
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
  }

  private async resumo(
    manager: EntityManager,
    chat: ChatEntity,
    meusIds: number[],
  ): Promise<ResumoChat> {
    const [ultimaMensagem, naoLidas] = await Promise.all([
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
    return {
      id: chat.id,
      programaId: chat.programaId,
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
  ): Promise<{ mensagens: MensagemChatEntity[]; temMais: boolean }> {
    if (antesDe !== undefined && (!Number.isInteger(antesDe) || antesDe < 1))
      throw new BadRequestException('Cursor de mensagem inválido.');
    const manager = this.dados.manager;
    const membro = await this.exigirMembro(manager, chatId, email);
    const participacoes = await this.participacoesDoUsuario(manager, email);
    const meusIds = participacoes
      .filter((participacao) => participacao.id === membro.participacaoId)
      .map((participacao) => participacao.id);
    await manager
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

    const consulta = manager
      .getRepository(MensagemChatEntity)
      .createQueryBuilder('mensagem')
      .where('mensagem.chat_id = :chatId', { chatId });
    if (antesDe !== undefined) {
      consulta.andWhere('mensagem.id < :antesDe', { antesDe });
    }
    const resultados = await consulta
      .orderBy('mensagem.id', 'DESC')
      .take(50)
      .getMany();
    return {
      mensagens: resultados.reverse(),
      temMais: resultados.length === 50,
    };
  }

  async enviarMensagem(
    chatId: number,
    email: string,
    texto: string,
  ): Promise<MensagemChatEntity> {
    const conteudo = texto.trim();
    if (!conteudo)
      throw new BadRequestException('A mensagem não pode ser vazia.');
    if (conteudo.length > 4000)
      throw new BadRequestException(
        'A mensagem excede o limite de 4000 caracteres.',
      );
    return this.dados.transaction(async (manager) => {
      const membro = await this.exigirMembro(manager, chatId, email);
      const mensagem = manager.getRepository(MensagemChatEntity).create({
        chatId,
        remetenteParticipacaoId: membro.participacaoId,
        texto: conteudo,
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
      return salva;
    });
  }

  /**
   * Chamado futuramente dentro da transação de aprovação do matching.
   * O vínculo único torna a criação idempotente.
   */
  async criarParaVinculo(
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
