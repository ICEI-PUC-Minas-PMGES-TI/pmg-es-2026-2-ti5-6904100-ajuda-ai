import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Perfil } from '../dados/dados.js';
import type { AuthenticatedRequest } from './authenticated-request.js';
import { ROLES_KEY } from './roles.decorator.js';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(contexto: ExecutionContext): boolean {
    const roles = this.reflector.getAllAndOverride<Perfil[]>(ROLES_KEY, [
      contexto.getHandler(),
      contexto.getClass(),
    ]);
    if (!roles?.length) {
      return true;
    }

    const requisicao = contexto
      .switchToHttp()
      .getRequest<AuthenticatedRequest>();
    const perfil = requisicao.user?.perfil;
    if (!perfil || !roles.includes(perfil)) {
      throw new ForbiddenException(
        'Acesso restrito à coordenação do programa.',
      );
    }
    return true;
  }
}
