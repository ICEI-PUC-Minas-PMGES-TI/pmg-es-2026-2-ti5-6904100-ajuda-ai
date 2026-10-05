import type { Repository } from 'typeorm';
import { ParticipacaoEntity } from './entities/participacao.entity.js';
import { ParticipacoesService } from './participacoes.service.js';

describe('ParticipacoesService', () => {
  let registros: ParticipacaoEntity[];
  let proximoId: number;
  let service: ParticipacoesService;

  beforeEach(() => {
    registros = [];
    proximoId = 1;
    service = new ParticipacoesService(criarRepo());
  });

  it('lista vazio quando o usuário não tem participações', async () => {
    await expect(service.listarPorUsuario('camila@pucminas.edu.br')).resolves.toEqual(
      [],
    );
  });

  it('registra candidatura uma única vez (idempotente)', async () => {
    const primeira = await service.registrarCandidaturaPadrinho({
      usuarioId: 'camila@pucminas.edu.br',
      programa: '2026/2',
    });
    const segunda = await service.registrarCandidaturaPadrinho({
      usuarioId: 'Camila@pucminas.edu.br',
      programa: '2026/2',
    });

    expect(primeira.id).toBe(segunda.id);
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

  it('confirma ingresso e preserva histórico de ciclos distintos', async () => {
    await service.confirmarIngresso({
      usuarioId: '1',
      papel: 'apadrinhado',
      programa: '2026/1',
    });
    await service.registrarCandidaturaPadrinho({
      usuarioId: '1',
      programa: '2026/2',
    });
    await service.confirmarIngresso({
      usuarioId: '1',
      papel: 'padrinho',
      programa: '2026/2',
      grupo: 'Grupo 08',
      apadrinhados: 2,
    });

    // confirmação repetida não duplica
    await service.confirmarIngresso({
      usuarioId: '1',
      papel: 'padrinho',
      programa: '2026/2',
    });

    const lista = await service.listarPorUsuario('1');
    expect(lista).toHaveLength(2);
    expect(lista[0].programa).toBe('2026/2');
    expect(lista[0].papel).toBe('padrinho');
    expect(lista[0].status).toBe('em_andamento');
    expect(lista[1].programa).toBe('2026/1');
    expect(lista[1].papel).toBe('apadrinhado');
  });

  it('rejeita candidatura sem apagar histórico anterior', async () => {
    await service.confirmarIngresso({
      usuarioId: '2',
      papel: 'apadrinhado',
      programa: '2025/2',
    });
    await service.registrarCandidaturaPadrinho({
      usuarioId: '2',
      programa: '2026/2',
    });
    await service.rejeitarCandidatura({
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

  function criarRepo(): Repository<ParticipacaoEntity> {
    return {
      create: (dados: Partial<ParticipacaoEntity>) =>
        ({ ...dados }) as ParticipacaoEntity,
      save: async (entidade: ParticipacaoEntity) => {
        if (!entidade.id) {
          entidade.id = proximoId++;
          entidade.criadoEm = new Date();
          entidade.atualizadoEm = new Date();
          registros.push(entidade);
          return entidade;
        }
        const indice = registros.findIndex((r) => r.id === entidade.id);
        entidade.atualizadoEm = new Date();
        if (indice >= 0) {
          registros[indice] = entidade;
        } else {
          registros.push(entidade);
        }
        return entidade;
      },
      find: async (opcoes?: {
        where?: { usuarioId?: string };
        order?: { programa?: 'ASC' | 'DESC' };
      }) => {
        let lista = registros.filter(
          (r) => r.usuarioId === opcoes?.where?.usuarioId,
        );
        lista = [...lista].sort((a, b) =>
          b.programa.localeCompare(a.programa),
        );
        return lista;
      },
      findOne: async (opcoes: {
        where: {
          usuarioId: string;
          programa: string;
          papel: string;
        };
      }) =>
        registros.find(
          (r) =>
            r.usuarioId === opcoes.where.usuarioId &&
            r.programa === opcoes.where.programa &&
            r.papel === opcoes.where.papel,
        ) ?? null,
    } as unknown as Repository<ParticipacaoEntity>;
  }
});
