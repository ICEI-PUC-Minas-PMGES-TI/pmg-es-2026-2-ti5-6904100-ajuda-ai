import { ConflictException } from '@nestjs/common';
import { cenarioMatching } from '../../test/helpers/matching-cenario.js';
import { ParticipacoesController } from '../participacoes/participacoes.controller.js';
import { ParticipacoesService } from '../participacoes/participacoes.service.js';
import { ProgramasService } from '../programas/programas.service.js';
import type { UsuariosService } from '../usuarios/usuarios.service.js';
import type { AuthenticatedRequest } from '../auth/authenticated-request.js';

describe('Experiência de matching e vínculos', () => {
  it('visão não anuncia pronto para executar com configuração que o comando recusaria', async () => {
    const c = cenarioMatching();
    c.configs[0].criterios = [];
    const visao = await c.service.visao('2026/2');
    expect(visao.podeExecutar).toBe(false);
    expect(visao.bloqueios.join(' ')).toMatch(/critério/i);
  });
  it('diagnóstico anterior à rodada distingue false, ausência e condição obrigatória', async () => {
    const c = cenarioMatching({ alunos: 2 });
    c.configs[0].criterios = [
      {
        campoCadastro: 'areas',
        operacao: 'intersecao',
        peso: 70,
        obrigatorio: true,
      },
      {
        campoCadastro: 'bolsistaProuni',
        operacao: 'vivencia_compartilhada',
        peso: 30,
      },
    ];
    c.participantes.forEach((p) => {
      p.respostas!.bolsistaProuni = false;
    });
    delete c.participantes.find((p) => p.id === 100)!.respostas!.areas;
    delete c.participantes.find((p) => p.id === 101)!.respostas!.bolsistaProuni;
    const antes = structuredClone(c.participantes);
    const d = (await c.service.visao('2026/2')).diagnosticoDados;
    expect(d.criterios[1].padrinhos.conhecidos).toBe(
      d.criterios[1].padrinhos.total,
    );
    expect(d.criterios[1].apadrinhados).toEqual({ conhecidos: 1, total: 2 });
    expect(d.pendencias.find((p) => p.participacaoId === 100)).toMatchObject({
      campos: ['Áreas de apoio'],
      obrigatorio: true,
    });
    expect(c.participantes).toEqual(antes);
    expect(c.execucoes).toHaveLength(0);
  });
  it('preferência ausente e gênero não informado aparecem como dados pendentes', async () => {
    const c = cenarioMatching({ alunos: 1 });
    c.configs[0].criterios = [
      {
        campoCadastro: 'preferenciaGenero',
        operacao: 'preferencia_genero',
        peso: 100,
      },
    ];
    c.participantes.forEach((p) => {
      p.respostas!.preferenciaGenero = { modo: 'sem_preferencia', generos: [] };
      p.respostas!.genero = 'Feminino';
    });
    delete c.participantes.find((p) => p.id === 100)!.respostas!.genero;
    const d = (await c.service.visao('2026/2')).diagnosticoDados;
    expect(d.criterios[0].apadrinhados).toEqual({ conhecidos: 0, total: 1 });
    expect(d.criterios[0].padrinhos.conhecidos).toBe(
      d.criterios[0].padrinhos.total,
    );
  });
  it('participação terminada não é anunciada como elegível antes da execução', async () => {
    const c = cenarioMatching({ padrinhos: 1, alunos: 1 });
    c.participantes[0].terminoEm = new Date();
    const visao = await c.service.visao('2026/2');
    expect(visao.totais.padrinhosElegiveis).toBe(0);
    expect(visao.podeExecutar).toBe(false);
  });
  it('não sobrescreve configuração alterada por outro coordenador', async () => {
    const c = cenarioMatching();
    const base = {
      programa: '2026/2',
      versaoBase: c.configs[0].versao,
      liberado: true,
      capacidadePorPadrinho: 3,
      capacidadePorApadrinhado: 1,
      criterios: c.configs[0].criterios,
    };
    const primeira = await c.service.salvarConfiguracao(
      base,
      'primeiro@pucminas.edu.br',
    );
    await expect(
      c.service.salvarConfiguracao(
        { ...base, capacidadePorPadrinho: 4 },
        'segundo@pucminas.edu.br',
      ),
    ).rejects.toThrow(ConflictException);
    expect(c.configs).toHaveLength(2);
    expect(c.configs.at(-1)?.id).toBe(primeira.id);
    expect(c.configs.at(-1)?.capacidadePorPadrinho).toBe(3);
  });
  it('consulta do aluno conserva todos os vínculos e as identidades dos grupos', async () => {
    const c = cenarioMatching({ padrinhos: 2, alunos: 1 });
    c.configs[0].capacidadePorApadrinhado = 2;
    await c.operacoes.vincular(100, 1, 'coord@pucminas.edu.br');
    await c.operacoes.vincular(100, 2, 'coord@pucminas.edu.br');
    const controller = new ParticipacoesController(
      new ParticipacoesService(
        c.repos.ParticipacaoEntity,
        c.repos.ProgramaEntity,
        c.dados,
      ),
      new ProgramasService(c.repos.ProgramaEntity),
      {
        buscarPorEmail: async () => ({
          nome: 'Aluno',
          curso: 'Software',
          periodo: 1,
          interesses: [],
        }),
      } as unknown as UsuariosService,
    );
    const req = {
      user: { email: c.participantes.find((p) => p.id === 100)!.usuarioId },
    } as AuthenticatedRequest;
    const atual = await controller.situacao(
      req,
      undefined,
      undefined,
      '2026/2',
    );
    expect(atual.padrinhos).toHaveLength(2);
    expect(new Set(atual.padrinhos.map((p) => p.grupoId)).size).toBe(2);
    expect(atual.padrinhos.every((p) => p.vinculoId && p.grupo)).toBe(true);
    expect(atual.podeConversar).toBe(true);
    c.programas[0].etapaAtual = 'encerramento';
    const encerrado = await controller.situacao(
      req,
      undefined,
      undefined,
      '2026/2',
    );
    expect(encerrado).toMatchObject({
      situacao: 'concluido',
      podeConversar: false,
      padrinhos: [],
      padrinho: null,
    });
    expect(c.vinculos.filter((v) => v.ativo)).toHaveLength(2);
    c.participantes.find((p) => p.id === 100)!.status = 'nao_aprovado';
    expect(
      (await controller.situacao(req, undefined, undefined, '2026/2')).situacao,
    ).toBe('apadrinhado_rejeitado');
  });
});
