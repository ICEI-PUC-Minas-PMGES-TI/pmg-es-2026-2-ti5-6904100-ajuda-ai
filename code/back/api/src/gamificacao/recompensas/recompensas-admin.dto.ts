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
  MinLength,
  ValidateIf,
} from 'class-validator';
import { DATA_HORA_COM_FUSO } from '../../campus/eventos/eventos.dto.js';
import {
  CONDICOES_RETIRADA_MAX,
  CUSTO_XP_RECOMPENSA,
  DESCRICAO_RECOMPENSA_MAX,
  ESTOQUE_MAX,
  IMAGEM_URL_MAX,
  LIMITE_POR_ALUNO,
  MOTIVO_ESTOQUE,
  NOME_RECOMPENSA_MAX,
  PUBLICOS_RECOMPENSA,
  type PublicoRecompensa,
  STATUS_RECOMPENSA,
  type StatusRecompensa,
  type TipoAjusteEstoque,
  URL_IMAGEM,
} from './recompensas.js';

const NAO_VAZIO = /\S/;
const COM_FUSO = {
  message: 'use data/hora ISO 8601 com fuso, ex. 2026-11-10T08:00:00-03:00',
};
const HTTPS = { message: 'imagemUrl deve ser um endereço https://' };
const CODIGO_PROGRAMA = /^[A-Za-z0-9._-]{1,20}$/;

/**
 * `POST /coordenacao/recompensas`. Estoque limitado exige `estoqueInicial`;
 * ilimitado precisa ser declarado (`estoqueIlimitado: true`). Id, autor,
 * status e versão nunca vêm do cliente; `publicar: true` publica já.
 */
export class CriarRecompensaDto {
  @IsDefined()
  @IsString()
  @MaxLength(NOME_RECOMPENSA_MAX)
  @Matches(NAO_VAZIO, { message: 'nome não pode ser vazio' })
  nome!: string;

  @IsDefined()
  @IsString()
  @MaxLength(DESCRICAO_RECOMPENSA_MAX)
  @Matches(NAO_VAZIO, { message: 'descricao não pode ser vazia' })
  descricao!: string;

  @IsOptional()
  @IsString()
  @MaxLength(IMAGEM_URL_MAX)
  @Matches(URL_IMAGEM, HTTPS)
  imagemUrl?: string | null;

  @IsDefined()
  @IsInt()
  @Min(CUSTO_XP_RECOMPENSA.min)
  @Max(CUSTO_XP_RECOMPENSA.max)
  custoXp!: number;

  @IsDefined()
  @IsString()
  @MaxLength(CONDICOES_RETIRADA_MAX)
  @Matches(NAO_VAZIO, { message: 'condicoesRetirada não pode ser vazio' })
  condicoesRetirada!: string;

  @IsDefined()
  @IsBoolean()
  estoqueIlimitado!: boolean;

  /** Obrigatório com estoque limitado; proibido com ilimitado. */
  @ValidateIf((o: CriarRecompensaDto) => o.estoqueIlimitado === false)
  @IsDefined({ message: 'estoqueInicial é obrigatório com estoque limitado' })
  @IsInt()
  @Min(0)
  @Max(ESTOQUE_MAX)
  estoqueInicial?: number;

  @IsOptional()
  @IsInt()
  @Min(LIMITE_POR_ALUNO.min)
  @Max(LIMITE_POR_ALUNO.max)
  limitePorAluno?: number | null;

  @IsOptional()
  @IsIn(PUBLICOS_RECOMPENSA)
  publico?: PublicoRecompensa;

  /** Contexto: programa em que vale; ausente/nulo = todos os programas. */
  @IsOptional()
  @IsString()
  @Matches(CODIGO_PROGRAMA, { message: 'programaCodigo inválido' })
  programaCodigo?: string | null;

  @IsOptional()
  @IsString()
  @Matches(DATA_HORA_COM_FUSO, COM_FUSO)
  @IsISO8601({ strict: true })
  disponivelDe?: string | null;

  @IsOptional()
  @IsString()
  @Matches(DATA_HORA_COM_FUSO, COM_FUSO)
  @IsISO8601({ strict: true })
  disponivelAte?: string | null;

  @IsOptional()
  @IsBoolean()
  publicar?: boolean;
}

/**
 * `PATCH /coordenacao/recompensas/:id`: qualquer subconjunto. `null` remove
 * imagem, limite, programa ou datas. Estoque muda só por
 * `POST :id/estoque` (com motivo); status, pelas ações próprias.
 */
export class AtualizarRecompensaDto {
  @ValidateIf((o: AtualizarRecompensaDto) => o.nome !== undefined)
  @IsString()
  @MaxLength(NOME_RECOMPENSA_MAX)
  @Matches(NAO_VAZIO, { message: 'nome não pode ser vazio' })
  nome?: string;

  @ValidateIf((o: AtualizarRecompensaDto) => o.descricao !== undefined)
  @IsString()
  @MaxLength(DESCRICAO_RECOMPENSA_MAX)
  @Matches(NAO_VAZIO, { message: 'descricao não pode ser vazia' })
  descricao?: string;

  @IsOptional()
  @IsString()
  @MaxLength(IMAGEM_URL_MAX)
  @Matches(URL_IMAGEM, HTTPS)
  imagemUrl?: string | null;

  @ValidateIf((o: AtualizarRecompensaDto) => o.custoXp !== undefined)
  @IsInt()
  @Min(CUSTO_XP_RECOMPENSA.min)
  @Max(CUSTO_XP_RECOMPENSA.max)
  custoXp?: number;

  @ValidateIf((o: AtualizarRecompensaDto) => o.condicoesRetirada !== undefined)
  @IsString()
  @MaxLength(CONDICOES_RETIRADA_MAX)
  @Matches(NAO_VAZIO, { message: 'condicoesRetirada não pode ser vazio' })
  condicoesRetirada?: string;

  @IsOptional()
  @IsInt()
  @Min(LIMITE_POR_ALUNO.min)
  @Max(LIMITE_POR_ALUNO.max)
  limitePorAluno?: number | null;

  @ValidateIf((o: AtualizarRecompensaDto) => o.publico !== undefined)
  @IsIn(PUBLICOS_RECOMPENSA)
  publico?: PublicoRecompensa;

  @IsOptional()
  @IsString()
  @Matches(CODIGO_PROGRAMA, { message: 'programaCodigo inválido' })
  programaCodigo?: string | null;

  @IsOptional()
  @IsString()
  @Matches(DATA_HORA_COM_FUSO, COM_FUSO)
  @IsISO8601({ strict: true })
  disponivelDe?: string | null;

  @IsOptional()
  @IsString()
  @Matches(DATA_HORA_COM_FUSO, COM_FUSO)
  @IsISO8601({ strict: true })
  disponivelAte?: string | null;

  /** `atualizadoEm` que a tela mostrava; recusa se outra pessoa alterou antes. */
  @IsDefined()
  @IsString()
  @IsISO8601({ strict: true })
  atualizadoEm!: string;
}

/** Tipos aceitos em `POST :id/estoque` (`inicial` é só do cadastro). */
export const TIPOS_AJUSTE_MANUAL = [
  'reposicao',
  'correcao',
  'ilimitado',
  'limitado',
] as const satisfies readonly TipoAjusteEstoque[];

/**
 * `POST /coordenacao/recompensas/:id/estoque`:
 * - `reposicao`: `quantidade` (≥ 1) unidades somadas ao total;
 * - `correcao`: `quantidade` é o novo total (≥ comprometido);
 * - `limitado`: sai do ilimitado com `quantidade` como total;
 * - `ilimitado`: passa a ilimitado (sem `quantidade`).
 * Motivo sempre obrigatório; o responsável vem do token.
 */
export class AjustarEstoqueDto {
  @IsDefined()
  @IsIn(TIPOS_AJUSTE_MANUAL)
  tipo!: (typeof TIPOS_AJUSTE_MANUAL)[number];

  @ValidateIf((o: AjustarEstoqueDto) => o.tipo !== 'ilimitado')
  @IsDefined({ message: 'quantidade é obrigatória para este ajuste' })
  @IsInt()
  @Min(0)
  @Max(ESTOQUE_MAX)
  quantidade?: number;

  @IsDefined()
  @IsString()
  @MinLength(MOTIVO_ESTOQUE.min)
  @MaxLength(MOTIVO_ESTOQUE.max)
  @Matches(NAO_VAZIO, { message: 'motivo não pode ser vazio' })
  motivo!: string;

  /** `atualizadoEm` que a tela mostrava; recusa se outra pessoa alterou antes. */
  @IsDefined()
  @IsString()
  @IsISO8601({ strict: true })
  atualizadoEm!: string;
}

/** Filtros de `GET /coordenacao/recompensas`. */
export class ListarRecompensasQuery {
  @IsOptional()
  @IsIn(STATUS_RECOMPENSA)
  status?: StatusRecompensa;
}

export interface EstoqueRecompensaDto {
  ilimitado: boolean;
  /** Total disponibilizado; nulo quando ilimitado. */
  total: number | null;
  /** Unidades presas a resgates (não podem ser retiradas por ajuste). */
  comprometido: number;
  /** total − comprometido; nulo quando ilimitado. */
  disponivel: number | null;
}

/** Item de `GET /coordenacao/recompensas`. */
export interface RecompensaAdminDto {
  id: string;
  nome: string;
  descricao: string;
  imagemUrl: string | null;
  custoXp: number;
  condicoesRetirada: string;
  estoque: EstoqueRecompensaDto;
  limitePorAluno: number | null;
  publico: PublicoRecompensa;
  programaCodigo: string | null;
  disponivelDe: string | null;
  disponivelAte: string | null;
  status: StatusRecompensa;
  /** Publicada e dentro da vigência agora. */
  disponivelAgora: boolean;
  versao: number;
  /** Resgates feitos (F28); com algum, só pode ser arquivada. */
  transacoes: number;
  /** Sem transações nem unidades comprometidas: pode ser excluída. */
  podeExcluir: boolean;
  criadoPor: number | null;
  criadoPorEmail: string | null;
  criadoEm: string;
  atualizadoEm: string;
  publicadoEm: string | null;
  arquivadoEm: string | null;
}

export interface VersaoRecompensaDto {
  versao: number;
  nome: string;
  descricao: string;
  imagemUrl: string | null;
  custoXp: number;
  condicoesRetirada: string;
  criadoPorEmail: string | null;
  criadoEm: string;
}

export interface AjusteEstoqueDto {
  id: string;
  tipo: TipoAjusteEstoque;
  quantidade: number | null;
  estoqueAntes: number | null;
  estoqueDepois: number | null;
  comprometido: number;
  motivo: string;
  responsavelId: number | null;
  responsavelEmail: string | null;
  criadoEm: string;
}

/** `GET /coordenacao/recompensas/:id`: estado, versões e trilha de estoque. */
export interface RecompensaDetalheDto extends RecompensaAdminDto {
  versoes: VersaoRecompensaDto[];
  ajustesEstoque: AjusteEstoqueDto[];
}
