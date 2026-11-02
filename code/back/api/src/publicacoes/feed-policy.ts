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

/** Permissões do feed pelo perfil atual, sem inferir vínculos de matching. */
@Injectable()
export class FeedPolicy {
  podePublicar(usuario: AccessTokenPayload): boolean {
    return ['coordenador', 'padrinho'].includes(usuario.perfil ?? '');
  }

  podeAdministrar(usuario: AccessTokenPayload): boolean {
    return usuario.perfil === 'coordenador';
  }

  podeInteragir(usuario: AccessTokenPayload): boolean {
    return ['coordenador', 'padrinho', 'apadrinhado'].includes(
      usuario.perfil ?? '',
    );
  }

  podeExcluirComentario(usuario: AccessTokenPayload, autorId: string): boolean {
    // Moderação de apadrinhados por padrinho depende do vínculo/contexto definitivo.
    return usuario.email === autorId || this.podeAdministrar(usuario);
  }

  exigirAdministracao(usuario: AccessTokenPayload): void {
    if (!this.podeAdministrar(usuario))
      throw new ForbiddenException(
        'Somente a coordenação administra publicações.',
      );
  }

  exigirInteracao(usuario: AccessTokenPayload): void {
    if (!this.podeInteragir(usuario))
      throw new ForbiddenException('Seu perfil não permite interagir no feed.');
  }

  exigirPublicacao(usuario: AccessTokenPayload): void {
    if (!this.podePublicar(usuario))
      throw new ForbiddenException(
        'Você não tem permissão para publicar no feed.',
      );
  }
}

@Injectable()
export class FeedAdminGuard implements CanActivate {
  constructor(private readonly policy: FeedPolicy) {}
  canActivate(contexto: ExecutionContext): boolean {
    this.policy.exigirAdministracao(
      contexto.switchToHttp().getRequest<AuthenticatedRequest>().user,
    );
    return true;
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
