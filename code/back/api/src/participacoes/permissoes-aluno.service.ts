import { ForbiddenException, Injectable } from '@nestjs/common';
import type { AccessTokenPayload } from '../auth/authenticated-request.js';
import { ProgramasService } from '../programas/programas.service.js';
import type { ParticipacaoEntity } from './entities/participacao.entity.js';
import {
  ParticipacoesService,
  type SituacaoAluno,
} from './participacoes.service.js';

export type PapelNoCiclo = 'padrinho' | 'apadrinhado';

/**
 * O que um usuário pode fazer no ciclo atual. Para alunos, tudo deriva da
 * participação no ciclo, nunca do claim `perfil` do JWT: esse claim vem de
 * `usuarios.tipoParticipacao`, que fica `'nenhuma'` nas contas reais.
 */
export interface PermissoesAluno {
  programa: string;
  coordenador: boolean;
  situacao: SituacaoAluno;
  /** Papel no ciclo atual; `null` para quem não participa dele. */
  papel: PapelNoCiclo | null;
  /** Aprovado no ciclo atual, com ou sem par (DP-22). */
  participante: boolean;
  vinculoAtivo: boolean;
  /** Feed e SSE (DP-01, DP-22). */
  podeLerFeed: boolean;
  /** Comentar e curtir posts e comentários (DP-20, DP-23). */
  podeInteragir: boolean;
  /** Só padrinho com vínculo ativo (ou coordenação). */
  podePublicar: boolean;
  /** Ganhar XP em totens (DP-07, DP-22). */
  podeColetarTotens: boolean;
  /** Resgatar na lojinha; ex-participante mantém o saldo mas não gasta (DP-07). */
  podeUsarLojinha: boolean;
}

const STATUS_PARTICIPANTE = new Set(['aprovado', 'em_andamento']);

@Injectable()
export class PermissoesAlunoService {
  constructor(
    private readonly participacoes: ParticipacoesService,
    private readonly programas: ProgramasService,
  ) {}

  /**
   * Calculado a cada chamada (sem cache): uma participação encerrada no meio
   * da sessão corta o acesso na hora, sem esperar o JWT expirar.
   */
  doUsuario(usuario: AccessTokenPayload): Promise<PermissoesAluno> {
    return this.calcular(usuario);
  }

  async exigir(
    usuario: AccessTokenPayload,
    permissao: keyof Pick<
      PermissoesAluno,
      | 'podeLerFeed'
      | 'podeInteragir'
      | 'podePublicar'
      | 'podeColetarTotens'
      | 'podeUsarLojinha'
    >,
    mensagem: string,
  ): Promise<PermissoesAluno> {
    const permissoes = await this.doUsuario(usuario);
    if (!permissoes[permissao])
      throw new ForbiddenException({
        statusCode: 403,
        message: mensagem,
        motivo: 'sem-participacao-no-ciclo',
        situacao: permissoes.situacao,
      });
    return permissoes;
  }

  /**
   * Apadrinhados do padrinho no ciclo atual (moderação de comentários,
   * DP-01/RN-002). Vazio para quem não é padrinho com vínculo.
   */
  async apadrinhadosDe(usuario: AccessTokenPayload): Promise<Set<string>> {
    const permissoes = await this.doUsuario(usuario);
    if (permissoes.papel !== 'padrinho') return new Set();
    const registro = await this.participacoes.registroPrincipal(
      String(usuario.email ?? ''),
      permissoes.programa,
    );
    return this.participacoes.emailsApadrinhadosDe(registro);
  }

  private async calcular(
    usuario: AccessTokenPayload,
  ): Promise<PermissoesAluno> {
    const programa = ParticipacoesService.programaAtual();
    // O papel de coordenador vem da lista de coordenadores no login (não de
    // `tipoParticipacao`), por isso ainda pode vir do token.
    if (usuario.perfil === 'coordenador')
      return PermissoesAlunoService.daCoordenacao(programa);
    const ciclo = await this.programas.buscarPorCodigo(programa);
    const registro =
      ciclo && ciclo.etapaAtual !== 'encerramento'
        ? await this.participacoes.registroPrincipal(
            String(usuario.email ?? ''),
            programa,
          )
        : null;
    return PermissoesAlunoService.derivar(
      programa,
      registro,
      await this.participacoes.situacaoDoRegistro(registro),
    );
  }

  static daCoordenacao(programa: string): PermissoesAluno {
    return {
      programa,
      coordenador: true,
      situacao: 'nenhuma',
      papel: null,
      participante: false,
      vinculoAtivo: false,
      podeLerFeed: true,
      podeInteragir: true,
      podePublicar: true,
      podeColetarTotens: false,
      podeUsarLojinha: false,
    };
  }

  /** Regra pura, testável sem banco. */
  static derivar(
    programa: string,
    registro: ParticipacaoEntity | null,
    situacao: SituacaoAluno,
  ): PermissoesAluno {
    const participante = Boolean(
      registro &&
      !registro.terminoEm &&
      STATUS_PARTICIPANTE.has(registro.status),
    );
    const vinculoAtivo =
      participante &&
      (situacao === 'padrinho_ativo' || situacao === 'apadrinhado_ativo');
    const papel: PapelNoCiclo | null = !participante
      ? null
      : registro!.papel === 'apadrinhado'
        ? 'apadrinhado'
        : 'padrinho';
    return {
      programa,
      coordenador: false,
      situacao,
      papel,
      participante,
      vinculoAtivo,
      podeLerFeed: participante,
      podeInteragir: participante,
      podePublicar: vinculoAtivo && situacao === 'padrinho_ativo',
      podeColetarTotens: participante,
      podeUsarLojinha: participante,
    };
  }
}
