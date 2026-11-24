import { BadRequestException, NotFoundException } from '@nestjs/common';
import type { EntityManager } from 'typeorm';
import { ParticipacaoEntity } from '../participacoes/entities/participacao.entity.js';
import { ProgramaEntity } from '../programas/entities/programa.entity.js';
import { matchingLiberado } from '../programas/etapas.js';
import { MatchingVinculoEntity } from '../matching/entities/matching.entity.js';
import { MatchingGrupoEntity } from '../matching/entities/grupo.entity.js';
import {
  parAtualValido,
  participacaoEmVinculo,
} from '../participacoes/vinculos-atuais.js';
import {
  ChatEntity,
  ChatParticipanteEntity,
  ChatPeriodoEntity,
  MensagemChatEntity,
} from './entities/chat.entity.js';

export function pessoaPodeConversar(p: ParticipacaoEntity | undefined) {
  return participacaoEmVinculo(p);
}

/** Relações canônicas são reavaliadas em toda leitura/envio/heartbeat. */
export async function membrosAtuais(
  manager: EntityManager,
  chat: ChatEntity,
  programa: ProgramaEntity,
  historicoEncerrado = false,
) {
  if (
    !chat.ativo ||
    (!historicoEncerrado &&
      (!matchingLiberado(programa) || programa.inscricoesAbertas))
  )
    return [];
  const pessoas = await manager
    .getRepository(ParticipacaoEntity)
    .find({ where: { programa: programa.codigo } });
  const vinculos =
    chat.tipo === 'privado' && chat.matchingVinculoId != null
      ? await manager.getRepository(MatchingVinculoEntity).find({
          where: {
            id: chat.matchingVinculoId,
            programaId: programa.id,
            ativo: true,
          },
        })
      : chat.tipo === 'coletivo' && chat.grupoId != null
        ? await manager.getRepository(MatchingVinculoEntity).find({
            where: {
              grupoId: chat.grupoId,
              programaId: programa.id,
              ativo: true,
            },
          })
        : [];
  const grupo =
    chat.tipo === 'coletivo'
      ? await manager
          .getRepository(MatchingGrupoEntity)
          .findOne({ where: { id: chat.grupoId!, programaId: programa.id } })
      : null;
  const ids = new Set<number>();
  for (const v of vinculos) {
    const p = pessoas.find((p) => p.id === v.padrinhoParticipacaoId);
    const a = pessoas.find((p) => p.id === v.apadrinhadoParticipacaoId);
    if (
      !parAtualValido(v, p, a, programa, historicoEncerrado) ||
      (chat.tipo === 'coletivo' && grupo?.padrinhoParticipacaoId !== p?.id)
    )
      continue;
    ids.add(p!.id);
    ids.add(a!.id);
  }
  return pessoas.filter((p) => ids.has(p.id));
}

export async function avancarRevisao(manager: EntityManager, chatId: number) {
  await manager
    .getRepository(ChatEntity)
    .increment({ id: chatId }, 'revisao', 1);
}

/** Chamado somente na transação que já detém o lock do ciclo. */
export async function sincronizarPeriodos(
  manager: EntityManager,
  chat: ChatEntity,
  idsDesejados: number[],
) {
  const repo = manager.getRepository(ChatPeriodoEntity);
  const periodos = await repo.find({ where: { chatId: chat.id } });
  const ultima = await manager
    .getRepository(MensagemChatEntity)
    .findOne({ where: { chatId: chat.id }, order: { id: 'DESC' } });
  const limite = ultima?.id ?? 0;
  let alterou = false;
  for (const periodo of periodos.filter(
    (p) => p.ateMensagemId == null && !idsDesejados.includes(p.participacaoId),
  )) {
    periodo.ateMensagemId = limite;
    periodo.saiuEm = new Date();
    await repo.save(periodo);
    alterou = true;
  }
  for (const id of idsDesejados) {
    if (
      periodos.some((p) => p.participacaoId === id && p.ateMensagemId == null)
    )
      continue;
    const membros = manager.getRepository(ChatParticipanteEntity);
    if (
      !(await membros.findOne({
        where: { chatId: chat.id, participacaoId: id },
      }))
    )
      await membros.save(
        membros.create({ chatId: chat.id, participacaoId: id }),
      );
    await repo.save(
      repo.create({
        chatId: chat.id,
        participacaoId: id,
        aposMensagemId: limite,
        ateMensagemId: null,
        entrouEm: new Date(),
        saiuEm: null,
      }),
    );
    alterou = true;
  }
  if (alterou) await avancarRevisao(manager, chat.id);
}

export async function sincronizarColetivo(
  manager: EntityManager,
  grupoId: number,
) {
  const grupo = await manager
    .getRepository(MatchingGrupoEntity)
    .findOne({ where: { id: grupoId } });
  if (!grupo)
    throw new BadRequestException(
      'Grupo canônico não encontrado para a conversa.',
    );
  const programa = await manager
    .getRepository(ProgramaEntity)
    .findOne({ where: { id: grupo.programaId } });
  if (!programa) throw new NotFoundException('Programa não encontrado.');
  const chats = manager.getRepository(ChatEntity);
  let chat = await chats.findOne({ where: { grupoId: grupo.id } });
  const provisoria = {
    tipo: 'coletivo',
    grupoId,
    programaId: programa.id,
    ativo: true,
  } as ChatEntity;
  const atuais = await membrosAtuais(manager, chat ?? provisoria, programa);
  if (!chat && !atuais.length) return;
  chat ??= await chats.save(
    chats.create({
      tipo: 'coletivo',
      grupoId: grupo.id,
      programaId: programa.id,
      matchingVinculoId: null,
      titulo: grupo.nome,
      ativo: true,
      revisao: 0,
    }),
  );
  await sincronizarPeriodos(
    manager,
    chat,
    atuais.map((p) => p.id),
  );
  return chat;
}

export async function criarConversasDoVinculo(
  manager: EntityManager,
  vinculoId: number,
) {
  const v = await manager
    .getRepository(MatchingVinculoEntity)
    .findOne({ where: { id: vinculoId } });
  if (!v?.ativo)
    throw new NotFoundException('Vínculo ativo do matching não encontrado.');
  const programa = await manager
    .getRepository(ProgramaEntity)
    .findOne({ where: { id: v.programaId } });
  if (!programa || !v.grupoId)
    throw new BadRequestException(
      'O vínculo precisa de programa e grupo canônico.',
    );
  const chats = manager.getRepository(ChatEntity);
  let chat = await chats.findOne({ where: { matchingVinculoId: v.id } });
  const provisoria = {
    tipo: 'privado',
    programaId: programa.id,
    matchingVinculoId: v.id,
    ativo: true,
  } as ChatEntity;
  const pessoas = await membrosAtuais(manager, chat ?? provisoria, programa);
  if (pessoas.length !== 2)
    throw new BadRequestException(
      'O vínculo precisa ter um padrinho e um apadrinhado ativos.',
    );
  chat ??= await chats.save(
    chats.create({
      tipo: 'privado',
      grupoId: null,
      programaId: programa.id,
      matchingVinculoId: v.id,
      titulo: null,
      ativo: true,
      revisao: 0,
    }),
  );
  await sincronizarPeriodos(
    manager,
    chat,
    pessoas.map((p) => p.id),
  );
  await sincronizarColetivo(manager, v.grupoId);
  return chat;
}

export async function encerrarConversasDoVinculo(
  manager: EntityManager,
  v: MatchingVinculoEntity,
) {
  const privado = await manager
    .getRepository(ChatEntity)
    .findOne({ where: { matchingVinculoId: v.id } });
  if (privado) await sincronizarPeriodos(manager, privado, []);
  if (v.grupoId) await sincronizarColetivo(manager, v.grupoId);
}
