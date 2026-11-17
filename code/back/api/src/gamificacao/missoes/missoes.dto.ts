import {
  IsBoolean,
  IsDefined,
  IsIn,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';
import { DATA_HORA_COM_FUSO } from '../../campus/eventos/eventos.dto.js';
import { LIMITES, type NivelDto } from '../economia.js';
import type { GanhoCreditado } from '../ganhos.js';
import {
  DESCRICAO_MISSAO_MAX,
  TIPOS_MISSAO,
  type TipoMissao,
  TITULO_MISSAO_MAX,
} from './missoes.js';

const NAO_VAZIO = /\S/;
const COM_FUSO = {
  message: 'use data/hora ISO 8601 com fuso, ex. 2026-11-17T08:00:00-03:00',
};
const CICLO = /^\d{4}\/[12]$/;

export type StatusMissaoAluno = 'disponivel' | 'limitada' | 'concluida';

export interface ConclusaoResumoDto {
  id: string;
  xp: number;
  moedas: number;
  limitado: boolean;
  concluidaEm: string;
}

export interface MissaoAlunoDto {
  id: string;
  titulo: string;
  descricao: string;
  tipo: TipoMissao;
  xp: number;
  moedas: number;
  fim: string | null;
  status: StatusMissaoAluno;
  xpPrevisto: number;
  conclusao: ConclusaoResumoDto | null;
}

export interface MissoesAlunoDto {
  ciclo: string;
  semana: string;
  limites: {
    ciclo: { ganho: number; limite: number };
    semanal: { ganho: number; limite: number };
  };
  missoes: MissaoAlunoDto[];
}

export interface ConclusaoMissaoDto extends Pick<
  GanhoCreditado,
  'xpConfigurado' | 'xp' | 'moedas' | 'limitado'
> {
  missaoId: string;
  conclusaoId: string;
  teto: Exclude<GanhoCreditado['teto'], 'totens'>;
  saldoMoedas: number;
  xpAcumulado: number;
  nivel: NivelDto;
  subiuDeNivel: boolean;
  ciclo: string;
  semana: string | null;
  concluidaEm: string;
}

export class CriarMissaoDto {
  @IsDefined()
  @IsString()
  @MaxLength(TITULO_MISSAO_MAX)
  @Matches(NAO_VAZIO, { message: 'titulo não pode ser vazio' })
  titulo!: string;

  @IsDefined()
  @IsString()
  @MaxLength(DESCRICAO_MISSAO_MAX)
  @Matches(NAO_VAZIO, { message: 'descricao não pode ser vazia' })
  descricao!: string;

  @IsDefined()
  @IsIn(TIPOS_MISSAO)
  tipo!: TipoMissao;

  @IsDefined()
  @IsInt()
  @Min(1)
  @Max(LIMITES.porMissao)
  xp!: number;

  @IsOptional()
  @IsString()
  @Matches(DATA_HORA_COM_FUSO, COM_FUSO)
  @IsISO8601({ strict: true })
  inicio?: string | null;

  @IsOptional()
  @IsString()
  @Matches(DATA_HORA_COM_FUSO, COM_FUSO)
  @IsISO8601({ strict: true })
  fim?: string | null;

  @IsOptional()
  @IsBoolean()
  ativar?: boolean;
}

export class AtualizarMissaoDto {
  @ValidateIf((o: AtualizarMissaoDto) => o.titulo !== undefined)
  @IsString()
  @MaxLength(TITULO_MISSAO_MAX)
  @Matches(NAO_VAZIO, { message: 'titulo não pode ser vazio' })
  titulo?: string;

  @ValidateIf((o: AtualizarMissaoDto) => o.descricao !== undefined)
  @IsString()
  @MaxLength(DESCRICAO_MISSAO_MAX)
  @Matches(NAO_VAZIO, { message: 'descricao não pode ser vazia' })
  descricao?: string;

  @ValidateIf((o: AtualizarMissaoDto) => o.tipo !== undefined)
  @IsIn(TIPOS_MISSAO)
  tipo?: TipoMissao;

  @ValidateIf((o: AtualizarMissaoDto) => o.xp !== undefined)
  @IsInt()
  @Min(1)
  @Max(LIMITES.porMissao)
  xp?: number;

  @IsOptional()
  @IsString()
  @Matches(DATA_HORA_COM_FUSO, COM_FUSO)
  @IsISO8601({ strict: true })
  inicio?: string | null;

  @IsOptional()
  @IsString()
  @Matches(DATA_HORA_COM_FUSO, COM_FUSO)
  @IsISO8601({ strict: true })
  fim?: string | null;

  @IsDefined()
  @IsString()
  @IsISO8601({ strict: true })
  atualizadoEm!: string;
}

export class ListarMissoesQuery {
  @IsOptional()
  @IsIn(['ativa', 'inativa'])
  status?: 'ativa' | 'inativa';

  @IsOptional()
  @IsString()
  @Matches(CICLO, { message: 'ciclo deve ser como 2026/2' })
  ciclo?: string;
}

export interface MissaoAdminDto {
  id: string;
  titulo: string;
  descricao: string;
  tipo: TipoMissao;
  xp: number;
  ativa: boolean;
  inicio: string | null;
  fim: string | null;
  ciclo: string;
  vigenteAgora: boolean;
  conclusoes: number;
  xpCreditadoTotal: number;
  criadoPor: number | null;
  criadoEm: string;
  atualizadoEm: string;
}
