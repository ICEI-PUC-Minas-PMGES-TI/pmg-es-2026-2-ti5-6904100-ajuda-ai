import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import type { AuthenticatedRequest } from './authenticated-request.js';
import { JwtAuthGuard } from './jwt-auth.guard.js';

/**
 * Como o JwtAuthGuard, mas sem exigir token: se vier `Authorization`, ele é
 * validado e `req.user` é preenchido (token inválido → 401); sem token a rota
 * segue no modo antigo, identificada por `x-user-id` (app mobile).
 */
@Injectable()
export class JwtOpcionalGuard implements CanActivate {
  constructor(private readonly jwtAuthGuard: JwtAuthGuard) {}

  async canActivate(contexto: ExecutionContext): Promise<boolean> {
    const requisicao = contexto
      .switchToHttp()
      .getRequest<AuthenticatedRequest>();
    if (!requisicao.headers.authorization) return true;
    return this.jwtAuthGuard.canActivate(contexto);
  }
}
