import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AuthModule } from '../src/auth/auth.module.js';
import { MicrosoftTokenVerifier } from '../src/auth/microsoft-token.verifier.js';
import { UsuariosModule } from '../src/usuarios/usuarios.module.js';

describe('Autenticação (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const modulo = await Test.createTestingModule({
      imports: [AuthModule, UsuariosModule],
    })
      .overrideProvider(MicrosoftTokenVerifier)
      .useValue({
        verificar: vi.fn().mockResolvedValue({
          subject: 'microsoft-user-id',
          email: 'camila@pucminas.edu.br',
          name: 'Camila Duarte',
        }),
      })
      .compile();

    app = modulo.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }),
    );
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
  });

  it('faz login e usa o JWT para acessar o próprio perfil', async () => {
    const login = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ idToken: 'id-token-valido' })
      .expect(201);

    expect(login.body.accessToken).toEqual(expect.any(String));

    const perfil = await request(app.getHttpServer())
      .get('/me')
      .set('Authorization', `Bearer ${login.body.accessToken}`)
      .expect(200);

    expect(perfil.body).toMatchObject({
      id: 1,
      email: 'camila@pucminas.edu.br',
      perfil: 'apadrinhado',
    });
  });

  it('impede acesso ao perfil sem JWT', async () => {
    await request(app.getHttpServer()).get('/me').expect(401);
  });

  it('rejeita um corpo de login sem ID token', async () => {
    await request(app.getHttpServer()).post('/auth/login').send({}).expect(400);
  });
});
