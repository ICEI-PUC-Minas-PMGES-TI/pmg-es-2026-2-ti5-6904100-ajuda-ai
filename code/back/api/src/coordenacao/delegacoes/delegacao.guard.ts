import {
  CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Injectable,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { DataSource } from 'typeorm';
import type { AuthenticatedRequest } from '../../auth/authenticated-request.js';
import { usuarioDoTokenOuNulo } from '../../gamificacao/gamificacao.js';
import type { FuncionalidadeDelegavel } from './delegacoes.js';
import { DelegacoesService } from './delegacoes.service.js';

export const DELEGACAO_KEY = 'delegacao';

export const PermiteDelegacao = (funcionalidade: FuncionalidadeDelegavel) =>
  SetMetadata(DELEGACAO_KEY, funcionalidade);

@Injectable()
export class DelegacaoGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly delegacoes: DelegacoesService,
    private readonly dataSource: DataSource,
  ) {}

  async canActivate(contexto: ExecutionContext): Promise<boolean> {
    const requisicao = contexto
      .switchToHttp()
      .getRequest<AuthenticatedRequest>();
    if (requisicao.user?.perfil === 'coordenador') return true;

    const funcionalidade = this.reflector.getAllAndOverride<
      FuncionalidadeDelegavel | undefined
    >(DELEGACAO_KEY, [contexto.getHandler(), contexto.getClass()]);
    if (!funcionalidade) {
      throw new ForbiddenException(
        'Acesso restrito à coordenação do programa.',
      );
    }

    const usuarioId = await usuarioDoTokenOuNulo(
      this.dataSource,
      requisicao.user,
    );
    if (
      usuarioId === null ||
      !(await this.delegacoes.temDelegacao(usuarioId, funcionalidade))
    ) {
      throw new ForbiddenException(
        'Acesso restrito à coordenação do programa.',
      );
    }
    return true;
  }
}
