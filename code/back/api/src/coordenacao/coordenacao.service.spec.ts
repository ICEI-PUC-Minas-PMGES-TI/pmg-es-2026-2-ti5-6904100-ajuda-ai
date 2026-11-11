import { describe, expect, it, vi } from 'vitest';
import type { CadastroService } from '../cadastro/cadastro.service.js';
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
