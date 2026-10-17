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

/**
 * Libera apenas alunos com cadastro APROVADO. Use depois do JwtAuthGuard.
 * O status é lido do banco a cada requisição (não do token), então uma
 * aprovação/rejeição vale imediatamente.
 */
@Injectable()
export class CadastroAprovadoGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly usuariosService: UsuariosService,
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
    if (usuario.statusCadastro === 'pendente') {
      throw new ForbiddenException(
        'Seu cadastro ainda está aguardando a análise da coordenação.',
      );
    }
    if (usuario.statusCadastro === 'rejeitado') {
      throw new ForbiddenException(
        'Seu cadastro não foi aprovado pela coordenação.',
      );
    }

    const tipos = this.reflector.getAllAndOverride<TipoParticipacao[]>(
      TIPOS_PARTICIPACAO_KEY,
      [contexto.getHandler(), contexto.getClass()],
    );
    if (tipos?.length && !tipos.includes(usuario.tipoParticipacao)) {
      throw new ForbiddenException(
        `Recurso exclusivo para ${tipos.join(' ou ')}.`,
      );
    }

    requisicao.usuario = usuario;
    return true;
  }
}
