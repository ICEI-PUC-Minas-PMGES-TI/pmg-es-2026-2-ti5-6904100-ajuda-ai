import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { JwtModule, JwtService } from '@nestjs/jwt';
import request from 'supertest';
import { CoordenacaoController } from '../src/coordenacao/coordenacao.controller.js';
import { CoordenacaoService } from '../src/coordenacao/coordenacao.service.js';
import { CadastroService } from '../src/cadastro/cadastro.service.js';
import { ProgramasService } from '../src/programas/programas.service.js';
import { ProgramaEntity } from '../src/programas/entities/programa.entity.js';
import { ParticipacaoEntity } from '../src/participacoes/entities/participacao.entity.js';
import { FormularioEntity } from '../src/formularios/entities/formulario.entity.js';
import { AvisoEntity } from '../src/avisos/entities/aviso.entity.js';
import { FormulariosService } from '../src/formularios/formularios.service.js';
import { AvisosService } from '../src/avisos/avisos.service.js';
import {
  conectarRepositorios,
  repositorioEmMemoria,
} from './helpers/repositorio-memoria.js';

describe('exclusão segura de programas', () => {
  let app: INestApplication;
  let programas: ProgramaEntity[];
  let participacoes: ParticipacaoEntity[];
  let formularios: FormularioEntity[];
  let avisos: AvisoEntity[];
  let repos: ReturnType<typeof conectarRepositorios>;
  let service: ProgramasService;
  let query: ReturnType<typeof vi.fn>;
  const codigo = '2026/2';
  const novo = () =>
    ({
      id: 1,
      codigo,
      titulo: 'Programa 2026/2',
      etapaAtual: 'inscricoes',
    }) as ProgramaEntity;
  beforeEach(async () => {
    programas = [novo()];
    participacoes = [];
    formularios = [];
    avisos = [];
    repos = conectarRepositorios({
      ProgramaEntity: repositorioEmMemoria(programas),
      ParticipacaoEntity: repositorioEmMemoria(participacoes),
      FormularioEntity: repositorioEmMemoria(formularios),
      AvisoEntity: repositorioEmMemoria(avisos),
    });
    query = vi.fn().mockResolvedValue([]);
    Object.assign(repos.ProgramaEntity.manager, { query });
    service = new ProgramasService(repos.ProgramaEntity);
    const modulo = await Test.createTestingModule({
      imports: [JwtModule.register({ secret: 'segredo-apenas-testes' })],
      controllers: [CoordenacaoController],
      providers: [
        {
          provide: CoordenacaoService,
          useValue: {
            excluirPrograma: (c: string, confirmacao: unknown) =>
              service.excluir(c, confirmacao),
          },
        },
        { provide: CadastroService, useValue: {} },
      ],
    }).compile();
    app = modulo.createNestApplication();
    await app.init();
  });
  afterEach(async () => app.close());
  const token = (perfil = 'coordenador') =>
    app
      .get(JwtService)
      .sign({
        email: 'renata@pucminas.edu.br',
        sub: 'renata',
        perfil,
        escopo: 'acesso',
      });
  const excluir = (confirmacao: unknown = 'COORDENADOR', c = codigo) =>
    request(app.getHttpServer())
      .delete('/coordenacao/programas')
      .query({ codigo: c })
      .set('Authorization', `Bearer ${token()}`)
      .send({ confirmacao });
  it('exclui vazio, exige coordenação e mantém outros ciclos', async () => {
    programas.push({ ...novo(), id: 2, codigo: '2026/1' });
    const deps = [
      repos.ParticipacaoEntity,
      repos.FormularioEntity,
      repos.AvisoEntity,
    ].map((r) => vi.spyOn(r, 'delete'));
    await request(app.getHttpServer())
      .delete('/coordenacao/programas')
      .query({ codigo })
      .send({ confirmacao: 'COORDENADOR' })
      .expect(401);
    await request(app.getHttpServer())
      .delete('/coordenacao/programas')
      .query({ codigo })
      .set('Authorization', `Bearer ${token('nenhuma')}`)
      .send({ confirmacao: 'COORDENADOR' })
      .expect(403);
    const r = await excluir().expect(200);
    expect(r.body).toEqual({ codigo, excluido: true });
    expect(programas.map((p) => p.codigo)).toEqual(['2026/1']);
    deps.forEach((d) => expect(d).not.toHaveBeenCalled());
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('pg_constraint'),
      ['programas'],
    );
  });
  it('programa inexistente retorna 404', async () => {
    await excluir('COORDENADOR', '2027/1').expect(404);
    expect(programas).toHaveLength(1);
  });
  for (const confirmacao of [
    '',
    'coordenado',
    'coordenador',
    ' COORDENADOR',
    'COORDENADOR ',
    'SIM',
    null,
    42,
  ])
    it(`recusa confirmação ${JSON.stringify(confirmacao)}`, async () => {
      await excluir(confirmacao).expect(400);
      expect(programas).toHaveLength(1);
      expect(query).not.toHaveBeenCalled();
    });
  for (const [nome, extra] of [
    ['candidatura', { papel: 'candidato', status: 'pendente' }],
    ['participação', { papel: 'apadrinhado', status: 'pendente' }],
    [
      'grupo/vínculo',
      { papel: 'padrinho', status: 'em_andamento', grupo: 'Grupo 1' },
    ],
    [
      'histórico',
      { papel: 'apadrinhado', status: 'concluido', terminoEm: new Date() },
    ],
    [
      'decisão',
      {
        papel: 'candidato',
        status: 'nao_aprovado',
        respostas: {
          _servidor: {
            decisao: {
              resultado: 'nao_aprovado',
              justificativa: 'Requisito',
              em: '2026-01-01',
              por: 'coord',
            },
          },
        },
      },
    ],
  ] as const)
    it(`bloqueia ${nome} sem alterar histórico`, async () => {
      participacoes.push({
        id: 1,
        usuarioId: 'aluno',
        programa: codigo,
        ...extra,
      } as ParticipacaoEntity);
      const antes = structuredClone(participacoes);
      const r = await excluir().expect(409);
      expect(r.body.message).toContain('Encerre o programa');
      expect(r.body.dependencias.participacoes).toBe(1);
      expect(programas).toHaveLength(1);
      expect(participacoes).toEqual(antes);
    });
  it('informa quantidades de grupos, vínculos e decisões', async () => {
    participacoes.push({
      id: 1,
      programa: codigo,
      papel: 'padrinho',
      status: 'em_andamento',
      grupo: 'Grupo 1',
      respostas: { _servidor: { decisao: { resultado: 'aprovado' } } },
    } as ParticipacaoEntity);
    const r = await excluir().expect(409);
    expect(r.body.dependencias).toMatchObject({
      grupos: 1,
      vinculos: 1,
      decisoes: 1,
    });
  });
  it('bloqueia formulário mesmo vazio/rascunho e preserva perguntas', async () => {
    formularios.push(
      repos.FormularioEntity.create({
        id: 1,
        programa: codigo,
        tipo: 'padrinho',
        publicado: false,
        perguntas: [],
      }),
    );
    const r = await excluir().expect(409);
    expect(r.body.dependencias.formularios).toBe(1);
    expect(formularios).toHaveLength(1);
  });
  it('bloqueia comunicado do ciclo; comunicado global não bloqueia outro ciclo', async () => {
    avisos.push({ id: 1, programa: codigo, titulo: 'Aviso' } as AvisoEntity);
    const r = await excluir().expect(409);
    expect(r.body.dependencias.comunicados).toBe(1);
    avisos[0].programa = null;
    await excluir().expect(200);
    expect(avisos).toHaveLength(1);
  });
  it('FK cascade inesperada bloqueia antes de qualquer delete', async () => {
    query.mockResolvedValue([{ conname: 'fk_cascata' }]);
    const del = vi.spyOn(repos.ProgramaEntity, 'delete');
    await excluir().expect(409);
    expect(del).not.toHaveBeenCalled();
    expect(programas).toHaveLength(1);
  });
  it('concorrência formulário/exclusão não cria formulário órfão', async () => {
    const forms = new FormulariosService(repos.FormularioEntity, service);
    await Promise.allSettled([
      forms.salvar('padrinho', {
        programa: codigo,
        publicado: false,
        perguntas: [],
      }),
      service.excluir(codigo, 'COORDENADOR'),
    ]);
    expect(
      programas.length === 0
        ? formularios.length === 0
        : formularios.length === 1,
    ).toBe(true);
  });
  it('comunicado não pode ser criado para ciclo já excluído', async () => {
    await excluir().expect(200);
    const serviceAvisos = new AvisosService(repos.AvisoEntity);
    await expect(
      serviceAvisos.criar({
        titulo: 'Aviso',
        descricao: 'Texto',
        programa: codigo,
      }),
    ).rejects.toThrow('Ciclo não cadastrado');
    expect(avisos).toHaveLength(0);
  });
});
