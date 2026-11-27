import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { NotificacoesModule } from '../notificacoes/notificacoes.module.js';
import { ParticipacoesModule } from '../participacoes/participacoes.module.js';
import {
  ConquistasAdminController,
  ConquistasController,
} from './conquistas/conquistas.controller.js';
import { ConquistasAdminService } from './conquistas/conquistas-admin.service.js';
import { ConquistasService } from './conquistas/conquistas.service.js';
import { LojinhaController } from './lojinha/lojinha.controller.js';
import { LojinhaService } from './lojinha/lojinha.service.js';
import { LimpezaTentativasService } from './missoes/limpeza-tentativas.service.js';
import { MissoesAdminController } from './missoes/missoes-admin.controller.js';
import { MissoesAdminService } from './missoes/missoes-admin.service.js';
import { MissoesController } from './missoes/missoes.controller.js';
import { MissoesService } from './missoes/missoes.service.js';
import { PucStopsAdminController } from './pucstops/pucstops-admin.controller.js';
import { PucStopsAdminService } from './pucstops/pucstops-admin.service.js';
import {
  MinhasColetasController,
  PucStopsController,
} from './pucstops/pucstops.controller.js';
import { PucStopsService } from './pucstops/pucstops.service.js';
import { RecompensasAdminController } from './recompensas/recompensas-admin.controller.js';
import { RecompensasAdminService } from './recompensas/recompensas-admin.service.js';
import { ResgatesAdminController } from './resgates/resgates-admin.controller.js';
import { ResgatesAdminService } from './resgates/resgates-admin.service.js';
import { XpAdminController } from './xp/xp-admin.controller.js';
import { XpAdminService } from './xp/xp-admin.service.js';
import { NiveisController, XpController } from './xp/xp.controller.js';
import { XpService } from './xp/xp.service.js';

/**
 * XP global por usuário e PucStops (ADR-0002): leitura pública e coleta em
 * `/mapa/pucstops`, administração em `/coordenacao/pucstops`. SQL direto (schemas
 * `gamificacao` e `mapa`), sem entidades: o `synchronize` local nunca cria
 * nem altera essas tabelas; só as migrations PucStopsEXpGlobal,
 * LojinhaResgates/LojinhaRecompensas. Lojinha: cadastro (F27) em
 * `/coordenacao/recompensas` e consulta/resgate do aluno (F28) em `/me/lojinha`.
 * Entrega e cancelamento (F29) em `/coordenacao/resgates`; saldo e ajustes de
 * XP pela coordenação (F26) em `/coordenacao/xp`. Conquistas (F32): cadastro em
 * `/coordenacao/conquistas` e coleção do aluno em `/me/conquistas`.
 */
@Module({
  imports: [AuthModule, ParticipacoesModule, NotificacoesModule],
  controllers: [
    PucStopsController,
    MinhasColetasController,
    XpController,
    NiveisController,
    PucStopsAdminController,
    RecompensasAdminController,
    LojinhaController,
    ResgatesAdminController,
    XpAdminController,
    MissoesController,
    MissoesAdminController,
    ConquistasController,
    ConquistasAdminController,
  ],
  providers: [
    PucStopsService,
    XpService,
    PucStopsAdminService,
    RecompensasAdminService,
    LojinhaService,
    ResgatesAdminService,
    XpAdminService,
    MissoesService,
    MissoesAdminService,
    LimpezaTentativasService,
    ConquistasService,
    ConquistasAdminService,
  ],
  // O feed confere as conquistas de publicação e comentário (F32).
  exports: [ConquistasService],
})
export class GamificacaoModule {}
