import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { StorageModule } from '../storage/storage.module.js';
import {
  CampusAdminController,
  CardapiosAdminController,
  EventosAdminController,
  EventosController,
  RestaurantesAdminController,
  RestaurantesController,
} from './campus.controller.js';
import { CardapiosService } from './cardapios/cardapios.service.js';
import { EventosService } from './eventos/eventos.service.js';
import { RestaurantesService } from './restaurantes/restaurantes.service.js';

/**
 * Eventos, restaurantes e cardápios do campus (Tarefa 11). Leitura pública em
 * `/mapa/eventos` e `/mapa/restaurantes`; administração em `/coordenacao/...`.
 * SQL direto no schema `mapa` (sem entidades: o `synchronize` local nunca
 * cria essas tabelas; só a migration EventosRestaurantesCardapios).
 */
@Module({
  imports: [AuthModule, StorageModule],
  controllers: [
    EventosController,
    RestaurantesController,
    CampusAdminController,
    EventosAdminController,
    RestaurantesAdminController,
    CardapiosAdminController,
  ],
  providers: [EventosService, RestaurantesService, CardapiosService],
})
export class CampusModule {}
