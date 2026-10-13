import { Logger, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DataSource, type DataSourceOptions } from 'typeorm';
import { AuthModule } from './auth/auth.module.js';
import { decidirSynchronize } from './config/seguranca.js';
import { AvisosModule } from './avisos/avisos.module.js';
import { CadastroModule } from './cadastro/cadastro.module.js';
import { CoordenacaoModule } from './coordenacao/coordenacao.module.js';
import { FormulariosModule } from './formularios/formularios.module.js';
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
        // Sem default: um DB_HOST ausente não pode cair num banco qualquer.
        host: configuracao.getOrThrow<string>('DB_HOST'),
        // Padrão desligado; ligado só em banco local (ver config/seguranca.ts).
        synchronize: decidirSynchronize(
          configuracao.getOrThrow<string>('DB_HOST'),
          configuracao.get<string>('DB_SYNCHRONIZE'),
          configuracao.get<string>('NODE_ENV'),
        ),
        port: Number(configuracao.get<string>('DB_PORT', '5432')),
        username: configuracao.get<string>('DB_USERNAME', 'postgres'),
        password: configuracao.getOrThrow<string>('DB_PASSWORD'),
        database: configuracao.get<string>('DB_DATABASE', 'postgres'),
        ssl: configuracao.get<string>('DB_SSL', 'true') === 'true',
        schema: configuracao.get<string>('DB_SCHEMA', 'feed'),
        autoLoadEntities: true,
        retryAttempts: 5,
        retryDelay: 2000,
      }),
      // Em um banco novo o schema ainda não existe e o synchronize falha.
      dataSourceFactory: async (opcoes?: DataSourceOptions) => {
        if (!opcoes) throw new Error('Configuração do banco ausente.');
        // Deixa inequívoco qual banco está em uso (sem credenciais).
        if (opcoes.type === 'postgres') {
          new Logger('Banco').log(
            `${opcoes.host}:${opcoes.port}/${opcoes.database} schema=${opcoes.schema} ssl=${opcoes.ssl ? 'ativo' : 'desativado'} synchronize=${opcoes.synchronize}`,
          );
        }
        // Criar o schema é escrita: só junto com synchronize (banco local).
        if (opcoes.synchronize) await garantirSchema(opcoes);
        return new DataSource(opcoes).initialize();
      },
    }),
    AuthModule,
    UsuariosModule,
    CadastroModule,
    AvisosModule,
    PublicacoesModule,
    ParticipacoesModule,
    ProgramasModule,
    FormulariosModule,
    CoordenacaoModule,
  ],
})
export class AppModule {}
