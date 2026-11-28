import { randomUUID } from 'node:crypto';
import { vi } from 'vitest';
import { cenarioMatching } from '../../test/helpers/matching-cenario.js';

const autor = 'coord@pucminas.edu.br';
const transferencia = (destino = 2) => ({
  padrinhoDestinoId: destino,
  motivo: 'Melhor disponibilidade de acompanhamento',
  operacaoId: randomUUID(),
});

describe('Vínculo canônico e transferência atômica', () => {
  it('consultar muitos destinos carrega as relações sem uma consulta de banco por padrinho', async () => {
    const c = cenarioMatching({ padrinhos: 25, alunos: 1 });
    const buscas = Object.values(c.repos).map((repo) => vi.spyOn(repo, 'find'));
    const resultado = await c.operacoes.destinos(100);
    expect(resultado.destinos).toHaveLength(25);
    expect(
      buscas.reduce((n, busca) => n + busca.mock.calls.length, 0),
    ).toBeLessThan(20);
  });
  it('aprovações sugeridas também respeitam capacidade maior que um por apadrinhado', async () => {
    const c = cenarioMatching({ padrinhos: 2, alunos: 1 });
    c.configs[0].capacidadePorApadrinhado = 2;
    await c.gerar();
    expect(c.sugestoes).toHaveLength(2);
    for (const s of c.sugestoes) await c.service.aprovar(s.id, autor);
    expect(c.vinculos.filter((v) => v.ativo)).toHaveLength(2);
    expect(c.participantes.find((p) => p.id === 100)?.grupo).toBeNull();
  });
  it('alterar compatibilidade depois da consulta de destinos impede a transferência', async () => {
    const c = cenarioMatching({ padrinhos: 2, alunos: 1 });
    await c.operacoes.vincular(100, 1, autor);
    expect(
      (await c.operacoes.destinos(100, c.vinculos[0].id)).destinos.find(
        (d) => d.padrinhoId === 2,
      )?.permitido,
    ).toBe(true);
    c.participantes.find((p) => p.id === 2)!.respostas!.areas = ['Carreira'];
    await expect(
      c.operacoes.transferir(c.vinculos[0].id, transferencia(), autor),
    ).rejects.toThrow(/compatibilidade/);
    expect(c.vinculos[0].ativo).toBe(true);
  });
  it('retorno ao mesmo padrinho reutiliza o grupo e mantém a aprovação original', async () => {
    const c = cenarioMatching({ padrinhos: 2, alunos: 1 });
    await c.gerar();
    const sugestao = c.sugestoes[0];
    await c.service.aprovar(sugestao.id, autor);
    const origem = c.vinculos[0];
    const outro = origem.padrinhoParticipacaoId === 1 ? 2 : 1;
    const r = await c.operacoes.transferir(
      origem.id,
      transferencia(outro),
      autor,
    );
    const volta = await c.operacoes.transferir(
      r.destino.id,
      transferencia(origem.padrinhoParticipacaoId),
      autor,
    );
    expect(volta.destino.grupoId).toBe(origem.grupoId);
    expect(c.grupos).toHaveLength(2);
    expect(sugestao).toMatchObject({
      status: 'aprovada',
      vinculoId: origem.id,
    });
    expect(c.decisoes).toHaveLength(1);
    expect(
      c.movimentacoes.filter((e) => e.acao === 'transferido'),
    ).toHaveLength(2);
  });
  it('alias do grupo anterior também detecta membros legados ainda não conciliados', async () => {
    const c = cenarioMatching({ alunos: 2 });
    await c.operacoes.vincular(100, 1, autor);
    c.grupos[0].nomeLegado = 'Nome antigo';
    c.participantes.find((p) => p.id === 101)!.grupo = 'Nome antigo';
    c.participantes.push({
      ...c.participantes.find((p) => p.id === 101)!,
      id: 102,
      usuarioId: 'outro@pucminas.edu.br',
      grupo: null,
    });
    await expect(c.operacoes.vincular(102, 1, autor)).rejects.toThrow(/legado/);
  });
  it('manual e sugerido respeitam o mesmo limite e formam o mesmo grupo estável', async () => {
    const c = cenarioMatching({ alunos: 3, capacidade: 2 });
    await c.gerar();
    await c.service.aprovar(c.sugestoes[0].id, autor);
    const outro = c.participantes
      .filter((p) => p.papel === 'apadrinhado')
      .find(
        (p) => !c.vinculos.some((v) => v.apadrinhadoParticipacaoId === p.id),
      )!;
    await c.operacoes.vincular(outro.id, 1, autor);
    await c.operacoes.vincular(outro.id, 1, autor);
    await expect(
      c.operacoes.vincular(c.participantes.at(-1)!.id, 1, autor),
    ).rejects.toThrow(/capacidade/);
    expect(c.vinculos).toHaveLength(2);
    expect(c.grupos).toHaveLength(1);
    expect(new Set(c.vinculos.map((v) => v.grupoId)).size).toBe(1);
    expect(c.movimentacoes).toHaveLength(2);
    expect(c.chats).toHaveLength(2);
  });
  it('manual não contorna falta de afinidade, condição obrigatória ou recusa', async () => {
    const c = cenarioMatching({ alunos: 1 });
    c.participantes[1].respostas!.areas = ['Carreira'];
    await expect(c.operacoes.vincular(100, 1, autor)).rejects.toThrow(
      /compatibilidade/,
    );
    c.participantes[1].respostas!.areas = ['Tecnologia'];
    await c.gerar();
    await c.service.recusar(c.sugestoes[0].id, autor, 'Indisponível');
    await expect(c.operacoes.vincular(100, 1, autor)).rejects.toThrow(
      /recusado/,
    );
    expect(c.vinculos).toHaveLength(0);
  });
  it.each(['inscricoes', 'analise', 'encerramento'])(
    'manual não altera o ciclo na etapa %s',
    async (etapa) => {
      const c = cenarioMatching({ alunos: 1 });
      c.programas[0].etapaAtual = etapa as any;
      await expect(c.operacoes.vincular(100, 1, autor)).rejects.toThrow(
        /Ciclo/,
      );
      expect(c.vinculos).toHaveLength(0);
    },
  );
  it('transferência encerra a origem, cria destino e recalcula o padrinho que ficou vazio', async () => {
    const c = cenarioMatching({ padrinhos: 2, alunos: 1 });
    await c.operacoes.vincular(100, 1, autor);
    const origem = c.vinculos[0];
    const resultado = await c.operacoes.transferir(
      origem.id,
      transferencia(),
      autor,
    );
    expect(resultado.origem.ativo).toBe(false);
    expect(resultado.destino.ativo).toBe(true);
    expect(resultado.destino.padrinhoParticipacaoId).toBe(2);
    expect(c.participantes.find((p) => p.id === 1)).toMatchObject({
      papel: 'candidato',
      status: 'aprovado',
      grupo: null,
      apadrinhados: 0,
    });
    expect(c.participantes.find((p) => p.id === 2)).toMatchObject({
      papel: 'padrinho',
      apadrinhados: 1,
    });
    expect(c.participantes.find((p) => p.id === 100)?.grupo).toBe(
      c.grupos.find((g) => g.padrinhoParticipacaoId === 2)?.nome,
    );
    expect(c.movimentacoes.at(-1)).toMatchObject({
      acao: 'transferido',
      vinculoOrigemId: origem.id,
      vinculoDestinoId: resultado.destino.id,
      responsavel: autor,
    });
  });
  it('falha no chat do destino preserva a origem, contadores e histórico', async () => {
    const c = cenarioMatching({ padrinhos: 2, alunos: 1 });
    await c.operacoes.vincular(100, 1, autor);
    const antes = structuredClone({
      vinculos: c.vinculos,
      participantes: c.participantes,
      grupos: c.grupos,
      movimentacoes: c.movimentacoes,
    });
    c.falharChat(true);
    await expect(
      c.operacoes.transferir(c.vinculos[0].id, transferencia(), autor),
    ).rejects.toThrow(/chat/);
    expect({
      vinculos: c.vinculos,
      participantes: c.participantes,
      grupos: c.grupos,
      movimentacoes: c.movimentacoes,
    }).toEqual(antes);
  });
  it('destino lotado não encerra origem', async () => {
    const c = cenarioMatching({ padrinhos: 2, alunos: 2, capacidade: 1 });
    await c.operacoes.vincular(100, 1, autor);
    await c.operacoes.vincular(101, 2, autor);
    await expect(
      c.operacoes.transferir(c.vinculos[0].id, transferencia(), autor),
    ).rejects.toThrow(/capacidade/);
    expect(c.vinculos.every((v) => v.ativo)).toBe(true);
  });
  it('repetir a operação não duplica vínculo, chat, grupo ou histórico', async () => {
    const c = cenarioMatching({ padrinhos: 2, alunos: 1 });
    await c.operacoes.vincular(100, 1, autor);
    const dto = transferencia();
    const [a, b] = await Promise.all([
      c.operacoes.transferir(c.vinculos[0].id, dto, autor),
      c.operacoes.transferir(c.vinculos[0].id, dto, autor),
    ]);
    expect(a.destino.id).toBe(b.destino!.id);
    expect(c.vinculos).toHaveLength(2);
    expect(c.chats).toHaveLength(2);
    expect(
      c.movimentacoes.filter((e) => e.acao === 'transferido'),
    ).toHaveLength(1);
    await expect(
      c.operacoes.transferir(
        c.vinculos[0].id,
        { ...dto, motivo: 'Outra intenção' },
        autor,
      ),
    ).rejects.toThrow(/identificador/);
  });
  it('repetição depois de encerrar o destino não reativa vínculo histórico', async () => {
    const c = cenarioMatching({ padrinhos: 2, alunos: 1 });
    await c.operacoes.vincular(100, 1, autor);
    const dto = transferencia();
    const r = await c.operacoes.transferir(c.vinculos[0].id, dto, autor);
    await c.operacoes.encerrar(100, r.destino.id, autor);
    const repetida = await c.operacoes.transferir(c.vinculos[0].id, dto, autor);
    expect(repetida.destino?.ativo).toBe(false);
    expect(c.vinculos.filter((v) => v.ativo)).toHaveLength(0);
  });
  it('dois destinos disputando a mesma origem não fazem duas transferências', async () => {
    const c = cenarioMatching({ padrinhos: 3, alunos: 1 });
    await c.operacoes.vincular(100, 1, autor);
    const r = await Promise.allSettled([
      c.operacoes.transferir(c.vinculos[0].id, transferencia(2), autor),
      c.operacoes.transferir(c.vinculos[0].id, transferencia(3), autor),
    ]);
    expect(r.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(c.vinculos.filter((v) => v.ativo)).toHaveLength(1);
  });
  it('transferência não contorna impedimento do par destino', async () => {
    const c = cenarioMatching({ padrinhos: 2, alunos: 1 });
    c.eventos.push({
      id: 1,
      programaId: 1,
      padrinhoParticipacaoId: 2,
      apadrinhadoParticipacaoId: 100,
      acao: 'recusado',
    } as any);
    await c.operacoes.vincular(100, 1, autor);
    await expect(
      c.operacoes.transferir(c.vinculos[0].id, transferencia(), autor),
    ).rejects.toThrow(/recusado/);
    expect(c.vinculos[0].ativo).toBe(true);
    const destinos = await c.operacoes.destinos(100, c.vinculos[0].id);
    expect(destinos.destinos.find((d) => d.padrinhoId === 2)).toMatchObject({
      permitido: false,
      bloqueio: expect.stringContaining('recusado'),
    });
  });
  it('capacidade configurada por apadrinhado é respeitada sem impor a premissa R13', async () => {
    const c = cenarioMatching({ padrinhos: 3, alunos: 1 });
    c.configs[0].capacidadePorApadrinhado = 2;
    await c.operacoes.vincular(100, 1, autor);
    await c.operacoes.vincular(100, 2, autor);
    expect(c.participantes.find((p) => p.id === 100)?.grupo).toBeNull();
    await c.operacoes.transferir(c.vinculos[0].id, transferencia(3), autor);
    expect(
      c.vinculos
        .filter((v) => v.ativo)
        .map((v) => v.padrinhoParticipacaoId)
        .sort(),
    ).toEqual([2, 3]);
    await expect(c.operacoes.vincular(100, 1, autor)).rejects.toThrow(
      /capacidade/,
    );
  });
  it('trocar nomes de grupos não altera sua propriedade ou a associação canônica', async () => {
    const c = cenarioMatching({ padrinhos: 2, alunos: 2 });
    await c.operacoes.vincular(100, 1, autor);
    await c.operacoes.vincular(101, 2, autor);
    c.grupos[0].nome = c.grupos[1].nome;
    const g = await c.operacoes.grupos('2026/2');
    expect(g.grupos[0].padrinho.id).toBe(1);
    expect(g.grupos[0].apadrinhados.map((a) => a.id)).toEqual([100]);
    expect(g.grupos[1].apadrinhados.map((a) => a.id)).toEqual([101]);
  });
  it('grupos apenas legados não são tratados como vaga livre nem convertidos silenciosamente', async () => {
    const c = cenarioMatching({ alunos: 2 });
    c.participantes[0].grupo = 'Legado';
    c.participantes[1].grupo = 'Legado';
    await expect(c.operacoes.vincular(101, 1, autor)).rejects.toThrow(/legado/);
    expect((await c.operacoes.grupos('2026/2')).inconsistencias).toHaveLength(
      1,
    );
    expect(c.vinculos).toHaveLength(0);
  });
  it('um vínculo manual invalida pendências e preserva decisões anteriores', async () => {
    const c = cenarioMatching({ alunos: 2 });
    await c.gerar();
    await c.service.aprovar(c.sugestoes[0].id, autor);
    await c.operacoes.vincular(
      c.sugestoes[1].apadrinhadoParticipacaoId,
      1,
      autor,
    );
    expect(c.sugestoes.map((s) => s.status)).toEqual(['aprovada', 'obsoleta']);
    expect(c.decisoes).toHaveLength(1);
    expect(c.programas[0].matchingPendente).toBe(false);
  });
});
