import { Module } from '@nestjs/common';
import { MapaController } from './mapa.controller.js';
import { MapaService } from './mapa.service.js';

/**
 * API de leitura do schema `mapa`. As entidades de `entities/` não são
 * registradas no TypeORM: o service lê por SQL parametrizado com funções
 * PostGIS/unaccent qualificadas, então o runtime não depende do `search_path`
 * e o `synchronize` local nunca toca no schema `mapa`.
 */
@Module({
  controllers: [MapaController],
  providers: [MapaService],
})
export class MapaModule {}
