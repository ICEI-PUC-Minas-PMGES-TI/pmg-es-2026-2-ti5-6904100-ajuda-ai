import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
export class PublicacaoDto {
  @IsOptional() @IsString() @MaxLength(10000) texto?: string;
  @IsOptional() @IsString() @MaxLength(80) categoria?: string;
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @IsString({ each: true })
  @MaxLength(300, { each: true })
  imagens?: string[];
}
export class ComentarioDto {
  @IsString() @MinLength(1) @MaxLength(2000) texto: string;
}
export class CurtidaDto {
  @IsIn([1, -1]) delta: number;
}
