import { cenarioMatching } from '../../test/helpers/matching-cenario.js';
import { decisoesAtuais, fingerprintMatching } from './matching.integridade.js';

describe('Validade e decisões do matching', () => {
  it('aprova em sequência na mesma rodada e repete sem duplicar vínculo, decisão ou chat', async () => {
    const c = cenarioMatching();
    await c.gerar();
    await c.service.aprovar(c.sugestoes[0].id, 'coord1');
    await c.service.aprovar(c.sugestoes[1].id, 'coord2');
    await c.service.aprovar(c.sugestoes[0].id, 'coord1');
    expect(c.vinculos).toHaveLength(2);
    expect(c.decisoes).toHaveLength(2);
    expect(c.chats).toHaveLength(2);
    expect(c.programas[0].matchingPendente).toBe(false);
  });
  it('uma nova configuração invalida imediatamente pendências sem alterar alunos', async () => {
    const c = cenarioMatching();
    await c.gerar();
    const alunos = structuredClone(c.participantes);
    await c.service.salvarConfiguracao(
      {
        programa: '2026/2',
        liberado: true,
        capacidadePorPadrinho: 2,
        capacidadePorApadrinhado: 1,
        criterios: [
          { campoCadastro: 'areas', operacao: 'intersecao', peso: 50 },
        ],
      },
      'coord',
    );
    expect(c.sugestoes.every((s) => s.status === 'obsoleta')).toBe(true);
    await expect(c.service.aprovar(c.sugestoes[0].id, 'coord')).rejects.toThrow(
      /desatualizada/,
    );
    expect(c.participantes).toEqual(alunos);
    expect(c.vinculos).toHaveLength(0);
  });
  it('mudança relevante detectada na aprovação é persistida apesar do 409', async () => {
    const c = cenarioMatching();
    await c.gerar();
    c.participantes[0].respostas!.areas = ['Carreira'];
    await expect(c.service.aprovar(c.sugestoes[0].id, 'coord')).rejects.toThrow(
      /dados|afinidade/,
    );
    expect(c.sugestoes[0].status).toBe('obsoleta');
    expect(c.vinculos).toHaveLength(0);
    expect(c.programas[0].matchingPendente).toBe(false);
  });
  it('nome e projeções de grupo não são confundidos com os dados de compatibilidade', async () => {
    const c = cenarioMatching();
    await c.gerar();
    c.participantes[0].respostas!.nome = 'Novo nome';
    await expect(
      c.service.aprovar(c.sugestoes[0].id, 'coord'),
    ).resolves.toBeDefined();
  });
  it('mudança de elegibilidade invalida ao consultar a lista', async () => {
    const c = cenarioMatching();
    await c.gerar();
    c.participantes[0].status = 'nao_aprovado';
    expect(await c.service.listarSugestoes('2026/2', 'pendente')).toEqual([]);
    expect(c.sugestoes.every((s) => s.status === 'obsoleta')).toBe(true);
  });
  it('vínculo externo altera a base e não permite aproveitar sugestão antiga', async () => {
    const c = cenarioMatching();
    await c.gerar();
    c.vinculos.push({
      id: 99,
      programaId: 1,
      padrinhoParticipacaoId: 1,
      apadrinhadoParticipacaoId: 999,
      origem: 'manual',
      ativo: true,
      sugestaoId: null,
    } as never);
    await expect(c.service.aprovar(c.sugestoes[0].id, 'coord')).rejects.toThrow(
      /vínculos|dados/,
    );
    expect(c.vinculos).toHaveLength(1);
  });
  it('a assinatura da sugestão está vinculada ao par e à rodada', async () => {
    const c = cenarioMatching();
    await c.gerar();
    c.sugestoes[0].apadrinhadoParticipacaoId = 101;
    await expect(c.service.aprovar(c.sugestoes[0].id, 'coord')).rejects.toThrow(
      /contrato de validade/,
    );
    expect(c.vinculos).toHaveLength(0);
  });
  it('recusa impede futuras rodadas e não reprova candidaturas', async () => {
    const c = cenarioMatching({ alunos: 1 });
    await c.gerar();
    const alunos = structuredClone(c.participantes);
    await c.service.recusar(
      c.sugestoes[0].id,
      'coord',
      'Preferência confirmada',
    );
    const rodada = await c.gerar();
    expect(rodada.totalSugestoes).toBe(0);
    expect(rodada.relatorio.semSugestao[0].motivo).toBe('pares_recusados');
    expect(c.participantes).toEqual(alunos);
    expect(c.eventos).toHaveLength(1);
    expect((await c.service.listarParesRecusados('2026/2'))[0].motivo).toBe(
      'Preferência confirmada',
    );
  });
  it('reconsideração preserva a recusa e só nova rodada cria uma nova sugestão', async () => {
    const c = cenarioMatching({ alunos: 1 });
    await c.gerar();
    const original = c.sugestoes[0];
    await c.service.recusar(original.id, 'coord', 'Motivo original');
    await c.service.reconsiderarPar(
      c.eventos[0].id,
      'coord2',
      'Informação complementada',
    );
    expect(original.status).toBe('recusada');
    expect(c.decisoes[0].decisao).toBe('recusada');
    expect(c.vinculos).toHaveLength(0);
    await expect(c.service.aprovar(original.id, 'coord')).rejects.toThrow();
    await c.service.recusar(
      original.id,
      'coord',
      'Repetição de requisição antiga',
    );
    expect(c.eventos).toHaveLength(2);
    expect(await c.service.listarParesRecusados('2026/2')).toHaveLength(0);
    await c.gerar();
    expect(c.sugestoes).toHaveLength(2);
    await c.service.aprovar(c.sugestoes[1].id, 'coord');
    expect(c.vinculos).toHaveLength(1);
  });
  it('reconsideração exige justificativa e não apaga uma recusa posterior', async () => {
    const c = cenarioMatching({ alunos: 1 });
    await c.gerar();
    await c.service.recusar(c.sugestoes[0].id, 'coord');
    const id = c.eventos[0].id;
    await expect(c.service.reconsiderarPar(id, 'coord', '  ')).rejects.toThrow(
      /justificativa/,
    );
    await c.service.reconsiderarPar(id, 'coord', 'Reavaliado');
    await c.gerar();
    await c.service.recusar(c.sugestoes[1].id, 'coord');
    await expect(
      c.service.reconsiderarPar(id, 'coord', 'Requisição antiga'),
    ).rejects.toThrow(/decisão do par mudou/);
    expect(c.eventos).toHaveLength(3);
  });
  it('duas reconsiderações concorrentes não duplicam a decisão', async () => {
    const c = cenarioMatching({ alunos: 1 });
    await c.gerar();
    await c.service.recusar(c.sugestoes[0].id, 'coord');
    const resultados = await Promise.all([
      c.service.reconsiderarPar(c.eventos[0].id, 'coord1', 'Reavaliado'),
      c.service.reconsiderarPar(c.eventos[0].id, 'coord2', 'Reavaliado'),
    ]);
    expect(resultados[0].decisao.id).toBe(resultados[1].decisao.id);
    expect(c.eventos).toHaveLength(2);
  });
  it('aprovar e recusar em paralelo preserva uma única decisão', async () => {
    const c = cenarioMatching({ alunos: 1 });
    await c.gerar();
    const resultados = await Promise.allSettled([
      c.service.aprovar(c.sugestoes[0].id, 'coord1'),
      c.service.recusar(c.sugestoes[0].id, 'coord2'),
    ]);
    expect(resultados.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(c.decisoes).toHaveLength(1);
  });
  it('todas as operações bloqueiam o programa antes de qualquer outro registro', async () => {
    const c = cenarioMatching({ alunos: 1 });
    await c.gerar();
    await c.service.recusar(c.sugestoes[0].id, 'coord');
    await c.service.reconsiderarPar(c.eventos[0].id, 'coord', 'Reavaliado');
    const transacoes = c.locks.join('|').split('TX|').slice(1);
    for (const locks of transacoes)
      expect(locks.split('|')[0]).toBe('ProgramaEntity:pessimistic_write');
  });
  it('falha na criação do chat desfaz aprovação e vínculo', async () => {
    const c = cenarioMatching({ alunos: 1 });
    await c.gerar();
    c.falharChat(true);
    await expect(c.service.aprovar(c.sugestoes[0].id, 'coord')).rejects.toThrow(
      /Falha no chat/,
    );
    expect(c.vinculos).toHaveLength(0);
    expect(c.decisoes).toHaveLength(0);
    expect(c.sugestoes[0].status).toBe('pendente');
  });
  it('mudança de configuração entre as duas fases não publica sugestões parciais', async () => {
    const c = cenarioMatching();
    c.aposTransacao(() => {
      c.aposTransacao();
      c.configs.push({ ...c.configs[0], id: 2, versao: 2 });
    });
    await expect(c.gerar()).rejects.toThrow(/configuração mudou/);
    expect(c.sugestoes).toHaveLength(0);
    expect(c.execucoes[0].status).toBe('falha');
  });
  it('recusar todas as sugestões não significa que todos foram atendidos', async () => {
    const c = cenarioMatching();
    await c.gerar();
    for (const s of c.sugestoes) await c.service.recusar(s.id, 'coord');
    const visao = await c.service.visao('2026/2');
    expect(visao.totais.sugestoesPendentes).toBe(0);
    expect(visao.totais.pessoasSemVinculo).toBe(2);
  });
  it('ordem de conjuntos e chaves não altera a assinatura', () => {
    expect(fingerprintMatching({ a: ['b', 'a'], b: true })).toBe(
      fingerprintMatching({ b: true, a: ['a', 'b'] }),
    );
    expect(fingerprintMatching({ b: true })).not.toBe(
      fingerprintMatching({ b: false }),
    );
    expect(decisoesAtuais([]).size).toBe(0);
  });
  it('aprovações paralelas de pares distintos e suas repetições respeitam capacidade', async () => {
    const c = cenarioMatching({ capacidade: 2 });
    await c.gerar();
    await Promise.all(
      [
        c.sugestoes[0].id,
        c.sugestoes[1].id,
        c.sugestoes[0].id,
        c.sugestoes[1].id,
      ].map((id) => c.service.aprovar(id, 'coord')),
    );
    expect(c.vinculos).toHaveLength(2);
    expect(c.decisoes).toHaveLength(2);
    expect(c.chats).toHaveLength(2);
  });
  it('recusas de um ciclo não impedem os mesmos alunos em outro ciclo', async () => {
    const c = cenarioMatching({ alunos: 1 });
    await c.gerar();
    await c.service.recusar(c.sugestoes[0].id, 'coord');
    c.programas.push({ ...c.programas[0], id: 2, codigo: '2027/1' });
    c.configs.push({ ...c.configs[0], id: 2, programaId: 2 });
    c.participantes.push(
      { ...c.participantes[0], id: 200, programa: '2027/1' },
      { ...c.participantes[1], id: 300, programa: '2027/1' },
    );
    expect((await c.service.executar('2027/1', 'coord')).totalSugestoes).toBe(
      1,
    );
    expect(await c.service.listarParesRecusados('2026/2')).toHaveLength(1);
    expect(await c.service.listarParesRecusados('2027/1')).toHaveLength(0);
  });
  it('execução recuperada por timeout não publica depois de uma rodada nova', async () => {
    const c = cenarioMatching();
    c.aposTransacao(async (resultado) => {
      if (resultado.status !== 'executando') return;
      c.aposTransacao();
      c.execucoes[0].criadoEm = new Date(Date.now() - 16 * 60_000);
      await c.gerar();
    });
    await expect(c.gerar()).rejects.toThrow(/encerrada ou substituída/);
    expect(c.execucoes.map((e) => e.status)).toEqual(['falha', 'concluida']);
    expect(c.execucoes[0].erro).toMatch(/timeout/);
    expect(c.sugestoes.every((s) => s.execucaoId === c.execucoes[1].id)).toBe(
      true,
    );
  });
  it('rodadas sem o contrato atual ficam históricas e não aprováveis', async () => {
    const c = cenarioMatching();
    await c.gerar();
    delete c.execucoes[0].configSnapshot.integridade;
    const detalhe = await c.service.obterSugestao(c.sugestoes[0].id);
    expect(detalhe.status).toBe('obsoleta');
    expect(detalhe.podeAprovar).toBe(false);
    expect(detalhe.validade).toMatchObject({
      motivos: expect.arrayContaining(['politica_desatualizada']),
    });
  });
  it('nova rodada explica a obsolescência e preserva a recusa histórica', async () => {
    const c = cenarioMatching();
    await c.gerar();
    const [recusada, pendente] = c.sugestoes;
    await c.service.recusar(recusada.id, 'coord', 'Revisar disponibilidade');
    await c.gerar();
    expect(recusada.status).toBe('recusada');
    expect(pendente.status).toBe('obsoleta');
    expect(pendente.explicacao.validade).toMatchObject({
      vigente: false,
      motivos: ['execucao_substituida'],
    });
    expect(c.eventos).toHaveLength(1);
    expect(c.decisoes).toHaveLength(1);
  });
  it('assinaturas sobrevivem à serialização JSONB de campos opcionais', async () => {
    const c = cenarioMatching({ alunos: 1 });
    c.configs[0].criterios.push({
      campoCadastro: 'preferenciaGenero',
      operacao: 'preferencia_genero',
      peso: 25,
    });
    c.participantes[0].respostas!.genero = 'Masculino';
    c.participantes[1].respostas!.genero = 'Feminino';
    c.participantes[1].respostas!.preferenciaGenero = {
      modo: 'preferencia',
      generos: ['Masculino'],
    };
    await c.gerar();
    c.sugestoes[0].explicacao = JSON.parse(
      JSON.stringify(c.sugestoes[0].explicacao),
    );
    c.execucoes[0].configSnapshot = JSON.parse(
      JSON.stringify(c.execucoes[0].configSnapshot),
    );
    await expect(
      c.service.aprovar(c.sugestoes[0].id, 'coord'),
    ).resolves.toBeDefined();
    expect(fingerprintMatching({ a: undefined })).toBe(fingerprintMatching({}));
  });
});
