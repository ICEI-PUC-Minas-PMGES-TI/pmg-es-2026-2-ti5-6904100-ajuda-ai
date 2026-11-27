import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { GamificacaoModule } from '../gamificacao/gamificacao.module.js';
import { NotificacoesModule } from '../notificacoes/notificacoes.module.js';
import { ParticipacoesModule } from '../participacoes/participacoes.module.js';
import { EncontrosPresencaService } from './encontros-presenca.service.js';
import { EncontrosController } from './encontros.controller.js';
import { EncontrosService } from './encontros.service.js';

@Module({
  imports: [
    AuthModule,
    ParticipacoesModule,
    NotificacoesModule,
    GamificacaoModule,
  ],
  controllers: [EncontrosController],
  providers: [EncontrosService, EncontrosPresencaService],
  exports: [EncontrosService],
})
export class EncontrosModule {}
