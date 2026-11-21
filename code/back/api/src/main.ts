import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { json } from 'express';
import { DataSource } from 'typeorm';
import { AppModule } from './app.module.js';
import {
  ambienteApp,
  ambientePublicado,
  modoLoginDemo,
  origensCors,
} from './config/ambiente.js';
import { avaliarSegredoJwt, ehBancoLocal } from './config/seguranca.js';
import { registrarSaude } from './saude.js';

async function bootstrap() {
  const log = new Logger('Bootstrap');
  const ambiente = ambienteApp();

  // Falha cedo, antes de abrir a porta, se um ambiente publicado estiver mal configurado.
  const cors = origensCors(process.env.CORS_ORIGINS, ambiente);
  if (ambientePublicado(ambiente) || !ehBancoLocal(process.env.DB_HOST ?? 'localhost')) {
    // Homologação é pública, e banco compartilhado tem dados de todos: com o
    // segredo de exemplo (literal público no código) qualquer um forjaria um
    // token. Exige o mesmo segredo forte da produção (SEG-001).
    avaliarSegredoJwt(process.env.JWT_SECRET, 'production');
  }

  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  app.enableShutdownHooks();
  if (ambientePublicado(ambiente)) {
    // Atrás do ingress HTTPS (um salto): IP real do cliente para o limite de tentativas.
    app.set('trust proxy', 1);
  }
  app.enableCors({
    origin: cors,
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Demo-Chave', 'Last-Event-ID'],
    maxAge: 600,
  });
  app.use(json({ limit: '20mb' }));
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }),
  );
  registrarSaude(app, app.get(DataSource), ambiente);

  const demo = modoLoginDemo();
  log.log(
    `Ambiente: ${ambiente}. Login demo: ${demo.modo}` +
      (demo.modo === 'desligado' ? ` (${demo.motivo})` : '') +
      `. CORS: ${cors === true ? 'qualquer origem (desenvolvimento)' : cors.join(', ')}.`,
  );

  const porta = Number(process.env.PORT ?? 3000);
  // 0.0.0.0: LAN e contêiner. 127.0.0.1: só a máquina (o emulador Android
  // continua chegando por 10.0.2.2) e deixa o login demo aberto no desenvolvimento.
  await app.listen(porta, process.env.HOST ?? '0.0.0.0');
}

await bootstrap();
