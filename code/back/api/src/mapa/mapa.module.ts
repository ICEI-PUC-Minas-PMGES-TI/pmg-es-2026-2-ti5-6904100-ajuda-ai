import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { StorageModule } from '../storage/storage.module.js';
import { LocalConteudoService } from './local-conteudo.service.js';
import {
  MapaController,
  MapaLocaisAdminController,
} from './mapa.controller.js';
import { MapaService } from './mapa.service.js';
import { RotasController } from './rotas/rotas.controller.js';
import { RotasService } from './rotas/rotas.service.js';

/**
 * API de leitura do schema `mapa`. As entidades de `entities/` não são
 * registradas no TypeORM: o service lê por SQL parametrizado com funções
 * PostGIS/unaccent qualificadas, então o runtime não depende do `search_path`
 * e o `synchronize` local nunca toca no schema `mapa`. As rotas (`rotas/`)
 * carregam o grafo da versão ativa em memória e calculam sem gravar nada.
 */
@Module({
  imports: [AuthModule, StorageModule],
  controllers: [MapaController, MapaLocaisAdminController, RotasController],
  providers: [MapaService, LocalConteudoService, RotasService],
})
export class MapaModule {}
