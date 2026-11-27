import { Type } from 'class-transformer';
import {
  IsDefined,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { JustificativaNormalizada } from '../justificativa.js';
import {
  MOTIVO_CANCELAMENTO,
  PAGINA_RESGATES,
  SITUACOES_RESGATE,
  type SituacaoResgate,
} from './resgates.js';

/** Mesmo formato de `programas.codigo` (ex.: 2026/2). */
const CODIGO_PROGRAMA = /^[A-Za-z0-9._/-]{1,20}$/;
/** Cursor opaco devolvido em `proximoCursor` (base64url). */
const CURSOR = /^[A-Za-z0-9_-]{1,200}$/;

/**
 * Filtros de `GET /coordenacao/resgates`. Todos são aplicados no banco antes
 * da paginação: um resgate pendente nunca some porque outros 200 vieram
 * depois dele.
 */
export class ListarResgatesQuery {
  @IsOptional()
  @IsIn(SITUACOES_RESGATE)
  situacao?: SituacaoResgate;

  /**
   * Programa (ciclo) em que a troca foi feita: `resgates.programa_codigo`,
   * gravado no momento do resgate. Editar a recompensa depois não muda.
   */
  @IsOptional()
  @IsString()
  @Matches(CODIGO_PROGRAMA, { message: 'programa inválido' })
  programa?: string;

  /** `true`: só resgates sem programa identificado (registros legados). */
  @IsOptional()
  @IsIn(['true', 'false'])
  semPrograma?: 'true' | 'false';

  @IsOptional()
  @IsUUID('4')
  recompensaId?: string;

  /** Nome, e-mail do participante, código do comprovante ou nome da recompensa. */
  @IsOptional()
  @IsString()
  @MaxLength(120)
  busca?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(PAGINA_RESGATES.max)
  limite?: number;

  /** `proximoCursor` da página anterior. */
  @IsOptional()
  @IsString()
  @Matches(CURSOR, { message: 'cursor inválido' })
  cursor?: string;
}

/** `POST /coordenacao/resgates/:id/cancelar`. */
export class CancelarResgateDto {
  /** Medido depois de remover espaços das pontas, como o CHECK do banco. */
  @IsDefined()
  @IsString()
  @JustificativaNormalizada(MOTIVO_CANCELAMENTO)
  motivo!: string;
}

/** Resgate visto pela coordenação. */
export interface ResgateAdminDto {
  id: string;
  codigo: string;
  situacao: SituacaoResgate;
  participante: { id: number; nome: string; email: string };
  recompensa: { id: string; nome: string; versao: number };
  /**
   * Programa da troca, fixado no resgate. `inferido`: registro anterior a
   * esta regra, preenchido pela migration a partir dos dados disponíveis.
   */
  programa: { codigo: string | null; inferido: boolean };
  custoXp: number;
  condicoesRetirada: string;
  resgatadoEm: string;
  entregueEm: string | null;
  canceladoEm: string | null;
  motivoCancelamento: string | null;
  responsavel: { id: number | null; email: string | null } | null;
}

/** Uma página da fila, com a contagem por situação dos mesmos filtros. */
export interface PaginaResgatesAdminDto {
  itens: ResgateAdminDto[];
  /** Cursor da próxima página; `null` quando acabou. */
  proximoCursor: string | null;
  /** Totais com programa/recompensa/busca aplicados, sem o filtro de situação. */
  contagem: Record<'todos' | SituacaoResgate, number>;
}
