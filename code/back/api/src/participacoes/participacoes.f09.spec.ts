import { cenarioMatching } from '../../test/helpers/matching-cenario.js';
import { NotFoundException } from '@nestjs/common';
import { conferirTudo } from '../../test/helpers/conferencia-academica.js';
import type {
  MatchingSugestaoEntity,
  MatchingVinculoEntity,
} from '../matching/entities/matching.entity.js';
import type { ProgramaEntity } from '../programas/entities/programa.entity.js';
import type { ParticipacaoEntity } from './entities/participacao.entity.js';
import { ParticipacoesService } from './participacoes.service.js';
import { serializarParticipacao } from './perfil.js';

const CICLO = ParticipacoesService.programaAtual();
const COORD = 'renata@pucminas.edu.br';
const MOTIVO = 'Matrícula trancada no sistema da faculdade.';

/** F09: conferência acadêmica antes da aprovação e vínculos antes de revogar. */
describe('ParticipacoesService — conferência acadêmica e vínculos (F09)', () => {
  let participacoes: ParticipacaoEntity[];
  let programas: ProgramaEntity[];
  let vinculos: MatchingVinculoEntity[];
  let sugestoes: MatchingSugestaoEntity[];
  let service: ParticipacoesService;

  beforeEach(() => {
    participacoes = [];
    programas = [
      {
        id: 1,
        codigo: CICLO,
        etapaAtual: 'formacao',
        matchingPendente: true,
      } as ProgramaEntity,
    ];
    vinculos = [];
    sugestoes = [];
    const c = cenarioMatching({
      participantes: participacoes,
      programas,
      vinculos,
      sugestoes,
    });
    service = new ParticipacoesService(
      c.repos.ParticipacaoEntity,
      c.repos.ProgramaEntity,
      c.dados,
      c.operacoes,
    );
  });

  const candidatar = () =>
    service.registrarCandidaturaPadrinho({
      usuarioId: 'veterano@pucminas.edu.br',
      programa: CICLO,
      respostas: { periodo: 4 },
    });

  const cadastrarCalouro = (usuarioId = 'calouro@pucminas.edu.br') =>
    service.cadastrarApadrinhado({
      usuarioId,
      programa: CICLO,
      respostas: { periodo: 1, declaraPrimeiroPeriodo: true },
    });

  async function aprovados() {
    const candidato = await candidatar();
    await conferirTudo(service, candidato.id);
    await service.aprovarCandidatura(candidato.id, COORD);
    const apadrinhado = await cadastrarCalouro();
    await conferirTudo(service, apadrinhado.id);
    await service.aprovarCandidatura(apadrinhado.id, COORD);
    return { candidatoId: candidato.id, apadrinhadoId: apadrinhado.id };
  }

  /** O que MatchingService.aprovar grava ao confirmar uma sugestão. */
  async function confirmarMatch(padrinhoId: number, apadrinhadoId: number) {
    const vinculo = {
      id: vinculos.length + 1,
      programaId: 1,
      padrinhoParticipacaoId: padrinhoId,
      apadrinhadoParticipacaoId: apadrinhadoId,
      ativo: true,
      origem: 'matching',
      sugestaoId: null,
      confirmadoPor: COORD,
      encerradoEm: null,
    } as MatchingVinculoEntity;
    vinculos.push(vinculo);
    Object.assign(await service.buscarPorId(padrinhoId), {
      papel: 'padrinho',
      status: 'em_andamento',
      apadrinhados: 1,
    });
    return vinculo.id;
  }

  const vinculo = (id: number) => vinculos.find((v) => v.id === id)!;

  it('conferência leva a candidatura a "em análise" e não volta para o aluno', async () => {
    const candidato = await candidatar();
    await expect(
      service.aprovarCandidatura(candidato.id, COORD),
    ).rejects.toThrow(/conferência acadêmica/);

    const conferido = await service.registrarVerificacao(
      candidato.id,
      {
        itens: [
          { id: 'matricula_ativa', atende: true },
          { id: 'periodo_minimo', atende: true },
        ],
        observacoes: 'Nota interna da coordenação',
      },
      COORD,
    );
    expect(conferido.status).toBe('em_analise');
    expect(conferido.verificacao?.atual).toMatchObject({
      resultado: 'requisitos_atendidos',
      por: COORD,
    });
    expect(ParticipacoesService.situacaoDe(conferido)).toBe(
      'candidatura_em_analise',
    );
    const paraAluno = JSON.stringify(serializarParticipacao(conferido));
    expect(paraAluno).not.toContain('Nota interna');
    expect(paraAluno).not.toContain('verificacao');
  });

  it('apadrinhado conferido segue pendente até a decisão', async () => {
    const apadrinhado = await cadastrarCalouro();
    const conferido = await conferirTudo(service, apadrinhado.id);
    expect(conferido.status).toBe('pendente');
    expect(ParticipacoesService.situacaoDe(conferido)).toBe(
      'apadrinhado_pendente',
    );
  });

  it('não registra conferência depois da decisão', async () => {
    const { candidatoId } = await aprovados();
    await expect(conferirTudo(service, candidatoId)).rejects.toThrow(
      /já foi decidida/,
    );
  });

  it('aprovação não cria vínculo nem combinação', async () => {
    const { candidatoId, apadrinhadoId } = await aprovados();
    const candidato = await service.buscarPorId(candidatoId);
    expect(candidato).toMatchObject({ papel: 'candidato', status: 'aprovado' });
    expect(candidato.grupo ?? null).toBeNull();
    expect(await service.buscarPorId(apadrinhadoId)).toMatchObject({
      status: 'em_andamento',
    });
    expect(vinculos).toHaveLength(0);
    expect(sugestoes).toHaveLength(0);
  });

  it('revogar aprovação usada no matching exige encerrar os vínculos antes', async () => {
    const { candidatoId, apadrinhadoId } = await aprovados();
    const id = await confirmarMatch(candidatoId, apadrinhadoId);

    for (const alvo of [candidatoId, apadrinhadoId]) {
      await expect(
        service.revogarAprovacao(alvo, MOTIVO, COORD),
      ).rejects.toThrow(/já foi usada no matching/);
    }
    expect((await service.buscarPorId(candidatoId)).status).toBe(
      'em_andamento',
    );

    const { padrinho } = await service.encerrarVinculo(candidatoId, id, COORD);
    expect(vinculo(id).ativo).toBe(false);
    expect(vinculo(id).encerradoEm).toBeInstanceOf(Date);
    expect(padrinho).toMatchObject({
      papel: 'candidato',
      status: 'aprovado',
      apadrinhados: 0,
    });

    const revogado = await service.revogarAprovacao(candidatoId, MOTIVO, COORD);
    expect(revogado.status).toBe('nao_aprovado');
    expect(revogado.respostas?._servidor?.decisao).toMatchObject({
      resultado: 'nao_aprovado',
      justificativa: MOTIVO,
      por: COORD,
    });
  });

  it('encerra só vínculo da própria participação, uma única vez', async () => {
    const { candidatoId, apadrinhadoId } = await aprovados();
    const id = await confirmarMatch(candidatoId, apadrinhadoId);
    const outro = await cadastrarCalouro('outro@pucminas.edu.br');

    await expect(
      service.encerrarVinculo(outro.id, id, COORD),
    ).rejects.toBeInstanceOf(NotFoundException);
    await service.encerrarVinculo(apadrinhadoId, id, COORD);
    await expect(
      service.encerrarVinculo(apadrinhadoId, id, COORD),
    ).resolves.toBeDefined();
  });

  it('desfazer vínculo do apadrinhado também encerra o par do matching', async () => {
    const { candidatoId, apadrinhadoId } = await aprovados();
    const id = await confirmarMatch(candidatoId, apadrinhadoId);

    const { padrinho } = await service.desvincular(apadrinhadoId, COORD);
    expect(vinculo(id).ativo).toBe(false);
    expect(padrinho).toMatchObject({ papel: 'candidato', status: 'aprovado' });
    expect(
      (await service.revogarAprovacao(apadrinhadoId, MOTIVO, COORD)).status,
    ).toBe('nao_aprovado');
  });

  it('revogação tira as sugestões pendentes do matching', async () => {
    const { candidatoId, apadrinhadoId } = await aprovados();
    sugestoes.push({
      id: 1,
      programaId: 1,
      execucaoId: 1,
      padrinhoParticipacaoId: candidatoId,
      apadrinhadoParticipacaoId: apadrinhadoId,
      status: 'pendente',
      motivoDecisao: null,
    } as MatchingSugestaoEntity);

    await service.revogarAprovacao(candidatoId, MOTIVO, COORD);
    expect(sugestoes[0]).toMatchObject({
      status: 'obsoleta',
      motivoDecisao: expect.stringMatching(/revogada/),
    });
    expect(programas[0].matchingPendente).toBe(false);
  });
});
