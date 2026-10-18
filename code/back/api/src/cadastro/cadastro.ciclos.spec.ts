import { FormularioEntity } from '../formularios/entities/formulario.entity.js';
import {
  repositorioEmMemoria,
  conectarRepositorios,
} from '../../test/helpers/repositorio-memoria.js';
import type { AuthService } from '../auth/auth.service.js';
import { CoordenacaoService } from '../coordenacao/coordenacao.service.js';
import {
  ParticipacaoEntity,
  type RespostasCadastro,
} from '../participacoes/entities/participacao.entity.js';
import { ParticipacoesService } from '../participacoes/participacoes.service.js';
import { ProgramaEntity } from '../programas/entities/programa.entity.js';
import { ProgramasService } from '../programas/programas.service.js';
import { UsuarioEntity } from '../usuarios/entities/usuario.entity.js';
import { UsuariosService } from '../usuarios/usuarios.service.js';
import { CadastroService } from './cadastro.service.js';

/**
 * Cadastro global × participações por ciclo, requisitos configuráveis de
 * padrinho e a transição apadrinhado → padrinho, passando pelas mesmas ações
 * da tela de Candidaturas (CoordenacaoService).
 */
const cronograma = {
  inscricoesInicio: '2000-01-01', inscricoesFim: '2099-12-31',
  analiseInicio: '2099-12-31', analiseFim: '2099-12-31',
  formacaoInicio: '2099-12-31', formacaoFim: '2099-12-31',
  andamentoInicio: '2099-12-31', andamentoFim: '2099-12-31', encerramentoEm: '2099-12-31',
};
describe('Cadastro × ciclos, requisitos e transição', () => {
  const COORD = 'renata@pucminas.edu.br';
  let usuarios: UsuarioEntity[];
  let participacoes: ParticipacaoEntity[];
  let programasService: ProgramasService;
  let cadastro: CadastroService;
  let participacoesService: ParticipacoesService;
  let coordenacao: CoordenacaoService;

  beforeEach(async () => {
    usuarios = [];
    participacoes = [];
    const repoUsuarios = repositorioEmMemoria(usuarios);
    const usuariosService = new UsuariosService(repoUsuarios);
    const repoParticipacoes = repositorioEmMemoria(participacoes);
    const repoProgramas = repositorioEmMemoria<ProgramaEntity>();
    const repoFormularios = repositorioEmMemoria<FormularioEntity>();
    conectarRepositorios({
      UsuarioEntity: repoUsuarios,
      ParticipacaoEntity: repoParticipacoes,
      ProgramaEntity: repoProgramas,
      FormularioEntity: repoFormularios,
    });
    participacoesService = new ParticipacoesService(
      repoParticipacoes,
      repoProgramas,
    );
    programasService = new ProgramasService(repoProgramas);
    cadastro = new CadastroService(
      usuariosService,
      participacoesService,
      {} as AuthService,
      programasService,
    );
    // só os colaboradores usados em aprovar/rejeitar/detalhar candidatura
    coordenacao = new CoordenacaoService(
      programasService,
      participacoesService,
      null as never,
      null as never,
      cadastro,
      usuariosService,
      repoParticipacoes,
    );
    for (const codigo of ['2025/2', '2026/2', '2027/1', '2027/2']) {
      await programasService.criarNovoCiclo(codigo, cronograma);
      await programasService.atualizar(codigo, {
        inscricoesInicio: '2000-01-01',
        inscricoesFim: '2099-12-31',
      });
      await repoFormularios.save(
        repoFormularios.create({
          programa: codigo,
          tipo: 'padrinho',
          publicado: true,
          perguntas: [],
        }),
      );
    }
    await programasService.atualizar('2026/2', {
      requisitosPadrinho: [{ descricao: 'Cálculo I' }],
    });
    await programasService.atualizar('2027/1', {
      requisitosPadrinho: [{ descricao: 'Cálculo I' }, { descricao: 'AED I' }],
    });
    await programasService.atualizar('2027/2', { requisitosPadrinho: [] });
  });

  const EMAIL = 'veterano@pucminas.edu.br';
  const usuario = () => usuarios.find((u) => u.email === EMAIL)!;
  const todos = (programa: string) =>
    // O payload envia id/cumpre; descrição e obrigatoriedade vêm do servidor.
    ({
      requisitos: (programa === '2026/2'
        ? ['calculo-i']
        : ['calculo-i', 'aed-i']
      ).map((id) => ({ id, cumpre: true })),
    }) as Pick<RespostasCadastro, 'requisitos'>;
  const padrinho = (
    programa: string,
    periodo = 4,
    respostas = todos(programa),
  ) => ({
    email: EMAIL,
    nome: 'Veterano',
    curso: 'SI',
    periodo,
    tipoParticipacao: 'padrinho' as const,
    programa,
    respostas: {
      motivacao: 'Quero apoiar novos alunos.',
      areas: ['Projetos'],
      disponibilidade: ['Noite'],
      genero: 'Prefiro não informar',
      bolsistaProuni: false,
      deOutraCidade: false,
      ...respostas,
    },
  });

  async function aprovadoEm2026_2() {
    const { participacao } = await cadastro.registrar(padrinho('2026/2'));
    await coordenacao.aprovarCandidatura(participacao.id, COORD);
    expect(usuario().statusCadastro).toBe('aprovado');
    return usuario().analisadoEm;
  }

  /* ---------- requisitos configuráveis ---------- */

  it('A: cumpre todos os requisitos do ciclo → candidatura PENDENTE (não aprovada)', async () => {
    const { usuario: u, participacao } = await cadastro.registrar(
      padrinho('2027/1', 3),
    );
    expect(participacao).toMatchObject({
      papel: 'candidato',
      status: 'pendente',
    });
    expect(u.statusCadastro).toBe('aprovado');
    expect(participacao.respostas?.requisitos).toEqual([
      {
        id: 'calculo-i',
        descricao: 'Cálculo I',
        obrigatorio: true,
        cumpre: true,
      },
      { id: 'aed-i', descricao: 'AED I', obrigatorio: true, cumpre: true },
    ]);
  });

  it('B: não cumpre um requisito obrigatório → 400 e nada é criado', async () => {
    await expect(
      cadastro.registrar(
        padrinho('2027/1', 3, {
          requisitos: [
            { id: 'calculo-i', cumpre: false },
            { id: 'aed-i', cumpre: true },
          ],
        } as never),
      ),
    ).rejects.toThrow(/é preciso cumprir: Cálculo I/);
    // sem resposta também conta como não cumprido
    await expect(
      cadastro.registrar(padrinho('2027/1', 3, {} as never)),
    ).rejects.toThrow(/Cálculo I; AED I/);
    expect(usuarios).toHaveLength(0);
    expect(participacoes).toHaveLength(0);
  });

  it('B2: requisito NÃO obrigatório é registrado, mas não bloqueia', async () => {
    await programasService.atualizar('2027/1', {
      requisitosPadrinho: [
        { descricao: 'Cálculo I' },
        { descricao: 'Banco de Dados', obrigatorio: false },
      ],
    });
    const { participacao } = await cadastro.registrar(
      padrinho('2027/1', 3, {
        requisitos: [{ id: 'calculo-i', cumpre: true }],
      } as never),
    );
    expect(participacao.respostas?.requisitos?.[1]).toMatchObject({
      descricao: 'Banco de Dados',
      obrigatorio: false,
      cumpre: false,
    });
  });

  it('C: 1º período continua sem poder ser padrinho mesmo cumprindo tudo', async () => {
    await expect(cadastro.registrar(padrinho('2027/1', 1))).rejects.toThrow(
      /1º período não podem se cadastrar como padrinho/,
    );
  });

  it('D: mudar requisitos de outro ciclo não altera participações históricas', async () => {
    await aprovadoEm2026_2();
    const historica = participacoes.find((p) => p.programa === '2026/2')!;
    const fotoAntes = structuredClone(historica.respostas?.requisitos);

    await programasService.atualizar('2027/1', {
      requisitosPadrinho: [
        { descricao: 'Cálculo I' },
        { descricao: 'AED I' },
        { descricao: 'Banco de Dados' },
      ],
    });

    expect(historica.respostas?.requisitos).toEqual(fotoAntes);
    expect(historica).toMatchObject({
      papel: 'candidato',
      status: 'aprovado',
    });
    const detalhe = await coordenacao.detalharCandidatura(historica.id);
    expect(detalhe.requisitos.map((r) => r.descricao)).toEqual(['Cálculo I']);
    expect(usuario().statusCadastro).toBe('aprovado');
  });

  it('apadrinhado não responde requisitos de padrinho', async () => {
    const { participacao } = await cadastro.registrar({
      email: 'calouro@pucminas.edu.br',
      nome: 'Calouro',
      curso: 'SI',
      periodo: 1,
      tipoParticipacao: 'apadrinhado',
      programa: '2027/1',
      respostas: { requisitos: [{ id: 'x', cumpre: true }] } as never,
    });
    expect(participacao.respostas?.requisitos).toBeUndefined();
  });

  it('novo ciclo copia os requisitos do mais recente (cópia independente)', async () => {
    const novo = await programasService.criarNovoCiclo('2028/1', cronograma);
    expect(novo.requisitosPadrinho).toEqual([]); // 2027/2 é o mais recente
    await programasService.atualizar('2028/1', {
      requisitosPadrinho: [{ descricao: 'Física I' }],
    });
    expect(await programasService.requisitosPadrinho('2027/2')).toEqual([]);
  });

  /* ---------- ciclo inexistente / criação explícita de ciclo ---------- */

  it('cadastro (apadrinhado ou padrinho) em ciclo inexistente → 400 e nenhum usuário gravado', async () => {
    await expect(
      cadastro.registrar({
        email: 'calouro@pucminas.edu.br',
        nome: 'Calouro',
        curso: 'SI',
        periodo: 1,
        tipoParticipacao: 'apadrinhado',
        programa: '2099/1',
      }),
    ).rejects.toThrow(/Ciclo 2099\/1 não cadastrado/);
    await expect(cadastro.registrar(padrinho('2099/1'))).rejects.toThrow(
      /Ciclo 2099\/1 não cadastrado/,
    );
    expect(usuarios).toHaveLength(0);
    expect(participacoes).toHaveLength(0);
  });

  it('coordenação cria explicitamente qualquer semestre (ex.: 2028/2) sem depender da data', async () => {
    const criado = await programasService.criarNovoCiclo('2028/2', cronograma);
    expect(criado).toMatchObject({
      codigo: '2028/2',
      etapaAtual: 'inscricoes',
    });
    await programasService.atualizar('2028/2', {
      inscricoesInicio: '2000-01-01',
      inscricoesFim: '2099-12-31',
    });
    const { participacao } = await cadastro.registrar({
      email: 'calouro@pucminas.edu.br',
      nome: 'Calouro',
      curso: 'SI',
      periodo: 1,
      tipoParticipacao: 'apadrinhado',
      programa: '2028/2',
    });
    expect(participacao.programa).toBe('2028/2');
  });

  it('código de ciclo inválido → 400; ciclo já existente → 409 (sem duplicar)', async () => {
    for (const codigo of ['2027', '2027/3', '27/1', '1999/1', 'abc']) {
      await expect(programasService.criarNovoCiclo(codigo, cronograma)).rejects.toThrow(
        /Código do ciclo inválido/,
      );
    }
    await expect(programasService.criarNovoCiclo('2027/1', cronograma)).rejects.toThrow(
      /já existe/,
    );
    expect(
      (await programasService.listar()).filter((p) => p.codigo === '2027/1'),
    ).toHaveLength(1);
  });

  /* ---------- sincronização cadastro × participação ---------- */

  it('aprovação inicial decide somente a candidatura', async () => {
    const { participacao } = await cadastro.registrar(padrinho('2026/2'));
    await coordenacao.aprovarCandidatura(participacao.id, COORD);
    expect(usuario()).toMatchObject({
      statusCadastro: 'aprovado',
      tipoParticipacao: 'nenhuma',
    });
    expect(participacoes[0]).toMatchObject({
      papel: 'candidato',
      status: 'aprovado',
    });
    expect(await coordenacao.listarCandidaturas('2026/2', 'aprovadas')).toEqual(
      [
        expect.objectContaining({
          id: participacao.id,
          papel: 'candidato',
          status: 'aprovado',
        }),
      ],
    );
    const dashboard = await coordenacao.obterDashboard('2026/2');
    expect(dashboard.indicadores?.padrinhosAprovados.valor).toBe(1);
    expect(dashboard.indicadores?.padrinhosAprovados.comVinculo).toBe(0);
  });

  it('rejeição inicial preserva a conta e decide a candidatura', async () => {
    const { participacao } = await cadastro.registrar(padrinho('2026/2'));
    await coordenacao.rejeitarCandidatura(
      participacao.id,
      COORD,
      'Requisitos não confirmados.',
    );
    expect(usuario().statusCadastro).toBe('aprovado');
    expect(participacoes[0].status).toBe('nao_aprovado');
  });

  it('ciclo futuro: rejeitar/aprovar participação não mexe no cadastro global', async () => {
    const analisadoEm = await aprovadoEm2026_2();
    const { participacao: f1 } = await cadastro.registrar(padrinho('2027/1'));
    expect(f1).toMatchObject({ programa: '2027/1', status: 'pendente' });
    await coordenacao.rejeitarCandidatura(
      f1.id,
      COORD,
      'Requisitos não confirmados.',
    );
    expect(f1.status).toBe('nao_aprovado');
    expect(usuario()).toMatchObject({
      statusCadastro: 'aprovado',
      analisadoEm,
    });

    const { participacao: f2 } = await cadastro.registrar(padrinho('2027/2'));
    await coordenacao.acaoEmMassa({ ids: [f2.id], acao: 'aprovar' }, COORD);
    expect(f2).toMatchObject({ papel: 'candidato', status: 'aprovado' });
    expect(usuario()).toMatchObject({
      statusCadastro: 'aprovado',
      analisadoEm,
    });
  });

  it('decisão sobre participação que não é a do cadastro pendente não o altera', async () => {
    const antiga = await participacoesService.registrarCandidaturaPadrinho({
      usuarioId: EMAIL,
      programa: '2025/2',
    });
    await cadastro.registrar(padrinho('2026/2'));
    await coordenacao.rejeitarCandidatura(
      antiga.id,
      COORD,
      'Requisitos não confirmados.',
    );
    expect(usuario().statusCadastro).toBe('aprovado');
  });

  /* ---------- transição apadrinhado → padrinho ---------- */

  async function apadrinhadoAprovadoEm2026_2() {
    const { usuario: u, participacao } = await cadastro.registrar({
      email: EMAIL,
      nome: 'Ex-calouro',
      curso: 'SI',
      periodo: 1,
      tipoParticipacao: 'apadrinhado',
      programa: '2026/2',
    });
    await cadastro.aprovar(u.id, COORD);
    expect(participacao.status).toBe('em_andamento');
    return { usuario: u, apadrinhado: participacao };
  }

  it('transição: candidatura PENDENTE no novo ciclo, sem novo usuário, cadastro segue APROVADO', async () => {
    const { apadrinhado } = await apadrinhadoAprovadoEm2026_2();
    const analisadoEm = usuario().analisadoEm;

    const { usuario: u, participacao } = await cadastro.registrar(
      padrinho('2027/1', 2),
    );

    expect(usuarios.filter((x) => x.email === EMAIL)).toHaveLength(1);
    expect(u).toMatchObject({ statusCadastro: 'aprovado', analisadoEm });
    expect(u.tipoParticipacao).toBe('nenhuma'); // só muda se aprovado
    expect(participacao).toMatchObject({
      programa: '2027/1',
      papel: 'candidato',
      status: 'pendente',
    });
    expect(apadrinhado).toMatchObject({
      programa: '2026/2',
      papel: 'apadrinhado',
    });
  });

  it('transição exige os requisitos do novo ciclo', async () => {
    await apadrinhadoAprovadoEm2026_2();
    await expect(
      cadastro.registrar(padrinho('2027/1', 2, {} as never)),
    ).rejects.toThrow(/é preciso cumprir/);
  });

  it('transição aprovada aguarda matching sem alterar conta ou histórico', async () => {
    await apadrinhadoAprovadoEm2026_2();
    const analisadoEm = usuario().analisadoEm;
    const { participacao } = await cadastro.registrar(padrinho('2027/1', 2));

    await coordenacao.aprovarCandidatura(participacao.id, COORD);

    expect(participacao).toMatchObject({
      papel: 'candidato',
      status: 'aprovado',
    });
    expect(usuario()).toMatchObject({
      statusCadastro: 'aprovado',
      tipoParticipacao: 'nenhuma',
      analisadoEm,
    });
    const historico = await participacoesService.listarPorUsuario(EMAIL);
    expect(historico.map((p) => `${p.programa}:${p.papel}`).sort()).toEqual([
      '2026/2:apadrinhado',
      '2027/1:candidato',
    ]);
  });

  it('transição rejeitada: só a participação fica rejeitada', async () => {
    await apadrinhadoAprovadoEm2026_2();
    const { participacao } = await cadastro.registrar(padrinho('2027/1', 2));

    await coordenacao.rejeitarCandidatura(
      participacao.id,
      COORD,
      'Requisitos não confirmados.',
    );

    expect(participacao.status).toBe('nao_aprovado');
    expect(usuario()).toMatchObject({
      statusCadastro: 'aprovado',
      tipoParticipacao: 'nenhuma',
    });
    expect(participacoes.find((p) => p.programa === '2026/2')).toMatchObject({
      papel: 'apadrinhado',
      status: 'em_andamento',
    });
  });

  it('inscrição anterior não impede outra modalidade em novo ciclo', async () => {
    await cadastro.registrar({
      email: EMAIL,
      nome: 'Calouro',
      curso: 'SI',
      periodo: 1,
      tipoParticipacao: 'apadrinhado',
      programa: '2026/2',
    });
    const nova = await cadastro.registrar(padrinho('2027/1', 2));
    expect(nova.participacao).toMatchObject({
      programa: '2027/1',
      papel: 'candidato',
      status: 'pendente',
    });
    expect(participacoes).toHaveLength(2);
  });
});
