import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { JwtService } from '@nestjs/jwt';
import request from 'supertest';
import { AuthModule } from '../src/auth/auth.module.js';
import { CadastroService } from '../src/cadastro/cadastro.service.js';
import { ProgramasService } from '../src/programas/programas.service.js';
import { CadastroModule } from '../src/cadastro/cadastro.module.js';
import { UsuarioEntity } from '../src/usuarios/entities/usuario.entity.js';
import { ParticipacaoEntity } from '../src/participacoes/entities/participacao.entity.js';
import { ParticipacoesService } from '../src/participacoes/participacoes.service.js';
import { ProgramaEntity } from '../src/programas/entities/programa.entity.js';
import { FormularioEntity } from '../src/formularios/entities/formulario.entity.js';
import { FormulariosService } from '../src/formularios/formularios.service.js';
import { AzureBlobStorageService } from '../src/storage/azure-blob-storage.service.js';
import {
  conectarRepositorios,
  repositorioEmMemoria,
} from './helpers/repositorio-memoria.js';
import { conferirTudo } from './helpers/conferencia-academica.js';

describe('F02/F07: contratos, isolamento de ciclos e matching', () => {
  let app: INestApplication;
  let usuarios: UsuarioEntity[];
  let participacoes: ParticipacaoEntity[];
  let programas: ProgramaEntity[];
  let formularios: FormularioEntity[];
  let repos: ReturnType<typeof conectarRepositorios>;
  let service: ParticipacoesService;
  const email = 'aluno@pucminas.edu.br';
  const ciclo = ParticipacoesService.programaAtual();
  const perfil = { nome: 'Aluno', curso: 'SI', periodo: 3 };
  const pergunta = {
    id: 'apoio',
    tipo: 'dropdown',
    enunciado: 'Área de apoio',
    obrigatoria: true,
    opcoes: ['Acadêmico', 'Carreira'],
  };
  const storage = {
    substituirFotoPerfil: vi.fn().mockResolvedValue(undefined),
    existe: vi.fn().mockResolvedValue(true),
    sasLeitura: vi.fn((container: string, chave: string) => ({
      container,
      chave,
      url: `https://storage.test/${chave}?sig=temporaria`,
    })),
  };
  const token = (conta = email, escopo = 'acesso') =>
    app
      .get(JwtService)
      .sign({ sub: conta, email: conta, perfil: 'nenhuma', escopo });
  const http = () => request(app.getHttpServer());
  const enviar = (dados: Record<string, unknown> = {}) =>
    http()
      .post('/cadastro')
      .set('Authorization', `Bearer ${token()}`)
      .send({
        ...perfil,
        email,
        programa: ciclo,
        tipoParticipacao: 'padrinho',
        ...dados,
        respostas: {
          motivacao: 'Quero apoiar novos alunos.',
          areas: ['Projetos'],
          disponibilidade: ['Noite'],
          genero: 'Prefiro não informar',
          bolsistaProuni: false,
          deOutraCidade: false,
          extras: { apoio: 'Acadêmico' },
          ...(dados.respostas as object),
        },
      });
  const situacao = () =>
    http()
      .get(`/participacoes/situacao?programa=${encodeURIComponent(ciclo)}`)
      .set('Authorization', `Bearer ${token()}`);

  beforeEach(async () => {
    vi.clearAllMocks();
    usuarios = [];
    participacoes = [];
    programas = [
      repositorioEmMemoria<ProgramaEntity>().create({
        id: 1,
        codigo: ciclo,
        etapaAtual: 'inscricoes',
        inscricoesAbertas: true,
        inscricoesInicio: '2000-01-01',
        inscricoesFim: '2099-12-31',
        requisitosPadrinho: [],
      }),
    ];
    formularios = [
      {
        id: 1,
        programa: ciclo,
        tipo: 'padrinho',
        publicado: true,
        perguntas: [pergunta],
      } as FormularioEntity,
    ];
    repos = conectarRepositorios({
      UsuarioEntity: repositorioEmMemoria(usuarios),
      ParticipacaoEntity: repositorioEmMemoria(participacoes),
      ProgramaEntity: repositorioEmMemoria(programas),
      FormularioEntity: repositorioEmMemoria(formularios),
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
      .overrideProvider(getRepositoryToken(FormularioEntity))
      .useValue(repos.FormularioEntity)
      .overrideProvider(AzureBlobStorageService)
      .useValue(storage)
      .compile();
    app = modulo.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }),
    );
    await app.init();
    service = app.get(ParticipacoesService);
  });
  afterEach(async () => {
    await app?.close();
  });

  async function completar(conta = email) {
    return http()
      .put('/cadastro/perfil')
      .set('Authorization', `Bearer ${token(conta, 'onboarding')}`)
      .send(perfil)
      .expect(200);
  }

  it('consulta autenticada de ciclos expõe janela efetiva sem alterar regras', async () => {
    await http().get('/participacoes/programas').expect(401);
    const r = await http().get('/participacoes/programas').set('Authorization', `Bearer ${token()}`).expect(200);
    expect(r.body).toEqual([expect.objectContaining({codigo: ciclo, atual: true, inscricoesDisponiveis: true})]);
    programas[0].inscricoesFim = '2000-01-01';
    const fechado = await http().get('/participacoes/programas').set('Authorization', `Bearer ${token()}`).expect(200);
    expect(fechado.body[0].inscricoesDisponiveis).toBe(false);
    expect(participacoes).toHaveLength(0);
  });

  it('persiste perfil com onboarding e emite sessão normal sem participação fictícia para explorar', async () => {
    const { body } = await completar();
    expect(app.get(JwtService).verify(body.accessToken).escopo).toBe('acesso');
    expect(body.usuario).toMatchObject({
      ...perfil,
      email,
      tipoParticipacao: 'nenhuma',
    });
    expect(participacoes).toEqual([]);
    const me = await http()
      .get('/me')
      .set('Authorization', `Bearer ${body.accessToken}`)
      .expect(200);
    expect(me.body.nome).toBe('Aluno');
    expect((await situacao().expect(200)).body.situacao).toBe('nenhuma');
  });

  it('edita perfil autorizado sem reescrever candidatura histórica', async () => {
    await completar();
    await enviar().expect(201);
    const antes = structuredClone(participacoes);
    await http()
      .patch('/me')
      .set('Authorization', `Bearer ${token()}`)
      .send({ nome: 'Novo nome', curso: 'ES', periodo: 4 })
      .expect(200);
    expect(usuarios.find((u) => u.email === email)).toMatchObject({
      nome: 'Novo nome',
      curso: 'ES',
      periodo: 4,
    });
    expect(participacoes).toEqual(antes);
    expect((await situacao()).body.perfil.nome).toBe('Novo nome');
  });

  it('recusa mudança do e-mail, campos internos e identidade arbitrária', async () => {
    await completar();
    await http()
      .patch('/me')
      .set('Authorization', `Bearer ${token()}`)
      .send({ email: 'outro@pucminas.edu.br' })
      .expect(400);
    await http()
      .patch('/me')
      .set('Authorization', `Bearer ${token()}`)
      .send({ statusCadastro: 'aprovado' })
      .expect(400);
    await http()
      .get('/participacoes/situacao?usuarioId=outro@pucminas.edu.br')
      .set('Authorization', `Bearer ${token()}`)
      .expect(400);
    const resposta = await http()
      .get('/me?email=outro@pucminas.edu.br')
      .set('Authorization', `Bearer ${token()}`)
      .expect(200);
    expect(resposta.body.email).toBe(email);
  });

  it('perfil e consultas de participação exigem JWT; onboarding não lê /me', async () => {
    await http().get('/me').expect(401);
    await http().patch('/me').send(perfil).expect(401);
    await http().put('/cadastro/perfil').send(perfil).expect(401);
    await http().get('/participacoes').set('x-user-id', email).expect(401);
    await http()
      .get('/me')
      .set('Authorization', `Bearer ${token(email, 'onboarding')}`)
      .expect(401);
  });

  it.each([
    ['antes da abertura', { inscricoesInicio: '2099-01-01' }],
    ['depois do encerramento', { inscricoesFim: '2000-01-01' }],
    ['fechamento manual', { inscricoesAbertas: false }],
    ['etapa encerrada', { etapaAtual: 'encerramento' }],
  ])('recusa candidatura: %s', async (_nome, alteracao) => {
    Object.assign(programas[0], alteracao);
    await enviar().expect(400);
    expect(participacoes).toHaveLength(0);
    expect(usuarios.some((u) => u.email === email)).toBe(false);
  });

  it('recusa ciclo inexistente e contexto ambíguo', async () => {
    await enviar({ programa: '2099/1' }).expect(400);
    programas.push({ ...programas[0], id: 2, codigo: '2098/1' });
    await enviar({ programa: undefined }).expect(400);
    expect(participacoes).toHaveLength(0);
  });

  it('envio durante inscrições nasce pendente; reenvio e edição são recusados', async () => {
    const resposta = await enviar().expect(201);
    expect(resposta.body.participacao).toMatchObject({
      papel: 'candidato',
      status: 'pendente',
      programa: ciclo,
    });
    const original = structuredClone(participacoes[0].respostas);
    await enviar({ respostas: { extras: { apoio: 'Carreira' } } }).expect(409);
    expect(participacoes).toHaveLength(1);
    expect(participacoes[0].respostas).toEqual(original);
  });

  it('envios concorrentes não duplicam inscrição', async () => {
    const resultados = await Promise.all([enviar(), enviar()]);
    expect(resultados.map((r) => r.status).sort()).toEqual([201, 409]);
    expect(participacoes).toHaveLength(1);
  });

  it('primeiro período é recusado no servidor', async () => {
    await enviar({ periodo: 1 }).expect(400);
    expect(participacoes).toHaveLength(0);
  });

  it.each([
    {},
    { apoio: 'Inválido' },
    { apoio: ['Acadêmico'] },
    { desconhecida: 'x' },
  ])('recusa resposta obrigatória ausente/inválida: %j', async (extras) => {
    await enviar({ respostas: { extras } }).expect(400);
    expect(participacoes).toHaveLength(0);
  });

  it('recusa formulário não publicado', async () => {
    formularios[0].publicado = false;
    await enviar().expect(400);
  });

  it.each(['upload', 'file', 'attachment', 'tipo_inexistente'])(
    'recusa criação/edição/publicação com tipo %s',
    async (tipo) => {
      const antes = structuredClone(formularios);
      for (const publicado of [false, true]) {
        await expect(
          app.get(FormulariosService).salvar('padrinho', {
            programa: ciclo,
            publicado,
            perguntas: [{ ...pergunta, tipo }],
          }),
        ).rejects.toThrow(/Tipo de resposta inválido/);
      }
      expect(formularios).toEqual(antes);
    },
  );

  it.each(['upload', 'file', 'attachment', 'tipo_inexistente'])(
    'legado %s permanece legível à coordenação, mas não ao candidato',
    async (tipo) => {
      for (const obrigatoria of [true, false]) {
        formularios[0].perguntas = [{ ...pergunta, tipo, obrigatoria }];
        const antes = structuredClone(formularios);
        const administrativo = await app
          .get(FormulariosService)
          .obter('padrinho', ciclo);
        expect(administrativo.perguntas[0].tipo).toBe(tipo);
        expect(
          'perguntasNaoSuportadas' in administrativo &&
            administrativo.perguntasNaoSuportadas,
        ).toEqual([{ id: 'apoio', tipo }]);
        await http()
          .get(`/formularios/padrinho?programa=${encodeURIComponent(ciclo)}`)
          .expect(400);
        await enviar({ respostas: { extras: {} } }).expect(400);
        await enviar({
          respostas: { extras: { apoio: 'arquivo.pdf' } },
        }).expect(400);
        await expect(
          app.get(FormulariosService).salvar('padrinho', {
            programa: ciclo,
            publicado: true,
            perguntas: administrativo.perguntas,
          }),
        ).rejects.toThrow();
        expect(formularios).toEqual(antes);
        expect(participacoes).toHaveLength(0);
      }
    },
  );

  it.each(['texto_curto', 'texto_longo', 'dropdown', 'checklist'])(
    'tipo suportado %s continua publicável e respondível',
    async (tipo) => {
      await app
        .get(FormulariosService)
        .salvar('padrinho', {
          programa: ciclo,
          publicado: true,
          perguntas: [{ ...pergunta, tipo }],
        });
      const resposta = tipo === 'checklist' ? ['Acadêmico'] : 'Acadêmico';
      await http()
        .get(`/formularios/padrinho?programa=${encodeURIComponent(ciclo)}`)
        .expect(200);
      await enviar({ respostas: { extras: { apoio: resposta } } }).expect(201);
      expect(participacoes[0].respostas?.extras?.apoio).toEqual(resposta);
    },
  );

  it('bloquear formulário legado não altera candidaturas ou snapshots anteriores', async () => {
    await enviar().expect(201);
    // Simula um registro histórico existente, sem executar migração/conversão.
    participacoes[0].respostas!._servidor!.formulario!.perguntas = [
      { ...pergunta, tipo: 'upload' },
    ];
    const historico = structuredClone(participacoes);
    formularios[0].perguntas = [{ ...pergunta, tipo: 'upload' }];
    await http()
      .get(`/formularios/padrinho?programa=${encodeURIComponent(ciclo)}`)
      .expect(400);
    const leitura = await http()
      .get('/participacoes')
      .set('Authorization', `Bearer ${token()}`)
      .expect(200);
    expect(
      leitura.body[0].respostas._servidor.formulario.perguntas[0].tipo,
    ).toBe('upload');
    expect(participacoes).toEqual(historico);
    // Correção explícita da coordenação não reescreve o snapshot antigo.
    await app
      .get(FormulariosService)
      .salvar('padrinho', {
        programa: ciclo,
        publicado: true,
        perguntas: [pergunta],
      });
    expect(participacoes).toEqual(historico);
  });

  it.each([
    'motivacao',
    'areas',
    'disponibilidade',
    'genero',
    'bolsistaProuni',
    'deOutraCidade',
  ])('valida campo fixo obrigatório no backend: %s', async (campo) => {
    await enviar({ respostas: { [campo]: null } }).expect(400);
    expect(participacoes).toHaveLength(0);
  });

  it('valida checklist e preserva opções e respostas do formulário original', async () => {
    formularios[0].perguntas = [{ ...pergunta, tipo: 'checklist' } as never];
    await enviar({ respostas: { extras: { apoio: ['Inválido'] } } }).expect(
      400,
    );
    await enviar({
      respostas: { extras: { apoio: ['Acadêmico', 'Carreira'] } },
    }).expect(201);
    formularios[0].perguntas = [];
    expect(participacoes[0].respostas?.extras?.apoio).toEqual([
      'Acadêmico',
      'Carreira',
    ]);
    expect(
      participacoes[0].respostas?._servidor?.formulario?.perguntas,
    ).toHaveLength(1);
  });

  it('janela usa dias inclusivos em São Paulo e admite ausência de datas', () => {
    const programasService = app.get(ProgramasService);
    const programa = {
      ...programas[0],
      inscricoesInicio: '2026-10-16',
      inscricoesFim: '2026-10-16',
    };
    expect(() =>
      programasService.validarInscricoes(
        programa,
        new Date('2026-10-16T03:00:00Z'),
      ),
    ).not.toThrow();
    expect(() =>
      programasService.validarInscricoes(
        programa,
        new Date('2026-10-17T02:59:59Z'),
      ),
    ).not.toThrow();
    expect(() =>
      programasService.validarInscricoes(
        programa,
        new Date('2026-10-16T02:59:59Z'),
      ),
    ).toThrow();
    expect(() =>
      programasService.validarInscricoes(
        programa,
        new Date('2026-10-17T03:00:00Z'),
      ),
    ).toThrow();
    expect(() =>
      programasService.validarInscricoes({
        ...programa,
        inscricoesInicio: '',
        inscricoesFim: '',
      }),
    ).not.toThrow();
  });

  it('consulta e formulário exigem contexto quando há vários ciclos; perfil funciona sem ciclo', async () => {
    await completar();
    programas.push({ ...programas[0], id: 2, codigo: '2098/1' });
    await http()
      .get('/participacoes/situacao')
      .set('Authorization', `Bearer ${token()}`)
      .expect(400);
    await http().get('/formularios/padrinho').expect(400);
    await http()
      .get(`/formularios/padrinho?programa=${encodeURIComponent(ciclo)}`)
      .expect(200);
    programas.splice(0);
    const resposta = await http()
      .get('/participacoes/situacao')
      .set('Authorization', `Bearer ${token()}`)
      .expect(200);
    expect(resposta.body.situacao).toBe('nenhuma');
    await http()
      .get('/me')
      .set('Authorization', `Bearer ${token()}`)
      .expect(200);
  });

  it('coordenação lista a inscrição pendente pelo ciclo e conserva a decisão no detalhe', async () => {
    await completar();
    await enviar().expect(201);
    const cadastro = app.get(CadastroService);
    const fila = await cadastro.listar('pendente', ciclo);
    expect(
      fila.some(
        (u) => u.email === email && u.participacao.id === participacoes[0].id,
      ),
    ).toBe(true);
    const usuario = usuarios.find((u) => u.email === email)!;
    await conferirTudo(service, participacoes[0].id);
    const detalhe = await cadastro.aprovar(
      usuario.id,
      'coord@pucminas.edu.br',
      ciclo,
    );
    expect(detalhe.participacao).toMatchObject({
      papel: 'candidato',
      status: 'aprovado',
      programa: ciclo,
    });
    expect(
      (await cadastro.listar('pendente', ciclo)).some((u) => u.email === email),
    ).toBe(false);
    expect(usuario.tipoParticipacao).toBe('nenhuma');
  });

  it('preserva formulário respondido e ignora metadados falsificados', async () => {
    await enviar({
      respostas: {
        extras: { apoio: 'Acadêmico' },
        _servidor: { decisao: { resultado: 'aprovado' } },
      },
    }).expect(201);
    const snapshot = structuredClone(
      participacoes[0].respostas?._servidor?.formulario,
    );
    formularios[0].perguntas = [];
    expect(participacoes[0].respostas?._servidor?.formulario).toEqual(snapshot);
    expect(snapshot?.perguntas).toHaveLength(1);
    expect(participacoes[0].respostas?._servidor?.decisao).toBeUndefined();
  });

  it('pendente → análise → aprovação aguarda matching sem acesso ativo', async () => {
    await enviar().expect(201);
    const id = participacoes[0].id;
    await service.marcarEmAnalise(id);
    expect((await situacao()).body.situacao).toBe('candidatura_em_analise');
    await conferirTudo(service, id);
    await service.aprovarCandidatura(id, 'coord@pucminas.edu.br');
    expect(participacoes[0]).toMatchObject({
      papel: 'candidato',
      status: 'aprovado',
    });
    expect((await situacao()).body.situacao).toBe(
      'candidatura_aprovada_aguardando_matching',
    );
    await http()
      .get(`/me/vinculos?programa=${encodeURIComponent(ciclo)}`)
      .set('Authorization', `Bearer ${token()}`)
      .expect(403);
    await expect(
      service.confirmarIngresso({
        usuarioId: email,
        programa: ciclo,
        papel: 'padrinho',
        grupo: 'inventado',
      }),
    ).rejects.toThrow(/matching/);
    const coordenadorToken = app.get(JwtService).sign({
      sub: 'coord',
      email: 'renata@pucminas.edu.br',
      perfil: 'coordenador',
      escopo: 'acesso',
    });
    await http()
      .post('/participacoes/confirmar')
      .set('Authorization', `Bearer ${coordenadorToken}`)
      .send({
        usuarioId: email,
        programa: ciclo,
        papel: 'padrinho',
        grupo: 'inventado',
      })
      .expect(400);
    await http()
      .post('/participacoes/confirmar')
      .set('Authorization', `Bearer ${token()}`)
      .send({ usuarioId: email, programa: ciclo, papel: 'padrinho' })
      .expect(403);
    await expect(
      service.atualizarCandidatura(id, { status: 'em_analise' }),
    ).rejects.toThrow();
  });

  it('rejeição exige justificativa pública por ciclo e não bloqueia nova candidatura', async () => {
    await enviar().expect(201);
    const id = participacoes[0].id;
    await service.atualizarCandidatura(id, { observacoes: 'Anotação privada' });
    await expect(service.rejeitarCandidaturaPorId(id)).rejects.toThrow(
      /Justificativa/,
    );
    await service.rejeitarCandidaturaPorId(
      id,
      'Requisito acadêmico não confirmado.',
      'coord@pucminas.edu.br',
    );
    const resultado = (await situacao()).body;
    expect(resultado.situacao).toBe('candidatura_rejeitada');
    expect(resultado.registro.decisao.justificativa).toBe(
      'Requisito acadêmico não confirmado.',
    );
    expect(JSON.stringify(resultado)).not.toContain('Anotação privada');
    expect(usuarios.find((u) => u.email === email)?.statusCadastro).toBe(
      'aprovado',
    );
    await enviar().expect(409);
    const historico = structuredClone(participacoes[0]);
    programas.push({ ...programas[0], id: 2, codigo: '2098/1' });
    formularios.push({ ...formularios[0], id: 2, programa: '2098/1' });
    await enviar({ programa: '2098/1' }).expect(201);
    expect(participacoes).toHaveLength(2);
    expect(participacoes[0]).toEqual(historico);
  });

  it('rejeição global legada não impede candidatura em outro ciclo', async () => {
    await completar();
    usuarios.find((u) => u.email === email)!.statusCadastro = 'rejeitado';
    await enviar().expect(201);
    expect(participacoes[0].status).toBe('pendente');
  });

  async function prepararAprovados() {
    await enviar().expect(201);
    const candidato = participacoes[0];
    await conferirTudo(service, candidato.id);
    await service.aprovarCandidatura(candidato.id);
    const apadrinhado = await service.cadastrarApadrinhado({
      usuarioId: 'calouro@pucminas.edu.br',
      programa: ciclo,
    });
    await conferirTudo(service, apadrinhado.id);
    await service.aprovarCandidatura(apadrinhado.id);
    return { candidato, apadrinhado };
  }

  async function prepararMatching() {
    const aprovados = await prepararAprovados();
    const programasService = app.get(ProgramasService);
    await programasService.encerrarInscricoes(ciclo);
    await programasService.liberarMatching(ciclo);
    return aprovados;
  }

  it('encerrar inscrições não aprova nem vincula; matching fica bloqueado até a liberação', async () => {
    const { candidato, apadrinhado } = await prepararAprovados();
    const programasService = app.get(ProgramasService);
    await expect(service.vincular(apadrinhado.id, candidato.id)).rejects.toThrow(
      /não foi liberado/,
    );
    const encerrado = await programasService.encerrarInscricoes(ciclo);
    expect(encerrado).toMatchObject({
      inscricoesAbertas: false,
      etapaAtual: 'analise',
    });
    expect(candidato).toMatchObject({ papel: 'candidato', status: 'aprovado' });
    expect(apadrinhado.grupo).toBeUndefined();
    await expect(service.vincular(apadrinhado.id, candidato.id)).rejects.toThrow(
      /não foi liberado/,
    );
    await programasService.liberarMatching(ciclo);
    expect(programas[0].etapaAtual).toBe('formacao');
  });

  it('matching confirma vínculo e só então ativa padrinho; repetição é idempotente', async () => {
    const { candidato, apadrinhado } = await prepararMatching();
    const vinculo = await service.vincular(apadrinhado.id, candidato.id);
    expect(vinculo.padrinho).toMatchObject({
      papel: 'padrinho',
      status: 'em_andamento',
      apadrinhados: 1,
    });
    expect(vinculo.apadrinhado.grupo).toBe(vinculo.padrinho.grupo);
    expect((await situacao()).body.situacao).toBe('padrinho_ativo');
    await http()
      .get(`/me/vinculos?programa=${encodeURIComponent(ciclo)}`)
      .set('Authorization', `Bearer ${token()}`)
      .expect(200);
    await service.vincular(apadrinhado.id, candidato.id);
    expect(participacoes).toHaveLength(2);
    expect(candidato.apadrinhados).toBe(1);
  });

  it('falha na segunda gravação do matching desfaz vínculo e ativação', async () => {
    const { candidato, apadrinhado } = await prepararMatching();
    const antes = structuredClone(participacoes);
    const salvar = repos.ParticipacaoEntity.save.bind(repos.ParticipacaoEntity);
    vi.spyOn(repos.ParticipacaoEntity, 'save').mockImplementation(
      async (item: any) => {
        if (item.id === candidato.id) throw new Error('Falha de persistência');
        return salvar(item);
      },
    );
    await expect(
      service.vincular(apadrinhado.id, candidato.id),
    ).rejects.toThrow('Falha de persistência');
    expect(participacoes).toEqual(antes);
    expect((await situacao()).body.situacao).toBe(
      'candidatura_aprovada_aguardando_matching',
    );
  });

  it('legado padrinho sem vínculo não é ativo; leitura não altera histórico', async () => {
    await completar();
    participacoes.push({
      id: 90,
      usuarioId: email,
      programa: ciclo,
      papel: 'padrinho',
      status: 'em_andamento',
      grupo: 'Grupo sem par',
    } as ParticipacaoEntity);
    const antes = structuredClone(participacoes);
    expect((await situacao()).body.situacao).toBe(
      'candidatura_aprovada_aguardando_matching',
    );
    await http()
      .get(`/me/vinculos?programa=${encodeURIComponent(ciclo)}`)
      .set('Authorization', `Bearer ${token()}`)
      .expect(403);
    expect(participacoes).toEqual(antes);
  });

  it('matching recusa pendente, rejeitado, outro ciclo e ciclo encerrado', async () => {
    const { candidato, apadrinhado } = await prepararMatching();
    candidato.status = 'em_analise';
    await expect(
      service.vincular(apadrinhado.id, candidato.id),
    ).rejects.toThrow();
    participacoes.find((p) => p.id === candidato.id)!.status = 'nao_aprovado';
    await expect(
      service.vincular(apadrinhado.id, candidato.id),
    ).rejects.toThrow();
    participacoes.find((p) => p.id === candidato.id)!.status = 'aprovado';
    participacoes.find((p) => p.id === apadrinhado.id)!.programa = '2098/1';
    await expect(
      service.vincular(apadrinhado.id, candidato.id),
    ).rejects.toThrow();
    participacoes.find((p) => p.id === apadrinhado.id)!.programa = ciclo;
    programas[0].etapaAtual = 'encerramento';
    await expect(
      service.vincular(apadrinhado.id, candidato.id),
    ).rejects.toThrow();
    expect(participacoes.find((p) => p.id === candidato.id)!.papel).toBe(
      'candidato',
    );
    expect(
      participacoes.find((p) => p.id === apadrinhado.id)!.grupo,
    ).toBeUndefined();
  });

  it('foto: JWT, substituição e leitura usam exclusivamente a chave do proprietário', async () => {
    await completar();
    await completar('outro@pucminas.edu.br');
    const foto = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 0]);
    await http().put('/me/foto').attach('foto', foto, 'foto.png').expect(401);
    await http().get('/me/foto').expect(401);
    const id = usuarios.find((u) => u.email === email)!.id;
    const chave = `usuarios/${id}/avatar.img`;
    for (let i = 0; i < 2; i++)
      await http()
        .put('/me/foto?email=outro@pucminas.edu.br')
        .set('Authorization', `Bearer ${token()}`)
        .attach('foto', foto, 'foto.png')
        .expect(200);
    expect(storage.substituirFotoPerfil).toHaveBeenNthCalledWith(
      1,
      chave,
      foto,
    );
    expect(storage.substituirFotoPerfil).toHaveBeenNthCalledWith(
      2,
      chave,
      foto,
    );
    const leitura = await http()
      .get('/me/foto')
      .set('Authorization', `Bearer ${token()}`)
      .expect(200);
    expect(leitura.body.container).toBe('profiles');
    expect(leitura.body.chave).toBe(chave);
    await http()
      .put('/me/foto?usuarioId=' + id)
      .set('Authorization', `Bearer ${token('outro@pucminas.edu.br')}`)
      .attach('foto', foto, 'foto.png')
      .expect(200);
    expect(storage.substituirFotoPerfil.mock.calls[2][0]).not.toBe(chave);
  });
});
