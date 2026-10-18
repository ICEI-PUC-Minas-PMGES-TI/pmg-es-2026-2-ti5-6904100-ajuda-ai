import { ParticipacoesService } from '../participacoes/participacoes.service.js';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ParticipacaoEntity } from '../participacoes/entities/participacao.entity.js';
import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type {
  TipoParticipacao,
  UsuarioEntity,
} from '../usuarios/entities/usuario.entity.js';
import { UsuariosService } from '../usuarios/usuarios.service.js';
import type { AuthenticatedRequest } from './authenticated-request.js';

export const TIPOS_PARTICIPACAO_KEY = 'tiposParticipacao';

/** Restringe a rota a padrinhos e/ou apadrinhados (além de aprovados). */
export const TiposParticipacao = (...tipos: TipoParticipacao[]) =>
  SetMetadata(TIPOS_PARTICIPACAO_KEY, tipos);

export interface ParticipanteRequest extends AuthenticatedRequest {
  usuario: UsuarioEntity;
}

/** Permissões derivam exclusivamente de participação com vínculo válido no ciclo informado. */
@Injectable()
export class CadastroAprovadoGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly usuariosService: UsuariosService,
    @InjectRepository(ParticipacaoEntity)
    private readonly participacoes: Repository<ParticipacaoEntity>,
  ) {}

  async canActivate(contexto: ExecutionContext): Promise<boolean> {
    const requisicao = contexto
      .switchToHttp()
      .getRequest<ParticipanteRequest>();
    const usuario = await this.usuariosService.buscarPorEmail(
      requisicao.user?.email ?? '',
    );
    if (!usuario) {
      throw new ForbiddenException(
        'Recurso exclusivo de alunos cadastrados no programa.',
      );
    }
    const programa =
      typeof requisicao.query.programa === 'string'
        ? requisicao.query.programa.trim()
        : '';
    if (!programa)
      throw new ForbiddenException(
        'Informe o programa para verificar participação com vínculo confirmado.',
      );
    const registros = await this.participacoes.find({
      where: { usuarioId: usuario.email, programa, status: 'em_andamento' },
    });
    const tipos = this.reflector.getAllAndOverride<TipoParticipacao[]>(
      TIPOS_PARTICIPACAO_KEY,
      [contexto.getHandler(), contexto.getClass()],
    );
    let ativo = false;
    for (const registro of registros) {
      if (
        !registro.grupo?.trim() ||
        !['padrinho', 'apadrinhado'].includes(registro.papel)
      )
        continue;
      if (tipos?.length && !tipos.includes(registro.papel as TipoParticipacao))
        continue;
      const grupo = await this.participacoes.find({
        where: { programa, grupo: registro.grupo },
      });
      if (ParticipacoesService.vinculoValido(registro, grupo)) ativo = true;
    }
    if (!ativo)
      throw new ForbiddenException(
        'Recurso exclusivo de participação ativa com vínculo confirmado neste ciclo.',
      );

    requisicao.usuario = usuario;
    return true;
  }
}
