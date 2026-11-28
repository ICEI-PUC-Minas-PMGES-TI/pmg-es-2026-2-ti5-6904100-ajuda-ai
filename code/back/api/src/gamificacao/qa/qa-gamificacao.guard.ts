import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { DataSource } from 'typeorm';
import type { AuthenticatedRequest } from '../../auth/authenticated-request.js';
import { usuarioDoTokenOuNulo } from '../gamificacao.js';
import { configQaGamificacao, emailAutorizadoQa } from './qa-gamificacao.config.js';

/**
 * Painel de QA da gamificação. Usar DEPOIS do `JwtAuthGuard` (o e-mail vem
 * do token assinado, nunca da requisição). Regras:
 * - painel desligado (sem lista, ou produção sem liberação explícita) → 404;
 * - e-mail fora da lista → 403;
 * - conta precisa existir em `usuarios` com o mesmo `sub` e e-mail → 403.
 */
@Injectable()
export class QaGamificacaoGuard implements CanActivate {
  private readonly logger = new Logger('QaGamificacao');

  constructor(private readonly dataSource: DataSource) {}

  async canActivate(contexto: ExecutionContext): Promise<boolean> {
    const requisicao = contexto
      .switchToHttp()
      .getRequest<AuthenticatedRequest>();
    const config = configQaGamificacao();
    if (!config.habilitado) throw new NotFoundException();
    if (!emailAutorizadoQa(config, requisicao.user?.email)) {
      throw new ForbiddenException(
        'Painel de testes da gamificação restrito a contas de QA autorizadas.',
      );
    }
    const usuarioId = await usuarioDoTokenOuNulo(
      this.dataSource,
      requisicao.user,
    );
    if (usuarioId === null) {
      throw new ForbiddenException(
        'Painel de testes da gamificação restrito a contas de QA autorizadas.',
      );
    }
    this.logger.log(
      `acesso usuario=${usuarioId} ${requisicao.method} ${requisicao.path}`,
    );
    return true;
  }
}
