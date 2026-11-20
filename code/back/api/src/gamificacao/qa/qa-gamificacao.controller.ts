import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { Type } from 'class-transformer';
import { IsDefined, IsInt, IsOptional, Max, Min } from 'class-validator';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard.js';
import { QaGamificacaoGuard } from './qa-gamificacao.guard.js';
import { QaGamificacaoService } from './qa-gamificacao.service.js';

export class SimulacaoQaQuery {
  @IsDefined()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(1000)
  nivel!: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(100)
  progresso?: number;
}

/**
 * Painel de QA da gamificação: só LEITURA e cálculo em memória. Não há rota
 * de escrita: nada aqui altera XP, moedas, nível, celebração ou coletas.
 * Acesso: JWT válido + e-mail em `GAMIFICACAO_QA_EMAILS` (ver o guard).
 */
@Controller('qa/gamificacao')
@UseGuards(JwtAuthGuard, QaGamificacaoGuard)
export class QaGamificacaoController {
  constructor(private readonly qa: QaGamificacaoService) {}

  @Get('acesso')
  acesso() {
    return this.qa.acesso();
  }

  @Get('simulacao')
  simulacao(@Query() consulta: SimulacaoQaQuery) {
    // Sem `transform` no ValidationPipe global: a query chega como string.
    return this.qa.simular(
      Number(consulta.nivel),
      consulta.progresso === undefined ? undefined : Number(consulta.progresso),
    );
  }
}
