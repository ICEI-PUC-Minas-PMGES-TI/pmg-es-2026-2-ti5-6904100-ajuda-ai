import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import request from 'supertest';
import { JwtService } from '@nestjs/jwt';
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
import {
  repositorioEmMemoria,
  conectarRepositorios,
} from './helpers/repositorio-memoria.js';

/** Regras de período × requisitos do ciclo, pela API (sem frontend). */
describe('Período e requisitos de padrinho (e2e)', () => {
  let app: INestApplication;
  let participacoes: ParticipacaoEntity[];
  const ciclo = ParticipacoesService.programaAtual();

  beforeEach(async () => {
    participacoes = [];
    const repos = conectarRepositorios({
      UsuarioEntity: repositorioEmMemoria<UsuarioEntity>([]),
      ParticipacaoEntity:
        repositorioEmMemoria<ParticipacaoEntity>(participacoes),
      ProgramaEntity: repositorioEmMemoria<ProgramaEntity>(),
      FormularioEntity: repositorioEmMemoria<FormularioEntity>(),
    });
    const modulo = await Test.createTestingModule({
      imports: [
        AuthModule,
        ParticipacoesModule,
        CadastroModule,
        FormulariosModule,
      ],
    })
      .overrideProvider(getRepositoryToken(UsuarioEntity))
      .useValue(repos.UsuarioEntity)
      .overrideProvider(getRepositoryToken(ParticipacaoEntity))
      .useValue(repos.ParticipacaoEntity)
      .overrideProvider(getRepositoryToken(ProgramaEntity))
      .useValue(repos.ProgramaEntity)
      .overrideProvider(getRepositoryToken(FormularioEntity))
      .useValue(repos.FormularioEntity)
      .compile();
    app = modulo.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }),
    );
    await app.init();
    const programas = await repos.ProgramaEntity.find();
    for (const programa of programas) {
      Object.assign(programa, {
        etapaAtual: 'inscricoes',
        inscricoesAbertas: true,
        inscricoesInicio: '2000-01-01',
        inscricoesFim: '2099-12-31',
      });
      await repos.ProgramaEntity.save(programa);
      await repos.FormularioEntity.save(
        repos.FormularioEntity.create({
          programa: programa.codigo,
          tipo: 'padrinho',
          publicado: true,
          perguntas: [],
        }),
      );
    }
    // ciclo de teste com requisitos configurados pela coordenação
    await app.get(ProgramasService).atualizar(ciclo, {
      requisitosPadrinho: [{ descricao: 'Cálculo I' }, { descricao: 'AED I' }],
    });
  });

  afterEach(async () => {
    await app?.close();
  });

  const http = () => request(app.getHttpServer());
  const postCadastro = (corpo: { email: string; nome?: string }) => {
    const token = app.get(JwtService).sign({
      sub: corpo.email,
      email: corpo.email,
      nome: corpo.nome ?? 'Aluno',
      escopo: 'onboarding',
    });
    return http()
      .post('/cadastro')
      .set('Authorization', `Bearer ${token}`)
      .send(corpo);
  };
  let n = 0;
  const corpo = (tipo: string, periodo: number, requisitos?: unknown) => ({
    nome: 'Aluno',
    email: `aluno${++n}@pucminas.edu.br`,
    curso: 'SI',
    periodo,
    tipoParticipacao: tipo,
    respostas: {
      motivacao: 'Quero apoiar novos alunos.',
      expectativa: 'Espero apoio nos estudos.',
      areas: ['Projetos'],
      disponibilidade: ['Noite'],
      genero: 'Prefiro não informar',
      bolsistaProuni: false,
      deOutraCidade: false,
      ...(tipo === 'apadrinhado'
        ? {
            expectativa: 'Quero apoio na adaptação.',
            declaraPrimeiroPeriodo: true,
          }
        : {}),
      ...(requisitos ? { requisitos } : {}),
    },
  });
  const todos = [
    { id: 'calculo-i', cumpre: true },
    { id: 'aed-i', cumpre: true },
  ];

  it('1. 1º + APADRINHADO → permitido', async () => {
    await postCadastro(corpo('apadrinhado', 1)).expect(201);
  });

  it('2. 1º + PADRINHO → 400 (mesmo declarando os requisitos)', async () => {
    const r = await postCadastro(corpo('padrinho', 1, todos)).expect(400);
    expect(r.body.message).toMatch(/1º período/);
  });

  it('3/5. 2º e 3º+ + APADRINHADO → 400', async () => {
    for (const periodo of [2, 3, 8]) {
      await postCadastro(corpo('apadrinhado', periodo)).expect(400);
    }
  });

  it('4/6. 2º e 3º+ + PADRINHO → entram na validação dos requisitos', async () => {
    for (const periodo of [2, 3, 8]) {
      const sem = await postCadastro(corpo('padrinho', periodo)).expect(400);
      expect(sem.body.message).toMatch(/é preciso cumprir: Cálculo I; AED I/);

      const com = await postCadastro(corpo('padrinho', periodo, todos)).expect(
        201,
      );
      expect(com.body.usuario.statusCadastro).toBe('aprovado');
      expect(com.body.participacao).toMatchObject({
        papel: 'candidato',
        status: 'pendente',
      });
    }
  });

  it('B. declara que NÃO cumpre um requisito → 400', async () => {
    const r = await postCadastro(
      corpo('padrinho', 3, [
        { id: 'calculo-i', cumpre: false },
        { id: 'aed-i', cumpre: true },
      ]),
    ).expect(400);
    expect(r.body.message).toMatch(/Cálculo I/);
    expect(r.body.message).not.toMatch(/AED I/);
    expect(participacoes).toHaveLength(0);
  });

  it('B. rota antiga do mobile aplica os mesmos requisitos', async () => {
    const token = app.get(JwtService).sign({
      sub: 'legado@pucminas.edu.br',
      email: 'legado@pucminas.edu.br',
      perfil: 'padrinho',
      escopo: 'acesso',
    });
    await http()
      .post('/participacoes/candidatura-padrinho')
      .set('Authorization', `Bearer ${token}`)
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
