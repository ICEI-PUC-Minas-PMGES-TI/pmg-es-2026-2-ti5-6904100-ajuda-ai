import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from './auth/auth.module.js';
import { AvisosModule } from './avisos/avisos.module.js';
import { CoordenacaoModule } from './coordenacao/coordenacao.module.js';
import { ParticipacoesModule } from './participacoes/participacoes.module.js';
import { ProgramasModule } from './programas/programas.module.js';
import { UsuariosModule } from './usuarios/usuarios.module.js';
import { PublicacoesModule } from './publicacoes/publicacoes.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (configuracao: ConfigService) => ({
        type: 'postgres',
        host: configuracao.get<string>('DB_HOST', 'localhost'),
        port: Number(configuracao.get<string>('DB_PORT', '5433')),
        username: configuracao.get<string>('DB_USERNAME', 'ajudaai'),
        password: configuracao.get<string>('DB_PASSWORD', 'ajudaai'),
        database: configuracao.get<string>('DB_DATABASE', 'ajudaai'),
        schema: configuracao.get<string>('DB_SCHEMA', 'feed'),
        autoLoadEntities: true,
        synchronize:
          configuracao.get<string>('DB_SYNCHRONIZE', 'true') === 'true',
        retryAttempts: 5,
        retryDelay: 2000,
      }),
    }),
    AuthModule,
    UsuariosModule,
    AvisosModule,
    PublicacoesModule,
    ParticipacoesModule,
    ProgramasModule,
    CoordenacaoModule,
  ],
})
export class AppModule {}
