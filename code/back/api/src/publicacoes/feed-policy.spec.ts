import { ForbiddenException } from '@nestjs/common';
import { criarFeedTeste, padrinho } from '../../test/helpers/feed.js';

describe('Publicação exige participação ativa no ciclo atual', () => {
  it.each([
    ['pendente', { papel: 'candidato', status: 'pendente' }],
    ['em análise', { papel: 'candidato', status: 'em_analise' }],
    ['rejeitada', { papel: 'candidato', status: 'nao_aprovado' }],
    [
      'aprovada aguardando matching',
      { papel: 'candidato', status: 'aprovado' },
    ],
    ['padrinho ainda aprovado', { status: 'aprovado' }],
    ['padrinho rejeitado', { status: 'nao_aprovado' }],
    ['padrinho concluído', { status: 'concluido' }],
    ['apadrinhado com JWT antigo de padrinho', { papel: 'apadrinhado' }],
    ['sem grupo', { grupo: null }],
    ['grupo sem vínculo válido', { grupo: 'Outro grupo' }],
    ['participação encerrada', { terminoEm: new Date('2020-01-01') }],
    ['ciclo anterior', { programa: '2020/1' }],
    ['ciclo futuro', { programa: '2099/1' }],
  ])(
    'nega %s mesmo com perfil padrinho no JWT e chamada direta ao serviço',
    async (_nome, alteracoes) => {
      const { service, policy, tabelas, midias } = criarFeedTeste();
      Object.assign(tabelas.ParticipacaoEntity[0], alteracoes);
      const validarMidias = vi.spyOn(midias, 'validar');
      expect(await policy.podePublicar(padrinho)).toBe(false);
      await expect(
        service.criar({ texto: 'Não permitido' }, padrinho),
      ).rejects.toThrow(ForbiddenException);
      expect(validarMidias).not.toHaveBeenCalled();
      expect(tabelas.PublicacaoEntity).toHaveLength(0);
      expect(tabelas.FeedOutboxEntity).toHaveLength(0);
    },
  );

  it.each([
    'ciclo ausente',
    'ciclo encerrado',
    'participação ausente',
    'vínculo removido',
  ])('nega publicação após %s sem renovar o JWT', async (caso) => {
    const { service, policy, tabelas } = criarFeedTeste();
    expect(await policy.podePublicar(padrinho)).toBe(true);
    switch (caso) {
      case 'ciclo ausente':
        tabelas.ProgramaEntity.length = 0;
        break;
      case 'ciclo encerrado':
        tabelas.ProgramaEntity[0].etapaAtual = 'encerramento';
        break;
      case 'participação ausente':
        tabelas.ParticipacaoEntity.length = 0;
        break;
      case 'vínculo removido':
        tabelas.ParticipacaoEntity[1].grupo = null;
        break;
    }
    expect(await policy.podePublicar(padrinho)).toBe(false);
    await expect(
      service.criar({ texto: 'Não permitido' }, padrinho),
    ).rejects.toThrow(ForbiddenException);
    expect(tabelas.PublicacaoEntity).toHaveLength(0);
    expect(tabelas.FeedOutboxEntity).toHaveLength(0);
  });
});
