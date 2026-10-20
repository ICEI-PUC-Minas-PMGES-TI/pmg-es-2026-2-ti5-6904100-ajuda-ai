import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import type { DataSource, EntityManager } from 'typeorm';
import { CriterioCatalogoService } from './criterio-catalogo.service.js';
import {
  MatchingCriterioEntity,
  MatchingCriterioVersaoEntity,
} from './entities/criterio-catalogo.entity.js';
import { MatchingConfiguracaoEntity } from './entities/matching.entity.js';
import { FormularioEntity } from '../formularios/entities/formulario.entity.js';

type Registro = Record<string, unknown> & { id?: number };

function repoMemoria<T extends Registro>(linhas: T[]) {
  let seq = Math.max(0, ...linhas.map((l) => Number(l.id) || 0));
  const api = {
    find: async (opts?: {
      where?: Record<string, unknown> | Array<Record<string, unknown>>;
      order?: Record<string, 'ASC' | 'DESC'>;
    }) => {
      let lista = [...linhas];
      const where = opts?.where;
      if (Array.isArray(where)) {
        lista = lista.filter((item) =>
          where.some((w) => Object.entries(w).every(([k, v]) => item[k] === v)),
        );
      } else if (where) {
        lista = lista.filter((item) =>
          Object.entries(where).every(([k, v]) => item[k] === v),
        );
      }
      if (opts?.order) {
        const [[campo, dir]] = Object.entries(opts.order);
        lista.sort((a, b) => {
          const va = a[campo] as number | string;
          const vb = b[campo] as number | string;
          if (va === vb) return 0;
          const cmp = va > vb ? 1 : -1;
          return dir === 'DESC' ? -cmp : cmp;
        });
      }
      return lista;
    },
    findOne: async (opts: {
      where: Record<string, unknown>;
      order?: Record<string, 'ASC' | 'DESC'>;
    }) => {
      const lista = await api.find(opts);
      return lista[0] ?? null;
    },
    findOneOrFail: async (opts: {
      where: Record<string, unknown>;
      order?: Record<string, 'ASC' | 'DESC'>;
    }) => {
      const achado = await api.findOne(opts);
      if (!achado) throw new Error('not found');
      return achado;
    },
    create: (dados: T) => ({ ...dados }),
    save: async (dados: T | T[]) => {
      const itens = Array.isArray(dados) ? dados : [dados];
      for (const item of itens) {
        if (item.id == null) {
          seq += 1;
          item.id = seq;
          linhas.push(item);
        } else {
          const idx = linhas.findIndex((l) => l.id === item.id);
          if (idx >= 0) linhas[idx] = item;
          else linhas.push(item);
        }
      }
      return Array.isArray(dados) ? itens : itens[0];
    },
    delete: async (crit: Record<string, unknown> | number) => {
      if (typeof crit === 'number') {
        const idx = linhas.findIndex((l) => l.id === crit);
        if (idx >= 0) linhas.splice(idx, 1);
        return;
      }
      for (let i = linhas.length - 1; i >= 0; i -= 1) {
        if (Object.entries(crit).every(([k, v]) => linhas[i][k] === v))
          linhas.splice(i, 1);
      }
    },
  };
  return api;
}

describe('CriterioCatalogoService', () => {
  let criterios: MatchingCriterioEntity[];
  let versoes: MatchingCriterioVersaoEntity[];
  let formularios: FormularioEntity[];
  let configs: MatchingConfiguracaoEntity[];
  let service: CriterioCatalogoService;

  beforeEach(() => {
    criterios = [];
    versoes = [];
    formularios = [];
    configs = [];
    const repos = new Map<unknown, unknown>([
      [MatchingCriterioEntity, repoMemoria(criterios as Registro[])],
      [MatchingCriterioVersaoEntity, repoMemoria(versoes as Registro[])],
      [FormularioEntity, repoMemoria(formularios as Registro[])],
      [MatchingConfiguracaoEntity, repoMemoria(configs as Registro[])],
    ]);
    const manager = {
      getRepository: (entity: unknown) => repos.get(entity),
    } as EntityManager;
    const dados = {
      manager,
      getRepository: (entity: unknown) => repos.get(entity),
      transaction: async <T>(fn: (m: EntityManager) => Promise<T>) =>
        fn(manager),
    } as unknown as DataSource;
    service = new CriterioCatalogoService(dados);
  });

  it('cria critério Sim/Não com alternativas booleanas estáveis', async () => {
    const criado = await service.criar(
      {
        nome: 'Condição de bolsista',
        enunciadoPadrao: 'Você é bolsista?',
        tipo: 'sim_nao',
      },
      'coord@pucminas.edu.br',
    );
    expect(criado.nome).toBe('Condição de bolsista');
    expect(criado.versao?.tipo).toBe('sim_nao');
    expect(criado.versao?.alternativas).toEqual([
      { id: 'true', rotulo: 'Sim' },
      { id: 'false', rotulo: 'Não' },
    ]);
  });

  it('recusa nome duplicado e alternativas vazias/duplicadas', async () => {
    await service.criar(
      {
        nome: 'Áreas de apoio',
        enunciadoPadrao: 'Quais áreas?',
        tipo: 'multipla_escolha',
        alternativas: [{ rotulo: 'Acadêmico' }, { rotulo: 'Pessoal' }],
      },
      'coord@pucminas.edu.br',
    );
    await expect(
      service.criar(
        {
          nome: 'areas de apoio',
          enunciadoPadrao: 'Quais áreas?',
          tipo: 'multipla_escolha',
          alternativas: [{ rotulo: 'X' }],
        },
        'coord@pucminas.edu.br',
      ),
    ).rejects.toBeInstanceOf(ConflictException);

    await expect(
      service.criar(
        {
          nome: 'Categoria',
          enunciadoPadrao: 'Escolha',
          tipo: 'escolha_unica',
          alternativas: [],
        },
        'coord@pucminas.edu.br',
      ),
    ).rejects.toBeInstanceOf(BadRequestException);

    await expect(
      service.criar(
        {
          nome: 'Interesses',
          enunciadoPadrao: 'Marque',
          tipo: 'multipla_escolha',
          alternativas: [{ rotulo: 'A' }, { rotulo: 'a' }],
        },
        'coord@pucminas.edu.br',
      ),
    ).rejects.toThrow(/duplicada/i);
  });

  it('sugere semelhantes sem fundir automaticamente', async () => {
    await service.criar(
      {
        nome: 'Bolsista ProUni',
        enunciadoPadrao: 'É bolsista?',
        tipo: 'sim_nao',
      },
      'coord@pucminas.edu.br',
    );
    const sugestoes = await service.sugerirSemelhantes('Bolsista');
    expect(sugestoes.some((s) => s.nome === 'Bolsista ProUni')).toBe(true);
  });

  it('versiona mudança estrutural quando já há uso e preserva versão antiga', async () => {
    const criado = await service.criar(
      {
        nome: 'Turno preferido',
        enunciadoPadrao: 'Qual turno?',
        tipo: 'escolha_unica',
        alternativas: [{ rotulo: 'Manhã' }, { rotulo: 'Noite' }],
      },
      'coord@pucminas.edu.br',
    );
    formularios.push({
      id: 1,
      programa: '2026/2',
      tipo: 'padrinho',
      versao: 1,
      perguntas: [
        {
          id: 'q1',
          enunciado: 'Qual turno?',
          tipo: 'escolha_unica',
          criterioId: criado.id,
          criterioVersao: 1,
          alternativas: criado.versao!.alternativas,
        },
      ],
    } as FormularioEntity);

    const atualizado = await service.atualizar(
      criado.id,
      {
        tipo: 'multipla_escolha',
        alternativas: [
          { id: criado.versao!.alternativas[0].id, rotulo: 'Manhã' },
          { id: criado.versao!.alternativas[1].id, rotulo: 'Noite' },
          { rotulo: 'Tarde' },
        ],
      },
      'coord@pucminas.edu.br',
    );
    expect(atualizado.versaoAtual).toBe(2);
    expect(atualizado.versoes).toHaveLength(2);
    expect(atualizado.versoes![1].versao).toBe(1);
    expect(atualizado.versoes![1].tipo).toBe('escolha_unica');
  });

  it.each(['adicionar', 'remover'])(
    'preserva a versão em uso ao %s alternativa e editar o enunciado juntos',
    async (operacao) => {
      const criado = await service.criar(
        {
          nome: 'Turno preferido',
          enunciadoPadrao: 'Qual turno?',
          tipo: 'escolha_unica',
          alternativas: [{ rotulo: 'Manhã' }, { rotulo: 'Noite' }],
        },
        'coord@pucminas.edu.br',
      );
      const original = structuredClone(criado.versao!);
      configs.push({
        id: 1,
        criterios: [{ criterioPadrinhoId: criado.id }],
      } as MatchingConfiguracaoEntity);
      const alternativas =
        operacao === 'adicionar'
          ? [...original.alternativas, { rotulo: 'Tarde' }]
          : original.alternativas.slice(0, 1);

      const atualizado = await service.atualizar(
        criado.id,
        { enunciadoPadrao: 'Em qual turno prefere participar?', alternativas },
        'coord@pucminas.edu.br',
      );

      expect(atualizado.versaoAtual).toBe(2);
      expect(atualizado.versao).toMatchObject({
        versao: 2,
        enunciadoPadrao: 'Em qual turno prefere participar?',
        alternativas: expect.any(Array),
      });
      expect(atualizado.versao!.alternativas).toHaveLength(alternativas.length);
      expect(atualizado.versoes!.find((v) => v.versao === 1)).toEqual(original);
    },
  );

  it('mantém a versão ao editar apenas enunciado e rótulos de alternativas', async () => {
    const criado = await service.criar(
      {
        nome: 'Turno preferido',
        enunciadoPadrao: 'Qual turno?',
        tipo: 'escolha_unica',
        alternativas: [{ rotulo: 'Manhã' }],
      },
      'coord@pucminas.edu.br',
    );
    configs.push({
      id: 1,
      criterios: [{ criterioPadrinhoId: criado.id }],
    } as MatchingConfiguracaoEntity);
    const atualizado = await service.atualizar(
      criado.id,
      {
        enunciadoPadrao: 'Em qual turno prefere participar?',
        alternativas: [
          { id: criado.versao!.alternativas[0].id, rotulo: 'Matutino' },
        ],
      },
      'coord@pucminas.edu.br',
    );
    expect(atualizado.versaoAtual).toBe(1);
    expect(atualizado.versoes).toHaveLength(1);
    expect(atualizado.versao!.alternativas[0].rotulo).toBe('Matutino');
  });

  it('impede exclusão física com dependências e permite desativar', async () => {
    const criado = await service.criar(
      {
        nome: 'De outra cidade',
        enunciadoPadrao: 'Mora em outra cidade?',
        tipo: 'sim_nao',
      },
      'coord@pucminas.edu.br',
    );
    configs.push({
      id: 1,
      criterios: [
        {
          criterioPadrinhoId: criado.id,
          criterioApadrinhadoId: criado.id,
          operacao: 'igualdade',
          peso: 10,
        },
      ],
    } as MatchingConfiguracaoEntity);

    await expect(service.excluir(criado.id)).rejects.toBeInstanceOf(
      ConflictException,
    );
    const desativado = await service.desativar(
      criado.id,
      false,
      'coord@pucminas.edu.br',
    );
    expect(desativado.ativo).toBe(false);
  });

  it('exclui critério sem usos', async () => {
    const criado = await service.criar(
      {
        nome: 'Temporário',
        enunciadoPadrao: 'Temporário?',
        tipo: 'sim_nao',
      },
      'coord@pucminas.edu.br',
    );
    await expect(service.excluir(criado.id)).resolves.toEqual({ ok: true });
    await expect(service.obter(criado.id)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
