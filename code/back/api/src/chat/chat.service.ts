import { randomUUID } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  type MessageEvent,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import {
  Between,
  DataSource,
  EntityManager,
  In,
  IsNull,
  MoreThan,
} from 'typeorm';
import { Observable } from 'rxjs';
import { ParticipacaoEntity } from '../participacoes/entities/participacao.entity.js';
import { ProgramaEntity } from '../programas/entities/programa.entity.js';
import {
  ChatEntity,
  ChatPeriodoEntity,
  ChatDestinatarioEntity,
  MensagemChatEntity,
} from './entities/chat.entity.js';
import {
  avancarRevisao,
  criarConversasDoVinculo,
  membrosAtuais,
} from './chat.vinculos.js';
import {
  intervalosDoHistorico,
  mensagemNoHistorico,
} from './chat.historico.js';

type Contexto = Awaited<ReturnType<ChatService['contexto']>>;

@Injectable()
export class ChatService {
  constructor(@InjectDataSource() private readonly dados: DataSource) {}

  private async contexto(
    manager: EntityManager,
    chatId: number,
    email: string,
  ) {
    const chat = await manager
      .getRepository(ChatEntity)
      .findOne({ where: { id: chatId, ativo: true } });
    if (!chat || !['privado', 'coletivo'].includes(chat.tipo))
      throw new NotFoundException('Conversa não encontrada.');
    const programa = await manager
      .getRepository(ProgramaEntity)
      .findOne({ where: { id: chat.programaId } });
    if (!programa) throw new NotFoundException('Conversa não encontrada.');
    const pessoas = await manager
      .getRepository(ParticipacaoEntity)
      .find({ where: { programa: programa.codigo } });
    const minhas = pessoas.filter(
      (p) =>
        p.usuarioId === email.trim().toLowerCase() &&
        ['aprovado', 'em_andamento', 'concluido'].includes(p.status),
    );
    const ids = minhas.map((p) => p.id);
    if (!ids.length) throw new NotFoundException('Conversa não encontrada.');
    const periodos = await manager.getRepository(ChatPeriodoEntity).find({
      where: { chatId, participacaoId: In(ids) },
      order: { id: 'ASC' },
    });
    if (!periodos.length)
      throw new NotFoundException('Conversa não encontrada.');
    const atuais = await membrosAtuais(manager, chat, programa);
    const idsAtuais = new Set(atuais.map((p) => p.id));
    const idsHistoricos =
      programa.etapaAtual === 'encerramento'
        ? new Set(
            (await membrosAtuais(manager, chat, programa, true)).map(
              (p) => p.id,
            ),
          )
        : idsAtuais;
    const abertos = periodos.filter(
      (p) => p.ateMensagemId == null && idsAtuais.has(p.participacaoId),
    );
    const podeEnviar = abertos.length > 0;
    // Intervalo aberto sem relação atual não autoriza histórico futuro em dados divergentes.
    const visiveis = periodos.filter(
      (p) =>
        p.ateMensagemId != null ||
        idsAtuais.has(p.participacaoId) ||
        idsHistoricos.has(p.participacaoId),
    );
    const intervalos = intervalosDoHistorico(visiveis);
    const minhaParticipacaoId =
      abertos[0]?.participacaoId ?? periodos[0].participacaoId;
    const motivoBloqueio = podeEnviar
      ? null
      : programa.etapaAtual === 'encerramento'
        ? 'O ciclo foi encerrado. Esta conversa está disponível para consulta.'
        : 'Sua participação nesta conversa foi encerrada. O histórico dos seus períodos foi preservado.';
    let participantes = atuais;
    if (!podeEnviar) {
      if (chat.tipo === 'privado') {
        const historicos = await manager
          .getRepository(ChatPeriodoEntity)
          .find({ where: { chatId } });
        participantes = pessoas.filter((p) =>
          historicos.some((h) => h.participacaoId === p.id),
        );
      } else participantes = [];
    }
    return {
      chat,
      programa,
      ids,
      minhaParticipacaoId,
      podeEnviar,
      motivoBloqueio,
      intervalos,
      atuais,
      participantes,
    };
  }

  private async comAcesso<T>(
    chatId: number,
    email: string,
    escrita: boolean,
    acao: (manager: EntityManager, contexto: Contexto) => Promise<T>,
  ) {
    const inicial = await this.dados
      .getRepository(ChatEntity)
      .findOne({ where: { id: chatId } });
    if (!inicial) throw new NotFoundException('Conversa não encontrada.');
    return this.dados.transaction(async (manager) => {
      // Mesma ordem do matching: programa primeiro. Todas as decisões são revalidadas dentro do lock.
      const programa = await manager
        .getRepository(ProgramaEntity)
        .createQueryBuilder('programa')
        .setLock(escrita ? 'pessimistic_write' : 'pessimistic_read')
        .where('programa.id = :id', { id: inicial.programaId })
        .getOne();
      if (!programa) throw new NotFoundException('Conversa não encontrada.');
      const contexto = await this.contexto(manager, chatId, email);
      return acao(manager, contexto);
    });
  }

  private acesso(c: Contexto) {
    return {
      recibosRevisao: c.chat.revisao ?? 0,
      minhaParticipacaoId: c.minhaParticipacaoId,
      minhasParticipacoesIds: c.ids,
      podeEnviar: c.podeEnviar,
      motivoBloqueio: c.motivoBloqueio,
      revisao: c.podeEnviar ? (c.chat.revisao ?? 0) : 0,
    };
  }

  private filtros(c: Contexto, antesDe?: number, depoisDe?: number) {
    return c.intervalos
      .map((p) => ({
        inicio: Math.max(p.inicio, (depoisDe ?? 0) + 1),
        fim: Math.min(p.fim, (antesDe ?? 2147483648) - 1),
      }))
      .filter((p) => p.inicio <= p.fim)
      .map((p) => ({ chatId: c.chat.id, id: Between(p.inicio, p.fim) }));
  }

  private async serializar(
    manager: EntityManager,
    mensagens: MensagemChatEntity[],
  ) {
    if (!mensagens.length) return [];
    const recibos = await manager
      .getRepository(ChatDestinatarioEntity)
      .find({ where: { mensagemId: In(mensagens.map((m) => m.id)) } });
    return mensagens.map((m) => {
      const destinados = recibos.filter((r) => r.mensagemId === m.id);
      const lidas = destinados.filter((r) => r.lidaEm != null).length;
      const entregues = destinados.filter((r) => r.entregueEm != null).length;
      const estado =
        destinados.length && lidas === destinados.length
          ? 'lida'
          : destinados.length && entregues === destinados.length
            ? 'entregue'
            : 'enviada';
      return {
        ...m,
        estado,
        recibos: { total: destinados.length, entregues, lidas },
      };
    });
  }

  private async registrarRecebimento(
    manager: EntityManager,
    c: Contexto,
    mensagens?: number[],
  ) {
    if (mensagens && !mensagens.length) return;
    const repo = manager.getRepository(ChatDestinatarioEntity);
    const recibos = await repo.find({
      where: {
        chatId: c.chat.id,
        participacaoId: In(c.ids),
        ...(mensagens
          ? { mensagemId: In(mensagens), lidaEm: IsNull() }
          : { entregueEm: IsNull() }),
      },
      order: { id: 'ASC' },
    });
    const alterados: number[] = [];
    for (const recibo of recibos) {
      if (
        !mensagemNoHistorico(recibo.mensagemId, c.intervalos) ||
        (mensagens && !mensagens.includes(recibo.mensagemId))
      )
        continue;
      if (!recibo.entregueEm || (mensagens && !recibo.lidaEm)) {
        // Atualizações condicionais preservam uma leitura confirmada por outra sessão.
        const entrega = await repo.update(
          { id: recibo.id, entregueEm: IsNull() },
          { entregueEm: new Date() },
        );
        const leitura = mensagens
          ? await repo.update(
              { id: recibo.id, lidaEm: IsNull() },
              { lidaEm: new Date() },
            )
          : null;
        if ((entrega.affected ?? 0) + (leitura?.affected ?? 0) > 0)
          alterados.push(recibo.id);
      }
    }
    if (alterados.length) {
      c.chat.revisao = await avancarRevisao(manager, c.chat.id);
      await repo.update({ id: In(alterados) }, { revisao: c.chat.revisao });
    }
  }

  async listar(email: string, codigo?: string) {
    const pessoas = await this.dados.getRepository(ParticipacaoEntity).find({
      where: {
        usuarioId: email.trim().toLowerCase(),
        ...(codigo ? { programa: codigo } : {}),
      },
    });
    if (!pessoas.length) return [];
    const periodos = await this.dados
      .getRepository(ChatPeriodoEntity)
      .find({ where: { participacaoId: In(pessoas.map((p) => p.id)) } });
    const ids = [...new Set(periodos.map((p) => p.chatId))];
    const resultado = [];
    for (const id of ids) {
      try {
        resultado.push(await this.resumo(id, email));
      } catch (erro) {
        if (!(erro instanceof NotFoundException)) throw erro;
      }
    }
    return resultado.sort(
      (a, b) =>
        new Date(b.atualizadoEm).getTime() -
          new Date(a.atualizadoEm).getTime() || b.id - a.id,
    );
  }

  private resumo(chatId: number, email: string) {
    return this.comAcesso(chatId, email, false, async (manager, c) => {
      const where = this.filtros(c);
      const ultima = where.length
        ? await manager
            .getRepository(MensagemChatEntity)
            .findOne({ where, order: { id: 'DESC' } })
        : null;
      await this.registrarRecebimento(manager, c);
      const recibos = await manager.getRepository(ChatDestinatarioEntity).find({
        where: { chatId, participacaoId: In(c.ids), lidaEm: IsNull() },
      });
      return {
        id: chatId,
        programaId: c.programa.id,
        programa: c.programa.codigo,
        tipo: c.chat.tipo,
        grupoId: c.chat.grupoId,
        matchingVinculoId: c.chat.matchingVinculoId,
        titulo: c.chat.titulo,
        atualizadoEm: ultima?.criadaEm ?? c.chat.criadoEm,
        participantes: this.perfis(c),
        ultimaMensagem: ultima
          ? (await this.serializar(manager, [ultima]))[0]
          : null,
        naoLidas: new Set(
          recibos
            .filter((r) => mensagemNoHistorico(r.mensagemId, c.intervalos))
            .map((r) => r.mensagemId),
        ).size,
        ...this.acesso(c),
      };
    });
  }

  private perfis(c: Contexto) {
    return c.participantes.map((p) => ({
      participacaoId: p.id,
      id: p.id,
      nome: p.respostas?.nome?.trim() || p.usuarioId,
      email: p.usuarioId,
      papel: p.papel,
    }));
  }

  async listarMensagens(
    chatId: number,
    email: string,
    antesDe?: number,
    depoisDe?: number,
  ) {
    if (
      (antesDe !== undefined &&
        (!Number.isSafeInteger(antesDe) || antesDe < 1)) ||
      (depoisDe !== undefined &&
        (!Number.isSafeInteger(depoisDe) || depoisDe < 0)) ||
      (antesDe !== undefined && depoisDe !== undefined)
    )
      throw new BadRequestException('Cursor de mensagem inválido.');
    return this.comAcesso(chatId, email, false, async (manager, c) => {
      const where = this.filtros(c, antesDe, depoisDe);
      const resultados = where.length
        ? await manager.getRepository(MensagemChatEntity).find({
            where,
            order: { id: depoisDe !== undefined ? 'ASC' : 'DESC' },
            take: 51,
          })
        : [];
      const pagina = resultados.slice(0, 50);
      if (depoisDe === undefined) pagina.reverse();
      await this.registrarRecebimento(
        manager,
        c,
        pagina.map((m) => m.id),
      );
      return {
        mensagens: await this.serializar(manager, pagina),
        temMais: resultados.length > 50,
        ...this.acesso(c),
      };
    });
  }

  /** Delta de estado, sem baixar novamente o texto das mensagens já carregadas. */
  async listarRecibos(
    chatId: number,
    email: string,
    depoisDaRevisao: number,
    ateMensagemId: number,
  ) {
    if (
      !Number.isSafeInteger(depoisDaRevisao) ||
      depoisDaRevisao < 0 ||
      !Number.isSafeInteger(ateMensagemId) ||
      ateMensagemId < 1
    )
      throw new BadRequestException('Cursor de recibos inválido.');
    return this.comAcesso(chatId, email, false, async (manager, c) => {
      const revisao = c.chat.revisao ?? 0;
      const alterados = await manager
        .getRepository(ChatDestinatarioEntity)
        .find({
          where: { chatId, revisao: MoreThan(depoisDaRevisao) },
        });
      const ids = [
        ...new Set(
          alterados
            .filter(
              (r) =>
                r.revisao <= revisao &&
                r.mensagemId <= ateMensagemId &&
                mensagemNoHistorico(r.mensagemId, c.intervalos),
            )
            .map((r) => r.mensagemId),
        ),
      ];
      const mensagens = ids.length
        ? await manager
            .getRepository(MensagemChatEntity)
            .find({ where: { chatId, id: In(ids) } })
        : [];
      const estados = await this.serializar(manager, mensagens);
      return {
        recibos: estados.map(({ id, estado, recibos }) => ({
          id,
          estado,
          recibos,
        })),
        ...this.acesso(c),
      };
    });
  }

  async enviarMensagem(
    chatId: number,
    email: string,
    texto: string,
    clientId?: string,
  ) {
    if (
      typeof texto !== 'string' ||
      !texto.trim() ||
      texto.trim().length > 4000
    )
      throw new BadRequestException(
        'Escreva uma mensagem de até 4000 caracteres.',
      );
    if (
      clientId !== undefined &&
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        clientId,
      )
    )
      throw new BadRequestException('Identificador de mensagem inválido.');
    return this.comAcesso(chatId, email, true, async (manager, c) => {
      const repo = manager.getRepository(MensagemChatEntity);
      if (clientId) {
        const anterior = await repo.findOne({
          where: { chatId, remetenteParticipacaoId: In(c.ids), clientId },
        });
        if (anterior) {
          if (anterior.texto !== texto.trim())
            throw new ConflictException(
              'O identificador já foi usado para outra mensagem.',
            );
          if (!mensagemNoHistorico(anterior.id, c.intervalos))
            throw new NotFoundException('Mensagem não encontrada.');
          return (await this.serializar(manager, [anterior]))[0];
        }
      }
      if (!c.podeEnviar) throw new ConflictException(c.motivoBloqueio!);
      const mensagem = await repo.save(
        repo.create({
          chatId,
          remetenteParticipacaoId: c.minhaParticipacaoId,
          texto: texto.trim(),
          remetenteNome: (
            c.atuais.find((p) => p.id === c.minhaParticipacaoId)?.respostas
              ?.nome || email
          ).slice(0, 160),
          clientId: clientId ?? randomUUID(),
          criadaEm: new Date(),
          estado: 'enviada',
          entregueEm: null,
          lidaEm: null,
        }),
      );
      const repoRecibos = manager.getRepository(ChatDestinatarioEntity);
      const destinatarios = c.atuais.filter(
        (p) => p.id !== c.minhaParticipacaoId,
      );
      if (destinatarios.length)
        await repoRecibos.save(
          destinatarios.map((p) =>
            repoRecibos.create({
              chatId,
              mensagemId: mensagem.id,
              participacaoId: p.id,
              entregueEm: null,
              lidaEm: null,
            }),
          ),
        );
      await manager
        .getRepository(ChatEntity)
        .update({ id: chatId }, { atualizadoEm: new Date() });
      c.chat.revisao = await avancarRevisao(manager, chatId);
      if (destinatarios.length)
        await repoRecibos.update(
          { mensagemId: mensagem.id },
          { revisao: c.chat.revisao },
        );
      return (await this.serializar(manager, [mensagem]))[0];
    });
  }

  async observarMensagens(chatId: number, email: string, expiraEm: number) {
    await this.comAcesso(chatId, email, false, async (_m, c) => this.acesso(c));
    return new Observable<MessageEvent>((assinante) => {
      let ocupado = false,
        terminado = false,
        revisao: number | undefined;
      let ultimoHeartbeat = Date.now();
      const consultar = async () => {
        if (ocupado || terminado) return;
        if (Date.now() >= expiraEm) {
          terminado = true;
          assinante.complete();
          return;
        }
        ocupado = true;
        try {
          const acesso = await this.comAcesso(
            chatId,
            email,
            false,
            async (_m, c) => this.acesso(c),
          );
          if (terminado || Date.now() >= expiraEm) return;
          if (!acesso.podeEnviar) {
            assinante.next({
              type: 'chat.access',
              data: {
                chatId,
                podeEnviar: false,
                motivoBloqueio: acesso.motivoBloqueio,
              },
            });
            terminado = true;
            assinante.complete();
          } else if (revisao !== acesso.revisao) {
            assinante.next({
              id: String(acesso.revisao),
              type: revisao === undefined ? 'chat.ready' : 'chat.changed',
              data: { chatId, revisao: acesso.revisao },
            });
            revisao = acesso.revisao;
          } else if (Date.now() - ultimoHeartbeat >= 15000) {
            assinante.next({ type: 'chat.heartbeat', data: { chatId } });
            ultimoHeartbeat = Date.now();
          }
        } catch (erro) {
          if (!terminado) {
            if (erro instanceof NotFoundException) {
              assinante.next({
                type: 'chat.access',
                data: { chatId, revogado: true },
              });
              terminado = true;
              assinante.complete();
            } else {
              terminado = true;
              assinante.error(erro);
            }
          }
        } finally {
          ocupado = false;
        }
      };
      void consultar();
      const timer = setInterval(() => {
        void consultar();
      }, 2000);
      const expirar = setTimeout(
        () => {
          terminado = true;
          assinante.complete();
        },
        Math.max(0, expiraEm - Date.now()),
      );
      return () => {
        terminado = true;
        clearInterval(timer);
        clearTimeout(expirar);
      };
    });
  }

  async buscarParticipantes(chatId: number, email: string) {
    return this.comAcesso(chatId, email, false, async (_m, c) =>
      this.perfis(c),
    );
  }

  async criarParaVinculo(
    manager: EntityManager,
    vinculoId: number,
  ): Promise<ChatEntity> {
    return ChatService.criarParaVinculoNaTransacao(manager, vinculoId);
  }
  static async criarParaVinculoNaTransacao(
    manager: EntityManager,
    vinculoId: number,
  ) {
    return criarConversasDoVinculo(manager, vinculoId);
  }
}
