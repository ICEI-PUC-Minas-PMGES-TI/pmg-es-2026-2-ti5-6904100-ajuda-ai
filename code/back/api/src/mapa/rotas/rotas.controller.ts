import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { CalcularRotaDto } from './rotas.dto.js';
import { RotasService } from './rotas.service.js';

/**
 * Rota a pé sob demanda, pública como a leitura do mapa. POST porque a origem
 * pode ser a localização do usuário: ela vai no corpo (fora de URL e de logs
 * de acesso), é usada só no cálculo e não é gravada.
 */
@Controller('mapa')
export class RotasController {
  constructor(private readonly rotas: RotasService) {}

  @Post('rotas')
  @HttpCode(200)
  calcular(@Body() pedido: CalcularRotaDto) {
    return this.rotas.calcular(pedido);
  }
}
