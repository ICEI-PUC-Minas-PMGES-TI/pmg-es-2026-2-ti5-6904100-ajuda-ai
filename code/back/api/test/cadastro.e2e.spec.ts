import { moduloMatchingMemoria } from './helpers/modulo-matching-memoria.js';
import { ParticipacoesService } from '../src/participacoes/participacoes.service.js';
import { conferirTudo } from './helpers/conferencia-academica.js';
import { FormularioEntity } from '../src/formularios/entities/formulario.entity.js';
import { FormulariosService } from '../src/formularios/formularios.service.js';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import request from 'supertest';
import { JwtService } from '@nestjs/jwt';
import { AuthModule } from '../src/auth/auth.module.js';
import { CadastroModule } from '../src/cadastro/cadastro.module.js';
import { CadastroService } from '../src/cadastro/cadastro.service.js';
import { ParticipacaoEntity } from '../src/participacoes/entities/participacao.entity.js';
import { ParticipacoesModule } from '../src/participacoes/participacoes.module.js';
import { ProgramaEntity } from '../src/programas/entities/programa.entity.js';
import { UsuarioEntity } from '../src/usuarios/entities/usuario.entity.js';
import {
  repositorioEmMemoria,
  conectarRepositorios,
} from './helpers/repositorio-memoria.js';

/** Cadastro pela API: validação, regra do 1º período e acesso por status. */
describe('Cadastro (e2e)', () => {
  let app: INestApplication;
  let usuarios: UsuarioEntity[];
  let participacoes: ParticipacaoEntity[];
  let formularios: FormularioEntity[];

  const respostasApadrinhado = {
    areas: ['Projetos'],
    disponibilidade: ['Noite'],
    genero: 'Prefiro não informar',
    bolsistaProuni: false,
    deOutraCidade: false,
    expectativa: 'Quero apoio na adaptação.',
    declaraPrimeiroPeriodo: true,
  };

  const base = {
    nome: 'Rafaela Souza',
    email: 'rafaela.souza@pucminas.edu.br',
    curso: 'Engenharia de Software',
    periodo: 4,
    turno: 'Noite',
    interesses: ['Tecnologia'],
    tipoParticipacao: 'padrinho',
    respostas: {
      areas: ['Projetos'],
      disponibilidade: ['Noite'],
      genero: 'Prefiro não informar',
      bolsistaProuni: false,
      deOutraCidade: false,
      motivacao: 'Quero ajudar calouros.',
    },
  };

  const baseApadrinhado = {
    ...base,
    periodo: 1,
    tipoParticipacao: 'apadrinhado' as const,
    respostas: respostasApadrinhado,
  };

  beforeEach(async () => {
    usuarios = [];
    participacoes = [];
    formularios = [];
    const repos = conectarRepositorios({
      UsuarioEntity: repositorioEmMemoria<UsuarioEntity>(usuarios),
      ParticipacaoEntity:
        repositorioEmMemoria<ParticipacaoEntity>(participacoes),
      ProgramaEntity: repositorioEmMemoria<ProgramaEntity>(),
      FormularioEntity: repositorioEmMemoria<FormularioEntity>(formularios),
    });
    const matching = moduloMatchingMemoria(repos);
    const modulo = await Test.createTestingModule({
      imports: [matching.modulo, AuthModule, ParticipacoesModule, CadastroModule],
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
  });

  afterEach(async () => {
    await app?.close();
  });

  const http = () => request(app.getHttpServer());

  const postCadastro = <T extends { email: string; nome?: string }>(
    corpo: T,
  ) => {
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

  const tokenAcesso = (email: string) =>
    app.get(JwtService).sign({
      sub: email,
      email,
      perfil: 'apadrinhado',
      escopo: 'acesso',
    });

  it('cria o cadastro PENDENTE com a candidatura do ciclo e devolve sessão', async () => {
    const resposta = await postCadastro(base).expect(201);

    expect(resposta.body.accessToken).toEqual(expect.any(String));
    expect(resposta.body.usuario).toMatchObject({
      email: 'rafaela.souza@pucminas.edu.br',
      tipoParticipacao: 'nenhuma',
      statusCadastro: 'aprovado',
      periodo: 4,
    });
    expect(resposta.body.participacao).toMatchObject({
      papel: 'candidato',
      status: 'pendente',
    });
    expect(resposta.body.participacao.respostas).toMatchObject({
      nome: 'Rafaela Souza',
      curso: 'Engenharia de Software',
      periodo: 4,
      motivacao: 'Quero ajudar calouros.',
    });
    expect(usuarios.filter((u) => u.email === base.email)).toHaveLength(1);

    const meu = await http()
      .get('/cadastro/me')
      .set('Authorization', `Bearer ${resposta.body.accessToken}`)
      .expect(200);
    expect(meu.body.usuario.statusCadastro).toBe('aprovado');
  });

  it('valida e registra a versão do formulário publicado do apadrinhado', async () => {
    const formularios = app.get(getRepositoryToken(FormularioEntity));
    const programa = ParticipacoesService.programaAtual();
    await formularios.save(
      formularios.create({
        programa,
        tipo: 'apadrinhado',
        publicado: true,
        versao: 2,
        encerradoEm: null,
        perguntas: [
          {
            id: 'expectativa',
            enunciado: 'O que espera do programa?',
            tipo: 'texto_curto',
            opcoes: [],
            obrigatoria: true,
          },
        ],
      }),
    );

    const resposta = await postCadastro({
      ...baseApadrinhado,
      respostas: {
        ...baseApadrinhado.respostas,
        extras: { expectativa: 'Apoio nos estudos.' },
      },
    }).expect(201);

    expect(
      resposta.body.participacao.respostas._servidor.formulario,
    ).toMatchObject({
      programa,
      tipo: 'apadrinhado',
      versao: 2,
    });
  });

  it('rejeita PADRINHO no 1º período (regra do backend)', async () => {
    const resposta = await postCadastro({ ...base, periodo: 1 }).expect(400);

    expect(resposta.body.message).toMatch(
      /1º período não podem se cadastrar como padrinho/,
    );
    expect(usuarios.find((u) => u.email === base.email)).toBeUndefined();
    expect(participacoes).toHaveLength(0);
  });

  it('aceita APADRINHADO no 1º período, pendente de aprovação', async () => {
    const resposta = await postCadastro({
      ...baseApadrinhado,
    }).expect(201);

    expect(resposta.body.usuario.statusCadastro).toBe('aprovado');
    expect(resposta.body.participacao).toMatchObject({
      papel: 'apadrinhado',
      status: 'pendente',
    });
  });

  it('rejeita APADRINHADO a partir do 2º período (regra do backend)', async () => {
    for (const periodo of [2, 5, 12]) {
      const resposta = await postCadastro({
        ...base,
        periodo,
        tipoParticipacao: 'apadrinhado',
      }).expect(400);
      expect(resposta.body.message).toMatch(
        /A partir do 2º período não é possível se cadastrar como apadrinhado/,
      );
    }
    expect(usuarios.find((u) => u.email === base.email)).toBeUndefined();
    expect(participacoes).toHaveLength(0);
  });

  it('aceita PADRINHO a partir do 2º período', async () => {
    const resposta = await postCadastro({ ...base, periodo: 2 }).expect(201);
    expect(resposta.body.usuario).toMatchObject({
      tipoParticipacao: 'nenhuma',
      statusCadastro: 'aprovado',
    });
  });

  it('rota antiga do mobile: 2º+ período como apadrinhado → 400', async () => {
    const resposta = await http()
      .post('/participacoes/cadastro-apadrinhado')
      .set('Authorization', `Bearer ${tokenAcesso('veterano@pucminas.edu.br')}`)
      .set('x-user-id', 'veterano@pucminas.edu.br')
      .send({ respostas: { nome: 'Veterano', curso: 'SI', periodo: 3 } })
      .expect(400);
    expect(resposta.body.message).toMatch(/2º período/);
    expect(participacoes).toHaveLength(0);
  });

  it('rota antiga com token: x-user-id falso não troca a identidade', async () => {
    const { body } = await postCadastro({
      ...baseApadrinhado,
    }).expect(201);
    const resposta = await http()
      .post('/participacoes/cadastro-apadrinhado')
      .set('Authorization', `Bearer ${body.accessToken}`)
      .set('x-user-id', 'vitima@pucminas.edu.br')
      .send({
        usuarioId: 'vitima@pucminas.edu.br',
        respostas: {
          nome: 'Rafaela',
          curso: 'SI',
          periodo: 1,
          expectativa: 'nova',
        },
      })
      .expect(409);
    expect(participacoes[0].usuarioId).toBe(base.email);
    expect(resposta.body.message).toMatch(/Já existe/);
    expect(
      usuarios.find((u) => u.email === 'vitima@pucminas.edu.br'),
    ).toBeUndefined();
  });

  it('a regra do 1º período vale também na rota antiga (app mobile)', async () => {
    const resposta = await http()
      .post('/participacoes/candidatura-padrinho')
      .set('Authorization', `Bearer ${tokenAcesso('calouro@pucminas.edu.br')}`)
      .set('x-user-id', 'calouro@pucminas.edu.br')
      .send({ respostas: { nome: 'Calouro', curso: 'SI', periodo: 1 } })
      .expect(400);

    expect(resposta.body.message).toMatch(/1º período/);
    expect(participacoes).toHaveLength(0);
  });

  it('valida dados obrigatórios e modalidade', async () => {
    await postCadastro({ ...base, tipoParticipacao: 'coordenador' }).expect(
      400,
    );
    await postCadastro({ ...base, nome: '' }).expect(400);
    await postCadastro({ ...base, periodo: 0 }).expect(400);
    await postCadastro({ ...base, email: 'rafa@gmail.com' }).expect(400);
    await postCadastro({ ...base, email: 'renata@pucminas.edu.br' }).expect(
      400,
    );
  });

  it('não troca de modalidade num cadastro já existente', async () => {
    await postCadastro({
      ...baseApadrinhado,
    }).expect(201);
    // já no 2º período, tenta virar padrinho com o mesmo e-mail
    const resposta = await postCadastro({
      ...base,
      periodo: 2,
      tipoParticipacao: 'padrinho',
    }).expect(409);

    expect(resposta.body.message).toMatch(/Já existe/);
  });

  it('aprovação acadêmica não libera recursos de participação ativa', async () => {
    const { body } = await postCadastro(base).expect(201);
    const token = `Bearer ${body.accessToken}`;
    const cadastro = app.get(CadastroService);

    await http().get('/me/vinculos').set('Authorization', token).expect(403);

    await conferirTudo(app.get(ParticipacoesService), body.participacao.id);
    await cadastro.aprovar(body.usuario.id, 'renata@pucminas.edu.br');
    await http().get('/me/vinculos').set('Authorization', token).expect(403);
    expect(participacoes[0]).toMatchObject({
      papel: 'candidato',
      status: 'aprovado',
    });
  });

  it('rejeitado não ganha acesso e não consegue reenviar', async () => {
    const { body } = await postCadastro({
      ...baseApadrinhado,
    }).expect(201);
    const cadastro = app.get(CadastroService);
    await cadastro.rejeitar(
      body.usuario.id,
      'Faltam dados.',
      'renata@pucminas.edu.br',
    );

    const vinculos = await http()
      .get('/me/vinculos')
      .set('Authorization', `Bearer ${body.accessToken}`)
      .expect(403);
    expect(vinculos.body.message).toMatch(/vínculo confirmado/);

    const reenvio = await postCadastro({
      ...baseApadrinhado,
    }).expect(409);
    expect(reenvio.body.message).toMatch(/Já existe/);
  });

  it('situação só traz cadastro e esconde vínculos de quem não é aprovado', async () => {
    const { body } = await postCadastro({
      ...baseApadrinhado,
    }).expect(201);

    const situacao = await http()
      .get('/participacoes/situacao')
      .set('Authorization', `Bearer ${body.accessToken}`)
      .expect(200);

    expect(situacao.body.usuarioId).toBe('rafaela.souza@pucminas.edu.br');
    expect(situacao.body.situacao).toBe('apadrinhado_pendente');
    expect(situacao.body.cadastro).toMatchObject({
      status: 'pendente',
      tipoParticipacao: 'apadrinhado',
    });
    expect(situacao.body.padrinho).toBeNull();
  });

  it('aprovação de candidatura preserva conta e registra decisão por ciclo', async () => {
    const { body } = await postCadastro(base).expect(201);
    const cadastro = app.get(CadastroService);
    const participacao = participacoes.find(
      (p) => p.id === body.participacao.id,
    )!;

    // mesma sequência que CoordenacaoService.aprovarCandidatura executa
    await conferirTudo(app.get(ParticipacoesService), participacao.id);
    await app
      .get(ParticipacoesService)
      .aprovarCandidatura(participacao.id, 'renata@pucminas.edu.br');
    await cadastro.refletirDecisaoDaCandidatura(
      participacao,
      'aprovado',
      'renata@pucminas.edu.br',
    );

    const usuario = usuarios.find((u) => u.email === base.email)!;
    expect(usuario.statusCadastro).toBe('aprovado');
    expect(usuario.analisadoPor).toBeNull();
    expect(participacao.respostas?._servidor?.decisao?.por).toBe(
      'renata@pucminas.edu.br',
    );
  });

  it('demo: alunos semeados com status coerente', () => {
    const status = Object.fromEntries(
      usuarios.map((u) => [u.email, u.statusCadastro]),
    );
    expect(status['camila@pucminas.edu.br']).toBe('aprovado');
    expect(status['ana.beatriz@pucminas.edu.br']).toBe('pendente');
    expect(status['julia.fernandes@pucminas.edu.br']).toBe('rejeitado');
    expect(status['renata@pucminas.edu.br']).toBeUndefined();
  });

  it('cadastro sem token ou com e-mail diferente do token é recusado', async () => {
    await http().post('/cadastro').send(base).expect(401);

    const token = app.get(JwtService).sign({
      sub: 'subject-microsoft',
      email: 'gabriel@pucminas.edu.br',
      nome: 'Gabriel',
      escopo: 'onboarding',
    });
    const resposta = await http()
      .post('/cadastro')
      .set('Authorization', `Bearer ${token}`)
      .send({
        ...baseApadrinhado,
        nome: 'Gabriel',
        email: 'outra.pessoa@pucminas.edu.br',
      })
      .expect(400);

    expect(resposta.body.message).toMatch(/conta Microsoft/);
    expect(
      usuarios.find((u) => u.email === 'outra.pessoa@pucminas.edu.br'),
    ).toBeUndefined();
    expect(
      usuarios.find((u) => u.email === 'gabriel@pucminas.edu.br'),
    ).toBeUndefined();
  });

  it('token inválido é recusado nas rotas do aluno', async () => {
    await http()
      .get('/participacoes/situacao')
      .set('Authorization', 'Bearer token-falso')
      .expect(401);
  });

  describe('formulário do apadrinhado: versão e encerramento', () => {
    const pergunta = {
      id: 'dificuldade',
      enunciado: 'Qual sua maior dificuldade?',
      tipo: 'texto_curto',
      opcoes: [],
      obrigatoria: true,
    };
    const apadrinhado = (email: string, extras?: Record<string, unknown>) =>
      postCadastro({
        ...baseApadrinhado,
        email,
        respostas: extras
          ? { ...respostasApadrinhado, extras }
          : respostasApadrinhado,
      });
    const ciclo = () => formularios[0].programa;
    const publicar = (perguntas: unknown[]) =>
      app.get(FormulariosService).salvar('apadrinhado', {
        programa: ciclo(),
        publicado: true,
        perguntas,
      });
    const fotoDoEnvio = (indice: number) =>
      participacoes[indice].respostas?._servidor?.formulario;

    it('sem formulário publicado o apadrinhado se inscreve sem respostas adicionais', async () => {
      await apadrinhado('a1@pucminas.edu.br').expect(201);
      expect(fotoDoEnvio(0)).toBeUndefined();
    });

    it('sem formulário publicado recusa respostas adicionais', async () => {
      await apadrinhado('a1@pucminas.edu.br', { dificuldade: 'x' }).expect(400);
      expect(participacoes).toHaveLength(0);
    });

    it('formulário publicado: valida o obrigatório e grava a versão respondida', async () => {
      await publicar([pergunta]);
      await apadrinhado('a1@pucminas.edu.br').expect(400);
      await apadrinhado('a1@pucminas.edu.br', {
        dificuldade: 'Cálculo',
      }).expect(201);
      expect(participacoes[0].respostas?.extras).toEqual({
        dificuldade: 'Cálculo',
      });
      expect(fotoDoEnvio(0)).toMatchObject({
        tipo: 'apadrinhado',
        versao: 1,
        programa: ciclo(),
        perguntas: [expect.objectContaining({ id: 'dificuldade' })],
      });
    });

    it('envios antigos mantêm a versão e as perguntas respondidas quando o formulário muda', async () => {
      await publicar([pergunta]);
      await apadrinhado('a1@pucminas.edu.br', {
        dificuldade: 'Cálculo',
      }).expect(201);
      await publicar([{ ...pergunta, enunciado: 'Qual seu maior desafio?' }]);
      await apadrinhado('a2@pucminas.edu.br', { dificuldade: 'Física' }).expect(
        201,
      );
      expect(fotoDoEnvio(0)).toMatchObject({
        versao: 1,
        perguntas: [
          expect.objectContaining({ enunciado: 'Qual sua maior dificuldade?' }),
        ],
      });
      expect(fotoDoEnvio(1)).toMatchObject({
        versao: 2,
        perguntas: [
          expect.objectContaining({ enunciado: 'Qual seu maior desafio?' }),
        ],
      });
    });

    it('formulário encerrado recusa novas respostas e preserva as existentes', async () => {
      await publicar([pergunta]);
      await apadrinhado('a1@pucminas.edu.br', {
        dificuldade: 'Cálculo',
      }).expect(201);
      await app.get(FormulariosService).encerrar('apadrinhado', ciclo());
      const recusa = await apadrinhado('a2@pucminas.edu.br', {
        dificuldade: 'Física',
      }).expect(400);
      expect(recusa.body.message).toMatch(/encerrado/);
      expect(participacoes).toHaveLength(1);
      expect(participacoes[0].respostas?.extras).toEqual({
        dificuldade: 'Cálculo',
      });
    });

    it('formulário de padrinho encerrado recusa a candidatura', async () => {
      await app.get(FormulariosService).encerrar('padrinho', ciclo());
      const recusa = await postCadastro({ ...base, periodo: 4 }).expect(400);
      expect(recusa.body.message).toMatch(/encerrado/);
      expect(participacoes).toHaveLength(0);
    });
  });
});
