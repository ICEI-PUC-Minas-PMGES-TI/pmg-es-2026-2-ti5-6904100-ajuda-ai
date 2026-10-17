import type { Repository } from 'typeorm';
import { ParticipacaoEntity } from './entities/participacao.entity.js';
import { repositorioEmMemoria } from '../../test/helpers/repositorio-memoria.js';
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
  let proximoId: number;
  let service: ParticipacoesService;

  beforeEach(() => {
    registros = [];
    proximoId = 1;
    service = new ParticipacoesService(criarRepo(), ciclos());
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
    const rejeitado = await service.rejeitarCandidaturaPorId(registro.id);
    const reenvio = await service.cadastrarApadrinhado({
      usuarioId: 'a1@pucminas.edu.br',
      programa: '2026/2',
      respostas: { expectativa: 'nova' },
    });

    expect(rejeitado.status).toBe('nao_aprovado');
    expect(ParticipacoesService.situacaoDe(rejeitado)).toBe(
      'apadrinhado_rejeitado',
    );
    expect(reenvio.respostas?.expectativa).toBe('original');
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
      /ainda não foi aprovado/,
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

  it('reenviar candidatura pendente atualiza as respostas sem duplicar', async () => {
    await service.registrarCandidaturaPadrinho({
      usuarioId: 'rafa@pucminas.edu.br',
      programa: '2026/2',
      respostas: { motivacao: 'primeira' },
    });
    const editada = await service.registrarCandidaturaPadrinho({
      usuarioId: 'rafa@pucminas.edu.br',
      programa: '2026/2',
      respostas: { motivacao: 'segunda' },
    });

    expect(registros).toHaveLength(1);
    expect(editada.respostas?.motivacao).toBe('segunda');
  });

  it('candidatura rejeitada não é mais editável', async () => {
    const candidatura = await service.registrarCandidaturaPadrinho({
      usuarioId: 'rafa@pucminas.edu.br',
      programa: '2026/2',
      respostas: { motivacao: 'original' },
    });
    await service.rejeitarCandidaturaPorId(candidatura.id);
    const tentativa = await service.registrarCandidaturaPadrinho({
      usuarioId: 'rafa@pucminas.edu.br',
      programa: '2026/2',
      respostas: { motivacao: 'nova' },
    });

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

    expect(aprovada.papel).toBe('padrinho');
    expect(aprovada.status).toBe('em_andamento');
    await expect(
      service.rejeitarCandidaturaPorId(candidatura.id),
    ).rejects.toThrow(/não aprovadas/);
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

    expect(atualizado.grupo).toBe('Grupo 01');
    expect(apadrinhado.grupo).toBe('Grupo 01');
    expect(atualizado.apadrinhados).toBe(2);
    expect(ParticipacoesService.situacaoDe(apadrinhado)).toBe(
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
    ).rejects.toThrow(/padrinho aprovado/);
  });

  it('registro principal prioriza padrinho sobre apadrinhado', async () => {
    await service.cadastrarApadrinhado({
      usuarioId: 'duplo@pucminas.edu.br',
      programa: '2026/2',
    });
    const candidatura = await service.registrarCandidaturaPadrinho({
      usuarioId: 'duplo@pucminas.edu.br',
      programa: '2026/2',
    });
    await service.aprovarCandidatura(candidatura.id);

    const principal = await service.registroPrincipal(
      'duplo@pucminas.edu.br',
      '2026/2',
    );
    expect(principal?.papel).toBe('padrinho');
  });

  /** Repositório em memória que entende `where` simples (igualdade). */
  function criarRepo(): Repository<ParticipacaoEntity> {
    const corresponde = (
      registro: ParticipacaoEntity,
      where: Record<string, unknown> = {},
    ) =>
      Object.entries(where).every(([chave, valor]) => {
        const atual = (registro as unknown as Record<string, unknown>)[chave];
        if (valor && typeof valor === 'object' && '_value' in valor) {
          return (valor as { _value: unknown[] })._value.includes(atual);
        }
        return atual === valor;
      });

    return {
      create: (dados: Partial<ParticipacaoEntity>) =>
        ({ ...dados }) as ParticipacaoEntity,
      save: async (entidade: ParticipacaoEntity) => {
        if (!entidade.id) {
          entidade.id = proximoId++;
          entidade.criadoEm = new Date(Date.now() + entidade.id);
          registros.push(entidade);
        }
        entidade.atualizadoEm = new Date();
        return entidade;
      },
      find: async (opcoes?: { where?: Record<string, unknown> }) =>
        registros.filter((r) => corresponde(r, opcoes?.where)),
      findOne: async (opcoes: { where: Record<string, unknown> }) =>
        registros.find((r) => corresponde(r, opcoes.where)) ?? null,
    } as unknown as Repository<ParticipacaoEntity>;
  }
});
