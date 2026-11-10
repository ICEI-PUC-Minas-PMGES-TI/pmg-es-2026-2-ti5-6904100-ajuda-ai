import { randomUUID } from 'node:crypto';
import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { DataSource, type QueryRunner } from 'typeorm';
import {
  registrarMovimentacao,
  SaldoInsuficienteError,
  schemaUsuarios,
  travarCarteira,
} from '../gamificacao.js';

const g = '"gamificacao"';

/** Quem consulta/resgata: `usuarios.id`, e-mail e papel do token. */
export interface Aluno {
  id: number;
  email: string;
  perfil: 'padrinho' | 'apadrinhado';
}

/** Item da lojinha visto pelo aluno. */
export interface Recompensa {
  id: string;
  nome: string;
  descricao: string;
  imagemUrl: string | null;
  custoXp: number;
  /** Unidades disponíveis agora; `null` = ilimitado. */
  estoque: number | null;
  condicoesRetirada: string;
  limitePorAluno: number | null;
  /** Resgates que este aluno já fez desta recompensa. */
  resgatesFeitos: number;
  disponivelAte: Date | null;
  versao: number;
}

/** O que o aluno viu na tela de revisão antes de confirmar. */
export interface Confirmado {
  versao: number;
  custoXp: number;
}

export interface Resgate {
  id: string;
  codigo: string;
  recompensaId: string;
  versao: number;
  nome: string;
  descricao: string;
  custoXp: number;
  condicoesRetirada: string;
  criadoEm: Date;
  saldoApos: number;
  imagemUrl: string | null;
}

function participacaoAtiva(schemaFeed: string, extra = ''): string {
  return (
    `SELECT 1 FROM ${schemaFeed}."participacoes" p ` +
    `WHERE p."usuario_id" IN ($2::text, $3) ` +
    `AND (p."papel" = $1 OR ($1 = 'padrinho' AND p."papel" = 'candidato')) ` +
    `AND p."status" IN ('aprovado', 'em_andamento') ${extra}`
  );
}

/**
 * Condição de visibilidade de `r` para o aluno ($1 papel, $2 id, $3 e-mail):
 * publicada, dentro da vigência, do público certo e, quando restrita a um
 * programa, só para quem participa ativamente dele.
 */
function visivel(schemaFeed: string): string {
  return (
    `r."status" = 'publicada' ` +
    `AND (r."disponivel_de" IS NULL OR r."disponivel_de" <= now()) ` +
    `AND (r."disponivel_ate" IS NULL OR r."disponivel_ate" > now()) ` +
    `AND (r."publico" = 'todos' OR (r."publico" = 'padrinhos' AND $1 = 'padrinho') ` +
    `OR (r."publico" = 'apadrinhados' AND $1 = 'apadrinhado')) ` +
    `AND (r."programa_codigo" IS NULL OR EXISTS (${participacaoAtiva(schemaFeed, 'AND p."programa" = r."programa_codigo"')}))`
  );
}

const COLUNAS =
  `r."id", r."nome", r."descricao", r."imagem_url" AS "imagemUrl", r."custo_xp" AS "custoXp", ` +
  `CASE WHEN r."estoque_ilimitado" THEN NULL ELSE GREATEST(r."estoque_total" - r."estoque_comprometido", 0) END AS "estoque", ` +
  `r."condicoes_retirada" AS "condicoesRetirada", r."limite_por_aluno" AS "limitePorAluno", ` +
  `(SELECT count(*)::int FROM ${g}."resgates" s WHERE s."recompensa_id" = r."id" AND s."usuario_id" = $2) AS "resgatesFeitos", ` +
  `r."disponivel_ate" AS "disponivelAte", r."versao"`;

const RESGATE =
  `SELECT r."id", r."codigo", r."recompensa_id" AS "recompensaId", r."versao", r."nome", r."descricao", ` +
  `r."custo_xp" AS "custoXp", r."condicoes_retirada" AS "condicoesRetirada", ` +
  `r."criado_em" AS "criadoEm", m."saldo_apos" AS "saldoApos", c."imagem_url" AS "imagemUrl" ` +
  `FROM ${g}."resgates" r JOIN ${g}."xp_movimentacoes" m ON m."id" = r."movimentacao_id" ` +
  `JOIN ${g}."recompensas" c ON c."id" = r."recompensa_id" `;

/**
 * Consulta e resgate da lojinha pelo aluno. O cadastro (F27) fica em
 * `RecompensasAdminService`; aqui só se lê a recompensa e se compromete
 * estoque. O ledger de XP continua sendo a fonte do saldo.
 */
@Injectable()
export class LojinhaService {
  constructor(private readonly db: DataSource) {}

  private async exigirParticipacao(
    executor: DataSource | QueryRunner,
    aluno: Aluno,
  ): Promise<void> {
    const [linha] = (await executor.query(
      `${participacaoAtiva(schemaUsuarios(this.db))} LIMIT 1`,
      [aluno.perfil, aluno.id, aluno.email],
    )) as unknown[];
    if (!linha) {
      throw new ForbiddenException({
        statusCode: 403,
        message: 'A lojinha é só para participantes ativos do programa.',
        motivo: 'sem-participacao',
      });
    }
  }

  async listar(aluno: Aluno): Promise<Recompensa[]> {
    await this.exigirParticipacao(this.db, aluno);
    return this.db.query(
      `SELECT ${COLUNAS} FROM ${g}."recompensas" r WHERE ${visivel(schemaUsuarios(this.db))} ORDER BY r."nome", r."id"`,
      [aluno.perfil, aluno.id, aluno.email],
    ) as Promise<Recompensa[]>;
  }

  async detalhe(aluno: Aluno, id: string): Promise<Recompensa> {
    await this.exigirParticipacao(this.db, aluno);
    const [item] = (await this.db.query(
      `SELECT ${COLUNAS} FROM ${g}."recompensas" r WHERE r."id" = $4 AND ${visivel(schemaUsuarios(this.db))}`,
      [aluno.perfil, aluno.id, aluno.email, id],
    )) as Recompensa[];
    if (!item) throw new NotFoundException('Recompensa indisponível.');
    return item;
  }

  historico(usuarioId: number): Promise<Resgate[]> {
    return this.db.query(
      `${RESGATE} WHERE r."usuario_id" = $1 ORDER BY r."criado_em" DESC, r."id" DESC`,
      [usuarioId],
    ) as Promise<Resgate[]>;
  }

  async comprovante(usuarioId: number, id: string): Promise<Resgate> {
    const [resgate] = (await this.db.query(
      `${RESGATE} WHERE r."usuario_id" = $1 AND r."id" = $2`,
      [usuarioId, id],
    )) as Resgate[];
    if (!resgate) throw new NotFoundException('Resgate não encontrado.');
    return resgate;
  }

  /**
   * Carteira e recompensa ficam travadas até o commit (mesma ordem em todo
   * resgate; o cadastro só trava a recompensa). Toda falha desfaz débito e
   * estoque. O resgate grava a versão vista, então editar a recompensa
   * depois não muda as condições do comprovante. Se a recompensa mudou
   * (versão ou custo) desde a revisão, nada é debitado e o app precisa
   * mostrar os dados novos antes de uma nova confirmação.
   */
  async resgatar(
    aluno: Aluno,
    recompensaId: string,
    chave: string,
    confirmado: Confirmado,
  ): Promise<Resgate & { saldoAtual: number }> {
    const usuarioId = aluno.id;
    const qr = this.db.createQueryRunner();
    await qr.connect();
    await qr.startTransaction();
    try {
      const saldoAtual = await travarCarteira(qr, usuarioId);
      const [anterior] = (await qr.query(
        `${RESGATE} WHERE r."usuario_id" = $1 AND r."chave_idempotencia" = $2`,
        [usuarioId, chave],
      )) as Resgate[];
      if (anterior) {
        if (anterior.recompensaId !== recompensaId) {
          throw new ConflictException('Chave já usada para outra recompensa.');
        }
        await qr.commitTransaction();
        return { ...anterior, saldoAtual };
      }
      await this.exigirParticipacao(qr, aluno);

      await qr.query(
        `SELECT 1 FROM ${g}."recompensas" WHERE "id" = $1 FOR UPDATE`,
        [recompensaId],
      );
      const [item] = (await qr.query(
        `SELECT ${COLUNAS} FROM ${g}."recompensas" r WHERE r."id" = $4 AND ${visivel(schemaUsuarios(this.db))}`,
        [aluno.perfil, usuarioId, aluno.email, recompensaId],
      )) as Recompensa[];
      if (!item) throw new NotFoundException('Recompensa indisponível.');
      if (
        item.versao !== confirmado.versao ||
        item.custoXp !== confirmado.custoXp
      ) {
        throw new ConflictException({
          statusCode: 409,
          message: `Esta recompensa mudou e agora custa ${item.custoXp} XP. Volte e revise antes de confirmar.`,
          motivo: 'recompensa-alterada',
          versao: item.versao,
          custoXp: item.custoXp,
        });
      }
      if (item.estoque !== null && item.estoque <= 0) {
        throw new ConflictException('Recompensa esgotada.');
      }
      if (
        item.limitePorAluno !== null &&
        item.resgatesFeitos >= item.limitePorAluno
      ) {
        throw new ConflictException(
          'Você já atingiu o limite de resgates desta recompensa.',
        );
      }

      const id = randomUUID();
      let movimento;
      try {
        movimento = await registrarMovimentacao(qr, {
          usuarioId,
          quantidade: -item.custoXp,
          tipo: 'RECOMPENSA',
          referenciaTipo: 'RESGATE',
          referenciaId: id,
          descricao: `Resgate: ${item.nome}`.slice(0, 200),
          chaveIdempotencia: `resgate:${usuarioId}:${chave}`,
        });
      } catch (erro) {
        if (erro instanceof SaldoInsuficienteError) {
          throw new UnprocessableEntityException('Saldo de XP insuficiente.');
        }
        throw erro;
      }
      // Sem tocar em `atualizado_em`: ele marca edições da coordenação, e um
      // resgate não deve invalidar o formulário aberto por ela.
      await qr.query(
        `UPDATE ${g}."recompensas" SET "estoque_comprometido" = "estoque_comprometido" + 1 WHERE "id" = $1`,
        [recompensaId],
      );
      const [resgate] = (await qr.query(
        `INSERT INTO ${g}."resgates" ` +
          `("id", "usuario_id", "recompensa_id", "versao", "movimentacao_id", "chave_idempotencia", "nome", "descricao", "custo_xp", "condicoes_retirada") ` +
          `VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) ` +
          `RETURNING "id", "codigo", "recompensa_id" AS "recompensaId", "versao", "nome", "descricao", "custo_xp" AS "custoXp", ` +
          `"condicoes_retirada" AS "condicoesRetirada", "criado_em" AS "criadoEm"`,
        [
          id,
          usuarioId,
          recompensaId,
          item.versao,
          movimento.movimentacaoId,
          chave,
          item.nome,
          item.descricao,
          item.custoXp,
          item.condicoesRetirada,
        ],
      )) as Resgate[];
      await qr.commitTransaction();
      return {
        ...resgate,
        imagemUrl: item.imagemUrl,
        saldoApos: movimento.saldo,
        saldoAtual: movimento.saldo,
      };
    } catch (erro) {
      await qr.rollbackTransaction();
      throw erro;
    } finally {
      await qr.release();
    }
  }
}
