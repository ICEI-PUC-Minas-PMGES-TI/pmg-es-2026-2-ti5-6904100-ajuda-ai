import { DataSource } from 'typeorm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { FormularioEntity } from '../src/formularios/entities/formulario.entity.js';
import {
  MatchingChatOutboxEntity,
  MatchingConfiguracaoEntity,
  MatchingDecisaoEntity,
  MatchingExecucaoEntity,
  MatchingSugestaoEntity,
  MatchingVinculoEntity,
} from '../src/matching/entities/matching.entity.js';
import { MatchingService } from '../src/matching/matching.service.js';
import { ParticipacaoEntity } from '../src/participacoes/entities/participacao.entity.js';
import { ProgramaEntity } from '../src/programas/entities/programa.entity.js';

const URL_TESTE = process.env.MATCHING_TEST_DB_URL;

describe.skipIf(!URL_TESTE)('Matching com PostgreSQL real', () => {
  let dados: DataSource;
  let matching: MatchingService;
  const codigo = `MT-${Date.now()}`;

  beforeAll(async () => {
    dados = new DataSource({
      type: 'postgres',
      url: URL_TESTE,
      schema: 'feed',
      entities: [
        ProgramaEntity,
        ParticipacaoEntity,
        FormularioEntity,
        MatchingConfiguracaoEntity,
        MatchingExecucaoEntity,
        MatchingSugestaoEntity,
        MatchingDecisaoEntity,
        MatchingVinculoEntity,
        MatchingChatOutboxEntity,
      ],
      synchronize: false,
    });
    await dados.initialize();
    matching = new MatchingService(dados);
  });

  afterAll(async () => {
    if (!dados?.isInitialized) return;
    const programa = await dados.getRepository(ProgramaEntity).findOne({
      where: { codigo },
    });
    if (programa) {
      await dados
        .getRepository(MatchingChatOutboxEntity)
        .delete({ programaId: programa.id });
      const sugestoes = await dados
        .getRepository(MatchingSugestaoEntity)
        .find({ where: { programaId: programa.id } });
      if (sugestoes.length) {
        await dados
          .getRepository(MatchingDecisaoEntity)
          .delete(sugestoes.map((s) => ({ sugestaoId: s.id })));
        await dados
          .getRepository(MatchingSugestaoEntity)
          .update({ programaId: programa.id }, { vinculoId: null });
        await dados
          .getRepository(MatchingVinculoEntity)
          .update({ programaId: programa.id }, { sugestaoId: null });
      }
      await dados
        .getRepository(MatchingVinculoEntity)
        .delete({ programaId: programa.id });
      await dados
        .getRepository(MatchingSugestaoEntity)
        .delete({ programaId: programa.id });
      await dados
        .getRepository(MatchingExecucaoEntity)
        .delete({ programaId: programa.id });
      await dados
        .getRepository(MatchingConfiguracaoEntity)
        .delete({ programaId: programa.id });
      await dados
        .getRepository(ParticipacaoEntity)
        .delete({ programa: codigo });
      await dados.getRepository(FormularioEntity).delete({ programa: codigo });
      await dados.getRepository(ProgramaEntity).delete(programa.id);
    }
    await dados.destroy();
  });

  it('serializa aprovações pela última vaga e mantém efeitos idempotentes', async () => {
    const programa = await dados.getRepository(ProgramaEntity).save({
      codigo,
      titulo: codigo,
      etapaAtual: 'formacao',
      inscricoesAbertas: false,
      formularioPublicado: true,
      matchingPendente: false,
      vagasApadrinhados: 10,
      gruposPrevistos: 2,
    });
    const participacoes = await dados.getRepository(ParticipacaoEntity).save([
      {
        usuarioId: `p1-${codigo}@teste`,
        programa: codigo,
        papel: 'candidato',
        status: 'aprovado',
        grupo: null,
        apadrinhados: 0,
        respostas: { nome: 'Padrinho 1', areas: ['Acadêmico'] },
      },
      {
        usuarioId: `p2-${codigo}@teste`,
        programa: codigo,
        papel: 'candidato',
        status: 'aprovado',
        grupo: null,
        apadrinhados: 0,
        respostas: { nome: 'Padrinho 2', areas: ['Acadêmico'] },
      },
      {
        usuarioId: `a-${codigo}@teste`,
        programa: codigo,
        papel: 'apadrinhado',
        status: 'em_andamento',
        grupo: null,
        apadrinhados: 0,
        respostas: { nome: 'Apadrinhado', areas: ['Acadêmico'] },
      },
      {
        usuarioId: `a2-${codigo}@teste`,
        programa: codigo,
        papel: 'apadrinhado',
        status: 'em_andamento',
        grupo: null,
        apadrinhados: 0,
        respostas: { nome: 'Apadrinhado 2', areas: ['Acadêmico'] },
      },
    ]);
    await matching.salvarConfiguracao(
      {
        programa: codigo,
        liberado: true,
        capacidadePorPadrinho: 2,
        capacidadePorApadrinhado: 1,
        criterios: [
          {
            campoPadrinho: 'areas',
            campoApadrinhado: 'areas',
            operacao: 'intersecao',
            peso: 100,
          },
        ],
      },
      'coord@teste',
    );
    const execucao = await matching.executar(codigo, 'coord@teste');
    expect(
      await dados
        .getRepository(MatchingVinculoEntity)
        .count({ where: { programaId: programa.id } }),
    ).toBe(0);

    const primeira = await dados
      .getRepository(MatchingSugestaoEntity)
      .findOneOrFail({
        where: { execucaoId: execucao.id },
        order: { apadrinhadoParticipacaoId: 'ASC' },
      });
    const padrinhoAlternativo = participacoes.find(
      (p) =>
        p.papel === 'candidato' && p.id !== primeira.padrinhoParticipacaoId,
    )!;
    const segunda = await dados.getRepository(MatchingSugestaoEntity).save({
      programaId: programa.id,
      execucaoId: execucao.id,
      padrinhoParticipacaoId: padrinhoAlternativo.id,
      apadrinhadoParticipacaoId: primeira.apadrinhadoParticipacaoId,
      status: 'pendente',
      score: '1.0000',
      explicacao: primeira.explicacao,
      decididaPor: null,
      decididaEm: null,
      motivoDecisao: null,
      vinculoId: null,
    });

    const resultados = await Promise.allSettled([
      matching.aprovar(primeira.id, 'coord-a@teste'),
      matching.aprovar(segunda.id, 'coord-b@teste'),
    ]);
    expect(resultados.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(resultados.filter((r) => r.status === 'rejected')).toHaveLength(1);

    const vinculos = await dados
      .getRepository(MatchingVinculoEntity)
      .find({ where: { programaId: programa.id, ativo: true } });
    expect(vinculos).toHaveLength(1);
    const aprovada = await dados
      .getRepository(MatchingSugestaoEntity)
      .findOneByOrFail({ vinculoId: vinculos[0].id });
    await matching.aprovar(aprovada.id, 'coord-a@teste');
    expect(
      await dados
        .getRepository(MatchingVinculoEntity)
        .count({ where: { programaId: programa.id, ativo: true } }),
    ).toBe(1);
    const recusada = primeira.id === aprovada.id ? segunda : primeira;
    await matching.recusar(
      recusada.id,
      'coord-b@teste',
      'Alternativa não usada',
    );
    expect(
      await dados
        .getRepository(ParticipacaoEntity)
        .findOneByOrFail({ id: recusada.padrinhoParticipacaoId }),
    ).toMatchObject(
      recusada.padrinhoParticipacaoId === aprovada.padrinhoParticipacaoId
        ? { status: 'em_andamento' }
        : { status: 'aprovado' },
    );

    const outroApadrinhado = participacoes.find(
      (p) =>
        p.papel === 'apadrinhado' &&
        p.id !== aprovada.apadrinhadoParticipacaoId,
    )!;
    let sugestaoGrupo = await dados
      .getRepository(MatchingSugestaoEntity)
      .findOneBy({
        execucaoId: execucao.id,
        padrinhoParticipacaoId: aprovada.padrinhoParticipacaoId,
        apadrinhadoParticipacaoId: outroApadrinhado.id,
      });
    sugestaoGrupo ??= await dados.getRepository(MatchingSugestaoEntity).save({
      programaId: programa.id,
      execucaoId: execucao.id,
      padrinhoParticipacaoId: aprovada.padrinhoParticipacaoId,
      apadrinhadoParticipacaoId: outroApadrinhado.id,
      status: 'pendente',
      score: '1.0000',
      explicacao: primeira.explicacao,
      decididaPor: null,
      decididaEm: null,
      motivoDecisao: null,
      vinculoId: null,
    });
    await matching.aprovar(sugestaoGrupo.id, 'coord-a@teste');
    expect(
      await dados
        .getRepository(MatchingChatOutboxEntity)
        .count({ where: { programaId: programa.id } }),
    ).toBe(3);
    expect(
      await dados
        .getRepository(ParticipacaoEntity)
        .findOneByOrFail({ id: aprovada.padrinhoParticipacaoId }),
    ).toMatchObject({
      papel: 'padrinho',
      status: 'em_andamento',
      apadrinhados: 2,
    });
  });
});
