import { FormularioEntity } from '../src/formularios/entities/formulario.entity.js';
import {
  INestApplication,
  UnauthorizedException,
  ValidationPipe,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import request from 'supertest';
import { AuthModule } from '../src/auth/auth.module.js';
import { MicrosoftTokenVerifier } from '../src/auth/microsoft-token.verifier.js';
import { CadastroModule } from '../src/cadastro/cadastro.module.js';
import { ParticipacaoEntity } from '../src/participacoes/entities/participacao.entity.js';
import { ProgramaEntity } from '../src/programas/entities/programa.entity.js';
import { UsuarioEntity } from '../src/usuarios/entities/usuario.entity.js';
import {
  repositorioEmMemoria,
  conectarRepositorios,
} from './helpers/repositorio-memoria.js';

describe('Autenticação (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const repos = conectarRepositorios({
      UsuarioEntity: repositorioEmMemoria<UsuarioEntity>([]),
      ParticipacaoEntity: repositorioEmMemoria<ParticipacaoEntity>([]),
      ProgramaEntity: repositorioEmMemoria<ProgramaEntity>(),
      FormularioEntity: repositorioEmMemoria<FormularioEntity>(),
    });
    const modulo = await Test.createTestingModule({
      imports: [AuthModule, CadastroModule],
    })
      .overrideProvider(getRepositoryToken(UsuarioEntity))
      .useValue(repos.UsuarioEntity)
      .overrideProvider(getRepositoryToken(ParticipacaoEntity))
      .useValue(repos.ParticipacaoEntity)
      .overrideProvider(getRepositoryToken(ProgramaEntity))
      .useValue(repos.ProgramaEntity)
      .overrideProvider(MicrosoftTokenVerifier)
      .useValue({
        verificar: vi.fn().mockResolvedValue({
          subject: 'microsoft-user-id',
          email: 'camila@pucminas.edu.br',
          name: 'Camila Duarte',
        }),
      })
      .overrideProvider(getRepositoryToken(FormularioEntity))
      .useValue(repos.FormularioEntity)
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

    expect(login.body.situacao).toBe('autenticado');
    expect(login.body.accessToken).toEqual(expect.any(String));

    const perfil = await request(app.getHttpServer())
      .get('/me')
      .set('Authorization', `Bearer ${login.body.accessToken}`)
      .expect(200);

    expect(perfil.body).toMatchObject({
      email: 'camila@pucminas.edu.br',
      perfil: 'apadrinhado',
      statusCadastro: 'aprovado',
    });
  });

  it('impede acesso ao perfil sem JWT', async () => {
    await request(app.getHttpServer()).get('/me').expect(401);
  });

  it('rejeita um corpo de login sem ID token', async () => {
    await request(app.getHttpServer()).post('/auth/login').send({}).expect(400);
  });

  it('usuário Microsoft ainda não cadastrado recebe onboarding e não entra no /me', async () => {
    const verificador = app.get(MicrosoftTokenVerifier) as {
      verificar: ReturnType<typeof vi.fn>;
    };
    verificador.verificar.mockResolvedValueOnce({
      subject: 'novo-subject',
      email: 'gabriel@pucminas.edu.br',
      name: 'Gabriel',
    });

    const login = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ idToken: 'id-token-novo' })
      .expect(201);

    expect(login.body.situacao).toBe('onboarding');
    expect(login.body.accessToken).toBeUndefined();
    expect(login.body.identidade).toEqual({
      nome: 'Gabriel',
      email: 'gabriel@pucminas.edu.br',
    });

    await request(app.getHttpServer())
      .get('/me')
      .set('Authorization', `Bearer ${login.body.onboardingToken}`)
      .expect(401);
  });

  it('domínio fora de @pucminas.edu.br e token inválido são recusados', async () => {
    const verificador = app.get(MicrosoftTokenVerifier) as {
      verificar: ReturnType<typeof vi.fn>;
    };
    verificador.verificar.mockResolvedValueOnce({
      subject: 's',
      email: 'gabriel@gmail.com',
      name: 'Gabriel',
    });
    await request(app.getHttpServer())
      .post('/auth/login')
      .send({ idToken: 'outro-dominio' })
      .expect(401);

    verificador.verificar.mockRejectedValueOnce(
      new UnauthorizedException('Token Microsoft inválido ou expirado.'),
    );
    await request(app.getHttpServer())
      .post('/auth/login')
      .send({ idToken: 'invalido' })
      .expect(401);
  });
});
