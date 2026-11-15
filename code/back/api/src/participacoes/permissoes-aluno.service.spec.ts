import { ForbiddenException } from '@nestjs/common';
import type { AccessTokenPayload } from '../auth/authenticated-request.js';
import {
  aluno,
  coordenador,
  criarFeedTeste,
  padrinho,
  somenteMapa,
} from '../../test/helpers/feed.js';

/** Contas do fluxo real nascem com `tipoParticipacao: 'nenhuma'` (RN-001). */
const real = (u: AccessTokenPayload): AccessTokenPayload => ({
  ...u,
  perfil: 'nenhuma',
});

const nada = {
  participante: false,
  vinculoAtivo: false,
  papel: null,
  podeLerFeed: false,
  podeInteragir: false,
  podePublicar: false,
  podeColetarTotens: false,
  podeUsarLojinha: false,
};

describe('PermissoesAlunoService: permissões pela situação no ciclo atual', () => {
  it('padrinho real vinculado publica, interage, coleta e usa a lojinha', async () => {
    const { permissoes } = criarFeedTeste();
    expect(await permissoes.doUsuario(real(padrinho))).toMatchObject({
      situacao: 'padrinho_ativo',
      papel: 'padrinho',
      participante: true,
      vinculoAtivo: true,
      podeLerFeed: true,
      podeInteragir: true,
      podePublicar: true,
      podeColetarTotens: true,
      podeUsarLojinha: true,
    });
  });

  it('apadrinhado real vinculado lê, curte, comenta e usa a lojinha, mas não publica', async () => {
    const { permissoes, policy, service } = criarFeedTeste();
    const camila = real(aluno);
    expect(await permissoes.doUsuario(camila)).toMatchObject({
      situacao: 'apadrinhado_ativo',
      papel: 'apadrinhado',
      podeLerFeed: true,
      podeInteragir: true,
      podePublicar: false,
      podeColetarTotens: true,
      podeUsarLojinha: true,
    });
    expect(await policy.resumo(camila)).toEqual({
      podeLer: true,
      podePublicar: false,
      podeAdministrar: false,
      podeInteragir: true,
    });
    const post = await service.criar({ texto: 'Aviso' }, coordenador);
    expect((await service.curtir(post.id, 1, camila)).curtidas).toBe(1);
  });

  it.each([
    [
      'padrinho aprovado sem par',
      0,
      { papel: 'candidato', status: 'aprovado', grupo: null },
      'padrinho',
    ],
    [
      'apadrinhado aprovado sem par',
      1,
      { status: 'aprovado', grupo: null },
      'apadrinhado',
    ],
  ] as const)(
    '%s vê o feed, interage e coleta, mas não publica (DP-22)',
    async (_n, i, alteracoes, papel) => {
      const { permissoes, tabelas } = criarFeedTeste();
      Object.assign(tabelas.ParticipacaoEntity[i], alteracoes);
      const usuario = real(i === 0 ? padrinho : aluno);
      expect(await permissoes.doUsuario(usuario)).toMatchObject({
        papel,
        participante: true,
        vinculoAtivo: false,
        podeLerFeed: true,
        podeInteragir: true,
        podePublicar: false,
        podeColetarTotens: true,
        podeUsarLojinha: true,
      });
    },
  );

  it.each([
    ['pendente', { papel: 'candidato', status: 'pendente' }],
    ['em análise', { papel: 'candidato', status: 'em_analise' }],
    ['rejeitado', { papel: 'candidato', status: 'nao_aprovado' }],
    ['concluído', { status: 'concluido' }],
    ['com vínculo encerrado', { terminoEm: new Date('2026-01-01') }],
    ['ex-participante (ciclo anterior)', { programa: '2020/1' }],
  ])(
    'padrinho %s não tem nenhuma permissão de participante',
    async (_n, alteracoes) => {
      const { permissoes, tabelas } = criarFeedTeste();
      Object.assign(tabelas.ParticipacaoEntity[0], alteracoes);
      expect(await permissoes.doUsuario(real(padrinho))).toMatchObject(nada);
    },
  );

  it('o claim perfil do JWT não concede nada sem participação no ciclo', async () => {
    const { permissoes } = criarFeedTeste();
    const intruso = { ...padrinho, sub: '9', email: 'outro@pucminas.edu.br' };
    expect(await permissoes.doUsuario(intruso)).toMatchObject(nada);
  });

  it('ciclo em encerramento corta tudo, mesmo com vínculo', async () => {
    const { permissoes, tabelas } = criarFeedTeste();
    tabelas.ProgramaEntity[0].etapaAtual = 'encerramento';
    expect(await permissoes.doUsuario(real(padrinho))).toMatchObject(nada);
  });

  it('usuário só do mapa recebe 403 ao ler o feed, coletar ou usar a lojinha', async () => {
    const { permissoes, policy } = criarFeedTeste();
    expect(await permissoes.doUsuario(somenteMapa)).toMatchObject(nada);
    await expect(policy.exigirLeitura(somenteMapa)).rejects.toThrow(
      ForbiddenException,
    );
    for (const p of ['podeColetarTotens', 'podeUsarLojinha'] as const)
      await expect(
        permissoes.exigir(somenteMapa, p, 'Sem participação.'),
      ).rejects.toMatchObject({
        response: { motivo: 'sem-participacao-no-ciclo', situacao: 'nenhuma' },
      });
  });

  it('coordenação lê, publica e interage, mas não ganha XP nem usa a lojinha', async () => {
    const { permissoes } = criarFeedTeste();
    expect(await permissoes.doUsuario(coordenador)).toMatchObject({
      coordenador: true,
      podeLerFeed: true,
      podeInteragir: true,
      podePublicar: true,
      podeColetarTotens: false,
      podeUsarLojinha: false,
    });
  });

  it('perde o acesso assim que a participação muda, sem renovar o JWT', async () => {
    const { permissoes, tabelas } = criarFeedTeste();
    const camila = real(aluno);
    expect((await permissoes.doUsuario(camila)).podeLerFeed).toBe(true);
    tabelas.ParticipacaoEntity[1].status = 'concluido';
    expect((await permissoes.doUsuario(camila)).podeLerFeed).toBe(false);
  });
});
