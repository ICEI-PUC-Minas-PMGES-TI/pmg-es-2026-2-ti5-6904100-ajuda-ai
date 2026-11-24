import { randomUUID } from 'node:crypto';
import { DataSource } from 'typeorm';
import { ENTIDADES_MATCHING } from '../../src/matching/matching.module.js';
import { ENTIDADES_CHAT } from '../../src/chat/chat.module.js';
import { ProgramaEntity } from '../../src/programas/entities/programa.entity.js';
import { ParticipacaoEntity } from '../../src/participacoes/entities/participacao.entity.js';
import { FormularioEntity } from '../../src/formularios/entities/formulario.entity.js';
import { PublicacaoEntity } from '../../src/publicacoes/entities/publicacao.entity.js';
import { ComentarioEntity } from '../../src/publicacoes/entities/comentario.entity.js';
import { CurtidaEntity } from '../../src/publicacoes/entities/curtida.entity.js';
import { CurtidaComentarioEntity } from '../../src/publicacoes/entities/curtida-comentario.entity.js';
import { FeedOutboxEntity } from '../../src/publicacoes/entities/feed-outbox.entity.js';
import { BaselineFeed1791900000000 } from '../../src/migrations/1791900000000-BaselineFeed.js';
import { UsuariosERequisitosPadrinho1791944105933 } from '../../src/migrations/1791944105933-UsuariosERequisitosPadrinho.js';
import { VersoesEEncerramentoFormularios1792400000000 } from '../../src/migrations/1792400000000-VersoesEEncerramentoFormularios.js';
import { MatchingF11F121792500000000 } from '../../src/migrations/1792500000000-MatchingF11F12.js';
import { CatalogoCriteriosMatching1792600000000 } from '../../src/migrations/1792600000000-CatalogoCriteriosMatching.js';
import { CriaChats1792700000000 } from '../../src/migrations/1792700000000-CriaChats.js';
import { VerificacaoAcademicaParticipacoes1792700000000 } from '../../src/migrations/1792700000000-VerificacaoAcademicaParticipacoes.js';
import { MatchingManualVinculoOrigem1792800000000 } from '../../src/migrations/1792800000000-MatchingManualVinculoOrigem.js';
import { FeedTempoReal1793300000000 } from '../../src/migrations/1793300000000-FeedTempoReal.js';
import { ThreadsComentariosFeed1793400000000 } from '../../src/migrations/1793400000000-ThreadsComentariosFeed.js';
import { FeedPorCiclo1793900000000 } from '../../src/migrations/1793900000000-FeedPorCiclo.js';
import { DecisoesParesMatching1794300000000 } from '../../src/migrations/1794300000000-DecisoesParesMatching.js';
import { GruposTransferenciasMatching1794400000000 } from '../../src/migrations/1794400000000-GruposTransferenciasMatching.js';
import { ChatGruposAcesso1794500000000 } from '../../src/migrations/1794500000000-ChatGruposAcesso.js';
import { ChatService } from '../../src/chat/chat.service.js';
import { MatchingService } from '../../src/matching/matching.service.js';
import { VinculosService } from '../../src/matching/vinculos.service.js';
import { ParticipacoesService } from '../../src/participacoes/participacoes.service.js';

export function servicosMatching(dados: DataSource) {
  const chat = new ChatService(dados),
    matching = new MatchingService(dados, chat);
  return {
    chat,
    matching,
    operacoes: new VinculosService(dados, matching, chat),
  };
}
export async function semearCenarioMatching(
  dados: DataSource,
  capacidade = 3,
  qtdP = 2,
  qtdA = 3,
) {
  const servicos = servicosMatching(dados);
  const programa = await dados
    .getRepository(ProgramaEntity)
    .save({
      codigo: ParticipacoesService.programaAtual(),
      titulo: 'Teste isolado',
      etapaAtual: 'formacao',
      inscricoesAbertas: false,
      formularioPublicado: true,
      matchingPendente: false,
      vagasApadrinhados: 20,
      gruposPrevistos: 3,
    });
  const p = await dados
    .getRepository(ParticipacaoEntity)
    .save(
      Array.from({ length: qtdP }, (_, i) => ({
        usuarioId: `p${i}@teste.local`,
        programa: programa.codigo,
        papel: 'candidato' as const,
        status: 'aprovado' as const,
        grupo: null,
        apadrinhados: 0,
        respostas: { nome: `Padrinho ${i}`, periodo: 4, areas: ['Tecnologia'] },
      })),
    );
  const a = await dados
    .getRepository(ParticipacaoEntity)
    .save(
      Array.from({ length: qtdA }, (_, i) => ({
        usuarioId: `a${i}@teste.local`,
        programa: programa.codigo,
        papel: 'apadrinhado' as const,
        status: 'em_andamento' as const,
        grupo: null,
        apadrinhados: 0,
        respostas: { nome: `Aluno ${i}`, periodo: 1, areas: ['Tecnologia'] },
      })),
    );
  await servicos.matching.salvarConfiguracao(
    {
      programa: programa.codigo,
      versaoBase: 0,
      liberado: true,
      capacidadePorPadrinho: capacidade,
      capacidadePorApadrinhado: 1,
      criterios: [
        { campoCadastro: 'areas', operacao: 'intersecao', peso: 100 },
      ],
    },
    'coord@teste.local',
  );
  return { programa, p, a, ...servicos };
}

export const MIGRACOES_ANTES_MATCHING_NOVO = [
  BaselineFeed1791900000000,
  UsuariosERequisitosPadrinho1791944105933,
  VersoesEEncerramentoFormularios1792400000000,
  MatchingF11F121792500000000,
  CatalogoCriteriosMatching1792600000000,
  CriaChats1792700000000,
  VerificacaoAcademicaParticipacoes1792700000000,
  MatchingManualVinculoOrigem1792800000000,
  FeedTempoReal1793300000000,
  ThreadsComentariosFeed1793400000000,
  FeedPorCiclo1793900000000,
];
export const MIGRACOES_MATCHING_NOVO = [
  DecisoesParesMatching1794300000000,
  GruposTransferenciasMatching1794400000000,
  ChatGruposAcesso1794500000000,
];
export const ENTIDADES_TESTE_MATCHING = [
  ...new Set([
    ProgramaEntity,
    ParticipacaoEntity,
    FormularioEntity,
    ...ENTIDADES_MATCHING,
    ...ENTIDADES_CHAT,
    PublicacaoEntity,
    ComentarioEntity,
    CurtidaEntity,
    CurtidaComentarioEntity,
    FeedOutboxEntity,
  ]),
];

/** Nunca usa o schema da aplicação: cria e remove somente um nome aleatório de teste. */
export async function bancoMatchingIsolado(migrarNovas = true) {
  const url = process.env.MATCHING_TEST_DB_URL;
  if (!url || process.env.MATCHING_TEST_DB_ISOLATED !== 'true')
    throw new Error(
      'Informe MATCHING_TEST_DB_URL e MATCHING_TEST_DB_ISOLATED=true para o banco de teste.',
    );
  const schema = `matching_test_${randomUUID().replaceAll('-', '')}`;
  const migracoes = [
    ...MIGRACOES_ANTES_MATCHING_NOVO,
    ...(migrarNovas ? MIGRACOES_MATCHING_NOVO : []),
  ];
  const criarFonte = () =>
    new DataSource({
      type: 'postgres',
      url,
      schema,
      entities: ENTIDADES_TESTE_MATCHING,
      synchronize: false,
      migrationsRun: false,
      installExtensions: false,
      migrations: migracoes,
      extra: {
        max: 5,
        connectionTimeoutMillis: 10_000,
        options: '-c lock_timeout=5000 -c statement_timeout=20000',
      },
    });
  const dados = criarFonte();
  let outra: DataSource | undefined;
  await dados.initialize();
  const limpar = async () => {
    if (!/^matching_test_[a-f0-9]{32}$/.test(schema))
      throw new Error('Schema de teste inválido.');
    if (outra?.isInitialized) await outra.destroy();
    if (dados.isInitialized) {
      await dados.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
      await dados.destroy();
    }
  };
  try {
    await dados.query(`CREATE SCHEMA "${schema}"`);
    await dados.runMigrations({ transaction: 'all' });
    outra = criarFonte();
    const aplicarNovas = async () => {
      const fonte = new DataSource({
        ...dados.options,
        migrations: [
          ...MIGRACOES_ANTES_MATCHING_NOVO,
          ...MIGRACOES_MATCHING_NOVO,
        ],
      });
      await fonte.initialize();
      try {
        return await fonte.runMigrations({ transaction: 'all' });
      } finally {
        await fonte.destroy();
      }
    };
    return { dados, schema, outra, limpar, aplicarNovas };
  } catch (erro) {
    await limpar();
    throw erro;
  }
}
