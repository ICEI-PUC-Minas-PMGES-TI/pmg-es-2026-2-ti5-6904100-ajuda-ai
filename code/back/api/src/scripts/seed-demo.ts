import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module.js';
import { CoordenacaoService } from '../coordenacao/coordenacao.service.js';
import { UsuariosService } from '../usuarios/usuarios.service.js';

/**
 * Grava o conjunto fixo de alunos e participações demo no banco do `.env`.
 * Idempotente. Recusado em produção. Não liga SEED_DEMO_DATA na subida da API.
 * Não incluir a coordenadora: ela continua só na base em memória.
 */
async function seedDemo() {
  if (process.env.NODE_ENV === 'production') {
    console.error('npm run seed:demo é recusado com NODE_ENV=production.');
    process.exit(1);
  }

  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn', 'log'],
  });
  try {
    await app.get(UsuariosService).semearAlunosDemo();
    await app.get(CoordenacaoService).semearBaseDemo();
    console.log(
      'Base demo conferida. Alunos já existentes não foram duplicados. A coordenadora Renata não vai para o banco.',
    );
  } finally {
    await app.close();
  }
}

await seedDemo();
