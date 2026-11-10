import { ParticipacaoEntity } from './entities/participacao.entity.js';
import {
  repositorioEmMemoria,
  conectarRepositorios,
} from '../../test/helpers/repositorio-memoria.js';
import type { ProgramaEntity } from '../programas/entities/programa.entity.js';
import { ParticipacoesService } from './participacoes.service.js';

/** Ciclos cadastrados usados nestes testes (participação exige ciclo existente). */
const ciclos = () =>
  repositorioEmMemoria(
    [
      ...new Set([
        '2025/2',
        '2026/1',
        '2026/2',
        ParticipacoesService.programaAtual(),
      ]),
    ].map(
      (codigo, i) =>
        ({ id: i + 1, codigo, etapaAtual: 'formacao' }) as ProgramaEntity,
    ),
  );

describe('ParticipacoesService', () => {
  let registros: ParticipacaoEntity[];
  let service: ParticipacoesService;

  beforeEach(() => {
    registros = [];
    const repo = repositorioEmMemoria(registros);
    const programas = ciclos();
    conectarRepositorios({
      ParticipacaoEntity: repo,
      ProgramaEntity: programas,
    });
    service = new ParticipacoesService(repo, programas);
  });

  it('lista vazio quando o usuário não tem participações', async () => {
    await expect(
      service.listarPorUsuario('camila@pucminas.edu.br'),
    ).resolves.toEqual([]);
  });

  it('registra candidatura uma única vez (idempotente)', async () => {
    const primeira = await service.registrarCandidaturaPadrinho({
      usuarioId: 'camila@pucminas.edu.br',
      programa: '2026/2',
    });
    await expect(
      service.registrarCandidaturaPadrinho({
        usuarioId: 'Camila@pucminas.edu.br',
        programa: '2026/2',
      }),
    ).rejects.toThrow(/Já existe/);

    expect(primeira.id).toBeDefined();
    expect(primeira.papel).toBe('candidato');
    expect(primeira.status).toBe('pendente');
    expect(registros).toHaveLength(1);
  });

  it('não cria padrinho ativo ao candidatar', async () => {
    const registro = await service.registrarCandidaturaPadrinho({
      usuarioId: '1',
      programa: '2026/2',
    });

    expect(registro.papel).toBe('candidato');
    expect(registro.status).not.toBe('em_andamento');
  });

  it.each([true, false])(
    'preserva a resposta booleana %s no cadastro',
    async (resposta) => {
      const registro = await service.registrarCandidaturaPadrinho({
        usuarioId: '1',
        programa: '2026/2',
        respostas: { extras: { 'pergunta-sim-nao': resposta } },
      });

      expect(registro.respostas?.extras).toEqual({
        'pergunta-sim-nao': resposta,
      });
    },
  );

  it('mantém a sanitização dos demais tipos de respostas extras', async () => {
    const registro = await service.registrarCandidaturaPadrinho({
      usuarioId: '1',
      programa: '2026/2',
      respostas: {
        extras: {
          texto: '  resposta  ',
          checklist: [' opção 1 ', 'opção 2'],
        },
      },
    });

    expect(registro.respostas?.extras).toEqual({
      texto: 'resposta',
      checklist: ['opção 1', 'opção 2'],
    });
  });

  it('confirma ingresso e preserva histórico de ciclos distintos', async () => {
    await service.cadastrarApadrinhado({
      usuarioId: '1',
      programa: '2026/1',
    });
    await service.registrarCandidaturaPadrinho({
      usuarioId: '1',
      programa: '2026/2',
    });
    const candidato = (await service.registroPrincipal('1', '2026/2'))!;
    await service.aprovarCandidatura(candidato.id);
    const apadrinhado = await service.cadastrarApadrinhado({
      usuarioId: 'calouro',
      programa: '2026/2',
      statusInicial: 'em_andamento',
    });
    await service.vincular(apadrinhado.id, candidato.id);

    // confirmação repetida não duplica
    await service.confirmarIngresso({
      usuarioId: '1',
      papel: 'padrinho',
      programa: '2026/2',
    });

    const lista = (await service.listarPorUsuario('1')).sort((a, b) =>
      b.programa.localeCompare(a.programa),
    );
    expect(lista).toHaveLength(2);
    expect(lista[0].programa).toBe('2026/2');
    expect(lista[0].papel).toBe('padrinho');
    expect(lista[0].status).toBe('em_andamento');
    expect(lista[1].programa).toBe('2026/1');
    expect(lista[1].papel).toBe('apadrinhado');
  });

  it('rejeita candidatura sem apagar histórico anterior', async () => {
    await service.cadastrarApadrinhado({
      usuarioId: '2',
      programa: '2025/2',
    });
    await service.registrarCandidaturaPadrinho({
      usuarioId: '2',
      programa: '2026/2',
    });
    await service.rejeitarCandidatura({
      justificativa: 'Requisitos não confirmados.',
      usuarioId: '2',
      programa: '2026/2',
    });

    const lista = await service.listarPorUsuario('2');
    expect(lista).toHaveLength(2);
    expect(lista.find((p) => p.programa === '2026/2')?.status).toBe(
      'nao_aprovado',
    );
    expect(lista.find((p) => p.programa === '2025/2')?.papel).toBe(
      'apadrinhado',
    );
  });
});
