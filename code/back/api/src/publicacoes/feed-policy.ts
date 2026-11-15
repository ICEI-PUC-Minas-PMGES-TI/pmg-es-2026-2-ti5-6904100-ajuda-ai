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
import { PermissoesAlunoService } from '../participacoes/permissoes-aluno.service.js';

/**
 * Permissões do feed. Para alunos, vêm da participação no ciclo atual
 * (`PermissoesAlunoService`), nunca do claim `perfil` do JWT.
 */
@Injectable()
export class FeedPolicy {
  constructor(private readonly permissoes: PermissoesAlunoService) {}

  /** Resumo para `GET /publicacoes/permissoes` com uma única consulta. */
  async resumo(usuario: AccessTokenPayload) {
    const p = await this.permissoes.doUsuario(usuario);
    return {
      podeLer: p.podeLerFeed,
      podePublicar: p.podePublicar,
      podeAdministrar: this.podeAdministrar(usuario),
      podeInteragir: p.podeInteragir,
    };
  }

  async podeLer(usuario: AccessTokenPayload): Promise<boolean> {
    return (await this.permissoes.doUsuario(usuario)).podeLerFeed;
  }

  async podePublicar(usuario: AccessTokenPayload): Promise<boolean> {
    return (await this.permissoes.doUsuario(usuario)).podePublicar;
  }

  podeAdministrar(usuario: AccessTokenPayload): boolean {
    return usuario.perfil === 'coordenador';
  }

  async podeInteragir(usuario: AccessTokenPayload): Promise<boolean> {
    return (await this.permissoes.doUsuario(usuario)).podeInteragir;
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

  async exigirLeitura(usuario: AccessTokenPayload): Promise<void> {
    await this.permissoes.exigir(
      usuario,
      'podeLerFeed',
      'O feed é dos participantes do apadrinhamento deste semestre.',
    );
  }

  async exigirInteracao(usuario: AccessTokenPayload): Promise<void> {
    await this.permissoes.exigir(
      usuario,
      'podeInteragir',
      'Só participantes do apadrinhamento deste semestre interagem no feed.',
    );
  }

  async exigirPublicacao(usuario: AccessTokenPayload): Promise<void> {
    await this.permissoes.exigir(
      usuario,
      'podePublicar',
      'Você não tem permissão para publicar no feed.',
    );
  }
}

/** Leitura do feed (lista, detalhe, SSE e permissões): participantes do ciclo. */
@Injectable()
export class FeedLeituraGuard implements CanActivate {
  constructor(private readonly policy: FeedPolicy) {}
  async canActivate(contexto: ExecutionContext): Promise<boolean> {
    await this.policy.exigirLeitura(
      contexto.switchToHttp().getRequest<AuthenticatedRequest>().user,
    );
    return true;
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
  async canActivate(contexto: ExecutionContext): Promise<boolean> {
    await this.policy.exigirPublicacao(
      contexto.switchToHttp().getRequest<AuthenticatedRequest>().user,
    );
    return true;
  }
}
