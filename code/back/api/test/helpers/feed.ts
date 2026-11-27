import type { DataSource, Repository } from 'typeorm';
import type { AccessTokenPayload } from '../../src/auth/authenticated-request.js';
import { PublicacaoEntity } from '../../src/publicacoes/entities/publicacao.entity.js';
import { PublicacoesService } from '../../src/publicacoes/publicacoes.service.js';
import { PermissoesAlunoService } from '../../src/participacoes/permissoes-aluno.service.js';
import { FeedPolicy } from '../../src/publicacoes/feed-policy.js';
import type { UsuariosService } from '../../src/usuarios/usuarios.service.js';
import type { FeedMidiasService } from '../../src/publicacoes/feed-midias.service.js';
import { ParticipacoesService } from '../../src/participacoes/participacoes.service.js';
import { ProgramasService } from '../../src/programas/programas.service.js';
import { buscarUsuarioPorEmail } from '../../src/dados/dados.js';

export const coordenador: AccessTokenPayload = {
  sub: '3',
  email: 'renata@pucminas.edu.br',
  perfil: 'coordenador',
  escopo: 'acesso',
};
export const aluno: AccessTokenPayload = {
  sub: '1',
  email: 'camila@pucminas.edu.br',
  perfil: 'apadrinhado',
  escopo: 'acesso',
};

export const padrinho: AccessTokenPayload = {
  sub: '2',
  email: 'pedro@pucminas.edu.br',
  perfil: 'padrinho',
  escopo: 'acesso',
};

export const somenteMapa: AccessTokenPayload = {
  sub: '4',
  email: 'mapa@pucminas.edu.br',
  perfil: 'nenhuma',
  escopo: 'acesso',
};

/** Banco isolado para testes de transação e contrato HTTP; integração PG testa locks reais. */
export function criarFeedTeste() {
  const programa = ParticipacoesService.programaAtual();
  const tabelas: Record<string, any[]> = {
    ProgramaEntity: [{ codigo: programa, etapaAtual: 'andamento' }],
    ParticipacaoEntity: [
      {
        id: 1,
        usuarioId: padrinho.email,
        programa,
        papel: 'padrinho',
        status: 'em_andamento',
        grupo: 'Grupo 01',
        terminoEm: null,
      },
      {
        id: 2,
        usuarioId: aluno.email,
        programa,
        papel: 'apadrinhado',
        status: 'em_andamento',
        grupo: 'Grupo 01',
        terminoEm: null,
      },
    ],
    PublicacaoEntity: [],
    ComentarioEntity: [],
    CurtidaEntity: [],
    CurtidaComentarioEntity: [],
    FeedOutboxEntity: [],
  };
  const repos: Record<string, any> = {};
  // `where` pode ser um objeto ou uma lista de objetos (OR), com In e IsNull.
  const corresponde = (v: any, where: any): boolean =>
    Array.isArray(where)
      ? where.some((w) => corresponde(v, w))
      : Object.entries(where ?? {}).every(([k, val]: [string, any]) =>
          val?._type === 'in'
            ? val._value.includes(v[k])
            : val?._type === 'isNull'
              ? v[k] == null
              : v[k] === val,
        );
  const completar = (v: any, relacoes: unknown) => {
    if (v && relacoes)
      return {
        ...v,
        curtidas: tabelas.CurtidaEntity.filter((c) => c.publicacaoId === v.id),
        comentarios: tabelas.ComentarioEntity.filter(
          (c) => c.publicacaoId === v.id,
        ),
      };
    return v;
  };
  for (const nome of Object.keys(tabelas))
    repos[nome] = {
      create: (v: any) => ({ ...v }),
      save: async (v: any) => {
        v.id ||= tabelas[nome].length + 1;
        v.criadoEm ||= new Date();
        const index = tabelas[nome].findIndex((p) => p.id === v.id);
        if (index < 0) tabelas[nome].push(v);
        else tabelas[nome][index] = v;
        return v;
      },
      find: async (opts: any = {}) =>
        tabelas[nome]
          .filter((v) => corresponde(v, opts.where))
          .map((v) => completar(v, opts.relations)),
      findOne: async (opts: any) =>
        completar(
          tabelas[nome].find((v) => corresponde(v, opts.where)) ?? null,
          opts.relations,
        ),
      remove: async (v: any) => {
        tabelas[nome] = tabelas[nome].filter((p) => p.id !== v.id);
        if (nome === 'ComentarioEntity') {
          const ids = [
            v.id,
            ...tabelas.ComentarioEntity.filter((c) => c.paiId === v.id).map(
              (c) => c.id,
            ),
          ];
          tabelas.ComentarioEntity = tabelas.ComentarioEntity.filter(
            (c) => !ids.includes(c.id),
          );
          tabelas.CurtidaComentarioEntity =
            tabelas.CurtidaComentarioEntity.filter(
              (c) => !ids.includes(c.comentarioId),
            );
        }
        return v;
      },
    };
  const manager = {
    getRepository: (entity: { name: string }) => repos[entity.name],
  };
  const dados = {
    getRepository: manager.getRepository,
    transaction: async (acao: any) => {
      const snapshot = structuredClone(tabelas);
      try {
        return await acao(manager);
      } catch (e) {
        Object.assign(tabelas, snapshot);
        throw e;
      }
    },
  } as unknown as DataSource;
  const midias = {
    fotoAutor: async () => null,
    validar: async () => {},
    urls: (chaves: string[]) => chaves,
  } as unknown as FeedMidiasService;
  const permissoes = new PermissoesAlunoService(
    new ParticipacoesService(repos.ParticipacaoEntity, repos.ProgramaEntity),
    new ProgramasService(repos.ProgramaEntity),
  );
  const policy = new FeedPolicy(permissoes);
  const service = new PublicacoesService(
    repos.PublicacaoEntity as Repository<PublicacaoEntity>,
    dados,
    policy,
    {
      buscarPorEmail: async (email: string) =>
        email === padrinho.email
          ? { id: 2, nome: 'Pedro Santos', email }
          : (buscarUsuarioPorEmail(email) ?? null),
      buscarAutoresPorEmails: async (emails: string[]) =>
        emails
          .filter((e) => e === aluno.email || e === padrinho.email)
          .map((email) => ({
            id: email === aluno.email ? 1 : 2,
            nome: email === aluno.email ? 'Camila Duarte' : 'Pedro Santos',
            email,
          })),
    } as unknown as UsuariosService,
    midias,
  );
  return { service, tabelas, repos, dados, midias, policy, permissoes };
}
