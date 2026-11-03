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
import { ParticipacoesService } from '../participacoes/participacoes.service.js';
import { ProgramasService } from '../programas/programas.service.js';

/** Publicação depende da participação atual; o perfil JWT sozinho não a concede. */
@Injectable()
export class FeedPolicy {
  constructor(
    private readonly participacoes: ParticipacoesService,
    private readonly programas: ProgramasService,
  ) {}

  async podePublicar(usuario: AccessTokenPayload): Promise<boolean> {
    if (this.podeAdministrar(usuario)) return true;
    if (usuario.perfil !== 'padrinho') return false;

    // O feed é global: o cliente não pode escolher um ciclo antigo para publicar.
    const codigo = ParticipacoesService.programaAtual();
    const programa = await this.programas.buscarPorCodigo(codigo);
    if (!programa || programa.etapaAtual === 'encerramento') return false;
    const registro = await this.participacoes.registroPrincipal(
      usuario.email,
      codigo,
    );
    if (!registro || registro.terminoEm) return false;
    return (
      (await this.participacoes.situacaoDoRegistro(registro)) ===
      'padrinho_ativo'
    );
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

  async exigirPublicacao(usuario: AccessTokenPayload): Promise<void> {
    if (!(await this.podePublicar(usuario)))
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
  async canActivate(contexto: ExecutionContext): Promise<boolean> {
    await this.policy.exigirPublicacao(
      contexto.switchToHttp().getRequest<AuthenticatedRequest>().user,
    );
    return true;
  }
}
