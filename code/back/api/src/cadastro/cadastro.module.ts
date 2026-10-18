import { FormulariosModule } from '../formularios/formularios.module.js';
import { StorageModule } from '../storage/storage.module.js';
import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { ParticipacoesModule } from '../participacoes/participacoes.module.js';
import { ProgramasModule } from '../programas/programas.module.js';
import { UsuariosModule } from '../usuarios/usuarios.module.js';
import {
  CadastroController,
  CadastroParticipacoesController,
  MeController,
} from './cadastro.controller.js';
import { CadastroService } from './cadastro.service.js';

@Module({
  imports: [
    FormulariosModule,
    StorageModule,
    AuthModule,
    UsuariosModule,
    ParticipacoesModule,
    ProgramasModule,
  ],
  controllers: [
    CadastroController,
    MeController,
    CadastroParticipacoesController,
  ],
  providers: [CadastroService],
  exports: [CadastroService],
})
export class CadastroModule {}
