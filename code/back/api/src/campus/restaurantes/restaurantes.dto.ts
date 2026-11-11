import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsDefined,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { DESCRICAO_MAX, NOME_RESTAURANTE } from '../campus.js';
import type { FaixaHorario } from '../horarios.js';
import { LocalEntradaDto, type LocalDto } from '../local.js';

const NAO_VAZIO = /\S/;
export const DATA = /^\d{4}-\d{2}-\d{2}$/;

/**
 * `POST /coordenacao/restaurantes`. Local obrigatório (prédio do mapa, área
 * ou ponto). `horarios` validado no serviço (formato, ordem, sobreposição).
 */
export class CriarRestauranteDto {
  @IsDefined()
  @IsString()
  @MaxLength(NOME_RESTAURANTE.max)
  @Matches(NAO_VAZIO, { message: 'nome não pode ser vazio' })
  nome!: string;

  @IsOptional()
  @IsString()
  @MaxLength(DESCRICAO_MAX)
  descricao?: string;

  @IsDefined()
  @IsObject()
  @ValidateNested()
  @Type(() => LocalEntradaDto)
  local!: LocalEntradaDto;

  @IsOptional()
  @IsArray()
  horarios?: unknown[];

  @IsOptional()
  @IsBoolean()
  ativo?: boolean;
}

/** `PATCH /coordenacao/restaurantes/:id`: subconjunto (local não pode ser removido). */
export class AtualizarRestauranteDto {
  @ValidateIf((o: AtualizarRestauranteDto) => o.nome !== undefined)
  @IsString()
  @MaxLength(NOME_RESTAURANTE.max)
  @Matches(NAO_VAZIO, { message: 'nome não pode ser vazio' })
  nome?: string;

  @ValidateIf((o: AtualizarRestauranteDto) => o.descricao !== undefined)
  @IsString()
  @MaxLength(DESCRICAO_MAX)
  descricao?: string;

  @ValidateIf((o: AtualizarRestauranteDto) => o.local !== undefined)
  @IsObject()
  @ValidateNested()
  @Type(() => LocalEntradaDto)
  local?: LocalEntradaDto;

  @ValidateIf((o: AtualizarRestauranteDto) => o.horarios !== undefined)
  @IsArray()
  horarios?: unknown[];
}

/** Campos do multipart de `POST /coordenacao/restaurantes/:id/cardapios` (além do arquivo). */
export class EnviarCardapioDto {
  @IsDefined()
  @IsString()
  @Matches(DATA, { message: 'validoDe: use AAAA-MM-DD' })
  validoDe!: string;

  @IsDefined()
  @IsString()
  @Matches(DATA, { message: 'validoAte: use AAAA-MM-DD' })
  validoAte!: string;

  /** Cardápio que este substitui: removido (linha e arquivo) depois do novo gravado. */
  @IsOptional()
  @IsUUID()
  substitui?: string;
}

/** `GET /mapa/restaurantes/:id/cardapio?data=AAAA-MM-DD`. */
export class CardapioDoDiaQuery {
  @IsOptional()
  @IsString()
  @Matches(DATA, { message: 'data: use AAAA-MM-DD' })
  data?: string;
}

/** `GET /mapa/restaurantes` (públicos, só ativos). */
export interface RestauranteDto {
  id: string;
  nome: string;
  descricao: string;
  local: LocalDto | null;
  horarios: FaixaHorario[];
  /** Pelos horários cadastrados, no horário de Brasília. */
  abertoAgora: boolean;
  /** Há cardápio vigente hoje (horário de Brasília). */
  cardapioHoje: boolean;
}

export interface RestauranteAdminDto extends RestauranteDto {
  ativo: boolean;
  criadoPor: number | null;
  criadoEm: string;
  atualizadoEm: string;
  /** Cardápios cadastrados (vigentes ou não). */
  cardapios: number;
}

export interface CardapioDto {
  id: string;
  /** URL pública (container `restaurant-menus`), sem SAS. */
  url: string;
  tipoConteudo: string;
  tamanhoBytes: number;
  validoDe: string;
  validoAte: string;
  criadoEm: string;
}

/** `GET /mapa/restaurantes/:id/cardapio`. */
export interface CardapioDoDiaDto {
  data: string;
  /** O mais recente cuja vigência cobre `data`; `null` se não houver. */
  cardapio: CardapioDto | null;
}

/** Prédio `CAFETERIA` da versão ativa, sugerido no cadastro. */
export interface SugestaoRestauranteDto {
  predioId: string;
  nome: string | null;
  latitude: number;
  longitude: number;
  /** Já existe restaurante (ativo ou não) neste prédio. */
  cadastrado: boolean;
}
