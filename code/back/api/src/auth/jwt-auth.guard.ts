import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type {
  AccessTokenPayload,
  AuthenticatedRequest,
} from './authenticated-request.js';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private readonly jwtService: JwtService) {}

  async canActivate(contexto: ExecutionContext): Promise<boolean> {
    const requisicao = contexto
      .switchToHttp()
      .getRequest<AuthenticatedRequest>();
    const [tipo, token] = requisicao.headers.authorization?.split(' ') ?? [];

    if (tipo !== 'Bearer' || !token) {
      throw new UnauthorizedException('Token de acesso não informado.');
    }

    try {
      requisicao.user =
        await this.jwtService.verifyAsync<AccessTokenPayload>(token);
      if (requisicao.user.escopo === 'onboarding') {
        throw new UnauthorizedException(
          'Token de onboarding não autoriza o acesso ao sistema.',
        );
      }
      return true;
    } catch (erro) {
      if (erro instanceof UnauthorizedException) throw erro;
      throw new UnauthorizedException('Token de acesso inválido ou expirado.');
    }
  }
}
