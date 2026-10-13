import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import request from 'supertest';
import { AuthModule } from '../src/auth/auth.module.js';
import { CadastroModule } from '../src/cadastro/cadastro.module.js';
import { CadastroService } from '../src/cadastro/cadastro.service.js';
import { ParticipacaoEntity } from '../src/participacoes/entities/participacao.entity.js';
import { ParticipacoesModule } from '../src/participacoes/participacoes.module.js';
import { ProgramaEntity } from '../src/programas/entities/programa.entity.js';
import { UsuarioEntity } from '../src/usuarios/entities/usuario.entity.js';
import { repositorioEmMemoria } from './helpers/repositorio-memoria.js';

/** Cadastro pela API: validação, regra do 1º período e acesso por status. */
describe('Cadastro (e2e)', () => {
  let app: INestApplication;
  let usuarios: UsuarioEntity[];
  let participacoes: ParticipacaoEntity[];

  const base = {
    nome: 'Rafaela Souza',
    email: 'rafaela.souza@pucminas.edu.br',
    curso: 'Engenharia de Software',
    periodo: 4,
    turno: 'Noite',
    interesses: ['Tecnologia'],
    tipoParticipacao: 'padrinho',
    respostas: { motivacao: 'Quero ajudar calouros.', areas: ['Projetos'] },
  };

  beforeEach(async () => {
    usuarios = [];
    participacoes = [];
    const modulo = await Test.createTestingModule({
      imports: [AuthModule, ParticipacoesModule, CadastroModule],
    })
      .overrideProvider(getRepositoryToken(UsuarioEntity))
      .useValue(repositorioEmMemoria(usuarios))
      .overrideProvider(getRepositoryToken(ParticipacaoEntity))
      .useValue(repositorioEmMemoria(participacoes))
      .overrideProvider(getRepositoryToken(ProgramaEntity))
      .useValue(repositorioEmMemoria<ProgramaEntity>())
      .compile();

    app = modulo.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }),
    );
    await app.init();
  });

  afterEach(async () => {
    await app?.close();
  });

  const http = () => request(app.getHttpServer());

  it('cria o cadastro PENDENTE com a candidatura do ciclo e devolve sessão', async () => {
    const resposta = await http().post('/cadastro').send(base).expect(201);

    expect(resposta.body.accessToken).toEqual(expect.any(String));
    expect(resposta.body.usuario).toMatchObject({
      email: 'rafaela.souza@pucminas.edu.br',
      tipoParticipacao: 'padrinho',
      statusCadastro: 'pendente',
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
    expect(meu.body.usuario.statusCadastro).toBe('pendente');
  });

  it('rejeita PADRINHO no 1º período (regra do backend)', async () => {
    const resposta = await http()
      .post('/cadastro')
      .send({ ...base, periodo: 1 })
      .expect(400);

    expect(resposta.body.message).toMatch(
      /1º período não podem se cadastrar como padrinho/,
    );
    expect(usuarios.find((u) => u.email === base.email)).toBeUndefined();
    expect(participacoes).toHaveLength(0);
  });

  it('aceita APADRINHADO no 1º período, pendente de aprovação', async () => {
    const resposta = await http()
      .post('/cadastro')
      .send({ ...base, periodo: 1, tipoParticipacao: 'apadrinhado' })
      .expect(201);

    expect(resposta.body.usuario.statusCadastro).toBe('pendente');
    expect(resposta.body.participacao).toMatchObject({
      papel: 'apadrinhado',
      status: 'pendente',
    });
  });

  it('rejeita APADRINHADO a partir do 2º período (regra do backend)', async () => {
    for (const periodo of [2, 5, 12]) {
      const resposta = await http()
        .post('/cadastro')
        .send({ ...base, periodo, tipoParticipacao: 'apadrinhado' })
        .expect(400);
      expect(resposta.body.message).toMatch(
        /A partir do 2º período não é possível se cadastrar como apadrinhado/,
      );
    }
    expect(usuarios.find((u) => u.email === base.email)).toBeUndefined();
    expect(participacoes).toHaveLength(0);
  });

  it('aceita PADRINHO a partir do 2º período', async () => {
    const resposta = await http()
      .post('/cadastro')
      .send({ ...base, periodo: 2 })
      .expect(201);
    expect(resposta.body.usuario).toMatchObject({
      tipoParticipacao: 'padrinho',
      statusCadastro: 'pendente',
    });
  });

  it('rota antiga do mobile: 2º+ período como apadrinhado → 400', async () => {
    const resposta = await http()
      .post('/participacoes/cadastro-apadrinhado')
      .set('x-user-id', 'veterano@pucminas.edu.br')
      .send({ respostas: { nome: 'Veterano', curso: 'SI', periodo: 3 } })
      .expect(400);
    expect(resposta.body.message).toMatch(/2º período/);
    expect(participacoes).toHaveLength(0);
  });

  it('rota antiga com token: x-user-id falso não troca a identidade', async () => {
    const { body } = await http()
      .post('/cadastro')
      .send({ ...base, periodo: 1, tipoParticipacao: 'apadrinhado' })
      .expect(201);
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
      .expect(201);
    expect(resposta.body.usuarioId).toBe(base.email);
    expect(
      usuarios.find((u) => u.email === 'vitima@pucminas.edu.br'),
    ).toBeUndefined();
  });

  it('a regra do 1º período vale também na rota antiga (app mobile)', async () => {
    const resposta = await http()
      .post('/participacoes/candidatura-padrinho')
      .set('x-user-id', 'calouro@pucminas.edu.br')
      .send({ respostas: { nome: 'Calouro', curso: 'SI', periodo: 1 } })
      .expect(400);

    expect(resposta.body.message).toMatch(/1º período/);
    expect(participacoes).toHaveLength(0);
  });

  it('valida dados obrigatórios e modalidade', async () => {
    await http()
      .post('/cadastro')
      .send({ ...base, tipoParticipacao: 'coordenador' })
      .expect(400);
    await http()
      .post('/cadastro')
      .send({ ...base, nome: '' })
      .expect(400);
    await http()
      .post('/cadastro')
      .send({ ...base, periodo: 0 })
      .expect(400);
    await http()
      .post('/cadastro')
      .send({ ...base, email: 'rafa@gmail.com' })
      .expect(400);
    await http()
      .post('/cadastro')
      .send({ ...base, email: 'renata@pucminas.edu.br' })
      .expect(400);
  });

  it('não troca de modalidade num cadastro já existente', async () => {
    await http()
      .post('/cadastro')
      .send({ ...base, periodo: 1, tipoParticipacao: 'apadrinhado' })
      .expect(201);
    // já no 2º período, tenta virar padrinho com o mesmo e-mail
    const resposta = await http()
      .post('/cadastro')
      .send({ ...base, periodo: 2, tipoParticipacao: 'padrinho' })
      .expect(409);

    expect(resposta.body.message).toMatch(/já está cadastrado/);
  });

  it('pendente e rejeitado não acessam recursos de participante; aprovado acessa', async () => {
    const { body } = await http().post('/cadastro').send(base).expect(201);
    const token = `Bearer ${body.accessToken}`;
    const cadastro = app.get(CadastroService);

    await http().get('/me/vinculos').set('Authorization', token).expect(403);

    await cadastro.aprovar(body.usuario.id, 'renata@pucminas.edu.br');
    await http().get('/me/vinculos').set('Authorization', token).expect(200);
    expect(participacoes[0]).toMatchObject({
      papel: 'padrinho',
      status: 'em_andamento',
    });
  });

  it('rejeitado não ganha acesso e não consegue reenviar', async () => {
    const { body } = await http()
      .post('/cadastro')
      .send({ ...base, periodo: 1, tipoParticipacao: 'apadrinhado' })
      .expect(201);
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
    expect(vinculos.body.message).toMatch(/não foi aprovado/);

    const reenvio = await http()
      .post('/cadastro')
      .send({ ...base, periodo: 1, tipoParticipacao: 'apadrinhado' })
      .expect(409);
    expect(reenvio.body.message).toMatch(/Faltam dados/);
  });

  it('situação só traz cadastro e esconde vínculos de quem não é aprovado', async () => {
    const { body } = await http()
      .post('/cadastro')
      .send({ ...base, periodo: 1, tipoParticipacao: 'apadrinhado' })
      .expect(201);

    const situacao = await http()
      .get('/participacoes/situacao')
      .set('Authorization', `Bearer ${body.accessToken}`)
      // com token, x-user-id é ignorado
      .set('x-user-id', 'outra.pessoa@pucminas.edu.br')
      .expect(200);

    expect(situacao.body.usuarioId).toBe('rafaela.souza@pucminas.edu.br');
    expect(situacao.body.situacao).toBe('apadrinhado_pendente');
    expect(situacao.body.cadastro).toMatchObject({
      status: 'pendente',
      tipoParticipacao: 'apadrinhado',
    });
    expect(situacao.body.padrinho).toBeNull();
  });

  it('aprovar a candidatura na tela de Candidaturas aprova o cadastro pendente', async () => {
    const { body } = await http().post('/cadastro').send(base).expect(201);
    const cadastro = app.get(CadastroService);
    const participacao = participacoes.find(
      (p) => p.id === body.participacao.id,
    )!;

    // mesma sequência que CoordenacaoService.aprovarCandidatura executa
    participacao.papel = 'padrinho';
    participacao.status = 'em_andamento';
    await cadastro.refletirDecisaoDaCandidatura(
      participacao,
      'aprovado',
      'renata@pucminas.edu.br',
    );

    const usuario = usuarios.find((u) => u.email === base.email)!;
    expect(usuario.statusCadastro).toBe('aprovado');
    expect(usuario.analisadoPor).toBe('renata@pucminas.edu.br');
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

  it('token inválido é recusado nas rotas do aluno', async () => {
    await http()
      .get('/participacoes/situacao')
      .set('Authorization', 'Bearer token-falso')
      .expect(401);
  });
});
