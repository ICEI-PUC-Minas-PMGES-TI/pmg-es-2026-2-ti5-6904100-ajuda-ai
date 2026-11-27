import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
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
  ValidateNested,
} from 'class-validator';
import { LIMITES } from '../economia.js';
import {
  CRITERIOS_CONQUISTA,
  type CriterioConquista,
  DESCRICAO_CONQUISTA_MAX,
  type EscopoConquista,
  ESTADOS_CONQUISTA,
  type EstadoConquista,
  IMAGEM_CONQUISTA_MAX,
  NOME_CONQUISTA_MAX,
  PUBLICOS_CONQUISTA,
  type PublicoConquista,
} from './conquistas.js';

const NAO_VAZIO = /\S/;
const HTTPS = /^https:\/\/\S+$/i;
const CICLO = /^\d{4}\/[12]$/;
const MENSAGEM_HTTPS = { message: 'imagemUrl deve ser um endereço https://' };
const MENSAGEM_CICLO = {
  message: 'programaCodigo deve ser um ciclo, ex.: 2026/2',
};
const MENSAGEM_CRITERIO = {
  message: `criterio deve ser um destes: ${CRITERIOS_CONQUISTA.join(', ')}`,
};

/** Edição parcial: só os campos enviados mudam. */
class CamposConquista {
  @IsOptional()
  @IsString()
  @MaxLength(NOME_CONQUISTA_MAX)
  @Matches(NAO_VAZIO, { message: 'nome não pode ficar vazio' })
  nome?: string;

  @IsOptional()
  @IsString()
  @MaxLength(DESCRICAO_CONQUISTA_MAX)
  @Matches(NAO_VAZIO, { message: 'descricao não pode ficar vazia' })
  descricao?: string;

  /** `null` tira a imagem (a medalha usa o ícone padrão). */
  @ValidateIf(
    (o: CamposConquista) => o.imagemUrl !== null && o.imagemUrl !== undefined,
  )
  @IsString()
  @MaxLength(IMAGEM_CONQUISTA_MAX)
  @Matches(HTTPS, MENSAGEM_HTTPS)
  imagemUrl?: string | null;

  @IsOptional()
  @IsIn(CRITERIOS_CONQUISTA, MENSAGEM_CRITERIO)
  criterio?: CriterioConquista;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  meta?: number;

  @IsOptional()
  @IsIn(PUBLICOS_CONQUISTA)
  publico?: PublicoConquista;

  /** `null` = todos os ciclos. */
  @ValidateIf(
    (o: CamposConquista) =>
      o.programaCodigo !== null && o.programaCodigo !== undefined,
  )
  @IsString()
  @Matches(CICLO, MENSAGEM_CICLO)
  programaCodigo?: string | null;

  /** XP extra ao desbloquear (regra explícita). Padrão 0: só a medalha. */
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(LIMITES.porConquista)
  xp?: number;
}

export class CriarConquistaDto {
  @IsString()
  @MaxLength(NOME_CONQUISTA_MAX)
  @Matches(NAO_VAZIO, { message: 'nome não pode ficar vazio' })
  nome!: string;

  @IsString()
  @MaxLength(DESCRICAO_CONQUISTA_MAX)
  @Matches(NAO_VAZIO, { message: 'descricao não pode ficar vazia' })
  descricao!: string;

  @ValidateIf(
    (o: CriarConquistaDto) => o.imagemUrl !== null && o.imagemUrl !== undefined,
  )
  @IsString()
  @MaxLength(IMAGEM_CONQUISTA_MAX)
  @Matches(HTTPS, MENSAGEM_HTTPS)
  imagemUrl?: string | null;

  @IsIn(CRITERIOS_CONQUISTA, MENSAGEM_CRITERIO)
  criterio!: CriterioConquista;

  @IsInt()
  @Min(1)
  @Max(100)
  meta!: number;

  @IsOptional()
  @IsIn(PUBLICOS_CONQUISTA)
  publico?: PublicoConquista;

  @ValidateIf(
    (o: CriarConquistaDto) =>
      o.programaCodigo !== null && o.programaCodigo !== undefined,
  )
  @IsString()
  @Matches(CICLO, MENSAGEM_CICLO)
  programaCodigo?: string | null;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(LIMITES.porConquista)
  xp?: number;

  /** Já publica ao criar. */
  @IsOptional()
  @IsBoolean()
  publicar?: boolean;
}

export class AtualizarConquistaDto extends CamposConquista {
  /** O que a tela mostrava: outra edição no meio responde 409. */
  @IsISO8601({ strict: true })
  atualizadoEm!: string;
}

export class ListarConquistasQuery {
  @IsOptional()
  @IsIn(ESTADOS_CONQUISTA)
  estado?: EstadoConquista;
}

export interface CriterioDto {
  criterio: CriterioConquista;
  rotulo: string;
  escopo: EscopoConquista;
  metaMin: number;
  metaMax: number;
}

export interface ConquistaAdminDto {
  id: string;
  nome: string;
  descricao: string;
  imagemUrl: string | null;
  criterio: CriterioConquista;
  /** Texto pronto do critério, como o aluno lê. */
  criterioTexto: string;
  meta: number;
  publico: PublicoConquista;
  programaCodigo: string | null;
  xp: number;
  estado: EstadoConquista;
  publicadaEm: string | null;
  /** Quantos desbloqueios existem (uso). Com uso, não exclui. */
  desbloqueios: number;
  podeExcluir: boolean;
  criadoPor: number | null;
  criadoEm: string;
  atualizadoEm: string;
}

export interface ConquistaObtidaDto {
  id: string;
  nome: string;
  descricao: string;
  imagemUrl: string | null;
  criterioTexto: string;
  /** Ciclo do desbloqueio, ou `GERAL`. */
  contexto: string;
  xpCreditado: number;
  desbloqueadaEm: string;
  /** Definição arquivada depois: o aluno continua com a conquista. */
  arquivada: boolean;
}

export interface ConquistaDisponivelDto {
  id: string;
  nome: string;
  descricao: string;
  imagemUrl: string | null;
  criterio: CriterioConquista;
  criterioTexto: string;
  xp: number;
  progresso: { atual: number; meta: number };
}

export interface ConquistasAlunoDto {
  ciclo: string;
  obtidas: ConquistaObtidaDto[];
  /** Publicadas, do público do aluno, ainda não obtidas neste contexto. */
  disponiveis: ConquistaDisponivelDto[];
  /**
   * Desbloqueios que o aluno ainda não tinha visto na coleção (o aviso na
   * tela), venham desta consulta ou de outra rota (feed, missão, totem).
   * Marcados como vistos ao responder: saem uma vez só. Com o contexto: a
   * mesma conquista obtida em dois semestres aparece duas vezes em
   * `obtidas`, e só a deste desbloqueio é nova.
   */
  novas: NovaConquistaDto[];
}

/** Um desbloqueio: a definição e o contexto (ciclo ou `GERAL`). */
export interface NovaConquistaDto {
  id: string;
  contexto: string;
}

/** Um desbloqueio cujo aviso o cliente exibiu. */
export class ConquistaVistaDto {
  @Matches(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i, {
    message: 'id deve ser o id de uma conquista',
  })
  id!: string;

  @IsString()
  @MaxLength(20)
  @Matches(/^(\d{4}\/[12]|GERAL)$/, {
    message: 'contexto deve ser um ciclo (ex.: 2026/2) ou GERAL',
  })
  contexto!: string;
}

/** `POST /me/conquistas/vistas`: confirma os avisos "Nova!" exibidos. */
export class ConfirmarVistasDto {
  @IsArray()
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => ConquistaVistaDto)
  vistas!: ConquistaVistaDto[];
}
