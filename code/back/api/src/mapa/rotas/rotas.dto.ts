import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsDefined,
  IsNotEmpty,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import type { LineString } from 'typeorm';

/**
 * Uma ponta da rota: ou `id` de prédio (chave estável do campus, ex.: `P26`)
 * ou `latitude` + `longitude` (WGS84). As duas formas juntas são recusadas.
 */
export class PontaRotaDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  @Matches(/^[A-Za-z0-9_]+$/, { message: 'id de prédio inválido.' })
  id?: string;

  @IsOptional()
  @IsNumber({ allowNaN: false, allowInfinity: false })
  @Min(-90)
  @Max(90)
  latitude?: number;

  @IsOptional()
  @IsNumber({ allowNaN: false, allowInfinity: false })
  @Min(-180)
  @Max(180)
  longitude?: number;
}

export class CalcularRotaDto {
  @IsDefined()
  @IsObject()
  @ValidateNested()
  @Type(() => PontaRotaDto)
  origem!: PontaRotaDto;

  /**
   * Prédio (`id`) ou coordenada: evento, restaurante ou área fora de prédio
   * (encaixado no caminho mais próximo, como a origem).
   */
  @IsDefined()
  @IsObject()
  @ValidateNested()
  @Type(() => PontaRotaDto)
  destino!: PontaRotaDto;

  @IsOptional()
  @IsBoolean()
  acessivel?: boolean;
}

export interface PontaRespostaDto {
  tipo: 'coordenada' | 'predio';
  /** Prédio (origem/destino por id, ou coordenada dentro de um prédio). */
  id: string | null;
  nome: string | null;
  /** `entrada`: nós do prédio; `caminho`: encaixe numa aresta; `proximidade`: nó mais próximo (prédio sem nó próprio). */
  conexao: 'entrada' | 'caminho' | 'proximidade';
  latitude: number;
  longitude: number;
}

export interface RotaDto {
  versao: string;
  acessivel: boolean;
  origem: PontaRespostaDto;
  destino: PontaRespostaDto;
  distanciaMetros: number;
  tempoSegundos: number;
  nos: number;
  arestas: number;
  geometria: LineString;
}
