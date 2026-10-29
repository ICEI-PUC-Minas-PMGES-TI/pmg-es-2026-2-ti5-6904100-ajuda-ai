import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import type {
  AccessTokenPayload,
  AuthenticatedRequest,
} from '../auth/authenticated-request.js';

/** Ponto único para futuramente consultar a concessão FEED_PUBLISH no banco. */
@Injectable()
export class FeedPolicy {
  podePublicar(usuario: AccessTokenPayload): boolean {
    return usuario.perfil === 'coordenador';
  }

  exigirPublicacao(usuario: AccessTokenPayload): void {
    if (!this.podePublicar(usuario))
      throw new ForbiddenException(
        'Você não tem permissão para publicar ou administrar o feed.',
      );
  }
}

@Injectable()
export class FeedPublishGuard implements CanActivate {
  constructor(private readonly policy: FeedPolicy) {}
  canActivate(contexto: ExecutionContext): boolean {
    this.policy.exigirPublicacao(
      contexto.switchToHttp().getRequest<AuthenticatedRequest>().user,
    );
    return true;
  }
}
