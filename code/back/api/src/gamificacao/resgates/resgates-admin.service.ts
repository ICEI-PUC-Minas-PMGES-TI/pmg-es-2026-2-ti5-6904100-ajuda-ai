import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { DataSource, type QueryRunner } from 'typeorm';
import {
  ehViolacaoCheck,
  ehViolacaoUnica,
  registrarMovimentacao,
  type ResponsavelCoordenacao,
  schemaUsuarios,
  travarCarteira,
} from '../gamificacao.js';
import { notificacaoResgate } from '../../notificacoes/notificacoes.js';
import { NotificacoesService } from '../../notificacoes/notificacoes.service.js';
import { normalizarJustificativa } from '../justificativa.js';
import type {
  ListarResgatesQuery,
  PaginaResgatesAdminDto,
  ResgateAdminDto,
} from './resgates-admin.dto.js';
import {
  chaveEstorno,
  COLUNAS_SITUACAO,
  type DesfechoResgate,
  MOTIVO_CANCELAMENTO,
  PAGINA_RESGATES,
  type SituacaoResgate,
} from './resgates.js';

const g = '"gamificacao"';

/** Instante com microssegundos, em UTC: o `criado_em` exato do PostgreSQL. */
const INSTANTE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Cursor da fila: posição (`criado_em`, `id`) do último item da página. Leva
 * os microssegundos do banco; um `Date` do JavaScript (milissegundos) faria
 * a próxima página repetir ou pular resgates criados no mesmo milissegundo.
 */
export function codificarCursor(criadoEm: string, id: string): string {
  return Buffer.from(`${criadoEm}|${id}`, 'utf8').toString('base64url');
}

export function decodificarCursor(cursor: string): {
  criadoEm: string;
  id: string;
} {
  const [criadoEm, id, ...resto] = Buffer.from(cursor, 'base64url')
    .toString('utf8')
    .split('|');
  if (resto.length || !INSTANTE.test(criadoEm ?? '') || !UUID.test(id ?? '')) {
    throw new BadRequestException('cursor inválido');
  }
  return { criadoEm, id };
}

/** `%termo%` para ILIKE, com `\`, `%` e `_` do usuário escapados. */
function padraoBusca(busca: string | undefined): string | null {
  const termo = busca?.trim();
  return termo ? `%${termo.replace(/[\\%_]/g, (c) => `\\${c}`)}%` : null;
}

interface Linha {
  id: string;
  codigo: string;
  situacao: SituacaoResgate;
  usuarioId: number;
  nome: string;
  email: string;
  recompensaId: string;
  recompensaNome: string;
  versao: number;
  programaCodigo: string | null;
  programaInferido: boolean;
  custoXp: number;
  condicoesRetirada: string;
  resgatadoEm: Date;
  /** `criado_em` em texto com microssegundos (cursor). */
  cursorEm: string;
  entregueEm: Date | null;
  canceladoEm: Date | null;
  motivoCancelamento: string | null;
  responsavelId: number | null;
  responsavelEmail: string | null;
}

function paraDto(l: Linha): ResgateAdminDto {
  const iso = (d: Date | null) => (d ? new Date(d).toISOString() : null);
  return {
    id: l.id,
    codigo: l.codigo,
    situacao: l.situacao,
    participante: { id: l.usuarioId, nome: l.nome, email: l.email },
    recompensa: {
      id: l.recompensaId,
      nome: l.recompensaNome,
      versao: l.versao,
    },
    programa: { codigo: l.programaCodigo, inferido: l.programaInferido },
    custoXp: l.custoXp,
    condicoesRetirada: l.condicoesRetirada,
    resgatadoEm: new Date(l.resgatadoEm).toISOString(),
    entregueEm: iso(l.entregueEm),
    canceladoEm: iso(l.canceladoEm),
    motivoCancelamento: l.motivoCancelamento,
    responsavel:
      l.situacao === 'aguardando_entrega'
        ? null
        : { id: l.responsavelId, email: l.responsavelEmail },
  };
}

/**
 * Acompanhamento dos resgates pela coordenação (F29): entrega e cancelamento
 * administrativo. O resgate em si nunca muda (tabela só de inserção); o
 * desfecho é uma linha em `resgate_desfechos`, no máximo uma por resgate.
 *
 * Cancelar devolve o XP (movimentação `RECOMPENSA` positiva, chave
 * `estorno:<id>`) e a unidade comprometida, tudo na mesma transação. A
 * carteira é travada antes do resgate e da recompensa, na mesma ordem do
 * resgate do aluno.
 */
@Injectable()
export class ResgatesAdminService {
  private readonly logger = new Logger(ResgatesAdminService.name);

  constructor(
    private readonly db: DataSource,
    @Optional() private readonly notificacoes?: NotificacoesService,
  ) {}

  private async avisarDesfecho(
    resgate: ResgateAdminDto,
    desfecho: 'entregue' | 'cancelado',
  ): Promise<void> {
    await this.notificacoes?.criar(
      resgate.participante.id,
      notificacaoResgate(desfecho, {
        id: resgate.id,
        nome: resgate.recompensa.nome,
      }),
    );
  }

  /**
   * O resgate é a fonte de tudo o que a coordenação vê: nome, versão, custo e
   * programa são os do momento da troca. Não há JOIN com `recompensas`, então
   * editar o catálogo depois não reescreve o histórico.
   */
  private select(): string {
    const u = schemaUsuarios(this.db);
    return (
      `SELECT r."id", r."codigo", r."usuario_id" AS "usuarioId", us."nome", us."email", ` +
      `r."recompensa_id" AS "recompensaId", r."nome" AS "recompensaNome", r."versao", ` +
      `r."programa_codigo" AS "programaCodigo", r."programa_inferido" AS "programaInferido", ` +
      `r."custo_xp" AS "custoXp", r."condicoes_retirada" AS "condicoesRetirada", ` +
      `r."criado_em" AS "resgatadoEm", ` +
      `to_char(r."criado_em" AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS "cursorEm", ` +
      `${COLUNAS_SITUACAO}, d."responsavel_id" AS "responsavelId", d."responsavel_email" AS "responsavelEmail" ` +
      `FROM ${g}."resgates" r ` +
      `JOIN ${u}."usuarios" us ON us."id" = r."usuario_id" ` +
      `LEFT JOIN ${g}."resgate_desfechos" d ON d."resgate_id" = r."id" `
    );
  }

  /**
   * Fila da coordenação (F29). Situação, programa, recompensa e busca entram
   * no `WHERE`, antes do `LIMIT`: um resgate pendente nunca some porque
   * outros vieram depois dele. A paginação é por cursor (keyset em
   * `criado_em DESC, id DESC`), estável mesmo com resgates novos chegando ou
   * mudando de situação entre uma página e outra.
   */
  async listar(filtros: ListarResgatesQuery): Promise<PaginaResgatesAdminDto> {
    const semPrograma = filtros.semPrograma === 'true';
    if (semPrograma && filtros.programa) {
      throw new BadRequestException(
        'Use programa ou semPrograma, não os dois.',
      );
    }
    const limite =
      filtros.limite === undefined
        ? PAGINA_RESGATES.padrao
        : Number(filtros.limite);
    const cursor = filtros.cursor ? decodificarCursor(filtros.cursor) : null;

    // Filtros comuns à página e à contagem ($1..$4).
    const comuns =
      `($1::text IS NULL OR r."programa_codigo" = $1) ` +
      `AND (NOT $2::boolean OR r."programa_codigo" IS NULL) ` +
      `AND ($3::uuid IS NULL OR r."recompensa_id" = $3) ` +
      `AND ($4::text IS NULL OR us."nome" ILIKE $4 OR us."email" ILIKE $4 ` +
      `OR r."codigo" ILIKE $4 OR r."nome" ILIKE $4)`;
    const parametros = [
      filtros.programa ?? null,
      semPrograma,
      filtros.recompensaId ?? null,
      padraoBusca(filtros.busca),
    ];

    const [linhas, [contagem]] = await Promise.all([
      this.db.query(
        `${this.select()} WHERE ${comuns} ` +
          `AND ($5::text IS NULL OR COALESCE(d."tipo", 'aguardando_entrega') = $5) ` +
          `AND ($6::timestamptz IS NULL OR (r."criado_em", r."id") < ($6::timestamptz, $7::uuid)) ` +
          `ORDER BY r."criado_em" DESC, r."id" DESC LIMIT $8`,
        [
          ...parametros,
          filtros.situacao ?? null,
          cursor?.criadoEm ?? null,
          cursor?.id ?? null,
          limite + 1,
        ],
      ) as Promise<Linha[]>,
      this.db.query(
        `SELECT count(*)::int AS "todos", ` +
          `(count(*) FILTER (WHERE d."tipo" IS NULL))::int AS "aguardando_entrega", ` +
          `(count(*) FILTER (WHERE d."tipo" = 'entregue'))::int AS "entregue", ` +
          `(count(*) FILTER (WHERE d."tipo" = 'cancelado'))::int AS "cancelado" ` +
          `FROM ${g}."resgates" r ` +
          `JOIN ${schemaUsuarios(this.db)}."usuarios" us ON us."id" = r."usuario_id" ` +
          `LEFT JOIN ${g}."resgate_desfechos" d ON d."resgate_id" = r."id" ` +
          `WHERE ${comuns}`,
        parametros,
      ) as Promise<Array<PaginaResgatesAdminDto['contagem']>>,
    ]);

    // Pede um a mais só para saber se há próxima página.
    const temMais = linhas.length > limite;
    const pagina = temMais ? linhas.slice(0, limite) : linhas;
    const ultima = pagina.at(-1);
    return {
      itens: pagina.map(paraDto),
      proximoCursor:
        temMais && ultima ? codificarCursor(ultima.cursorEm, ultima.id) : null,
      contagem,
    };
  }

  async detalhe(id: string): Promise<ResgateAdminDto> {
    const [linha] = (await this.db.query(`${this.select()} WHERE r."id" = $1`, [
      id,
    ])) as Linha[];
    if (!linha) throw new NotFoundException('Resgate não encontrado.');
    return paraDto(linha);
  }

  async entregar(
    id: string,
    responsavel: ResponsavelCoordenacao,
  ): Promise<ResgateAdminDto> {
    await this.emTransacao(id, 'entregue', async (qr) => {
      await this.travarSemDesfecho(qr, id);
      await this.gravarDesfecho(qr, id, 'entregue', responsavel);
    });
    this.logger.log(`resgate entregue id=${id}`);
    const entregue = await this.detalhe(id);
    await this.avisarDesfecho(entregue, 'entregue');
    return entregue;
  }

  async cancelar(
    id: string,
    motivo: string,
    responsavel: ResponsavelCoordenacao,
  ): Promise<ResgateAdminDto> {
    await this.emTransacao(id, 'cancelado', async (qr) => {
      const [resgate] = (await qr.query(
        `SELECT "usuario_id" AS "usuarioId", "recompensa_id" AS "recompensaId", "custo_xp" AS "custoXp", "nome" ` +
          `FROM ${g}."resgates" WHERE "id" = $1`,
        [id],
      )) as Array<{
        usuarioId: number;
        recompensaId: string;
        custoXp: number;
        nome: string;
      }>;
      if (!resgate) throw new NotFoundException('Resgate não encontrado.');
      await travarCarteira(qr, resgate.usuarioId);
      await this.travarSemDesfecho(qr, id);
      await qr.query(
        `SELECT 1 FROM ${g}."recompensas" WHERE "id" = $1 FOR UPDATE`,
        [resgate.recompensaId],
      );
      const estorno = await registrarMovimentacao(qr, {
        usuarioId: resgate.usuarioId,
        quantidade: resgate.custoXp,
        tipo: 'RECOMPENSA',
        referenciaTipo: 'RESGATE',
        referenciaId: id,
        descricao: `Estorno: ${resgate.nome}`.slice(0, 200),
        chaveIdempotencia: chaveEstorno(id),
      });
      // Sem tocar em `atualizado_em` (marca só edições da coordenação).
      await qr.query(
        `UPDATE ${g}."recompensas" SET "estoque_comprometido" = "estoque_comprometido" - 1 WHERE "id" = $1`,
        [resgate.recompensaId],
      );
      await this.gravarDesfecho(
        qr,
        id,
        'cancelado',
        responsavel,
        normalizarJustificativa(motivo),
        estorno.movimentacaoId,
      );
    });
    this.logger.log(`resgate cancelado id=${id}`);
    const cancelado = await this.detalhe(id);
    await this.avisarDesfecho(cancelado, 'cancelado');
    return cancelado;
  }

  /** Trava o resgate e recusa se ele já foi entregue ou cancelado. */
  private async travarSemDesfecho(qr: QueryRunner, id: string): Promise<void> {
    const [linha] = (await qr.query(
      `SELECT r."id", d."tipo" FROM ${g}."resgates" r ` +
        `LEFT JOIN ${g}."resgate_desfechos" d ON d."resgate_id" = r."id" ` +
        `WHERE r."id" = $1 FOR UPDATE OF r`,
      [id],
    )) as Array<{ id: string; tipo: DesfechoResgate | null }>;
    if (!linha) throw new NotFoundException('Resgate não encontrado.');
    if (linha.tipo) throw this.jaConcluido(linha.tipo);
  }

  private jaConcluido(tipo: DesfechoResgate): ConflictException {
    return new ConflictException({
      statusCode: 409,
      message:
        tipo === 'entregue'
          ? 'Este resgate já foi entregue.'
          : 'Este resgate já foi cancelado.',
      motivo: tipo === 'entregue' ? 'resgate-entregue' : 'resgate-cancelado',
    });
  }

  private async gravarDesfecho(
    qr: QueryRunner,
    id: string,
    tipo: DesfechoResgate,
    responsavel: ResponsavelCoordenacao,
    motivo: string | null = null,
    estornoId: string | null = null,
  ): Promise<void> {
    await qr.query(
      `INSERT INTO ${g}."resgate_desfechos" ` +
        `("resgate_id", "tipo", "motivo", "movimentacao_estorno_id", "responsavel_id", "responsavel_email") ` +
        `VALUES ($1, $2, $3, $4, $5, $6)`,
      [id, tipo, motivo, estornoId, responsavel.id, responsavel.email],
    );
  }

  /**
   * Transação própria. Duas ações simultâneas no mesmo resgate esperam a
   * trava; se mesmo assim uma corrida chegar ao UNIQUE, vira 409.
   *
   * O desfecho vencedor é lido pelo MESMO QueryRunner, depois do rollback e
   * antes do `release()`. Pedir outra conexão ao pool (`this.db.query`)
   * enquanto esta continua presa pode esperar indefinidamente com o pool
   * cheio, por exemplo com várias instâncias correndo para o mesmo resgate.
   */
  private async emTransacao(
    id: string,
    tipo: DesfechoResgate,
    corpo: (qr: QueryRunner) => Promise<void>,
  ): Promise<void> {
    const qr = this.db.createQueryRunner();
    await qr.connect();
    try {
      await qr.startTransaction();
      try {
        await corpo(qr);
        await qr.commitTransaction();
      } catch (erro) {
        await qr.rollbackTransaction();
        throw erro;
      }
    } catch (erro) {
      if (
        ehViolacaoUnica(erro, 'uq_resgate_desfechos_resgate') ||
        ehViolacaoUnica(erro, 'uq_xp_movimentacoes_chave')
      ) {
        const [d] = (await qr.query(
          `SELECT "tipo" FROM ${g}."resgate_desfechos" WHERE "resgate_id" = $1`,
          [id],
        )) as Array<{ tipo: DesfechoResgate }>;
        throw this.jaConcluido(d?.tipo ?? tipo);
      }
      // Rede de segurança: o DTO já recusa o motivo inválido com 400.
      if (ehViolacaoCheck(erro, 'ck_resgate_desfechos_motivo')) {
        throw new BadRequestException(
          `motivo deve ter de ${MOTIVO_CANCELAMENTO.min} a ${MOTIVO_CANCELAMENTO.max} caracteres, sem contar espaços no início e no fim`,
        );
      }
      throw erro;
    } finally {
      await qr.release();
    }
  }
}
