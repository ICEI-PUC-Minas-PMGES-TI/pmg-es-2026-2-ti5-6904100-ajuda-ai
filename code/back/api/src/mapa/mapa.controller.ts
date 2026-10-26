import { Controller, Get, Param, Query } from '@nestjs/common';
import { BuscaMapaQuery } from './dto/mapa.dto.js';
import { MapaService } from './mapa.service.js';

/**
 * Leitura pública do mapa do campus (dados abertos, sem login), como
 * `GET /avisos`. Só GET; nada de escrita, publicação ou administração.
 */
@Controller('mapa')
export class MapaController {
  constructor(private readonly mapa: MapaService) {}

  @Get('versao')
  versao() {
    return this.mapa.versao();
  }

  @Get('predios')
  predios() {
    return this.mapa.predios();
  }

  @Get('predios/:id')
  predio(@Param('id') id: string) {
    return this.mapa.predio(id);
  }

  @Get('areas')
  areas() {
    return this.mapa.areas();
  }

  @Get('salas')
  salas() {
    return this.mapa.salas();
  }

  /** `q` vazio devolve `[]`; `limit` 1..20 (padrão 8). */
  @Get('busca')
  buscar(@Query() consulta: BuscaMapaQuery) {
    return this.mapa.buscar(consulta.q, consulta.limit);
  }
}
