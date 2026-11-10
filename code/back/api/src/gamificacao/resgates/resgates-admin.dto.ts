import {
  IsDefined,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import {
  MOTIVO_CANCELAMENTO,
  SITUACOES_RESGATE,
  type SituacaoResgate,
} from './resgates.js';

const NAO_VAZIO = /\S/;
const CODIGO_PROGRAMA = /^[A-Za-z0-9._-]{1,20}$/;

/** Filtros de `GET /coordenacao/resgates`. */
export class ListarResgatesQuery {
  @IsOptional()
  @IsIn(SITUACOES_RESGATE)
  situacao?: SituacaoResgate;

  /** Recompensas restritas a este programa (`recompensas.programa_codigo`). */
  @IsOptional()
  @IsString()
  @Matches(CODIGO_PROGRAMA, { message: 'programa inválido' })
  programa?: string;

  @IsOptional()
  @IsUUID('4')
  recompensaId?: string;

  /** Nome, e-mail do participante ou código do comprovante. */
  @IsOptional()
  @IsString()
  @MaxLength(120)
  busca?: string;
}

/** `POST /coordenacao/resgates/:id/cancelar`. */
export class CancelarResgateDto {
  @IsDefined()
  @IsString()
  @MinLength(MOTIVO_CANCELAMENTO.min)
  @MaxLength(MOTIVO_CANCELAMENTO.max)
  @Matches(NAO_VAZIO, { message: 'motivo não pode ser vazio' })
  motivo!: string;
}

/** Resgate visto pela coordenação. */
export interface ResgateAdminDto {
  id: string;
  codigo: string;
  situacao: SituacaoResgate;
  participante: { id: number; nome: string; email: string };
  recompensa: {
    id: string;
    nome: string;
    versao: number;
    programaCodigo: string | null;
  };
  custoXp: number;
  condicoesRetirada: string;
  resgatadoEm: string;
  entregueEm: string | null;
  canceladoEm: string | null;
  motivoCancelamento: string | null;
  responsavel: { id: number | null; email: string | null } | null;
}
