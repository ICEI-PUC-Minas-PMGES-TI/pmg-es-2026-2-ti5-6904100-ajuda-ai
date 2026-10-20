import type { ParticipacaoEntity } from '../participacoes/entities/participacao.entity.js';
import {
  respostasIndividuais,
  respostasPorPergunta,
} from './respostas-formulario.js';

const texto = {
  id: 'dificuldade',
  enunciado: 'Qual sua maior dificuldade?',
  tipo: 'texto_curto',
  opcoes: [],
  obrigatoria: true,
};
const apoio = {
  id: 'apoio',
  enunciado: 'Que apoio você quer?',
  tipo: 'checklist',
  opcoes: ['Acadêmico', 'Carreira'],
  obrigatoria: false,
};

function envio(
  id: number,
  usuarioId: string,
  extras: Record<string, string | string[]>,
  formulario?: { versao?: number; perguntas: unknown[] },
): ParticipacaoEntity {
  return {
    id,
    usuarioId,
    programa: '2099/1',
    papel: 'apadrinhado',
    status: 'pendente',
    criadoEm: new Date('2099-01-01'),
    respostas: {
      nome: `Aluno ${id}`,
      extras,
      ...(formulario
        ? {
            _servidor: {
              formulario: {
                id: 1,
                programa: '2099/1',
                atualizadoEm: null,
                ...formulario,
              },
            },
          }
        : {}),
    },
  } as ParticipacaoEntity;
}

describe('respostas de formulário', () => {
  const v1 = envio(
    1,
    'a@x.com',
    { dificuldade: 'Cálculo' },
    {
      versao: 1,
      perguntas: [texto],
    },
  );
  const v2 = envio(
    2,
    'b@x.com',
    { dificuldade: 'Física', apoio: ['Acadêmico', 'Carreira'] },
    {
      versao: 2,
      perguntas: [{ ...texto, enunciado: 'Seu maior desafio?' }, apoio],
    },
  );
  const v2b = envio(
    3,
    'c@x.com',
    { apoio: ['Carreira'] },
    {
      versao: 2,
      perguntas: [{ ...texto, enunciado: 'Seu maior desafio?' }, apoio],
    },
  );
  const semFormulario = envio(4, 'd@x.com', {});

  describe('individual', () => {
    it('liga cada resposta ao aluno e à versão respondida', () => {
      const [primeiro, segundo] = respostasIndividuais([v1, v2]);
      expect(primeiro).toMatchObject({
        usuarioId: 'a@x.com',
        nome: 'Aluno 1',
        versao: 1,
        respostas: [
          {
            perguntaId: 'dificuldade',
            enunciado: 'Qual sua maior dificuldade?',
            resposta: 'Cálculo',
          },
        ],
      });
      expect(segundo.versao).toBe(2);
      expect(segundo.respostas.map((r) => r.enunciado)).toEqual([
        'Seu maior desafio?',
        'Que apoio você quer?',
      ]);
    });

    it('marca pergunta não respondida como null e envio sem formulário sem versão', () => {
      const [sem, parcial] = respostasIndividuais([semFormulario, v2b]);
      expect(sem).toMatchObject({ versao: null, respostas: [] });
      expect(parcial.respostas[0].resposta).toBeNull();
      expect(parcial.respostas[1].resposta).toEqual(['Carreira']);
    });

    it('trata a foto sem versão (envio antigo) como versão 0', () => {
      const antigo = envio(
        5,
        'e@x.com',
        { dificuldade: 'x' },
        {
          perguntas: [texto],
        },
      );
      expect(respostasIndividuais([antigo])[0].versao).toBe(0);
    });
  });

  describe('por pergunta', () => {
    const grupos = respostasPorPergunta([v1, v2, v2b, semFormulario]);
    const porId = (id: string) => grupos.find((g) => g.perguntaId === id)!;

    it('agrupa pelo id da pergunta usando o enunciado da versão mais recente', () => {
      expect(grupos.map((g) => g.perguntaId).sort()).toEqual([
        'apoio',
        'dificuldade',
      ]);
      expect(porId('dificuldade')).toMatchObject({
        enunciado: 'Seu maior desafio?',
        versoes: [2, 1],
        total: 2,
      });
      expect(porId('dificuldade').respostas).toEqual([
        {
          usuarioId: 'b@x.com',
          nome: 'Aluno 2',
          versao: 2,
          resposta: 'Física',
        },
        {
          usuarioId: 'a@x.com',
          nome: 'Aluno 1',
          versao: 1,
          resposta: 'Cálculo',
        },
      ]);
    });

    it('conta as opções escolhidas e ignora quem não respondeu', () => {
      expect(porId('apoio')).toMatchObject({
        total: 2,
        contagem: { Acadêmico: 1, Carreira: 2 },
        versoes: [2],
      });
      expect(porId('dificuldade').contagem).toEqual({});
    });

    it('sem envios com formulário não há perguntas', () => {
      expect(respostasPorPergunta([semFormulario])).toEqual([]);
      expect(respostasPorPergunta([])).toEqual([]);
    });
  });
});
