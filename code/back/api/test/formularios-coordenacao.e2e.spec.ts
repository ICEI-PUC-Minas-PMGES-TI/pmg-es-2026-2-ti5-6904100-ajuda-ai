import { INestApplication } from '@nestjs/common';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { AvisosService } from '../src/avisos/avisos.service.js';
import { CadastroService } from '../src/cadastro/cadastro.service.js';
import { CoordenacaoController } from '../src/coordenacao/coordenacao.controller.js';
import { CoordenacaoService } from '../src/coordenacao/coordenacao.service.js';
import { FormularioEntity } from '../src/formularios/entities/formulario.entity.js';
import { FormulariosService } from '../src/formularios/formularios.service.js';
import { ParticipacaoEntity } from '../src/participacoes/entities/participacao.entity.js';
import { ParticipacoesService } from '../src/participacoes/participacoes.service.js';
import { ProgramaEntity } from '../src/programas/entities/programa.entity.js';
import { ProgramasService } from '../src/programas/programas.service.js';
import type { UsuariosService } from '../src/usuarios/usuarios.service.js';
import {
  conectarRepositorios,
  repositorioEmMemoria,
} from './helpers/repositorio-memoria.js';

const CICLO = ParticipacoesService.programaAtual();
const [ANO_CICLO, SEMESTRE_CICLO] = CICLO.split('/').map(Number);
const OUTRO =
  SEMESTRE_CICLO === 1
    ? `${ANO_CICLO}/2`
    : `${ANO_CICLO + 1}/1`;

/** Publicação, versões, encerramento, duplicação e respostas (rotas da coordenação). */
describe('formulários da coordenação (e2e)', () => {
  let app: INestApplication;
  let programas: ProgramaEntity[];
  let participacoes: ParticipacaoEntity[];
  let formularios: FormularioEntity[];

  const pergunta = {
    id: 'dificuldade',
    enunciado: 'Qual sua maior dificuldade?',
    tipo: 'texto_curto',
    opcoes: [],
    obrigatoria: true,
  };

  beforeEach(async () => {
    programas = [CICLO, OUTRO].map(
      (codigo, i) =>
        ({
          id: i + 1,
          codigo,
          titulo: `Programa ${codigo}`,
          etapaAtual: 'inscricoes',
          formularioPublicado: false,
        }) as ProgramaEntity,
    );
    participacoes = [];
    formularios = [];
    const repos = conectarRepositorios({
      ProgramaEntity: repositorioEmMemoria(programas),
      ParticipacaoEntity: repositorioEmMemoria(participacoes),
      FormularioEntity: repositorioEmMemoria(formularios),
    });
    const programasService = new ProgramasService(repos.ProgramaEntity);
    const coordenacao = new CoordenacaoService(
      programasService,
      new ParticipacoesService(repos.ParticipacaoEntity, repos.ProgramaEntity),
      new FormulariosService(repos.FormularioEntity, programasService),
      {} as AvisosService,
      {} as CadastroService,
      {} as UsuariosService,
      repos.ParticipacaoEntity,
    );
    const modulo = await Test.createTestingModule({
      imports: [JwtModule.register({ secret: 'segredo-apenas-testes' })],
      controllers: [CoordenacaoController],
      providers: [
        // Sem `onModuleInit`: nada de seed de demonstração nestes testes.
        {
          provide: CoordenacaoService,
          useValue: {
            obterFormulario: coordenacao.obterFormulario.bind(coordenacao),
            listarFormularios: coordenacao.listarFormularios.bind(coordenacao),
            salvarFormulario: coordenacao.salvarFormulario.bind(coordenacao),
            excluirFormulario: coordenacao.excluirFormulario.bind(coordenacao),
            encerrarFormulario:
              coordenacao.encerrarFormulario.bind(coordenacao),
            duplicarFormulario:
              coordenacao.duplicarFormulario.bind(coordenacao),
            respostasFormulario:
              coordenacao.respostasFormulario.bind(coordenacao),
            respostasPorPergunta:
              coordenacao.respostasPorPergunta.bind(coordenacao),
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
    app.get(JwtService).sign({
      email: 'renata@pucminas.edu.br',
      sub: 'renata',
      perfil,
      escopo: 'acesso',
    });
  const http = (perfil?: string) => ({
    get: (url: string) =>
      request(app.getHttpServer())
        .get(url)
        .set('Authorization', `Bearer ${token(perfil)}`),
    post: (url: string) =>
      request(app.getHttpServer())
        .post(url)
        .set('Authorization', `Bearer ${token(perfil)}`),
    put: (url: string) =>
      request(app.getHttpServer())
        .put(url)
        .set('Authorization', `Bearer ${token(perfil)}`),
    delete: (url: string) =>
      request(app.getHttpServer())
        .delete(url)
        .set('Authorization', `Bearer ${token(perfil)}`),
  });
  const publicar = (tipo = 'apadrinhado', perguntas = [pergunta]) =>
    http()
      .put(`/coordenacao/formularios/${tipo}`)
      .send({ programa: CICLO, publicado: true, perguntas });

  function envio(
    id: number,
    papel: 'apadrinhado' | 'candidato' | 'padrinho',
    versao: number,
    resposta: string,
  ) {
    participacoes.push({
      id,
      usuarioId: `aluno${id}@pucminas.edu.br`,
      programa: CICLO,
      papel,
      status: 'pendente',
      criadoEm: new Date('2099-01-01'),
      respostas: {
        nome: `Aluno ${id}`,
        extras: { dificuldade: resposta },
        _servidor: {
          formulario: {
            id: 1,
            programa: CICLO,
            versao,
            perguntas: [pergunta],
            atualizadoEm: null,
          },
        },
      },
    } as unknown as ParticipacaoEntity);
  }

  it('exige coordenação em todas as rotas novas', async () => {
    const rotas = [
      ['get', '/coordenacao/formularios'],
      ['post', '/coordenacao/formularios/apadrinhado/encerrar'],
      ['post', '/coordenacao/formularios/apadrinhado/duplicar'],
      ['get', '/coordenacao/formularios/apadrinhado/respostas'],
      ['get', '/coordenacao/formularios/apadrinhado/respostas/por-pergunta'],
      ['delete', '/coordenacao/formularios/apadrinhado'],
    ] as const;
    for (const [metodo, url] of rotas) {
      await request(app.getHttpServer())[metodo](url).expect(401);
      await http('nenhuma')[metodo](url).expect(403);
    }
  });

  it('publica com versão e expõe o status na listagem e no selo do programa', async () => {
    const r = await publicar().expect(200);
    expect(r.body).toMatchObject({ status: 'publicado', versao: 1 });
    expect(programas[0].formularioPublicado).toBe(true);

    const lista = await http()
      .get(`/coordenacao/formularios?programa=${CICLO}`)
      .expect(200);
    expect(
      lista.body.map((f: { tipo: string; status: string }) => [
        f.tipo,
        f.status,
      ]),
    ).toEqual([
      ['apadrinhado', 'publicado'],
      ['padrinho', 'rascunho'],
    ]);
  });

  it('recusa publicar formulário inválido e não cria registro', async () => {
    await publicar('apadrinhado', [{ ...pergunta, enunciado: ' ' }]).expect(
      400,
    );
    expect(formularios).toHaveLength(0);
  });

  it('encerra, mantém os envios e tira o selo de publicado do programa', async () => {
    await publicar().expect(200);
    envio(1, 'apadrinhado', 1, 'Cálculo');
    const antes = structuredClone(participacoes);

    const r = await http()
      .post('/coordenacao/formularios/apadrinhado/encerrar')
      .send({ programa: CICLO })
      .expect(201);
    expect(r.body).toMatchObject({ status: 'encerrado', publicado: false });
    expect(programas[0].formularioPublicado).toBe(false);
    expect(participacoes).toEqual(antes);

    await http()
      .post('/coordenacao/formularios/apadrinhado/encerrar')
      .send({ programa: CICLO })
      .expect(400);
  });

  it('duplica para outro programa como rascunho e recusa duplicar de novo', async () => {
    await publicar().expect(200);
    const corpo = { programaOrigem: CICLO, programaDestino: OUTRO };
    const r = await http()
      .post('/coordenacao/formularios/apadrinhado/duplicar')
      .send(corpo)
      .expect(201);
    expect(r.body).toMatchObject({
      programa: OUTRO,
      status: 'rascunho',
      versao: 0,
      perguntas: [expect.objectContaining({ id: 'dificuldade' })],
    });
    await http()
      .post('/coordenacao/formularios/apadrinhado/duplicar')
      .send(corpo)
      .expect(409);
    await http()
      .post('/coordenacao/formularios/apadrinhado/duplicar')
      .send({ programaOrigem: CICLO })
      .expect(400);
  });

  it('consulta respostas individualmente, com aluno, programa e versão', async () => {
    envio(1, 'apadrinhado', 1, 'Cálculo');
    envio(2, 'apadrinhado', 2, 'Física');
    const r = await http()
      .get(`/coordenacao/formularios/apadrinhado/respostas?programa=${CICLO}`)
      .expect(200);
    expect(r.body).toMatchObject({
      programa: CICLO,
      tipo: 'apadrinhado',
      total: 2,
    });
    expect(r.body.envios).toEqual([
      expect.objectContaining({
        usuarioId: 'aluno1@pucminas.edu.br',
        versao: 1,
        respostas: [expect.objectContaining({ resposta: 'Cálculo' })],
      }),
      expect.objectContaining({
        usuarioId: 'aluno2@pucminas.edu.br',
        versao: 2,
      }),
    ]);
  });

  it('consulta respostas por pergunta; padrinho inclui candidatos e padrinhos', async () => {
    envio(1, 'candidato', 1, 'Tempo');
    envio(2, 'padrinho', 1, 'Agenda');
    envio(3, 'apadrinhado', 1, 'Cálculo');
    const r = await http()
      .get(
        `/coordenacao/formularios/padrinho/respostas/por-pergunta?programa=${CICLO}`,
      )
      .expect(200);
    expect(r.body.total).toBe(2);
    expect(r.body.perguntas).toEqual([
      expect.objectContaining({
        perguntaId: 'dificuldade',
        total: 2,
        respostas: expect.arrayContaining([
          expect.objectContaining({ resposta: 'Tempo' }),
          expect.objectContaining({ resposta: 'Agenda' }),
        ]),
      }),
    ]);
  });

  it('recusa tipo de formulário inexistente', async () => {
    await http().get('/coordenacao/formularios/outro/respostas').expect(400);
  });

  it('exclui rascunho nunca publicado, mas não um publicado', async () => {
    await http()
      .put('/coordenacao/formularios/padrinho')
      .send({ programa: CICLO, perguntas: [] })
      .expect(200);
    await http()
      .delete(`/coordenacao/formularios/padrinho?programa=${CICLO}`)
      .expect(200);
    expect(formularios).toHaveLength(0);

    await publicar().expect(200);
    await http()
      .delete(`/coordenacao/formularios/apadrinhado?programa=${CICLO}`)
      .expect(400);
    expect(formularios).toHaveLength(1);
  });
});
