import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DataSource, type DataSourceOptions } from 'typeorm';
import { AuthModule } from './auth/auth.module.js';
import { AvisosModule } from './avisos/avisos.module.js';
import { CoordenacaoModule } from './coordenacao/coordenacao.module.js';
import { ParticipacoesModule } from './participacoes/participacoes.module.js';
import { ProgramasModule } from './programas/programas.module.js';
import { UsuariosModule } from './usuarios/usuarios.module.js';
import { PublicacoesModule } from './publicacoes/publicacoes.module.js';

async function garantirSchema(opcoes: DataSourceOptions): Promise<void> {
  const schema = 'schema' in opcoes ? opcoes.schema : undefined;
  if (opcoes.type !== 'postgres' || !schema) return;
  const conexao = new DataSource({
    ...opcoes,
    entities: [],
    synchronize: false,
  });
  await conexao.initialize();
  try {
    await conexao.query(
      `CREATE SCHEMA IF NOT EXISTS "${schema.replaceAll('"', '""')}"`,
    );
  } finally {
    await conexao.destroy();
  }
}

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
      // Em um banco novo o schema ainda não existe e o synchronize falha.
      dataSourceFactory: async (opcoes?: DataSourceOptions) => {
        if (!opcoes) throw new Error('Configuração do banco ausente.');
        await garantirSchema(opcoes);
        return new DataSource(opcoes).initialize();
      },
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
