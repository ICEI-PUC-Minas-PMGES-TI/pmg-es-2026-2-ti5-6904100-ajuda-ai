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
    ].map((codigo, i) => ({ id: i + 1, codigo }) as ProgramaEntity),
  );

/** Fluxo completo: cadastro → análise → aprovação/rejeição → vínculo. */
describe('ParticipacoesService (fluxo da coordenação)', () => {
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

  it('cadastra apadrinhado pendente de aprovação e limpa respostas', async () => {
    const registro = await service.cadastrarApadrinhado({
      usuarioId: 'Fernanda@PUCMinas.edu.br',
      programa: '2026/2',
      respostas: {
        nome: '  Fernanda  ',
        periodo: 1,
        areas: ['Projetos', ''],
        expectativa: 'x'.repeat(900),
        // campo desconhecido não deve ser salvo
        ...({ senha: '123' } as object),
      },
    });

    expect(registro.usuarioId).toBe('fernanda@pucminas.edu.br');
    expect(registro.papel).toBe('apadrinhado');
    expect(registro.status).toBe('pendente');
    expect(registro.respostas?.nome).toBe('Fernanda');
    expect(registro.respostas?.areas).toEqual(['Projetos']);
    expect(registro.respostas?.expectativa).toHaveLength(500);
    expect(registro.respostas).not.toHaveProperty('senha');
    expect(ParticipacoesService.situacaoDe(registro)).toBe(
      'apadrinhado_pendente',
    );
  });

  it('aprovar o cadastro do apadrinhado o deixa aguardando match', async () => {
    const registro = await service.cadastrarApadrinhado({
      usuarioId: 'a1@pucminas.edu.br',
      programa: '2026/2',
    });
    const aprovado = await service.aprovarCandidatura(registro.id);

    expect(aprovado.papel).toBe('apadrinhado');
    expect(aprovado.status).toBe('em_andamento');
    expect(ParticipacoesService.situacaoDe(aprovado)).toBe(
      'apadrinhado_aguardando',
    );
  });

  it('rejeita cadastro de apadrinhado pendente e bloqueia edição', async () => {
    const registro = await service.cadastrarApadrinhado({
      usuarioId: 'a1@pucminas.edu.br',
      programa: '2026/2',
      respostas: { expectativa: 'original' },
    });
    const rejeitado = await service.rejeitarCandidaturaPorId(
      registro.id,
      'Requisitos não confirmados.',
    );
    await expect(
      service.cadastrarApadrinhado({
        usuarioId: 'a1@pucminas.edu.br',
        programa: '2026/2',
        respostas: { expectativa: 'nova' },
      }),
    ).rejects.toThrow(/Já existe/);

    expect(rejeitado.status).toBe('nao_aprovado');
    expect(ParticipacoesService.situacaoDe(rejeitado)).toBe(
      'apadrinhado_rejeitado',
    );
    expect(rejeitado.respostas?.expectativa).toBe('original');
  });

  it('não vincula apadrinhado com cadastro pendente', async () => {
    const candidatura = await service.registrarCandidaturaPadrinho({
      usuarioId: 'padrinho@pucminas.edu.br',
      programa: '2026/2',
    });
    const padrinho = await service.aprovarCandidatura(candidatura.id);
    const pendente = await service.cadastrarApadrinhado({
      usuarioId: 'a1@pucminas.edu.br',
      programa: '2026/2',
    });

    await expect(service.vincular(pendente.id, padrinho.id)).rejects.toThrow(
      /apadrinhado aprovado/,
    );
  });

  it('não cria participação em ciclo inexistente (padrinho, apadrinhado, ingresso)', async () => {
    await expect(
      service.cadastrarApadrinhado({
        usuarioId: 'a@pucminas.edu.br',
        programa: '2099/1',
      }),
    ).rejects.toThrow(/Ciclo 2099\/1 não cadastrado/);
    await expect(
      service.registrarCandidaturaPadrinho({
        usuarioId: 'p@pucminas.edu.br',
        programa: '2099/1',
      }),
    ).rejects.toThrow(/não cadastrado/);
    await expect(
      service.confirmarIngresso({
        usuarioId: 'x@pucminas.edu.br',
        papel: 'padrinho',
        programa: '2099/1',
      }),
    ).rejects.toThrow(/não cadastrado/);
    expect(registros).toHaveLength(0);
  });

  it('reenviar candidatura pendente é recusado e preserva respostas', async () => {
    await service.registrarCandidaturaPadrinho({
      usuarioId: 'rafa@pucminas.edu.br',
      programa: '2026/2',
      respostas: { motivacao: 'primeira' },
    });
    await expect(
      service.registrarCandidaturaPadrinho({
        usuarioId: 'rafa@pucminas.edu.br',
        programa: '2026/2',
        respostas: { motivacao: 'segunda' },
      }),
    ).rejects.toThrow(/Já existe/);

    expect(registros).toHaveLength(1);
    expect(registros[0].respostas?.motivacao).toBe('primeira');
  });

  it('candidatura rejeitada não é mais editável', async () => {
    const candidatura = await service.registrarCandidaturaPadrinho({
      usuarioId: 'rafa@pucminas.edu.br',
      programa: '2026/2',
      respostas: { motivacao: 'original' },
    });
    await service.rejeitarCandidaturaPorId(
      candidatura.id,
      'Requisitos não confirmados.',
    );
    await expect(
      service.registrarCandidaturaPadrinho({
        usuarioId: 'rafa@pucminas.edu.br',
        programa: '2026/2',
        respostas: { motivacao: 'nova' },
      }),
    ).rejects.toThrow(/Já existe/);
    const tentativa = await service.buscarPorId(candidatura.id);

    expect(tentativa.status).toBe('nao_aprovado');
    expect(tentativa.respostas?.motivacao).toBe('original');
    expect(ParticipacoesService.situacaoDe(tentativa)).toBe(
      'candidatura_rejeitada',
    );
  });

  it('aprova candidatura e impede rejeitar depois', async () => {
    const candidatura = await service.registrarCandidaturaPadrinho({
      usuarioId: 'rafa@pucminas.edu.br',
      programa: '2026/2',
    });
    const aprovada = await service.aprovarCandidatura(candidatura.id);

    expect(aprovada.papel).toBe('candidato');
    expect(aprovada.status).toBe('aprovado');
    await expect(
      service.rejeitarCandidaturaPorId(
        candidatura.id,
        'Requisitos não confirmados.',
      ),
    ).rejects.toThrow(/aguardando decisão/);
  });

  it('desfaz vínculo e só então permite revogar aprovação', async () => {
    const candidatura = await service.registrarCandidaturaPadrinho({
      usuarioId: 'padrinho@pucminas.edu.br',
      programa: '2026/2',
    });
    const padrinho = await service.aprovarCandidatura(candidatura.id);
    const apadrinhado = await service.cadastrarApadrinhado({
      usuarioId: 'a1@pucminas.edu.br',
      programa: '2026/2',
      statusInicial: 'em_andamento',
      respostas: { periodo: 1, declaraPrimeiroPeriodo: true },
    });
    await service.vincular(apadrinhado.id, padrinho.id);

    await expect(
      service.revogarAprovacao(apadrinhado.id, 'erro de análise'),
    ).rejects.toThrow(/Desfaça o vínculo/);

    const { apadrinhado: solto, padrinho: candidato } =
      await service.desvincular(apadrinhado.id);
    expect(solto.grupo).toBeFalsy();
    expect(candidato?.papel).toBe('candidato');
    expect(candidato?.status).toBe('aprovado');

    const revogado = await service.revogarAprovacao(
      solto.id,
      'Requisitos não confirmados no sistema acadêmico.',
    );
    expect(revogado.status).toBe('nao_aprovado');
    expect(revogado.respostas?._servidor?.decisao?.justificativa).toMatch(
      /sistema acadêmico/,
    );
  });

  it('volta para análise e guarda observações aparadas', async () => {
    const candidatura = await service.registrarCandidaturaPadrinho({
      usuarioId: 'rafa@pucminas.edu.br',
      programa: '2026/2',
    });
    const atualizada = await service.atualizarCandidatura(candidatura.id, {
      status: 'em_analise',
      observacoes: '  conferir histórico  ',
    });

    expect(atualizada.status).toBe('em_analise');
    expect(atualizada.observacoes).toBe('conferir histórico');
    expect(ParticipacoesService.situacaoDe(atualizada)).toBe(
      'candidatura_em_analise',
    );
  });

  it('vincula apadrinhado criando grupo e recontando apadrinhados', async () => {
    const candidatura = await service.registrarCandidaturaPadrinho({
      usuarioId: 'padrinho@pucminas.edu.br',
      programa: '2026/2',
    });
    const padrinho = await service.aprovarCandidatura(candidatura.id);
    const a1 = await service.cadastrarApadrinhado({
      usuarioId: 'a1@pucminas.edu.br',
      programa: '2026/2',
      statusInicial: 'em_andamento',
    });
    const a2 = await service.cadastrarApadrinhado({
      usuarioId: 'a2@pucminas.edu.br',
      programa: '2026/2',
      statusInicial: 'em_andamento',
    });

    await service.vincular(a1.id, padrinho.id);
    const { apadrinhado, padrinho: atualizado } = await service.vincular(
      a2.id,
      padrinho.id,
    );

    expect(atualizado.grupo).toBe('Grupo-1');
    expect(apadrinhado.grupo).toBe('Grupo-1');
    expect(atualizado.apadrinhados).toBe(2);
    expect(await service.situacaoDoRegistro(apadrinhado)).toBe(
      'apadrinhado_ativo',
    );
  });

  it('não vincula a quem não é padrinho aprovado', async () => {
    const candidatura = await service.registrarCandidaturaPadrinho({
      usuarioId: 'cand@pucminas.edu.br',
      programa: '2026/2',
    });
    const apadrinhado = await service.cadastrarApadrinhado({
      usuarioId: 'a1@pucminas.edu.br',
      programa: '2026/2',
      statusInicial: 'em_andamento',
    });

    await expect(
      service.vincular(apadrinhado.id, candidatura.id),
    ).rejects.toThrow(/candidato aprovado/);
  });

  it('registro principal prioriza padrinho sobre apadrinhado', async () => {
    await service.cadastrarApadrinhado({
      usuarioId: 'duplo@pucminas.edu.br',
      programa: '2026/2',
    });
    // Registros legados com múltiplos papéis continuam legíveis.
    registros.push({
      id: 99,
      usuarioId: 'duplo@pucminas.edu.br',
      programa: '2026/2',
      papel: 'padrinho',
      status: 'em_andamento',
    } as ParticipacaoEntity);

    const principal = await service.registroPrincipal(
      'duplo@pucminas.edu.br',
      '2026/2',
    );
    expect(principal?.papel).toBe('padrinho');
  });

  it('registro principal prioriza apadrinhado ativo sobre candidatura residual', async () => {
    registros.push(
      {
        id: 1,
        usuarioId: 'camila@pucminas.edu.br',
        programa: '2026/2',
        papel: 'candidato',
        status: 'em_analise',
      } as ParticipacaoEntity,
      {
        id: 8,
        usuarioId: 'camila@pucminas.edu.br',
        programa: '2026/2',
        papel: 'apadrinhado',
        status: 'em_andamento',
        grupo: 'Grupo 08',
      } as ParticipacaoEntity,
    );

    const principal = await service.registroPrincipal(
      'camila@pucminas.edu.br',
      '2026/2',
    );
    expect(principal?.papel).toBe('apadrinhado');
    expect(principal?.status).toBe('em_andamento');
  });

  /** Repositório em memória que entende `where` simples (igualdade). */
});
