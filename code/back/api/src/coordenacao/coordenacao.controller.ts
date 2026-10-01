import {
  Body,
  Controller,
  Get,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { Roles } from '../auth/roles.decorator.js';
import { RolesGuard } from '../auth/roles.guard.js';
import { CoordenacaoService } from './coordenacao.service.js';

@Controller('coordenacao')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('coordenador')
export class CoordenacaoController {
  constructor(private readonly coordenacaoService: CoordenacaoService) {}

  @Get('dashboard')
  dashboard(@Query('programa') programa?: string) {
    return this.coordenacaoService.obterDashboard(programa);
  }

  @Get('candidaturas')
  candidaturas(
    @Query('programa') programa?: string,
    @Query('status') status?: string,
  ) {
    const ciclo = programa?.trim();
    if (!ciclo) {
      return this.coordenacaoService.obterDashboard().then((dash) => {
        if (!dash.programa) return [];
        return this.coordenacaoService.listarCandidaturas(
          dash.programa.codigo,
          status,
        );
      });
    }
    return this.coordenacaoService.listarCandidaturas(ciclo, status);
  }

  @Post('programas')
  criarPrograma(@Body() corpo: { codigo?: string }) {
    return this.coordenacaoService.criarNovoCiclo(corpo.codigo);
  }
}
