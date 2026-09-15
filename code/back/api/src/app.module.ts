import { Module } from '@nestjs/common';
import { AuthModule } from './auth/auth.module.js';
import { AvisosModule } from './avisos/avisos.module.js';
import { UsuariosModule } from './usuarios/usuarios.module.js';

@Module({
  imports: [AuthModule, UsuariosModule, AvisosModule],
})
export class AppModule {}
