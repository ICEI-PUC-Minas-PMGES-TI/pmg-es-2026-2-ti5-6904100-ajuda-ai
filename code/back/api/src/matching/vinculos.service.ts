import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityManager } from 'typeorm';
import { ChatService } from '../chat/chat.service.js';
import { ParticipacaoEntity } from '../participacoes/entities/participacao.entity.js';
import { ProgramaEntity } from '../programas/entities/programa.entity.js';
import { MatchingService } from './matching.service.js';
import {
  MatchingGrupoEntity,
  MatchingVinculoEventoEntity,
} from './entities/grupo.entity.js';
import { MatchingVinculoEntity } from './entities/matching.entity.js';
import {
  carregarContextoDestino,
  criarVinculoNaTransacao,
  encerrarVinculoNaTransacao,
  invalidarPorMovimentacao,
  registrarEventoVinculo,
  sincronizarProjecoes,
  validarDestino,
} from './vinculos.dominio.js';

@Injectable()
export class VinculosService {
  constructor(
    @InjectDataSource() private readonly dados: DataSource,
    private readonly matching: MatchingService,
    private readonly chat: ChatService,
  ) {}

  private async ciclo(manager: EntityManager, id: number) {
    const programa = await manager
      .getRepository(ProgramaEntity)
      .createQueryBuilder('programa')
      .setLock('pessimistic_write')
      .where('programa.id = :id', { id })
      .getOne();
    if (!programa) throw new NotFoundException('Programa não encontrado.');
    return programa;
  }

  private async porParticipacao(manager: EntityManager, id: number) {
    const p = await manager
      .getRepository(ParticipacaoEntity)
      .findOne({ where: { id } });
    if (!p) throw new NotFoundException('Participação não encontrada.');
    const programa = await manager
      .getRepository(ProgramaEntity)
      .findOne({ where: { codigo: p.programa } });
    if (!programa) throw new NotFoundException('Programa não encontrado.');
    return this.ciclo(manager, programa.id);
  }

  async vincular(
    apadrinhadoId: number,
    padrinhoId: number,
    responsavel: string,
  ) {
    return this.dados.transaction(async (manager) => {
      const programa = await this.porParticipacao(manager, apadrinhadoId);
      const par = await this.matching.prepararPar(
        manager,
        programa,
        padrinhoId,
        apadrinhadoId,
      );
      const existente = await manager
        .getRepository(MatchingVinculoEntity)
        .findOne({
          where: {
            programaId: programa.id,
            padrinhoParticipacaoId: padrinhoId,
            apadrinhadoParticipacaoId: apadrinhadoId,
            ativo: true,
          },
        });
      if (existente) return { ...par, vinculo: existente };
      const vinculo = await criarVinculoNaTransacao(
        manager,
        par,
        { origem: 'manual', responsavel },
        this.chat,
      );
      await invalidarPorMovimentacao(manager, programa);
      return { ...par, vinculo };
    });
  }

  async transferir(
    id: number,
    dto: { padrinhoDestinoId: number; motivo: string; operacaoId: string },
    responsavel: string,
  ) {
    const motivo = typeof dto.motivo === 'string' ? dto.motivo.trim() : '';
    if (
      !motivo ||
      motivo.length > 1000 ||
      !Number.isInteger(dto.padrinhoDestinoId) ||
      dto.padrinhoDestinoId <= 0 ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        dto.operacaoId ?? '',
      )
    )
      throw new BadRequestException(
        'Informe padrinho destino, motivo (até 1000 caracteres) e identificador UUID da operação.',
      );
    return this.dados.transaction(async (manager) => {
      const repo = manager.getRepository(MatchingVinculoEntity);
      let inicial = await repo.findOne({ where: { id } });
      if (!inicial)
        throw new NotFoundException('Vínculo de origem não encontrado.');
      const programa = await this.ciclo(manager, inicial.programaId);
      inicial = await repo.findOne({ where: { id } });
      if (!inicial)
        throw new NotFoundException('Vínculo de origem não encontrado.');
      const evento = await manager
        .getRepository(MatchingVinculoEventoEntity)
        .findOne({ where: { operacaoId: dto.operacaoId } });
      if (evento) {
        const destino = evento.vinculoDestinoId
          ? await repo.findOne({ where: { id: evento.vinculoDestinoId } })
          : null;
        if (
          evento.acao !== 'transferido' ||
          evento.programaId !== programa.id ||
          evento.vinculoOrigemId !== id ||
          destino?.padrinhoParticipacaoId !== dto.padrinhoDestinoId ||
          evento.motivo !== motivo ||
          evento.responsavel !== responsavel
        )
          throw new ConflictException(
            'Este identificador já foi usado em outra operação.',
          );
        return { origem: inicial, destino, evento, repetida: true };
      }
      if (!inicial.ativo)
        throw new ConflictException(
          'O vínculo de origem mudou ou já foi encerrado. Atualize os grupos.',
        );
      const grupoOrigem = await manager
        .getRepository(MatchingGrupoEntity)
        .findOne({
          where: {
            id: inicial.grupoId ?? -1,
            programaId: programa.id,
            padrinhoParticipacaoId: inicial.padrinhoParticipacaoId,
          },
        });
      if (!grupoOrigem)
        throw new ConflictException(
          'O vínculo de origem requer conciliação do grupo canônico.',
        );
      if (inicial.padrinhoParticipacaoId === dto.padrinhoDestinoId)
        throw new ConflictException(
          'Selecione um padrinho diferente do atual.',
        );
      const par = await this.matching.prepararPar(
        manager,
        programa,
        dto.padrinhoDestinoId,
        inicial.apadrinhadoParticipacaoId,
      );
      await validarDestino(manager, par, inicial.id);
      await encerrarVinculoNaTransacao(manager, inicial);
      const destino = await criarVinculoNaTransacao(
        manager,
        par,
        { origem: 'manual', responsavel, registrar: false },
        this.chat,
      );
      const registrado = await registrarEventoVinculo(manager, {
        programaId: programa.id,
        acao: 'transferido',
        vinculoOrigemId: inicial.id,
        vinculoDestinoId: destino.id,
        motivo,
        responsavel,
        operacaoId: dto.operacaoId,
      });
      await invalidarPorMovimentacao(manager, programa);
      return { origem: inicial, destino, evento: registrado, repetida: false };
    });
  }

  async encerrar(
    participacaoId: number,
    vinculoId: number,
    responsavel: string,
  ) {
    return this.dados.transaction(async (manager) => {
      const repo = manager.getRepository(MatchingVinculoEntity);
      let vinculo = await repo.findOne({ where: { id: vinculoId } });
      if (
        !vinculo ||
        ![
          vinculo.apadrinhadoParticipacaoId,
          vinculo.padrinhoParticipacaoId,
        ].includes(participacaoId)
      )
        throw new NotFoundException(
          'Vínculo não encontrado para esta participação.',
        );
      const programa = await this.ciclo(manager, vinculo.programaId);
      vinculo = await repo.findOne({ where: { id: vinculoId } });
      if (!vinculo) throw new NotFoundException('Vínculo não encontrado.');
      if (programa.etapaAtual === 'encerramento')
        throw new ConflictException(
          'Programa encerrado: os vínculos são históricos.',
        );
      if (vinculo.ativo) {
        await encerrarVinculoNaTransacao(manager, vinculo);
        await sincronizarProjecoes(manager, programa);
        await registrarEventoVinculo(manager, {
          programaId: programa.id,
          acao: 'encerrado',
          vinculoOrigemId: vinculo.id,
          vinculoDestinoId: null,
          responsavel,
        });
        await invalidarPorMovimentacao(manager, programa);
      }
      return {
        apadrinhado: await manager
          .getRepository(ParticipacaoEntity)
          .findOne({ where: { id: vinculo.apadrinhadoParticipacaoId } }),
        padrinho: await manager
          .getRepository(ParticipacaoEntity)
          .findOne({ where: { id: vinculo.padrinhoParticipacaoId } }),
      };
    });
  }

  async desvincular(apadrinhadoId: number, responsavel: string) {
    return this.dados.transaction(async (manager) => {
      const programa = await this.porParticipacao(manager, apadrinhadoId);
      if (programa.etapaAtual === 'encerramento')
        throw new ConflictException(
          'Programa encerrado: os vínculos são históricos.',
        );
      const a = await manager
        .getRepository(ParticipacaoEntity)
        .findOne({ where: { id: apadrinhadoId } });
      if (a?.papel !== 'apadrinhado')
        throw new BadRequestException('Selecione um apadrinhado.');
      const vinculos = await manager.getRepository(MatchingVinculoEntity).find({
        where: {
          programaId: programa.id,
          apadrinhadoParticipacaoId: apadrinhadoId,
          ativo: true,
        },
        order: { id: 'ASC' },
      });
      if (!vinculos.length)
        throw new ConflictException(
          'Este apadrinhado não possui vínculo canônico ativo.',
        );
      for (const v of vinculos) {
        await encerrarVinculoNaTransacao(manager, v);
        await registrarEventoVinculo(manager, {
          programaId: programa.id,
          acao: 'encerrado',
          vinculoOrigemId: v.id,
          vinculoDestinoId: null,
          responsavel,
        });
      }
      await sincronizarProjecoes(manager, programa);
      await invalidarPorMovimentacao(manager, programa);
      return {
        apadrinhado: (await manager
          .getRepository(ParticipacaoEntity)
          .findOne({ where: { id: apadrinhadoId } })) as ParticipacaoEntity,
        padrinho: await manager
          .getRepository(ParticipacaoEntity)
          .findOne({ where: { id: vinculos[0].padrinhoParticipacaoId } }),
      };
    });
  }

  async destinos(apadrinhadoId: number, vinculoOrigemId?: number) {
    return this.dados.transaction(async (manager) => {
      const programa = await this.porParticipacao(manager, apadrinhadoId);
      const origem = vinculoOrigemId
        ? await manager
            .getRepository(MatchingVinculoEntity)
            .findOne({ where: { id: vinculoOrigemId } })
        : null;
      if (
        vinculoOrigemId &&
        (!origem?.ativo ||
          origem.programaId !== programa.id ||
          origem.apadrinhadoParticipacaoId !== apadrinhadoId)
      )
        throw new ConflictException(
          'O vínculo de origem mudou. Atualize os grupos.',
        );
      const pares = await this.matching.prepararDestinos(
        manager,
        programa,
        apadrinhadoId,
      );
      const contexto = await carregarContextoDestino(manager, programa);
      const itens = [];
      for (const par of pares) {
        let bloqueio: string | null =
          origem?.padrinhoParticipacaoId === par.padrinho.id
            ? 'Este é o padrinho atual.'
            : null;
        if (!bloqueio) {
          try {
            await validarDestino(manager, par, origem?.id, contexto);
          } catch (erro) {
            if (!(erro instanceof ConflictException)) throw erro;
            bloqueio = erro.message;
          }
        }
        const ocupacao = contexto.historicos.filter(
          (v) => v.ativo && v.padrinhoParticipacaoId === par.padrinho.id,
        ).length;
        itens.push({
          padrinhoId: par.padrinho.id,
          nome: par.padrinho.respostas?.nome || par.padrinho.usuarioId,
          vagas: Math.max(0, par.config.capacidadePorPadrinho - ocupacao),
          ocupacao,
          capacidade: par.config.capacidadePorPadrinho,
          permitido: !bloqueio,
          bloqueio,
          compatibilidade: par.avaliacao.explicacao,
        });
      }
      return {
        programa: programa.codigo,
        apadrinhadoId,
        vinculoOrigemId: origem?.id ?? null,
        destinos: itens,
      };
    });
  }

  async grupos(codigo: string) {
    const manager = this.dados.manager;
    const programa = await manager
      .getRepository(ProgramaEntity)
      .findOne({ where: { codigo } });
    if (!programa) throw new NotFoundException('Programa não encontrado.');
    const [grupos, vinculos, pessoas, eventos] = await Promise.all([
      manager
        .getRepository(MatchingGrupoEntity)
        .find({ where: { programaId: programa.id }, order: { id: 'ASC' } }),
      manager.getRepository(MatchingVinculoEntity).find({
        where: { programaId: programa.id, ativo: true },
        order: { id: 'ASC' },
      }),
      manager
        .getRepository(ParticipacaoEntity)
        .find({ where: { programa: codigo } }),
      manager
        .getRepository(MatchingVinculoEventoEntity)
        .find({ where: { programaId: programa.id }, order: { id: 'DESC' } }),
    ]);
    const pessoa = (id: number) => {
      const p = pessoas.find((p) => p.id === id);
      return {
        id,
        nome: p?.respostas?.nome || p?.usuarioId || 'Participante indisponível',
      };
    };
    const inconsistencias = pessoas
      .filter(
        (p) =>
          p.papel === 'apadrinhado' &&
          p.status === 'em_andamento' &&
          p.grupo?.trim() &&
          !vinculos.some((v) => v.apadrinhadoParticipacaoId === p.id),
      )
      .map((p) => ({
        participacaoId: p.id,
        nome: pessoa(p.id).nome,
        grupoLegado: p.grupo,
        motivo: 'Grupo legado sem vínculo canônico ativo; requer conciliação.',
      }));
    for (const v of vinculos) {
      if (
        !grupos.some(
          (g) =>
            g.id === v.grupoId &&
            g.padrinhoParticipacaoId === v.padrinhoParticipacaoId,
        )
      )
        inconsistencias.push({
          participacaoId: v.apadrinhadoParticipacaoId,
          nome: pessoa(v.apadrinhadoParticipacaoId).nome,
          grupoLegado: null,
          motivo: `O vínculo ${v.id} não tem grupo canônico consistente; requer conciliação.`,
        });
    }
    return {
      programa: codigo,
      podeMovimentar:
        !programa.inscricoesAbertas &&
        ['formacao', 'andamento'].includes(programa.etapaAtual),
      grupos: grupos.map((g) => ({
        id: g.id,
        nome: g.nome,
        padrinho: pessoa(g.padrinhoParticipacaoId),
        apadrinhados: vinculos
          .filter(
            (v) =>
              v.grupoId === g.id &&
              v.padrinhoParticipacaoId === g.padrinhoParticipacaoId,
          )
          .map((v) => ({
            ...pessoa(v.apadrinhadoParticipacaoId),
            vinculoId: v.id,
          })),
        ocupacao: vinculos.filter(
          (v) =>
            v.grupoId === g.id &&
            v.padrinhoParticipacaoId === g.padrinhoParticipacaoId,
        ).length,
      })),
      inconsistencias,
      historico: eventos,
    };
  }
}
