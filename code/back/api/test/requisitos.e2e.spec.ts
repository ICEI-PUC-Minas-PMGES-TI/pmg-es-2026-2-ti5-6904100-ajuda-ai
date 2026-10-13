import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import request from 'supertest';
import { AuthModule } from '../src/auth/auth.module.js';
import { CadastroModule } from '../src/cadastro/cadastro.module.js';
import { FormularioEntity } from '../src/formularios/entities/formulario.entity.js';
import { FormulariosModule } from '../src/formularios/formularios.module.js';
import { ParticipacaoEntity } from '../src/participacoes/entities/participacao.entity.js';
import { ParticipacoesModule } from '../src/participacoes/participacoes.module.js';
import { ParticipacoesService } from '../src/participacoes/participacoes.service.js';
import { ProgramaEntity } from '../src/programas/entities/programa.entity.js';
import { ProgramasService } from '../src/programas/programas.service.js';
import { UsuarioEntity } from '../src/usuarios/entities/usuario.entity.js';
import { repositorioEmMemoria } from './helpers/repositorio-memoria.js';

/** Regras de período × requisitos do ciclo, pela API (sem frontend). */
describe('Período e requisitos de padrinho (e2e)', () => {
  let app: INestApplication;
  let participacoes: ParticipacaoEntity[];
  const ciclo = ParticipacoesService.programaAtual();

  beforeEach(async () => {
    participacoes = [];
    const modulo = await Test.createTestingModule({
      imports: [
        AuthModule,
        ParticipacoesModule,
        CadastroModule,
        FormulariosModule,
      ],
    })
      .overrideProvider(getRepositoryToken(UsuarioEntity))
      .useValue(repositorioEmMemoria<UsuarioEntity>())
      .overrideProvider(getRepositoryToken(ParticipacaoEntity))
      .useValue(repositorioEmMemoria(participacoes))
      .overrideProvider(getRepositoryToken(ProgramaEntity))
      .useValue(repositorioEmMemoria<ProgramaEntity>())
      .overrideProvider(getRepositoryToken(FormularioEntity))
      .useValue(repositorioEmMemoria<FormularioEntity>())
      .compile();
    app = modulo.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }),
    );
    await app.init();
    // ciclo de teste com requisitos configurados pela coordenação
    await app.get(ProgramasService).atualizar(ciclo, {
      requisitosPadrinho: [{ descricao: 'Cálculo I' }, { descricao: 'AED I' }],
    });
  });

  afterEach(async () => {
    await app?.close();
  });

  const http = () => request(app.getHttpServer());
  let n = 0;
  const corpo = (tipo: string, periodo: number, requisitos?: unknown) => ({
    nome: 'Aluno',
    email: `aluno${++n}@pucminas.edu.br`,
    curso: 'SI',
    periodo,
    tipoParticipacao: tipo,
    respostas: requisitos ? { requisitos } : {},
  });
  const todos = [
    { id: 'calculo-i', cumpre: true },
    { id: 'aed-i', cumpre: true },
  ];

  it('1. 1º + APADRINHADO → permitido', async () => {
    await http().post('/cadastro').send(corpo('apadrinhado', 1)).expect(201);
  });

  it('2. 1º + PADRINHO → 400 (mesmo declarando os requisitos)', async () => {
    const r = await http()
      .post('/cadastro')
      .send(corpo('padrinho', 1, todos))
      .expect(400);
    expect(r.body.message).toMatch(/1º período/);
  });

  it('3/5. 2º e 3º+ + APADRINHADO → 400', async () => {
    for (const periodo of [2, 3, 8]) {
      await http()
        .post('/cadastro')
        .send(corpo('apadrinhado', periodo))
        .expect(400);
    }
  });

  it('4/6. 2º e 3º+ + PADRINHO → entram na validação dos requisitos', async () => {
    for (const periodo of [2, 3, 8]) {
      const sem = await http()
        .post('/cadastro')
        .send(corpo('padrinho', periodo))
        .expect(400);
      expect(sem.body.message).toMatch(/é preciso cumprir: Cálculo I; AED I/);

      const com = await http()
        .post('/cadastro')
        .send(corpo('padrinho', periodo, todos))
        .expect(201);
      expect(com.body.usuario.statusCadastro).toBe('pendente');
      expect(com.body.participacao).toMatchObject({
        papel: 'candidato',
        status: 'pendente',
      });
    }
  });

  it('B. declara que NÃO cumpre um requisito → 400', async () => {
    const r = await http()
      .post('/cadastro')
      .send(
        corpo('padrinho', 3, [
          { id: 'calculo-i', cumpre: false },
          { id: 'aed-i', cumpre: true },
        ]),
      )
      .expect(400);
    expect(r.body.message).toMatch(/Cálculo I/);
    expect(r.body.message).not.toMatch(/AED I/);
    expect(participacoes).toHaveLength(0);
  });

  it('B. rota antiga do mobile aplica os mesmos requisitos', async () => {
    await http()
      .post('/participacoes/candidatura-padrinho')
      .set('x-user-id', 'legado@pucminas.edu.br')
      .send({
        respostas: {
          nome: 'L',
          curso: 'SI',
          periodo: 4,
          declaraPreRequisitos: true,
        },
      })
      .expect(400);
  });

  it('E. GET /formularios/padrinho traz a mesma lista dinâmica (web e mobile leem daqui)', async () => {
    const r = await http().get('/formularios/padrinho').expect(200);
    expect(r.body.requisitos).toEqual([
      { id: 'calculo-i', descricao: 'Cálculo I', obrigatorio: true },
      { id: 'aed-i', descricao: 'AED I', obrigatorio: true },
    ]);
    const ap = await http().get('/formularios/apadrinhado').expect(200);
    expect(ap.body.requisitos).toBeUndefined();
  });

  it('requisitos inválidos são recusados na configuração', async () => {
    const programas = app.get(ProgramasService);
    await expect(
      programas.atualizar(ciclo, { requisitosPadrinho: [{ descricao: ' ' }] }),
    ).rejects.toThrow(/descrição/);
    await expect(
      programas.atualizar(ciclo, {
        requisitosPadrinho: [{ descricao: 'AED I' }, { descricao: 'aed i' }],
      }),
    ).rejects.toThrow(/repetido/);
    await programas.atualizar(ciclo, { etapaAtual: 'encerramento' });
    await expect(
      programas.atualizar(ciclo, { requisitosPadrinho: [] }),
    ).rejects.toThrow(/encerrado/);
  });
});
