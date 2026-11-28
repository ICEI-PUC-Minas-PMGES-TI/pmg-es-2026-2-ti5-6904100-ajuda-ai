import { Logger, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DataSource, type DataSourceOptions } from 'typeorm';
import { readFileSync } from 'node:fs';
import { AuthModule } from './auth/auth.module.js';
import {
  decidirSynchronize,
  opcoesSsl,
  validarSeedDemo,
} from './config/seguranca.js';
import { AvisosModule } from './avisos/avisos.module.js';
import { CadastroModule } from './cadastro/cadastro.module.js';
import { CampusModule } from './campus/campus.module.js';
import { CoordenacaoModule } from './coordenacao/coordenacao.module.js';
import { EncontrosModule } from './encontros/encontros.module.js';
import { FormulariosModule } from './formularios/formularios.module.js';
import { GamificacaoModule } from './gamificacao/gamificacao.module.js';
import { MapaModule } from './mapa/mapa.module.js';
import { MatchingModule } from './matching/matching.module.js';
import { ParticipacoesModule } from './participacoes/participacoes.module.js';
import { ProgramasModule } from './programas/programas.module.js';
import { UsuariosModule } from './usuarios/usuarios.module.js';
import { PublicacoesModule } from './publicacoes/publicacoes.module.js';
import { StorageModule } from './storage/storage.module.js';
import { ChatModule } from './chat/chat.module.js';
import { NotificacoesModule } from './notificacoes/notificacoes.module.js';

function obterSsl(configuracao: ConfigService) {
  if (configuracao.get<string>('DB_SSL', 'true') !== 'true') return false;
  const rejectUnauthorized =
    configuracao.get<string>('DB_SSL_REJECT_UNAUTHORIZED', 'true') !== 'false';
  if (
    !rejectUnauthorized &&
    configuracao.get<string>('NODE_ENV') === 'production'
  ) {
    throw new Error(
      'DB_SSL_REJECT_UNAUTHORIZED=false não é permitido em produção.',
    );
  }
  const arquivoCa = configuracao.get<string>('DB_SSL_CA_FILE')?.trim();
  return {
    rejectUnauthorized,
    ...(arquivoCa ? { ca: readFileSync(arquivoCa, 'utf8') } : {}),
  };
}

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
      useFactory: (configuracao: ConfigService) => {
        // Dados demo nunca em banco remoto (falha antes de conectar).
        validarSeedDemo(
          configuracao.getOrThrow<string>('DB_HOST'),
          configuracao.get<string>('SEED_DEMO_DATA'),
          configuracao.get<string>('NODE_ENV'),
        );
        return {
          type: 'postgres' as const,
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
          // TLS validado; DB_SSL_CA aponta a CA do provedor (ex.: Supabase).
          ssl: opcoesSsl(
            configuracao.get<string>('DB_SSL'),
            configuracao.get<string>('DB_SSL_CA'),
          ),
          schema: configuracao.get<string>('DB_SCHEMA', 'feed'),
          autoLoadEntities: true,
          // Extensões só por migration: sem isto o TypeORM roda
          // `CREATE EXTENSION postgis/uuid-ossp` ao conectar e instalaria o
          // PostGIS em `public` (ver docs/tecnico/banco/migrations.md).
          installExtensions: false,
          retryAttempts: 5,
          retryDelay: 2000,
        };
      },
      // Em um banco novo o schema ainda não existe e o synchronize falha.
      dataSourceFactory: async (opcoes?: DataSourceOptions) => {
        if (!opcoes) throw new Error('Configuração do banco ausente.');
        // Deixa inequívoco qual banco está em uso (sem credenciais).
        if (opcoes.type === 'postgres') {
          new Logger('Banco').log(
            `${opcoes.host}:${opcoes.port}/${opcoes.database} schema=${opcoes.schema} ssl=${opcoes.ssl ? (typeof opcoes.ssl === 'object' ? 'ativo (CA própria)' : 'ativo') : 'desativado'} synchronize=${opcoes.synchronize} seedDemo=${process.env.SEED_DEMO_DATA === 'true'}`,
          );
        }
        // Criar o schema é escrita: só junto com synchronize (banco local).
        if (opcoes.synchronize) await garantirSchema(opcoes);
        return new DataSource(opcoes).initialize();
      },
    }),
    StorageModule,
    ChatModule,
    MatchingModule,
    AuthModule,
    UsuariosModule,
    CadastroModule,
    AvisosModule,
    PublicacoesModule,
    ParticipacoesModule,
    ProgramasModule,
    FormulariosModule,
    CoordenacaoModule,
    MatchingModule,
    MapaModule,
    GamificacaoModule,
    NotificacoesModule,
    CampusModule,
    EncontrosModule,
  ],
})
export class AppModule {}
