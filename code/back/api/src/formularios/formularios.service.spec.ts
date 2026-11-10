import {
  conectarRepositorios,
  repositorioEmMemoria,
} from '../../test/helpers/repositorio-memoria.js';
import type { ProgramaEntity } from '../programas/entities/programa.entity.js';
import type { ProgramasService } from '../programas/programas.service.js';
import type { FormularioEntity } from './entities/formulario.entity.js';
import { FormulariosService } from './formularios.service.js';

const CICLO = '2099/1';
const OUTRO = '2099/2';

describe('FormulariosService', () => {
  let registros: FormularioEntity[];
  let programas: ProgramaEntity[];
  let service: FormulariosService;

  beforeEach(() => {
    registros = [];
    programas = [
      { id: 1, codigo: CICLO, etapaAtual: 'inscricoes' } as ProgramaEntity,
      { id: 2, codigo: OUTRO, etapaAtual: 'inscricoes' } as ProgramaEntity,
    ];
    const formularios = repositorioEmMemoria(registros);
    const repoProgramas = repositorioEmMemoria(programas);
    conectarRepositorios({
      FormularioEntity: formularios,
      ProgramaEntity: repoProgramas,
    });
    const programasService = {
      resolverConsulta: async (codigo?: string) => {
        const ciclo = programas.find((p) => p.codigo === (codigo || CICLO));
        if (!ciclo) throw new Error('Ciclo não cadastrado.');
        return ciclo;
      },
    } as unknown as ProgramasService;
    service = new FormulariosService(formularios, programasService);
  });

  const pergunta = (parcial: Record<string, unknown> = {}) => ({
    enunciado: 'Qual seu turno?',
    tipo: 'dropdown',
    opcoes: ['Manhã', 'Noite'],
    obrigatoria: true,
    ...parcial,
  });
  const salvar = (corpo: Record<string, unknown> = {}) =>
    service.salvar('apadrinhado', {
      programa: CICLO,
      perguntas: [pergunta()],
      ...corpo,
    });

  describe('construtor', () => {
    it('salva ajuda, seção e matching e os devolve na leitura', async () => {
      const salvo = await salvar({
        perguntas: [
          pergunta({
            ajuda: '  Escolha um  ',
            secao: ' Rotina ',
            matching: true,
          }),
        ],
      });
      expect(salvo.perguntas[0]).toMatchObject({
        ajuda: 'Escolha um',
        secao: 'Rotina',
        matching: true,
      });
      const lido = await service.obter('apadrinhado', CICLO);
      expect(lido.perguntas[0].secao).toBe('Rotina');
    });

    it('expõe os campos fixos do perfil, separados das perguntas personalizadas', async () => {
      const padrao = await service.obter('padrinho', CICLO);
      expect(padrao.camposFixos.map((c) => c.id)).toContain('curso');
      const salvo = await service.salvar('padrinho', {
        programa: CICLO,
        perguntas: [],
      });
      expect(salvo.perguntas).toEqual([]);
      expect(salvo.camposFixos.length).toBeGreaterThan(0);
    });

    it.each([
      ['enunciado vazio', { enunciado: '  ' }],
      ['opções repetidas', { opcoes: ['Noite', 'Noite'] }],
      ['dropdown sem opções', { opcoes: [] }],
      [
        'matching em pergunta de texto',
        { tipo: 'texto_curto', matching: true },
      ],
      ['tipo desconhecido', { tipo: 'upload' }],
      [
        'matching sem critério',
        {
          tipo: 'sim_nao',
          enunciado: 'É bolsista?',
          opcoes: [],
        },
      ],
    ])('recusa pergunta inválida: %s', async (_, parcial) => {
      await expect(
        salvar({ perguntas: [pergunta(parcial)] }),
      ).rejects.toThrow();
      expect(registros).toHaveLength(0);
    });

    it('vincula pergunta de matching ao critério sem duplicar no mesmo formulário', async () => {
      const matching = {
        enunciado: 'Você é bolsista?',
        tipo: 'sim_nao',
        criterioId: 7,
        criterioVersao: 1,
        obrigatoria: true,
        opcoes: [],
      };
      const salvo = await salvar({ perguntas: [matching] });
      expect(salvo.perguntas[0]).toMatchObject({
        tipo: 'sim_nao',
        criterioId: 7,
        criterioVersao: 1,
        matching: true,
      });
      await expect(
        salvar({
          perguntas: [
            matching,
            { ...matching, enunciado: 'Outra formulação', id: 'q2' },
          ],
        }),
      ).rejects.toThrow(/já foi incluído/);
    });

    it('aceita escolha única e múltipla escolha com alternativas do catálogo', async () => {
      const unico = await salvar({
        perguntas: [
          {
            enunciado: 'Categoria',
            tipo: 'escolha_unica',
            criterioId: 3,
            criterioVersao: 2,
            alternativas: [
              { id: 'cat_a', rotulo: 'A' },
              { id: 'cat_b', rotulo: 'B' },
            ],
            opcoes: [],
          },
        ],
      });
      expect(unico.perguntas[0].alternativas).toEqual([
        { id: 'cat_a', rotulo: 'A' },
        { id: 'cat_b', rotulo: 'B' },
      ]);
      const multi = await salvar({
        perguntas: [
          {
            enunciado: 'Interesses',
            tipo: 'multipla_escolha',
            criterioId: 4,
            criterioVersao: 1,
            alternativas: [
              { id: 'i1', rotulo: 'Esporte' },
              { id: 'i2', rotulo: 'Música' },
            ],
            opcoes: [],
          },
        ],
      });
      expect(multi.perguntas[0].tipo).toBe('multipla_escolha');
    });

    it('lista os dois públicos do programa', async () => {
      await service.salvar('padrinho', { programa: CICLO, perguntas: [] });
      const lista = await service.listar(CICLO);
      expect(lista.map((f) => [f.tipo, f.salvo])).toEqual([
        ['apadrinhado', false],
        ['padrinho', true],
      ]);
    });
  });

  describe('status e versões', () => {
    it('nasce como rascunho na versão 0', async () => {
      const f = await salvar();
      expect(f).toMatchObject({
        status: 'rascunho',
        publicado: false,
        versao: 0,
      });
    });

    it('publicar cria a versão 1; salvar sem mudanças não cria outra', async () => {
      const publicado = await salvar({ publicado: true });
      expect(publicado).toMatchObject({ status: 'publicado', versao: 1 });
      const igual = await salvar({ publicado: true });
      expect(igual.versao).toBe(1);
    });

    it('alterar perguntas de um formulário publicado cria nova versão', async () => {
      await salvar({ publicado: true });
      const alterado = await salvar({
        publicado: true,
        perguntas: [pergunta({ enunciado: 'Qual seu horário?' })],
      });
      expect(alterado.versao).toBe(2);
    });

    it('editar rascunho não consome versão; só a publicação consome', async () => {
      await salvar();
      await salvar({ perguntas: [pergunta({ enunciado: 'Outra?' })] });
      expect((await service.obter('apadrinhado', CICLO)).versao).toBe(0);
      const publicado = await salvar({ publicado: true });
      expect(publicado.versao).toBe(1);
    });

    it('despublicar volta a rascunho; publicar de novo é nova versão', async () => {
      await salvar({ publicado: true });
      const rascunho = await salvar({ publicado: false });
      expect(rascunho).toMatchObject({ status: 'rascunho', versao: 1 });
      const republicado = await salvar({ publicado: true });
      expect(republicado).toMatchObject({ status: 'publicado', versao: 2 });
    });

    it('recusa publicar em programa encerrado, mas aceita salvar rascunho', async () => {
      programas[0].etapaAtual = 'encerramento';
      await expect(salvar({ publicado: true })).rejects.toThrow(
        /Programa encerrado/,
      );
      expect(registros).toHaveLength(0);
      await expect(salvar()).resolves.toMatchObject({ status: 'rascunho' });
    });

    it('recusa publicar formulário inválido sem alterar o que existe', async () => {
      await salvar({ publicado: true });
      await expect(
        salvar({ publicado: true, perguntas: [pergunta({ enunciado: '' })] }),
      ).rejects.toThrow(/enunciado/);
      expect(registros[0]).toMatchObject({ publicado: true, versao: 1 });
    });
  });

  describe('encerramento', () => {
    it('encerra um formulário publicado e preserva as perguntas', async () => {
      await salvar({ publicado: true });
      const encerrado = await service.encerrar('apadrinhado', CICLO);
      expect(encerrado).toMatchObject({
        status: 'encerrado',
        publicado: false,
        versao: 1,
      });
      expect(encerrado.encerradoEm).toBeInstanceOf(Date);
      expect(encerrado.perguntas).toHaveLength(1);
    });

    it.each([
      ['sem formulário salvo', async () => undefined],
      ['rascunho', async () => salvar()],
    ])('só encerra formulário publicado: %s', async (_, preparar) => {
      await preparar();
      await expect(service.encerrar('apadrinhado', CICLO)).rejects.toThrow(
        /publicado/,
      );
    });

    it('salvar um encerrado como rascunho não o reabre; publicar o reabre', async () => {
      await salvar({ publicado: true });
      await service.encerrar('apadrinhado', CICLO);
      const salvoComoRascunho = await salvar({ publicado: false });
      expect(salvoComoRascunho.status).toBe('encerrado');
      const reaberto = await salvar({ publicado: true });
      expect(reaberto).toMatchObject({
        status: 'publicado',
        versao: 2,
        encerradoEm: null,
      });
    });

    it('a visão do aluno de um encerrado não traz perguntas', async () => {
      await salvar({ publicado: true });
      await service.encerrar('apadrinhado', CICLO);
      const visao = await service.obterPublicado('apadrinhado', CICLO);
      expect(visao).toMatchObject({ status: 'encerrado', perguntas: [] });
    });
  });

  describe('respostas', () => {
    const extras = { 'pergunta-1': 'Noite' };

    it('mantém a validação de respostas do cadastro de padrinhos', async () => {
      await service.salvar('padrinho', {
        programa: CICLO,
        publicado: true,
        perguntas: [],
      });

      await expect(
        service.validarRespostasPadrinho(CICLO, {}),
      ).resolves.toMatchObject({
        programa: CICLO,
        tipo: 'padrinho',
        versao: 1,
      });
    });

    it('devolve a foto da versão respondida, isolada do formulário', async () => {
      await salvar({ publicado: true });
      const foto = await service.validarRespostas('apadrinhado', CICLO, extras);
      expect(foto).toMatchObject({ tipo: 'apadrinhado', versao: 1 });
      foto?.perguntas.push(pergunta() as never);
      const lido = await service.obter('apadrinhado', CICLO);
      expect(lido.perguntas).toHaveLength(1);
    });

    it('recusa resposta ausente, desconhecida ou fora das opções', async () => {
      await salvar({ publicado: true });
      for (const invalido of [
        {},
        { x: 'a', ...extras },
        { 'pergunta-1': 'Tarde' },
      ])
        await expect(
          service.validarRespostas('apadrinhado', CICLO, invalido),
        ).rejects.toThrow();
    });

    it('formulário encerrado recusa novas respostas', async () => {
      await salvar({ publicado: true });
      await service.encerrar('apadrinhado', CICLO);
      await expect(
        service.validarRespostas('apadrinhado', CICLO, extras),
      ).rejects.toThrow(/encerrado/);
    });

    it('sem publicação: padrinho é recusado; apadrinhado segue sem respostas adicionais', async () => {
      await expect(
        service.validarRespostas('padrinho', CICLO, {}),
      ).rejects.toThrow(/não publicado/);
      await expect(
        service.validarRespostas('apadrinhado', CICLO, undefined),
      ).resolves.toBeUndefined();
      await expect(
        service.validarRespostas('apadrinhado', CICLO, extras),
      ).rejects.toThrow(/não publicado/);
    });

    it('só exige e aceita respostas das perguntas visíveis pela condição', async () => {
      await salvar({
        publicado: true,
        perguntas: [
          pergunta({
            id: 'tem-interesse',
            enunciado: 'Tem interesse?',
            tipo: 'dropdown',
            opcoes: ['Sim', 'Não'],
          }),
          pergunta({
            id: 'qual-area',
            enunciado: 'Qual área?',
            tipo: 'texto_curto',
            obrigatoria: true,
            visivelSe: {
              perguntaId: 'tem-interesse',
              operador: 'igual',
              valor: 'Sim',
            },
          }),
        ],
      });
      await expect(
        service.validarRespostas('apadrinhado', CICLO, {
          'tem-interesse': 'Não',
        }),
      ).resolves.toMatchObject({ versao: 1 });
      await expect(
        service.validarRespostas('apadrinhado', CICLO, {
          'tem-interesse': 'Sim',
        }),
      ).rejects.toThrow(/Qual área/);
      await expect(
        service.validarRespostas('apadrinhado', CICLO, {
          'tem-interesse': 'Não',
          'qual-area': 'Cálculo',
        }),
      ).rejects.toThrow(/oculta/);
    });
  });

  describe('duplicação', () => {
    const duplicar = (corpo: Record<string, unknown> = {}) =>
      service.duplicar('apadrinhado', {
        programaOrigem: CICLO,
        programaDestino: OUTRO,
        ...corpo,
      });

    it('copia as perguntas para o destino como novo rascunho, sem mexer na origem', async () => {
      await salvar({
        publicado: true,
        perguntas: [pergunta({ ajuda: 'Dica', secao: 'Rotina' })],
      });
      const copia = await duplicar();
      expect(copia).toMatchObject({
        programa: OUTRO,
        status: 'rascunho',
        versao: 0,
        salvo: true,
      });
      expect(copia.perguntas).toEqual(
        (await service.obter('apadrinhado', CICLO)).perguntas,
      );
      expect(await service.obter('apadrinhado', CICLO)).toMatchObject({
        status: 'publicado',
        versao: 1,
      });
    });

    it('recusa destino ausente, igual à origem, inexistente ou já com formulário', async () => {
      await expect(duplicar({ programaDestino: ' ' })).rejects.toThrow(
        /destino/,
      );
      await expect(duplicar({ programaDestino: CICLO })).rejects.toThrow(
        /diferente/,
      );
      await expect(duplicar({ programaDestino: '1900/1' })).rejects.toThrow(
        /não cadastrado/,
      );
      await service.salvar('apadrinhado', { programa: OUTRO, perguntas: [] });
      await expect(duplicar()).rejects.toThrow(/já tem formulário/);
      expect(registros).toHaveLength(1);
    });
  });

  describe('exclusão', () => {
    it('exclui rascunho nunca publicado', async () => {
      await salvar();
      const depois = await service.excluir('apadrinhado', CICLO);
      expect(depois.salvo).toBe(false);
      expect(registros).toHaveLength(0);
    });

    it('não exclui formulário publicado, encerrado ou já publicado alguma vez', async () => {
      await salvar({ publicado: true });
      await expect(service.excluir('apadrinhado', CICLO)).rejects.toThrow(
        /nunca foram publicados/,
      );
      await salvar({ publicado: false });
      await expect(service.excluir('apadrinhado', CICLO)).rejects.toThrow(
        /nunca foram publicados/,
      );
      await salvar({ publicado: true });
      await service.encerrar('apadrinhado', CICLO);
      await expect(service.excluir('apadrinhado', CICLO)).rejects.toThrow(
        /nunca foram publicados/,
      );
      expect(registros).toHaveLength(1);
    });
  });
});
