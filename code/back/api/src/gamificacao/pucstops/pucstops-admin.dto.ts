import {
  IsBoolean,
  IsDefined,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { RECOMPENSAS_TOTEM } from '../economia.js';
import { NOME_PUCSTOP_MAX, RAIO_PUCSTOP } from '../gamificacao.js';
import type { RegiaoCampusDto } from '../../mapa/campus-limite.js';

const NUMERO = { allowNaN: false, allowInfinity: false } as const;
/** Pelo menos um caractere visível (nome só de espaços é recusado). */
const NAO_VAZIO = /\S/;

/**
 * Corpo de `POST /coordenacao/pucstops`. A posição vem do clique no mapa da
 * coordenação; o servidor confere se cai dentro do campus (não confia no
 * front). Id, autor e datas nunca vêm do cliente.
 */
export class CriarPucStopDto {
  @IsDefined()
  @IsString()
  @MaxLength(NOME_PUCSTOP_MAX)
  @Matches(NAO_VAZIO, { message: 'nome não pode ser vazio' })
  nome!: string;

  @IsDefined()
  @IsNumber(NUMERO)
  @Min(-90)
  @Max(90)
  latitude!: number;

  @IsDefined()
  @IsNumber(NUMERO)
  @Min(-180)
  @Max(180)
  longitude!: number;

  /** Recompensa: 10, 20, 30, 40 ou 50 XP (as moedas acompanham 1:1). */
  @IsDefined()
  @IsInt()
  @IsIn(RECOMPENSAS_TOTEM, {
    message: `xp deve ser uma das opções: ${RECOMPENSAS_TOTEM.join(', ')}`,
  })
  xp!: number;

  @IsDefined()
  @IsNumber(NUMERO)
  @Min(RAIO_PUCSTOP.min)
  @Max(RAIO_PUCSTOP.max)
  raioMetros!: number;

  /** Padrão: ativo (aparece no mapa dos alunos assim que salvo). */
  @IsOptional()
  @IsBoolean()
  ativo?: boolean;
}

/**
 * Corpo de `PATCH /coordenacao/pucstops/:id`: qualquer subconjunto; latitude
 * e longitude andam juntas. Ativar/desativar tem ação própria.
 */
export class AtualizarPucStopDto {
  @IsOptional()
  @IsString()
  @MaxLength(NOME_PUCSTOP_MAX)
  @Matches(NAO_VAZIO, { message: 'nome não pode ser vazio' })
  nome?: string;

  @IsOptional()
  @IsNumber(NUMERO)
  @Min(-90)
  @Max(90)
  latitude?: number;

  @IsOptional()
  @IsNumber(NUMERO)
  @Min(-180)
  @Max(180)
  longitude?: number;

  @IsOptional()
  @IsInt()
  @IsIn(RECOMPENSAS_TOTEM, {
    message: `xp deve ser uma das opções: ${RECOMPENSAS_TOTEM.join(', ')}`,
  })
  xp?: number;

  @IsOptional()
  @IsNumber(NUMERO)
  @Min(RAIO_PUCSTOP.min)
  @Max(RAIO_PUCSTOP.max)
  raioMetros?: number;
}

/** Item de `GET /coordenacao/pucstops` (ativos e inativos). */
export interface PucStopAdminDto {
  id: string;
  nome: string;
  latitude: number;
  longitude: number;
  raioMetros: number;
  xp: number;
  ativo: boolean;
  /** `usuarios.id` de quem criou; nulo quando não está em `usuarios`. */
  criadoPor: number | null;
  criadoEm: string;
  atualizadoEm: string;
  /** Coletas já feitas (histórico preservado em qualquer edição). */
  coletas: number;
}

/** `GET /coordenacao/pucstops/campus`: onde o servidor aceita um PucStop. */
export type CampusPucStopsDto = RegiaoCampusDto;

/** `GET /coordenacao/pucstops/orcamento`: economia dos totens. */
export interface OrcamentoTotensDto {
  /** Totens ativos no mapa (só eles entram no orçamento). */
  ativos: number;
  /** Totens desativados (fora do mapa e do orçamento). */
  inativos: number;
  /** Soma das recompensas dos ativos (o que um aluno ganharia coletando todos). */
  xpPotencial: number;
  /** Moedas equivalentes (1:1 com o XP). */
  moedasPotenciais: number;
  /** Recompensa média por totem ativo (1 casa decimal); 0 sem totens. */
  recompensaMedia: number;
  /** Quantos totens ativos há em cada opção de recompensa. */
  distribuicao: Array<{ xp: number; totens: number }>;
  /** Teto de XP de totens por aluno e ciclo. */
  limitePorCiclo: number;
  /** A soma passa do teto: parte das coletas sairá sem XP. */
  excedeLimite: boolean;
  /** Ciclo da estimativa abaixo. */
  ciclo: string;
  /** Participantes que podem ganhar XP no ciclo (contados uma vez). */
  participantesElegiveis: number;
  /**
   * Estimativa TEÓRICA de moedas que os totens podem emitir no ciclo:
   * participantes × menor valor entre o potencial e o teto. Não é o saldo real.
   */
  emissaoMaximaEstimada: number;
  /** Opções de recompensa aceitas e a sugerida para um novo totem. */
  opcoes: number[];
  padrao: number;
}
