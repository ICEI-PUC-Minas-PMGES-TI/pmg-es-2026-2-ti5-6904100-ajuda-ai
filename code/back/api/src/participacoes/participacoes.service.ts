import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  PapelParticipacao,
  ParticipacaoEntity,
  StatusParticipacaoRegistro,
} from './entities/participacao.entity.js';

export interface RegistrarCandidaturaDto {
  usuarioId: string;
  programa?: string;
}

export interface ConfirmarParticipacaoDto {
  usuarioId: string;
  papel: 'padrinho' | 'apadrinhado';
  programa?: string;
  grupo?: string;
  apadrinhados?: number;
  inicioEm?: string;
}

export interface RejeitarCandidaturaDto {
  usuarioId: string;
  programa?: string;
}

@Injectable()
export class ParticipacoesService {
  constructor(
    @InjectRepository(ParticipacaoEntity)
    private readonly participacoes: Repository<ParticipacaoEntity>,
  ) {}

  static programaAtual(referencia = new Date()): string {
    const ano = referencia.getFullYear();
    const semestre = referencia.getMonth() < 6 ? 1 : 2;
    return `${ano}/${semestre}`;
  }

  async listarPorUsuario(usuarioId: string): Promise<ParticipacaoEntity[]> {
    const id = this.normalizarUsuario(usuarioId);
    return this.participacoes.find({
      where: { usuarioId: id },
      order: { programa: 'DESC', criadoEm: 'DESC' },
    });
  }

  /**
   * Registra candidatura de padrinho no ciclo atual.
   * Idempotente: recarregar/reenviar não duplica.
   * Não cria participação ativa de padrinho.
   */
  async registrarCandidaturaPadrinho(
    dto: RegistrarCandidaturaDto,
  ): Promise<ParticipacaoEntity> {
    const usuarioId = this.normalizarUsuario(dto.usuarioId);
    const programa = dto.programa?.trim() || ParticipacoesService.programaAtual();

    const padrinhoAtivo = await this.participacoes.findOne({
      where: { usuarioId, programa, papel: 'padrinho' },
    });
    if (padrinhoAtivo) {
      return padrinhoAtivo;
    }

    const existente = await this.participacoes.findOne({
      where: { usuarioId, programa, papel: 'candidato' },
    });
    if (existente) {
      return existente;
    }

    const registro = this.participacoes.create({
      usuarioId,
      programa,
      papel: 'candidato',
      status: 'em_analise',
      apadrinhados: 0,
      inicioEm: new Date(),
    });
    return this.participacoes.save(registro);
  }

  /**
   * Confirma ingresso efetivo no programa (aprovação / match).
   * Idempotente por usuarioId + programa + papel.
   */
  async confirmarIngresso(
    dto: ConfirmarParticipacaoDto,
  ): Promise<ParticipacaoEntity> {
    const usuarioId = this.normalizarUsuario(dto.usuarioId);
    const papel = dto.papel;
    if (papel !== 'padrinho' && papel !== 'apadrinhado') {
      throw new BadRequestException('Papel inválido para ingresso.');
    }

    const programa = dto.programa?.trim() || ParticipacoesService.programaAtual();

    const existente = await this.participacoes.findOne({
      where: { usuarioId, programa, papel },
    });
    if (existente) {
      if (existente.status === 'em_analise') {
        existente.status = 'em_andamento';
        existente.inicioEm ??= new Date();
        if (dto.grupo !== undefined) existente.grupo = dto.grupo;
        if (dto.apadrinhados !== undefined) {
          existente.apadrinhados = dto.apadrinhados;
        }
        return this.participacoes.save(existente);
      }
      return existente;
    }

    const candidatura = await this.participacoes.findOne({
      where: { usuarioId, programa, papel: 'candidato' },
    });
    if (candidatura && papel === 'padrinho') {
      candidatura.papel = 'padrinho';
      candidatura.status = 'em_andamento';
      candidatura.inicioEm = dto.inicioEm
        ? new Date(dto.inicioEm)
        : (candidatura.inicioEm ?? new Date());
      if (dto.grupo !== undefined) candidatura.grupo = dto.grupo;
      candidatura.apadrinhados = dto.apadrinhados ?? candidatura.apadrinhados;
      return this.participacoes.save(candidatura);
    }

    const registro = this.participacoes.create({
      usuarioId,
      programa,
      papel,
      status: 'em_andamento' satisfies StatusParticipacaoRegistro,
      apadrinhados: dto.apadrinhados ?? 0,
      inicioEm: dto.inicioEm ? new Date(dto.inicioEm) : new Date(),
    });
    if (dto.grupo !== undefined) {
      registro.grupo = dto.grupo;
    }
    return this.participacoes.save(registro);
  }

  async rejeitarCandidatura(
    dto: RejeitarCandidaturaDto,
  ): Promise<ParticipacaoEntity | null> {
    const usuarioId = this.normalizarUsuario(dto.usuarioId);
    const programa = dto.programa?.trim() || ParticipacoesService.programaAtual();

    const candidatura = await this.participacoes.findOne({
      where: { usuarioId, programa, papel: 'candidato' },
    });
    if (!candidatura) {
      return null;
    }
    if (candidatura.status === 'nao_aprovado') {
      return candidatura;
    }

    candidatura.status = 'nao_aprovado';
    candidatura.terminoEm = new Date();
    return this.participacoes.save(candidatura);
  }

  private normalizarUsuario(usuarioId: string): string {
    const id = usuarioId?.trim();
    if (!id) {
      throw new BadRequestException('usuarioId é obrigatório.');
    }
    return id.toLowerCase();
  }
}

export type { PapelParticipacao };
