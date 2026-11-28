import { moduloMatchingMemoria } from './helpers/modulo-matching-memoria.js';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { JwtModule, JwtService } from '@nestjs/jwt';
import request from 'supertest';
import { vi } from 'vitest';
import { CadastroService } from '../src/cadastro/cadastro.service.js';
import { CoordenacaoController } from '../src/coordenacao/coordenacao.controller.js';
import { CoordenacaoService } from '../src/coordenacao/coordenacao.service.js';
import { ParticipacaoEntity } from '../src/participacoes/entities/participacao.entity.js';
import { ParticipacoesService } from '../src/participacoes/participacoes.service.js';
import { ProgramaEntity } from '../src/programas/entities/programa.entity.js';
import { ProgramasService } from '../src/programas/programas.service.js';
import { UsuarioEntity } from '../src/usuarios/entities/usuario.entity.js';
import { UsuariosService } from '../src/usuarios/usuarios.service.js';
import {
  conectarRepositorios,
  repositorioEmMemoria,
} from './helpers/repositorio-memoria.js';
import { conferirTudo } from './helpers/conferencia-academica.js';

const cronograma = {
  inscricoesInicio: '2027-02-01',
  inscricoesFim: '2027-02-28',
  analiseInicio: '2027-03-01',
  analiseFim: '2027-03-30',
  formacaoInicio: '2027-04-01',
  formacaoFim: '2027-04-20',
  andamentoInicio: '2027-04-21',
  andamentoFim: '2027-06-15',
  encerramentoEm: '2027-06-20',
};

describe('programas por semestre, inscrições e liberação das etapas', () => {
  let programas: ProgramaEntity[];
  let participacoes: ParticipacaoEntity[];
  let programasService: ProgramasService;
  let participacoesService: ParticipacoesService;
  let coordenacao: CoordenacaoService;
  let matching: ReturnType<typeof moduloMatchingMemoria>;

  beforeEach(() => {
    programas = [];
    participacoes = [];
    const repoProgramas = repositorioEmMemoria(programas);
    const repoParticipacoes = repositorioEmMemoria(participacoes);
    const repoUsuarios = repositorioEmMemoria<UsuarioEntity>();
    const repos = conectarRepositorios({
      ProgramaEntity: repoProgramas,
      ParticipacaoEntity: repoParticipacoes,
      UsuarioEntity: repoUsuarios,
    });
    matching = moduloMatchingMemoria(repos);
    programasService = new ProgramasService(repos.ProgramaEntity);
    participacoesService = new ParticipacoesService(
      repos.ParticipacaoEntity,
      repos.ProgramaEntity,
      matching.dados,
      matching.operacoes,
    );
    coordenacao = new CoordenacaoService(
      programasService,
      participacoesService,
      null as never,
      null as never,
      null as never,
      new UsuariosService(repoUsuarios),
      null as never,
      null as never,
      repoParticipacoes,
    );
  });

  async function cicloAberto(codigo = '2027/1') {
    const programa = await programasService.criarNovoCiclo(codigo, cronograma);
    await matching.service.salvarConfiguracao(
      {
        programa: codigo,
        versaoBase: 0,
        liberado: false,
        capacidadePorPadrinho: 3,
        capacidadePorApadrinhado: 1,
        criterios: [
          { campoCadastro: 'areas', operacao: 'intersecao', peso: 100 },
        ],
      },
      'coord@pucminas.edu.br',
    );
    return programa;
  }

  async function prepararAprovados(codigo = '2027/1') {
    await cicloAberto(codigo);
    const candidato = await participacoesService.registrarCandidaturaPadrinho({
      usuarioId: 'padrinho@pucminas.edu.br',
      programa: codigo,
    });
    await conferirTudo(participacoesService, candidato.id);
    await participacoesService.aprovarCandidatura(candidato.id);
    const apadrinhado = await participacoesService.cadastrarApadrinhado({
      usuarioId: 'calouro@pucminas.edu.br',
      programa: codigo,
    });
    await conferirTudo(participacoesService, apadrinhado.id);
    await participacoesService.aprovarCandidatura(apadrinhado.id);
    candidato.respostas = { ...candidato.respostas, areas: ['Tecnologia'] };
    apadrinhado.respostas = { ...apadrinhado.respostas, areas: ['Tecnologia'] };
    return { candidato, apadrinhado };
  }

  it('cadastra, lista, consulta e edita programa com semestre, datas e situação', async () => {
    const criado = await cicloAberto();
    expect(criado).toMatchObject({
      codigo: '2027/1',
      etapaAtual: 'inscricoes',
      inscricoesAbertas: true,
      matchingPendente: false,
      inscricoesInicio: '2027-02-01',
      inscricoesFim: '2027-02-28',
    });
    await expect(
      programasService.criarNovoCiclo('2027/1', cronograma),
    ).rejects.toThrow(/já existe/);
    const listados = await programasService.listar();
    expect(listados.map((p) => p.codigo)).toEqual(['2027/1']);
    const consultado = await coordenacao.obterPrograma('2027/1');
    expect(consultado.codigo).toBe('2027/1');
    expect(consultado.matchingLiberado).toBe(false);
    const editado = await programasService.atualizar('2027/1', {
      inscricoesFim: '2027-02-20',
      vagasApadrinhados: 40,
    });
    expect(editado.inscricoesFim).toBe('2027-02-20');
    expect(editado.vagasApadrinhados).toBe(40);
  });

  it('impede candidatura fora do período e associa a inscrição ao ciclo informado', async () => {
    await cicloAberto();
    programasService.validarInscricoes(
      programas[0],
      new Date('2027-02-10T15:00:00-03:00'),
    );
    expect(() =>
      programasService.validarInscricoes(
        programas[0],
        new Date('2027-01-31T15:00:00-03:00'),
      ),
    ).toThrow(/Inscrições indisponíveis/);
    await programasService.encerrarInscricoes('2027/1');
    expect(() => programasService.validarInscricoes(programas[0])).toThrow(
      /Inscrições indisponíveis/,
    );
    const registro = await participacoesService.registrarCandidaturaPadrinho({
      usuarioId: 'a@pucminas.edu.br',
      programa: '2027/1',
    });
    expect(registro.programa).toBe('2027/1');
    expect(() =>
      programasService.validarInscricoes(
        programas[0],
        new Date('2027-03-10T12:00:00-03:00'),
      ),
    ).toThrow(/Inscrições indisponíveis/);
  });

  it('permite analisar candidaturas com inscrições abertas', async () => {
    await cicloAberto();
    const candidato = await participacoesService.registrarCandidaturaPadrinho({
      usuarioId: 'p@pucminas.edu.br',
      programa: '2027/1',
    });
    expect(programas[0].inscricoesAbertas).toBe(true);
    await participacoesService.marcarEmAnalise(candidato.id);
    await conferirTudo(participacoesService, candidato.id);
    const aprovado = await participacoesService.aprovarCandidatura(
      candidato.id,
    );
    expect(aprovado).toMatchObject({
      papel: 'candidato',
      status: 'aprovado',
      programa: '2027/1',
    });
    expect(programas[0].etapaAtual).toBe('inscricoes');
  });

  it('encerra inscrições sem aprovar candidatos nem gerar matching', async () => {
    const { candidato, apadrinhado } = await prepararAprovados();
    const pendente = await participacoesService.registrarCandidaturaPadrinho({
      usuarioId: 'outro@pucminas.edu.br',
      programa: '2027/1',
    });
    const encerrado = await programasService.encerrarInscricoes('2027/1');
    expect(encerrado).toMatchObject({
      inscricoesAbertas: false,
      etapaAtual: 'analise',
    });
    expect(pendente).toMatchObject({ status: 'pendente', papel: 'candidato' });
    expect(candidato.papel).toBe('candidato');
    expect(apadrinhado.grupo).toBeFalsy();
    const encerradoNovamente =
      await programasService.encerrarInscricoes('2027/1');
    expect(encerradoNovamente.etapaAtual).toBe('analise');
  });

  it('recusa liberar matching e vínculos antes das pré-condições', async () => {
    const { candidato, apadrinhado } = await prepararAprovados();
    await expect(programasService.liberarMatching('2027/1')).rejects.toThrow(
      /Encerre as inscrições/,
    );
    await expect(
      participacoesService.vincular(
        apadrinhado.id,
        candidato.id,
        'coord@pucminas.edu.br',
      ),
    ).rejects.toThrow(/Ciclo indisponível/);
    await programasService.encerrarInscricoes('2027/1');
    await expect(coordenacao.obterMatching('2027/1')).rejects.toThrow(
      /não foi liberado/,
    );
    const semAprovados = await cicloAberto('2027/2');
    await programasService.encerrarInscricoes(semAprovados.codigo);
    await expect(programasService.liberarMatching('2027/2')).rejects.toThrow(
      /conjunto de aprovados/,
    );
  });

  it('não libera o matching enquanto houver solicitações sem decisão', async () => {
    const { candidato: aprovado, apadrinhado } = await prepararAprovados();
    const candidatoPendente =
      await participacoesService.registrarCandidaturaPadrinho({
        usuarioId: 'pendente@pucminas.edu.br',
        programa: '2027/1',
      });
    const apadrinhadoPendente = await participacoesService.cadastrarApadrinhado(
      {
        usuarioId: 'outro-calouro@pucminas.edu.br',
        programa: '2027/1',
      },
    );

    await conferirTudo(participacoesService, apadrinhadoPendente.id);
    await programasService.encerrarInscricoes('2027/1');
    expect(candidatoPendente.status).toBe('pendente');
    expect(apadrinhadoPendente.status).toBe('pendente');
    await expect(programasService.liberarMatching('2027/1')).rejects.toThrow(
      /Decida todas as solicitações/,
    );
    expect(apadrinhado.grupo).toBeFalsy();
    expect(aprovado.grupo).toBeFalsy();

    await participacoesService.rejeitarCandidaturaPorId(
      candidatoPendente.id,
      'Não atende aos critérios.',
    );
    await conferirTudo(participacoesService, apadrinhadoPendente.id);
    await participacoesService.aprovarCandidatura(apadrinhadoPendente.id);
    const liberado = await programasService.liberarMatching('2027/1');
    expect(liberado.etapaAtual).toBe('formacao');
    expect(apadrinhadoPendente.grupo).toBeFalsy();
    expect(aprovado.grupo).toBeFalsy();
  });

  it('libera matching explicitamente e só então permite vínculos e o conjunto elegível', async () => {
    const { candidato, apadrinhado } = await prepararAprovados();
    await programasService.encerrarInscricoes('2027/1');
    const liberado = await programasService.liberarMatching('2027/1');
    expect(liberado).toMatchObject({
      etapaAtual: 'formacao',
      inscricoesAbertas: false,
      matchingPendente: true,
    });
    const repetido = await programasService.liberarMatching('2027/1');
    expect(repetido.etapaAtual).toBe('formacao');
    const pool = await coordenacao.obterMatching('2027/1');
    expect(pool.matchingLiberado).toBe(true);
    expect(pool.padrinhos.map((p) => p.id)).toContain(candidato.id);
    const vinculo = await participacoesService.vincular(
      apadrinhado.id,
      candidato.id,
      'coord@pucminas.edu.br',
    );
    expect(vinculo.padrinho.papel).toBe('padrinho');
    expect(vinculo.apadrinhado.programa).toBe('2027/1');
  });

  it('rejeita transições inválidas, inclusive PATCH para formação', async () => {
    await cicloAberto();
    await expect(
      programasService.atualizar('2027/1', { etapaAtual: 'formacao' }),
    ).rejects.toThrow(/liberar matching/);
    await expect(
      programasService.atualizar('2027/1', { etapaAtual: 'andamento' }),
    ).rejects.toThrow(/liberação do matching/);
    await programasService.atualizar('2027/1', { etapaAtual: 'analise' });
    expect(programas[0]).toMatchObject({
      etapaAtual: 'analise',
      inscricoesAbertas: false,
    });
    await programasService.atualizar('2027/1', { etapaAtual: 'encerramento' });
    await expect(programasService.encerrarInscricoes('2027/1')).rejects.toThrow(
      /Ciclo encerrado/,
    );
    await expect(programasService.liberarMatching('2027/1')).rejects.toThrow(
      /indisponível/,
    );
    await expect(
      programasService.atualizar('2027/1', { inscricoesAbertas: true }),
    ).rejects.toThrow(/reabrir inscrições/);
  });
});

describe('coordenação: rotas de etapa e permissão', () => {
  let app: INestApplication;
  let programasService: ProgramasService;
  let participacoesService: ParticipacoesService;

  beforeEach(async () => {
    const programas: ProgramaEntity[] = [];
    const participacoes: ParticipacaoEntity[] = [];
    const repoProgramas = repositorioEmMemoria(programas);
    const repoParticipacoes = repositorioEmMemoria(participacoes);
    const repos = conectarRepositorios({
      ProgramaEntity: repoProgramas,
      ParticipacaoEntity: repoParticipacoes,
    });
    const matching = moduloMatchingMemoria(repos);
    programasService = new ProgramasService(repos.ProgramaEntity);
    participacoesService = new ParticipacoesService(
      repos.ParticipacaoEntity,
      repos.ProgramaEntity,
      matching.dados,
      matching.operacoes,
    );
    const coordenacao = new CoordenacaoService(
      programasService,
      participacoesService,
      null as never,
      null as never,
      null as never,
      new UsuariosService(repositorioEmMemoria<UsuarioEntity>()),
      null as never,
      null as never,
      repoParticipacoes,
    );
    vi.spyOn(coordenacao, 'onModuleInit').mockResolvedValue(undefined);
    const modulo = await Test.createTestingModule({
      imports: [JwtModule.register({ secret: 'segredo-apenas-testes' })],
      controllers: [CoordenacaoController],
      providers: [
        { provide: CoordenacaoService, useValue: coordenacao },
        { provide: CadastroService, useValue: {} },
      ],
    }).compile();
    app = modulo.createNestApplication();
    await app.init();
    await programasService.criarNovoCiclo('2027/1', cronograma);
  });

  afterEach(async () => app.close());

  const token = (perfil = 'coordenador') =>
    app.get(JwtService).sign({
      email: 'renata@pucminas.edu.br',
      sub: 'renata',
      perfil,
      escopo: 'acesso',
    });

  const http = () => request(app.getHttpServer());

  it('exige coordenador nas operações de etapa e matching', async () => {
    await http()
      .post('/coordenacao/programas/encerrar-inscricoes')
      .query({ codigo: '2027/1' })
      .expect(401);
    await http()
      .post('/coordenacao/programas/liberar-matching')
      .query({ codigo: '2027/1' })
      .set('Authorization', `Bearer ${token('nenhuma')}`)
      .expect(403);
    await http()
      .get('/coordenacao/matching/pool')
      .query({ programa: '2027/1' })
      .set('Authorization', `Bearer ${token()}`)
      .expect(400);
  });

  it('encerra, recusa matching e libera pela API', async () => {
    const antesDeEncerrar = await http()
      .get('/coordenacao/programas')
      .auth(token(), { type: 'bearer' })
      .expect(200);
    expect(antesDeEncerrar.body).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          codigo: '2027/1',
          podeEncerrarInscricoes: true,
          podeLiberarMatching: false,
        }),
      ]),
    );

    const candidato = await participacoesService.registrarCandidaturaPadrinho({
      usuarioId: 'p@pucminas.edu.br',
      programa: '2027/1',
    });
    await conferirTudo(participacoesService, candidato.id);
    await participacoesService.aprovarCandidatura(candidato.id);
    const encerrar = await http()
      .post('/coordenacao/programas/encerrar-inscricoes')
      .query({ codigo: '2027/1' })
      .set('Authorization', `Bearer ${token()}`)
      .expect(201);
    expect(encerrar.body).toMatchObject({
      etapaAtual: 'analise',
      inscricoesAbertas: false,
      matchingLiberado: false,
    });
    const prontoParaLiberar = await http()
      .get('/coordenacao/programas')
      .auth(token(), { type: 'bearer' })
      .expect(200);
    expect(prontoParaLiberar.body).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          codigo: '2027/1',
          podeEncerrarInscricoes: false,
          podeLiberarMatching: true,
        }),
      ]),
    );
    await http()
      .get('/coordenacao/matching/pool')
      .query({ programa: '2027/1' })
      .set('Authorization', `Bearer ${token()}`)
      .expect(400);
    const item = await http()
      .get('/coordenacao/programas/item')
      .query({ codigo: '2027/1' })
      .set('Authorization', `Bearer ${token()}`)
      .expect(200);
    expect(item.body.podeLiberarMatching).toBe(true);
    const liberar = await http()
      .post('/coordenacao/programas/liberar-matching')
      .query({ codigo: '2027/1' })
      .set('Authorization', `Bearer ${token()}`)
      .expect(201);
    expect(liberar.body).toMatchObject({
      etapaAtual: 'formacao',
      matchingLiberado: true,
    });
    const matching = await http()
      .get('/coordenacao/matching/pool')
      .query({ programa: '2027/1' })
      .set('Authorization', `Bearer ${token()}`)
      .expect(200);
    expect(matching.body.padrinhos).toHaveLength(1);
  });
});
