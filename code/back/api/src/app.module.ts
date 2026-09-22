import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AuthModule } from './auth/auth.module.js';
import { AvisosModule } from './avisos/avisos.module.js';
import { UsuariosModule } from './usuarios/usuarios.module.js';
import { PublicacoesModule } from './publicacoes/publicacoes.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    AuthModule,
    UsuariosModule,
    AvisosModule,
    PublicacoesModule,
  ],
})
export class AppModule {}
