import { Injectable, Logger, Optional } from '@nestjs/common';
import { DataSource } from 'typeorm';
import type { AccessTokenPayload } from '../../auth/authenticated-request.js';
import {
  notificacaoConquista,
  notificacaoNivel,
  type NovaNotificacao,
} from '../../notificacoes/notificacoes.js';
import { NotificacoesService } from '../../notificacoes/notificacoes.service.js';
import { ParticipacoesService } from '../../participacoes/participacoes.service.js';
import { PermissoesAlunoService } from '../../participacoes/permissoes-aluno.service.js';
import { NIVEIS, nivelDe } from '../economia.js';
import {
  ehViolacaoUnica,
  SCHEMA_GAMIFICACAO,
  schemaUsuarios,
  travarCarteira,
  usuarioDoTokenOuNulo,
} from '../gamificacao.js';
import { creditarGanho } from '../ganhos.js';
import type {
  ConquistaDisponivelDto,
  ConquistaObtidaDto,
  ConquistasAlunoDto,
  NovaConquistaDto,
} from './conquistas.dto.js';
import {
  chaveConquista,
  type ContagensConquista,
  contextoDe,
  type CriterioConquista,
  progressoDe,
  sqlConquistaElegivel,
  sqlProgressoConquistas,
  textoCriterio,
} from './conquistas.js';

const g = `"${SCHEMA_GAMIFICACAO}"`;

/** O que o aluno pode desbloquear agora (de `PermissoesAlunoService`). */
export interface AcessoConquistas {
  /** Participa do ciclo atual. Sem participação, só vê as já obtidas. */
  participante: boolean;
  papel: 'padrinho' | 'apadrinhado' | null;
  podePublicar: boolean;
}

interface Candidata {
  id: string;
  nome: string;
  descricao: string;
  imagem_url: string | null;
  criterio: CriterioConquista;
  meta: number;
  xp: number;
}

/**
 * Passadas no máximo. O XP de uma conquista pode subir o nível e liberar uma
 * conquista de nível, cujo XP sobe o nível de novo. Só se faz outra passada
 * quando o nível subiu; como há `NIVEIS.length` níveis, ele sobe no máximo
 * `NIVEIS.length - 1` vezes, então `NIVEIS.length` passadas bastam para
 * liberar a cadeia inteira na mesma consulta.
 */
export const PASSADAS_MAX = NIVEIS.length;

@Injectable()
export class ConquistasService {
  private readonly logger = new Logger('Conquistas');

  constructor(
    private readonly dataSource: DataSource,
    private readonly notificacoes: NotificacoesService,
    @Optional() private readonly permissoes?: PermissoesAlunoService,
  ) {}

  private get u(): string {
    return schemaUsuarios(this.dataSource);
  }

  async listar(
    usuarioId: number,
    acesso: AcessoConquistas,
    agora = new Date(),
  ): Promise<ConquistasAlunoDto> {
    const ciclo = ParticipacoesService.programaAtual(agora);
    const novas = acesso.participante
      ? await this.sincronizar(usuarioId, acesso, ciclo)
      : [];
    const [obtidas, disponiveis] = await Promise.all([
      this.obtidas(usuarioId),
      acesso.participante
        ? this.disponiveis(usuarioId, acesso, ciclo)
        : Promise.resolve([]),
    ]);
    return { ciclo, obtidas, disponiveis, novas };
  }

  /**
   * Confere o progresso real e desbloqueia o que tiver a meta cumprida.
   * Nunca derruba quem chamou (missão, totem, XP): uma falha só gera log.
   * Devolve os desbloqueios feitos agora (id e contexto).
   */
  async sincronizarComSeguranca(
    usuarioId: number,
    acesso: AcessoConquistas,
    ciclo?: string,
  ): Promise<NovaConquistaDto[]> {
    if (!acesso.participante) return [];
    try {
      return await this.sincronizar(usuarioId, acesso, ciclo);
    } catch (erro) {
      this.logger.warn(
        `falha ao conferir conquistas usuario=${usuarioId}: ${(erro as Error).message}`,
      );
      return [];
    }
  }

  /**
   * Depois do commit de uma publicação ou comentário no feed (critérios
   * `FEED_*`, que não passam por missão nem totem). Confere no ciclo da
   * atividade, não no da próxima consulta: quem cumpre a meta no fim do
   * semestre e só volta no seguinte não perde a conquista nem o XP do
   * semestre anterior. Coordenação e quem não é aluno cadastrado: nada a
   * fazer. Nunca derruba a ação no feed.
   */
  async aposAtividadeNoFeed(
    usuario: AccessTokenPayload,
    ciclo: string | null | undefined,
  ): Promise<NovaConquistaDto[]> {
    try {
      if (!this.permissoes) return [];
      const usuarioId = await usuarioDoTokenOuNulo(this.dataSource, usuario);
      if (usuarioId === null) return [];
      const p = await this.permissoes.doUsuario(usuario);
      return await this.sincronizarComSeguranca(
        usuarioId,
        {
          participante: p.podeColetarTotens === true,
          papel: p.papel ?? null,
          podePublicar: p.podePublicar === true,
        },
        ciclo ?? undefined,
      );
    } catch (erro) {
      this.logger.warn(
        `falha ao conferir conquistas do feed: ${(erro as Error).message}`,
      );
      return [];
    }
  }

  /**
   * Desbloqueia o que tiver a meta cumprida no `ciclo` (padrão: o atual).
   * Cada novidade vai com o contexto: a mesma conquista pode ser obtida de
   * novo em outro semestre.
   */
  async sincronizar(
    usuarioId: number,
    acesso: AcessoConquistas,
    ciclo = ParticipacoesService.programaAtual(),
  ): Promise<NovaConquistaDto[]> {
    const novas: NovaConquistaDto[] = [];
    let nivelAnterior: number | null = null;
    for (let passada = 0; passada < PASSADAS_MAX; passada++) {
      const contagens = await this.contagens(usuarioId, ciclo);
      // Fora a primeira, uma passada só traz novidade se o nível subiu: as
      // outras contagens não mudam com o desbloqueio.
      if (nivelAnterior !== null && contagens.nivel <= nivelAnterior) break;
      nivelAnterior = contagens.nivel;
      const candidatas = await this.candidatas(usuarioId, acesso, ciclo);
      const cumpridas = candidatas.filter(
        (c) => progressoDe(c.criterio, contagens) >= c.meta,
      );
      let ganhouXp = false;
      for (const c of cumpridas) {
        const resultado = await this.desbloquear(
          usuarioId,
          c,
          ciclo,
          progressoDe(c.criterio, contagens),
        );
        if (resultado) {
          novas.push({ id: c.id, contexto: resultado.contexto });
          ganhouXp ||= resultado.xp > 0;
        }
      }
      // Só o XP ganho agora muda o nível; sem ele, nada novo a conferir.
      if (!ganhouXp) break;
    }
    return novas;
  }

  private async contagens(
    usuarioId: number,
    ciclo: string,
  ): Promise<ContagensConquista> {
    const [linha] = (await this.dataSource.query(
      sqlProgressoConquistas(this.u),
      [usuarioId, await this.emailDe(usuarioId), ciclo],
    )) as Array<Omit<ContagensConquista, 'nivel'> & { xp: number }>;
    return {
      missoes: linha.missoes,
      pucstops: linha.pucstops,
      publicacoes: linha.publicacoes,
      comentarios: linha.comentarios,
      nivel: nivelDe(linha.xp).numero,
    };
  }

  private async emailDe(usuarioId: number): Promise<string> {
    const [linha] = (await this.dataSource.query(
      `SELECT lower("email") AS email FROM ${this.u}."usuarios" WHERE "id" = $1`,
      [usuarioId],
    )) as Array<{ email: string }>;
    return linha?.email ?? '';
  }

  /** Publicadas e elegíveis, ainda não obtidas no contexto de hoje. */
  private async candidatas(
    usuarioId: number,
    acesso: AcessoConquistas,
    ciclo: string,
  ): Promise<Candidata[]> {
    return (await this.dataSource.query(
      `SELECT c."id", c."nome", c."descricao", c."imagem_url", c."criterio", c."meta", c."xp" FROM ${g}."conquistas" c ` +
        `WHERE ${sqlConquistaElegivel('c', acesso.papel, '$2', acesso.podePublicar)} ` +
        `AND NOT EXISTS (SELECT 1 FROM ${g}."conquistas_desbloqueios" d WHERE d."conquista_id" = c."id" AND d."usuario_id" = $1 ` +
        `AND d."contexto" = CASE WHEN c."criterio" = 'NIVEL_ALCANCADO' THEN 'GERAL' ELSE $2 END) ` +
        `ORDER BY c."publicada_em", c."id"`,
      [usuarioId, ciclo],
    )) as Candidata[];
  }

  /**
   * Um desbloqueio, numa transação com a carteira travada: duas consultas
   * simultâneas do mesmo aluno se enfileiram, e o UNIQUE do desbloqueio e o
   * da chave do ledger barram o repetido. Devolve `null` se já existia ou se
   * a conquista deixou de valer no meio (arquivada).
   */
  private async desbloquear(
    usuarioId: number,
    c: Candidata,
    ciclo: string,
    progresso: number,
  ): Promise<{ xp: number; contexto: string } | null> {
    const contexto = contextoDe(c.criterio, ciclo);
    const qr = this.dataSource.createQueryRunner();
    await qr.connect();
    try {
      await qr.startTransaction();
      await travarCarteira(qr, usuarioId);
      const [definicao] = (await qr.query(
        `SELECT "ativa", "meta", "xp" FROM ${g}."conquistas" WHERE "id" = $1 FOR SHARE`,
        [c.id],
      )) as Array<{ ativa: boolean; meta: number; xp: number }>;
      const [existe] = (await qr.query(
        `SELECT 1 FROM ${g}."conquistas_desbloqueios" WHERE "conquista_id" = $1 AND "usuario_id" = $2 AND "contexto" = $3`,
        [c.id, usuarioId, contexto],
      )) as unknown[];
      if (!definicao?.ativa || existe || progresso < definicao.meta) {
        await qr.rollbackTransaction();
        return null;
      }
      const [{ xp_acumulado: xpAntes }] = (await qr.query(
        `SELECT "xp_acumulado" FROM ${g}."xp_carteiras" WHERE "usuario_id" = $1`,
        [usuarioId],
      )) as Array<{ xp_acumulado: number }>;
      // XP só por regra explícita da definição; 0 = só a medalha.
      const ganho =
        definicao.xp > 0
          ? await creditarGanho(qr, {
              usuarioId,
              fonte: 'CONQUISTA',
              xp: definicao.xp,
              ciclo,
              referenciaTipo: 'CONQUISTA',
              referenciaId: c.id,
              descricao: `Conquista: ${c.nome}`.slice(0, 200),
              chaveIdempotencia: chaveConquista(c.id, usuarioId, contexto),
            })
          : null;
      await qr.query(
        `INSERT INTO ${g}."conquistas_desbloqueios" ("conquista_id", "usuario_id", "contexto", "meta", "progresso", "xp_configurado", "xp_creditado", "movimentacao_id") ` +
          `VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          c.id,
          usuarioId,
          contexto,
          definicao.meta,
          progresso,
          definicao.xp,
          ganho?.xp ?? 0,
          ganho?.movimentacao?.movimentacaoId ?? null,
        ],
      );
      const xp = ganho?.xp ?? 0;
      const avisos: NovaNotificacao[] = [
        notificacaoConquista({ id: c.id, nome: c.nome, contexto, xp }),
      ];
      const xpDepois = ganho?.movimentacao?.xpAcumulado;
      if (
        xpDepois !== undefined &&
        nivelDe(xpDepois).numero > nivelDe(xpAntes).numero
      ) {
        avisos.push(notificacaoNivel(xpDepois));
      }
      // Na mesma transação: se o aviso falhar, o desbloqueio e o XP são
      // desfeitos e a próxima consulta tenta de novo. Nunca fica conquista
      // sem o aviso no sino.
      await this.notificacoes.criarNaTransacao(qr, usuarioId, avisos);
      await qr.commitTransaction();
      this.logger.log(
        `conquista desbloqueada id=${c.id} usuario=${usuarioId} contexto=${contexto} xp=${xp}/${definicao.xp}`,
      );
      return { xp, contexto };
    } catch (erro) {
      if (qr.isTransactionActive) await qr.rollbackTransaction();
      if (
        ehViolacaoUnica(erro, 'uq_conquistas_desbloqueios_contexto') ||
        ehViolacaoUnica(erro, 'uq_xp_movimentacoes_chave')
      ) {
        return null;
      }
      throw erro;
    } finally {
      await qr.release();
    }
  }

  private async obtidas(usuarioId: number): Promise<ConquistaObtidaDto[]> {
    const linhas = (await this.dataSource.query(
      `SELECT c."id", c."nome", c."descricao", c."imagem_url", c."criterio", d."meta", c."ativa", ` +
        `d."contexto", d."xp_creditado", d."criado_em" FROM ${g}."conquistas_desbloqueios" d ` +
        `JOIN ${g}."conquistas" c ON c."id" = d."conquista_id" WHERE d."usuario_id" = $1 ` +
        `ORDER BY d."criado_em" DESC, d."id"`,
      [usuarioId],
    )) as Array<
      Omit<Candidata, 'xp'> & {
        ativa: boolean;
        contexto: string;
        xp_creditado: number;
        criado_em: Date;
      }
    >;
    return linhas.map((l) => ({
      id: l.id,
      nome: l.nome,
      descricao: l.descricao,
      imagemUrl: l.imagem_url,
      // Critério com a meta da época do desbloqueio.
      criterioTexto: textoCriterio(l.criterio, l.meta),
      contexto: l.contexto,
      xpCreditado: l.xp_creditado,
      desbloqueadaEm: l.criado_em.toISOString(),
      arquivada: !l.ativa,
    }));
  }

  private async disponiveis(
    usuarioId: number,
    acesso: AcessoConquistas,
    ciclo: string,
  ): Promise<ConquistaDisponivelDto[]> {
    const [contagens, candidatas] = await Promise.all([
      this.contagens(usuarioId, ciclo),
      this.candidatas(usuarioId, acesso, ciclo),
    ]);
    return candidatas.map((c) => ({
      id: c.id,
      nome: c.nome,
      descricao: c.descricao,
      imagemUrl: c.imagem_url,
      criterio: c.criterio,
      criterioTexto: textoCriterio(c.criterio, c.meta),
      xp: c.xp,
      progresso: {
        atual: Math.min(progressoDe(c.criterio, contagens), c.meta),
        meta: c.meta,
      },
    }));
  }
}
