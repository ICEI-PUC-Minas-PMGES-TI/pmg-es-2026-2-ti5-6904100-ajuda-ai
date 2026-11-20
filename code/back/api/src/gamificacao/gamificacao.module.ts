import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { ParticipacoesModule } from '../participacoes/participacoes.module.js';
import { LojinhaController } from './lojinha/lojinha.controller.js';
import { LojinhaService } from './lojinha/lojinha.service.js';
import { PucStopsAdminController } from './pucstops/pucstops-admin.controller.js';
import { PucStopsAdminService } from './pucstops/pucstops-admin.service.js';
import {
  MinhasColetasController,
  PucStopsController,
} from './pucstops/pucstops.controller.js';
import { PucStopsService } from './pucstops/pucstops.service.js';
import { QaGamificacaoController } from './qa/qa-gamificacao.controller.js';
import { QaGamificacaoGuard } from './qa/qa-gamificacao.guard.js';
import { QaGamificacaoService } from './qa/qa-gamificacao.service.js';
import { RecompensasAdminController } from './recompensas/recompensas-admin.controller.js';
import { RecompensasAdminService } from './recompensas/recompensas-admin.service.js';
import { NiveisController, XpController } from './xp/xp.controller.js';
import { XpService } from './xp/xp.service.js';

/**
 * XP global por usuário e PucStops (ADR-0002): leitura pública e coleta em
 * `/mapa/pucstops`, administração em `/coordenacao/pucstops`. SQL direto (schemas
 * `gamificacao` e `mapa`), sem entidades: o `synchronize` local nunca cria
 * nem altera essas tabelas; só as migrations PucStopsEXpGlobal,
 * LojinhaResgates/LojinhaRecompensas. Lojinha: cadastro (F27) em
 * `/coordenacao/recompensas` e consulta/resgate do aluno (F28) em `/me/lojinha`.
 * Painel de QA (só leitura/simulação) em `/qa/gamificacao`, restrito por
 * `GAMIFICACAO_QA_EMAILS`.
 */
@Module({
  imports: [AuthModule, ParticipacoesModule],
  controllers: [
    PucStopsController,
    MinhasColetasController,
    XpController,
    NiveisController,
    PucStopsAdminController,
    RecompensasAdminController,
    LojinhaController,
    QaGamificacaoController,
  ],
  providers: [
    PucStopsService,
    XpService,
    PucStopsAdminService,
    RecompensasAdminService,
    LojinhaService,
    QaGamificacaoService,
    QaGamificacaoGuard,
  ],
})
export class GamificacaoModule {}
