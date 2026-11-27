import { ForbiddenException, Injectable } from '@nestjs/common';
import type { EntityManager } from 'typeorm';
import { ParticipacaoEntity } from './entities/participacao.entity.js';
import { ProgramaEntity } from '../programas/entities/programa.entity.js';
import { matchingLiberado } from '../programas/etapas.js';
import { registroPrincipalDos } from './vinculos-atuais.js';
import type { AccessTokenPayload } from '../auth/authenticated-request.js';
import { ProgramasService } from '../programas/programas.service.js';
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
   *
   * `programa` (padrão: o ciclo atual) resolve as permissões de outro ciclo:
   * as conquistas do feed usam o ciclo da atividade, não o da conferência.
   */
  async doUsuario(
    usuario: AccessTokenPayload,
    manager?: EntityManager,
    programa: string = ParticipacoesService.programaAtual(),
  ): Promise<PermissoesAluno> {
    return (await this.contexto(usuario, manager, programa)).permissoes;
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
    manager?: EntityManager,
  ): Promise<PermissoesAluno> {
    const permissoes = await this.doUsuario(usuario, manager);
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
    return (await this.contexto(usuario)).apadrinhados;
  }

  async contexto(
    usuario: AccessTokenPayload,
    manager?: EntityManager,
    programa: string = ParticipacoesService.programaAtual(),
  ) {
    // O papel de coordenador vem da lista de coordenadores no login (não de
    // `tipoParticipacao`), por isso ainda pode vir do token.
    if (usuario.perfil === 'coordenador')
      return {
        permissoes: PermissoesAlunoService.daCoordenacao(programa),
        apadrinhados: new Set<string>(),
      };
    const ciclo = manager
      ? await manager
          .getRepository(ProgramaEntity)
          .findOne({ where: { codigo: programa } })
      : await this.programas.buscarPorCodigo(programa);
    const email = String(usuario.email ?? '')
      .trim()
      .toLowerCase();
    const registro =
      ciclo && ciclo.etapaAtual !== 'encerramento'
        ? manager
          ? registroPrincipalDos(
              await manager
                .getRepository(ParticipacaoEntity)
                .find({ where: { usuarioId: email, programa } }),
            )
          : await this.participacoes.registroPrincipal(email, programa)
        : null;
    const vinculados = await this.participacoes.vinculosAtuais(
      registro,
      manager,
    );
    const habilitado =
      !!ciclo && matchingLiberado(ciclo) && !ciclo.inscricoesAbertas;
    const permissoes = PermissoesAlunoService.derivar(
      programa,
      registro,
      ParticipacoesService.situacaoDe(
        registro,
        habilitado && vinculados.length > 0,
      ),
    );
    return {
      permissoes,
      apadrinhados: new Set(
        permissoes.podePublicar
          ? vinculados.map((v) => v.participacao.usuarioId)
          : [],
      ),
    };
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
