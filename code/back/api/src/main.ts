import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { json } from 'express';
import { AppModule } from './app.module.js';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableShutdownHooks();
  app.enableCors();
  app.use(json({ limit: '20mb' }));
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }),
  );
  const porta = Number(process.env.PORT ?? 3000);
  // 0.0.0.0: acessível pelo emulador (10.0.2.2), LAN e localhost.
  await app.listen(porta, process.env.HOST ?? '0.0.0.0');
}

await bootstrap();
