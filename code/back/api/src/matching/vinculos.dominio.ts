import { randomUUID } from 'node:crypto';
import { encerrarConversasDoVinculo } from '../chat/chat.vinculos.js';
import { BadRequestException, ConflictException } from '@nestjs/common';
import type { EntityManager } from 'typeorm';
import type { ChatService } from '../chat/chat.service.js';
import { ParticipacaoEntity } from '../participacoes/entities/participacao.entity.js';
import { ProgramaEntity } from '../programas/entities/programa.entity.js';
import { matchingLiberado } from '../programas/etapas.js';
import {
  MatchingConfiguracaoEntity,
  MatchingSugestaoEntity,
  MatchingVinculoEntity,
} from './entities/matching.entity.js';
import {
  MatchingGrupoEntity,
  MatchingVinculoEventoEntity,
} from './entities/grupo.entity.js';
import { MatchingParDecisaoEntity } from './entities/par-decisao.entity.js';
import {
  chavePar,
  decisoesAtuais,
  MOTIVOS_VALIDADE,
} from './matching.integridade.js';

export interface ParParaVinculo {
  programa: ProgramaEntity;
  config: MatchingConfiguracaoEntity;
  padrinho: ParticipacaoEntity;
  apadrinhado: ParticipacaoEntity;
  avaliacao: {
    sugerivel: boolean;
    score: number;
    explicacao: Record<string, unknown>;
  };
}

export function validarElegibilidadePar({
  programa,
  padrinho: p,
  apadrinhado: a,
}: Pick<ParParaVinculo, 'programa' | 'padrinho' | 'apadrinhado'>) {
  if (programa.inscricoesAbertas || !matchingLiberado(programa))
    throw new ConflictException(
      'Ciclo indisponível para formação de vínculos.',
    );
  if (
    p.id === a.id ||
    p.usuarioId === a.usuarioId ||
    p.programa !== programa.codigo ||
    a.programa !== programa.codigo
  )
    throw new ConflictException('Par inválido para este programa.');
  if (
    !(
      (p.papel === 'candidato' && p.status === 'aprovado') ||
      (p.papel === 'padrinho' && p.status === 'em_andamento')
    ) ||
    a.papel !== 'apadrinhado' ||
    a.status !== 'em_andamento' ||
    p.terminoEm ||
    a.terminoEm
  )
    throw new ConflictException(
      'Selecione participantes aprovados e ativos do mesmo ciclo.',
    );
}

/** Insumos compartilhados por todos os destinos de uma mesma consulta. */
export async function carregarContextoDestino(
  manager: EntityManager,
  programa: ProgramaEntity,
) {
  const [historicos, pessoas, grupos, eventos] = await Promise.all([
    manager
      .getRepository(MatchingVinculoEntity)
      .find({ where: { programaId: programa.id } }),
    manager
      .getRepository(ParticipacaoEntity)
      .find({ where: { programa: programa.codigo } }),
    manager
      .getRepository(MatchingGrupoEntity)
      .find({ where: { programaId: programa.id } }),
    manager
      .getRepository(MatchingParDecisaoEntity)
      .find({ where: { programaId: programa.id }, order: { id: 'ASC' } }),
  ]);
  return { historicos, pessoas, grupos, recusas: decisoesAtuais(eventos) };
}

/** O chamador adquire o lock do ciclo e dos participantes antes de entrar no domínio. */
export async function validarDestino(
  manager: EntityManager,
  par: ParParaVinculo,
  descontarId?: number,
  contexto?: Awaited<ReturnType<typeof carregarContextoDestino>>,
) {
  validarElegibilidadePar(par);
  if (!par.avaliacao.sugerivel)
    throw new ConflictException(
      'O par não tem compatibilidade comprovada ou não atende às condições obrigatórias.',
    );
  const { programa, padrinho, apadrinhado, config } = par;
  const base = contexto ?? (await carregarContextoDestino(manager, programa));
  const decisao = base.recusas.get(chavePar(padrinho.id, apadrinhado.id));
  if (decisao?.acao === 'recusado')
    throw new ConflictException(MOTIVOS_VALIDADE.par_recusado);
  const vinculos = base.historicos.filter(
    (v) => v.ativo && v.id !== descontarId,
  );
  if (
    vinculos.some(
      (v) =>
        v.padrinhoParticipacaoId === padrinho.id &&
        v.apadrinhadoParticipacaoId === apadrinhado.id,
    )
  )
    throw new ConflictException('Este vínculo ativo já existe.');
  if (
    vinculos.filter((v) => v.padrinhoParticipacaoId === padrinho.id).length >=
      config.capacidadePorPadrinho ||
    vinculos.filter((v) => v.apadrinhadoParticipacaoId === apadrinhado.id)
      .length >= config.capacidadePorApadrinhado
  )
    throw new ConflictException(
      'A capacidade de um participante foi atingida.',
    );
  // Uma relação apenas no nome de grupo não pode ser tratada como vaga livre.
  const { pessoas, grupos } = base;
  const aTemHistorico = base.historicos.some(
    (v) => v.apadrinhadoParticipacaoId === apadrinhado.id,
  );
  const grupoPadrinho = grupos.find(
    (g) => g.padrinhoParticipacaoId === padrinho.id,
  );
  const nomesLegados = new Set(
    [padrinho.grupo, grupoPadrinho?.nome, grupoPadrinho?.nomeLegado].filter(
      Boolean,
    ),
  );
  if (
    vinculos.some(
      (v) =>
        (v.padrinhoParticipacaoId === padrinho.id ||
          v.apadrinhadoParticipacaoId === apadrinhado.id) &&
        !grupos.some(
          (g) =>
            g.id === v.grupoId &&
            g.padrinhoParticipacaoId === v.padrinhoParticipacaoId,
        ),
    )
  )
    throw new ConflictException(
      'Há vínculo sem grupo canônico consistente. Concilie os dados antes de movimentar.',
    );
  const semCanonico = pessoas.some(
    (a) =>
      a.papel === 'apadrinhado' &&
      a.status === 'em_andamento' &&
      a.grupo?.trim() &&
      nomesLegados.has(a.grupo) &&
      !vinculos.some((v) => v.apadrinhadoParticipacaoId === a.id) &&
      a.id !== apadrinhado.id,
  );
  if ((apadrinhado.grupo?.trim() && !aTemHistorico) || semCanonico)
    throw new ConflictException(
      'Há um grupo legado sem vínculo canônico. Concilie os dados antes de movimentar este grupo.',
    );
}

/** Projeções antigas são derivadas dos vínculos; nunca concedem propriedade ao grupo. */
export async function sincronizarProjecoes(
  manager: EntityManager,
  programa: ProgramaEntity,
) {
  const repo = manager.getRepository(ParticipacaoEntity);
  const pessoas = await repo
    .createQueryBuilder('participacao')
    .setLock('pessimistic_write')
    .where('participacao.programa = :programa', { programa: programa.codigo })
    .orderBy('participacao.id', 'ASC')
    .getMany();
  const todos = await manager
    .getRepository(MatchingVinculoEntity)
    .find({ where: { programaId: programa.id } });
  const ativos = todos.filter((v) => v.ativo);
  const grupos = await manager
    .getRepository(MatchingGrupoEntity)
    .find({ where: { programaId: programa.id } });
  for (const pessoa of pessoas) {
    if (pessoa.papel === 'apadrinhado') {
      if (!todos.some((v) => v.apadrinhadoParticipacaoId === pessoa.id))
        continue;
      const ids = new Set(
        ativos
          .filter((v) => v.apadrinhadoParticipacaoId === pessoa.id)
          .map((v) => v.grupoId),
      );
      pessoa.grupo =
        ids.size === 1
          ? (grupos.find((g) => ids.has(g.id))?.nome ?? null)
          : null;
    } else if (['padrinho', 'candidato'].includes(pessoa.papel)) {
      if (!todos.some((v) => v.padrinhoParticipacaoId === pessoa.id)) continue;
      const pares = ativos.filter(
        (v) => v.padrinhoParticipacaoId === pessoa.id,
      );
      pessoa.apadrinhados = new Set(
        pares.map((v) => v.apadrinhadoParticipacaoId),
      ).size;
      if (pessoa.status === 'em_andamento' || pessoa.status === 'aprovado') {
        pessoa.papel = pares.length ? 'padrinho' : 'candidato';
        pessoa.status = pares.length ? 'em_andamento' : 'aprovado';
        pessoa.grupo = pares.length
          ? (grupos.find((g) => g.padrinhoParticipacaoId === pessoa.id)?.nome ??
            null)
          : null;
        if (pares.length) pessoa.inicioEm ??= new Date();
        else pessoa.inicioEm = null;
      }
    }
  }
  await repo.save(pessoas);
  return pessoas;
}

export async function registrarEventoVinculo(
  manager: EntityManager,
  dados: Pick<
    MatchingVinculoEventoEntity,
    | 'programaId'
    | 'acao'
    | 'responsavel'
    | 'vinculoOrigemId'
    | 'vinculoDestinoId'
  > &
    Partial<Pick<MatchingVinculoEventoEntity, 'operacaoId' | 'motivo'>>,
) {
  if (!dados.responsavel?.trim())
    throw new BadRequestException('Responsável autenticado obrigatório.');
  const repo = manager.getRepository(MatchingVinculoEventoEntity);
  return repo.save(
    repo.create({
      ...dados,
      operacaoId: dados.operacaoId ?? randomUUID(),
      motivo: dados.motivo ?? null,
    }),
  );
}

export async function criarVinculoNaTransacao(
  manager: EntityManager,
  par: ParParaVinculo,
  dados: {
    origem: 'matching' | 'manual';
    sugestaoId?: number;
    responsavel: string;
    registrar?: boolean;
  },
  chat: Pick<ChatService, 'criarParaVinculo'>,
) {
  await validarDestino(manager, par);
  const grupos = manager.getRepository(MatchingGrupoEntity);
  let grupo = await grupos.findOne({
    where: {
      programaId: par.programa.id,
      padrinhoParticipacaoId: par.padrinho.id,
    },
  });
  grupo ??= await grupos.save(
    grupos.create({
      programaId: par.programa.id,
      padrinhoParticipacaoId: par.padrinho.id,
      nome: `Grupo-${par.padrinho.id}`,
      nomeLegado: par.padrinho.grupo?.trim() || null,
    }),
  );
  const repo = manager.getRepository(MatchingVinculoEntity);
  const vinculo = await repo.save(
    repo.create({
      programaId: par.programa.id,
      grupoId: grupo.id,
      padrinhoParticipacaoId: par.padrinho.id,
      apadrinhadoParticipacaoId: par.apadrinhado.id,
      origem: dados.origem,
      sugestaoId: dados.sugestaoId ?? null,
      confirmadoPor: dados.responsavel,
      ativo: true,
      encerradoEm: null,
    }),
  );
  const projecoes = await sincronizarProjecoes(manager, par.programa);
  Object.assign(
    par.padrinho,
    projecoes.find((p) => p.id === par.padrinho.id),
  );
  Object.assign(
    par.apadrinhado,
    projecoes.find((p) => p.id === par.apadrinhado.id),
  );
  await chat.criarParaVinculo(manager, vinculo.id);
  if (dados.registrar !== false)
    await registrarEventoVinculo(manager, {
      programaId: par.programa.id,
      acao: 'criado',
      vinculoOrigemId: null,
      vinculoDestinoId: vinculo.id,
      responsavel: dados.responsavel,
    });
  return vinculo;
}

export async function encerrarVinculoNaTransacao(
  manager: EntityManager,
  vinculo: MatchingVinculoEntity,
) {
  vinculo.ativo = false;
  vinculo.encerradoEm = new Date();
  await manager.getRepository(MatchingVinculoEntity).save(vinculo);
  await encerrarConversasDoVinculo(manager, vinculo);
}

export async function invalidarPorMovimentacao(
  manager: EntityManager,
  programa: ProgramaEntity,
) {
  const repo = manager.getRepository(MatchingSugestaoEntity);
  const pendentes = await repo.find({
    where: { programaId: programa.id, status: 'pendente' },
  });
  for (const s of pendentes) {
    s.status = 'obsoleta';
    s.explicacao = {
      ...s.explicacao,
      validade: {
        vigente: false,
        motivos: ['vinculos_alterados'],
        mensagens: [MOTIVOS_VALIDADE.vinculos_alterados],
        detectadaEm: new Date().toISOString(),
      },
    };
  }
  if (pendentes.length) await repo.save(pendentes);
  programa.matchingPendente = false;
  await manager.getRepository(ProgramaEntity).save(programa);
}
