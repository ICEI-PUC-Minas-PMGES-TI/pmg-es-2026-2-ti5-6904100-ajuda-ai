import { describe, expect, it, vi } from 'vitest';
import type { CadastroService } from '../cadastro/cadastro.service.js';
import type { NotificacoesService } from '../notificacoes/notificacoes.service.js';
import type { ParticipacaoEntity } from '../participacoes/entities/participacao.entity.js';
import type { ParticipacoesService } from '../participacoes/participacoes.service.js';
import { CoordenacaoService } from './coordenacao.service.js';

describe('CoordenacaoService.revogarAprovacao', () => {
  it('encaminha justificativa e coordenador em seus campos corretos', async () => {
    const registro = {
      id: 23,
      papel: 'candidato',
      status: 'nao_aprovado',
    } as ParticipacaoEntity;
    const revogarAprovacao = vi.fn().mockResolvedValue(registro);
    const refletirDecisaoDaCandidatura = vi.fn().mockResolvedValue(undefined);
    const participacoes = {
      revogarAprovacao,
    } as unknown as ParticipacoesService;
    const cadastro = {
      refletirDecisaoDaCandidatura,
    } as unknown as CadastroService;
    const service = new CoordenacaoService(
      {} as never,
      participacoes,
      {} as never,
      {} as never,
      cadastro,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );
    vi.spyOn(service, 'detalharCandidatura').mockResolvedValue({} as never);

    await service.revogarAprovacao(
      registro.id,
      'coordenador@example.com',
      'Revisão dos requisitos.',
    );

    expect(revogarAprovacao).toHaveBeenCalledWith(
      registro.id,
      'Revisão dos requisitos.',
      'coordenador@example.com',
    );
    expect(refletirDecisaoDaCandidatura).toHaveBeenCalledWith(
      registro,
      'rejeitado',
      'coordenador@example.com',
    );
  });
});

describe('CoordenacaoService avisa a decisão da candidatura (F34)', () => {
  const EM = '2026-11-20T15:00:00.000Z';
  const registro = {
    id: 31,
    usuarioId: 'ana.calouro@sga.pucminas.br',
    programa: '2026/2',
    papel: 'apadrinhado',
    respostas: {
      _servidor: {
        decisao: { resultado: 'aprovado', justificativa: null, em: EM, por: null },
      },
    },
  } as unknown as ParticipacaoEntity;

  function montar(falhar = false) {
    const decidir = vi.fn(async () => {
      if (falhar) throw new Error('Apenas inscrições aguardando decisão podem ser decididas.');
      return registro;
    });
    const participacoes = {
      aprovarCandidatura: decidir,
      rejeitarCandidaturaPorId: decidir,
      revogarAprovacao: decidir,
    } as unknown as ParticipacoesService;
    const cadastro = {
      refletirDecisaoDaCandidatura: vi.fn(async () => undefined),
    } as unknown as CadastroService;
    const notificacoes = { criarParaEmail: vi.fn(async () => undefined) };
    const service = new CoordenacaoService(
      {} as never,
      participacoes,
      {} as never,
      {} as never,
      cadastro,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      notificacoes as unknown as NotificacoesService,
    );
    vi.spyOn(service, 'detalharCandidatura').mockResolvedValue({} as never);
    vi.spyOn(
      service as unknown as { garantirRequisitosParaAprovar: () => Promise<void> },
      'garantirRequisitosParaAprovar',
    ).mockResolvedValue(undefined);
    return { service, notificacoes, decidir };
  }

  it('aprovar avisa o aluno pelo e-mail da participação, uma vez por decisão', async () => {
    const { service, notificacoes, decidir } = montar();
    await service.aprovarCandidatura(registro.id, 'coord@pucminas.br');
    expect(notificacoes.criarParaEmail).toHaveBeenCalledWith(
      'ana.calouro@sga.pucminas.br',
      expect.objectContaining({
        tipo: 'CANDIDATURA_APROVADA',
        link: '/candidatura',
        chave: `candidatura:2026/2:${EM}`,
      }),
    );
    expect(decidir.mock.invocationCallOrder[0]).toBeLessThan(
      notificacoes.criarParaEmail.mock.invocationCallOrder[0],
    );
  });

  it.each([
    ['rejeitar', 'Candidatura não aprovada', (s: CoordenacaoService) => s.rejeitarCandidatura(31, 'coord', 'Fora do perfil.')],
    ['revogar', 'Aprovação revogada', (s: CoordenacaoService) => s.revogarAprovacao(31, 'coord', 'Documentação pendente.')],
  ])('%s avisa candidatura não aprovada', async (_acao, titulo, agir) => {
    const { service, notificacoes } = montar();
    await agir(service);
    expect(notificacoes.criarParaEmail).toHaveBeenCalledWith(
      'ana.calouro@sga.pucminas.br',
      expect.objectContaining({ tipo: 'CANDIDATURA_NAO_APROVADA', titulo }),
    );
  });

  it('decisão recusada não gera aviso', async () => {
    const { service, notificacoes } = montar(true);
    await expect(service.aprovarCandidatura(31)).rejects.toThrow();
    expect(notificacoes.criarParaEmail).not.toHaveBeenCalled();
  });
});
