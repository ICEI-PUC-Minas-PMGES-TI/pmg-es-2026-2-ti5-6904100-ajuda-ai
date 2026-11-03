import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { PucStopsAdminController } from './pucstops/pucstops-admin.controller.js';
import { PucStopsAdminService } from './pucstops/pucstops-admin.service.js';
import {
  MinhasColetasController,
  PucStopsController,
} from './pucstops/pucstops.controller.js';
import { PucStopsService } from './pucstops/pucstops.service.js';
import { RecompensasAdminController } from './recompensas/recompensas-admin.controller.js';
import { RecompensasAdminService } from './recompensas/recompensas-admin.service.js';
import { XpController } from './xp/xp.controller.js';
import { XpService } from './xp/xp.service.js';

/**
 * XP global por usuário e PucStops (ADR-0002): leitura pública e coleta em
 * `/mapa/pucstops`, administração em `/coordenacao/pucstops`. SQL direto (schemas
 * `gamificacao` e `mapa`), sem entidades: o `synchronize` local nunca cria
 * nem altera essas tabelas; só as migrations PucStopsEXpGlobal e
 * LojinhaRecompensas. Recompensas da lojinha (F27) em `/coordenacao/recompensas`.
 */
@Module({
  imports: [AuthModule],
  controllers: [
    PucStopsController,
    MinhasColetasController,
    XpController,
    PucStopsAdminController,
    RecompensasAdminController,
  ],
  providers: [
    PucStopsService,
    XpService,
    PucStopsAdminService,
    RecompensasAdminService,
  ],
})
export class GamificacaoModule {}
