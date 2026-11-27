import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { DataSource } from 'typeorm';
import {
  ehViolacaoUnica,
  schemaUsuarios,
} from '../../gamificacao/gamificacao.js';
import { ParticipacoesService } from '../../participacoes/participacoes.service.js';
import {
  type AlunoDetalheDto,
  type AlunoDto,
  type DelegacaoDto,
  type FuncionalidadeDelegavel,
} from './delegacoes.js';

interface LinhaAluno {
  id: number;
  nome: string;
  email: string;
  curso: string;
  periodo: number;
  status_cadastro: string;
  papel: string | null;
  status: string | null;
  programa: string | null;
  delegacoes: FuncionalidadeDelegavel[];
}

function linhasAfetadas(resultado: unknown): number {
  if (!Array.isArray(resultado)) return 0;
  const [primeiro, segundo] = resultado as unknown[];
  if (Array.isArray(primeiro) && typeof segundo === 'number') return segundo;
  return resultado.length;
}

interface LinhaDelegacao {
  id: number;
  funcionalidade: FuncionalidadeDelegavel;
  concedido_por: string;
  concedido_em: Date;
  revogado_por: string | null;
  revogado_em: Date | null;
}

@Injectable()
export class DelegacoesService {
  private readonly logger = new Logger('Delegacoes');

  constructor(private readonly dataSource: DataSource) {}

  private get u(): string {
    return schemaUsuarios(this.dataSource);
  }

  private selecao(): string {
    const u = this.u;
    return (
      `SELECT us."id", us."nome", us."email", us."curso", us."periodo", ` +
      `us."status_cadastro", pa."papel", pa."status", pa."programa", ` +
      `COALESCE(( ` +
      `SELECT jsonb_agg(d."funcionalidade" ORDER BY d."funcionalidade") ` +
      `FROM ${u}."delegacoes" d ` +
      `WHERE d."usuario_id" = us."id" AND d."revogado_em" IS NULL ` +
      `), '[]'::jsonb) AS "delegacoes" ` +
      `FROM ${u}."usuarios" us ` +
      `LEFT JOIN LATERAL (
        SELECT p."papel", p."status", p."programa"
        FROM ${u}."participacoes" p
        WHERE lower(p."usuario_id") = lower(us."email") AND p."programa" = $1
        ORDER BY CASE
          WHEN p."papel" IN ('padrinho', 'apadrinhado') AND p."status" = 'em_andamento' THEN 0
          WHEN p."papel" = 'padrinho' THEN 1
          WHEN p."papel" = 'candidato' THEN 2
          ELSE 3
        END, p."id" DESC
        LIMIT 1
      ) pa ON true `
    );
  }

  private paraDto(linha: LinhaAluno): AlunoDto {
    return {
      id: linha.id,
      nome: linha.nome,
      email: linha.email,
      curso: linha.curso,
      periodo: linha.periodo,
      statusCadastro: linha.status_cadastro,
      participacaoAtual: linha.papel
        ? {
            papel: linha.papel,
            status: linha.status!,
            programa: linha.programa!,
          }
        : null,
      delegacoes: linha.delegacoes,
    };
  }

  async listar(busca?: string): Promise<AlunoDto[]> {
    const programa = ParticipacoesService.programaAtual();
    const termo = busca?.trim();
    const linhas = (await this.dataSource.query(
      `${this.selecao()} ` +
        `WHERE $2::text IS NULL OR us."nome" ILIKE '%' || $2 || '%' ` +
        `OR us."email" ILIKE '%' || $2 || '%' ` +
        `ORDER BY us."nome"`,
      [programa, termo || null],
    )) as LinhaAluno[];
    return linhas.map((linha) => this.paraDto(linha));
  }

  async detalhe(id: number): Promise<AlunoDetalheDto> {
    const programa = ParticipacoesService.programaAtual();
    const [linha] = (await this.dataSource.query(
      `${this.selecao()} WHERE us."id" = $2`,
      [programa, id],
    )) as LinhaAluno[];
    if (!linha) throw new NotFoundException('Aluno não encontrado.');
    const historico = (await this.dataSource.query(
      `SELECT "id", "funcionalidade", "concedido_por", "concedido_em", ` +
        `"revogado_por", "revogado_em" FROM ${this.u}."delegacoes" ` +
        `WHERE "usuario_id" = $1 ORDER BY "concedido_em" DESC, "id" DESC`,
      [id],
    )) as LinhaDelegacao[];
    return {
      ...this.paraDto(linha),
      historicoDelegacoes: historico.map((d): DelegacaoDto => ({
        id: d.id,
        funcionalidade: d.funcionalidade,
        concedidoPor: d.concedido_por,
        concedidoEm: d.concedido_em.toISOString(),
        revogadoPor: d.revogado_por,
        revogadoEm: d.revogado_em?.toISOString() ?? null,
      })),
    };
  }

  async conceder(
    usuarioId: number,
    funcionalidade: FuncionalidadeDelegavel,
    concedidoPor: string,
  ): Promise<AlunoDetalheDto> {
    const [aluno] = (await this.dataSource.query(
      `SELECT "id" FROM ${this.u}."usuarios" WHERE "id" = $1`,
      [usuarioId],
    )) as Array<{ id: number }>;
    if (!aluno) throw new NotFoundException('Aluno não encontrado.');
    try {
      await this.dataSource.query(
        `INSERT INTO ${this.u}."delegacoes" ("usuario_id", "funcionalidade", "concedido_por") ` +
          `VALUES ($1, $2, $3)`,
        [usuarioId, funcionalidade, concedidoPor],
      );
    } catch (erro) {
      if (ehViolacaoUnica(erro, 'uq_delegacao_ativa')) {
        throw new ConflictException({
          statusCode: 409,
          message: 'Este aluno já tem essa funcionalidade delegada.',
          motivo: 'ja-delegado',
        });
      }
      throw erro;
    }
    this.logger.log(
      `delegacao concedida usuario=${usuarioId} funcionalidade=${funcionalidade} por=${concedidoPor}`,
    );
    return this.detalhe(usuarioId);
  }

  async revogar(
    usuarioId: number,
    funcionalidade: FuncionalidadeDelegavel,
    revogadoPor: string,
  ): Promise<AlunoDetalheDto> {
    const atualizadas = await this.dataSource.query(
      `UPDATE ${this.u}."delegacoes" SET "revogado_em" = now(), "revogado_por" = $3 ` +
        `WHERE "usuario_id" = $1 AND "funcionalidade" = $2 AND "revogado_em" IS NULL ` +
        `RETURNING "id"`,
      [usuarioId, funcionalidade, revogadoPor],
    );
    if (linhasAfetadas(atualizadas) === 0) {
      throw new NotFoundException('Esse aluno não tem essa delegação ativa.');
    }
    this.logger.log(
      `delegacao revogada usuario=${usuarioId} funcionalidade=${funcionalidade} por=${revogadoPor}`,
    );
    return this.detalhe(usuarioId);
  }

  async temDelegacao(
    usuarioId: number,
    funcionalidade: FuncionalidadeDelegavel,
  ): Promise<boolean> {
    const [linha] = (await this.dataSource.query(
      `SELECT 1 FROM ${this.u}."delegacoes" ` +
        `WHERE "usuario_id" = $1 AND "funcionalidade" = $2 AND "revogado_em" IS NULL`,
      [usuarioId, funcionalidade],
    )) as unknown[];
    return Boolean(linha);
  }

  async listarAtivas(usuarioId: number): Promise<FuncionalidadeDelegavel[]> {
    const linhas = (await this.dataSource.query(
      `SELECT "funcionalidade" FROM ${this.u}."delegacoes"
       WHERE "usuario_id" = $1 AND "revogado_em" IS NULL ORDER BY "funcionalidade"`,
      [usuarioId],
    )) as Array<{ funcionalidade: FuncionalidadeDelegavel }>;
    return linhas.map(({ funcionalidade }) => funcionalidade);
  }
}
