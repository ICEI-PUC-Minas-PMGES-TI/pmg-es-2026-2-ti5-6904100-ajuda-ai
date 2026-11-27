import type { AuthenticatedRequest } from '../auth/authenticated-request.js';
import type { ConquistasService } from '../gamificacao/conquistas/conquistas.service.js';
import { PASSADAS_MAX } from '../gamificacao/conquistas/conquistas.service.js';
import { normalizarImagemConquista } from '../gamificacao/conquistas/conquistas.js';
import { NIVEIS } from '../gamificacao/economia.js';
import type { FeedMidiasService } from './feed-midias.service.js';
import type { FeedPolicy } from './feed-policy.js';
import type { FeedStreamService } from './feed-stream.service.js';
import { PublicacoesController } from './publicacoes.controller.js';
import type { PublicacoesService } from './publicacoes.service.js';

/**
 * F32: publicar e comentar conferem as conquistas depois do commit, no ciclo
 * da publicação (o semestre da atividade), não só na próxima consulta.
 */
describe('feed confere as conquistas no ciclo da atividade', () => {
  const req = {
    user: { sub: '7', email: 'aluno@pucminas.edu.br', perfil: 'padrinho' },
  } as unknown as AuthenticatedRequest;

  function montar() {
    const ordem: string[] = [];
    const publicacoes = {
      criar: vi.fn(async () => {
        ordem.push('commit');
        return { id: 1, programa: '2026/1' };
      }),
      comentar: vi.fn(async () => {
        ordem.push('commit');
        return { id: 2, programa: '2026/1' };
      }),
    };
    const aceita = { programa: '2026/1', participante: true };
    const conquistas = {
      aceita,
      elegibilidadeNoFeed: vi.fn(async () => {
        ordem.push('elegibilidade');
        return aceita;
      }),
      aposAtividadeNoFeed: vi.fn(async () => {
        ordem.push('conquistas');
        return [];
      }),
    };
    const controller = new PublicacoesController(
      publicacoes as unknown as PublicacoesService,
      {} as FeedStreamService,
      {} as FeedMidiasService,
      {} as FeedPolicy,
      conquistas as unknown as ConquistasService,
    );
    return { controller, conquistas, ordem };
  }

  it('publicar: confere depois do commit, com o ciclo da publicação', async () => {
    const { controller, conquistas, ordem } = montar();
    const resposta = await controller.criar(
      { texto: 'Olá, turma!', categoria: 'Geral' } as never,
      req,
    );
    expect(resposta).toEqual({ id: 1, programa: '2026/1' });
    // Elegibilidade lida quando a ação é aceita, passada à conferência.
    expect(conquistas.aposAtividadeNoFeed).toHaveBeenCalledWith(
      req.user,
      '2026/1',
      conquistas.aceita,
    );
    expect(ordem).toEqual(['elegibilidade', 'commit', 'conquistas']);
  });

  it('comentar: confere depois do commit, com o ciclo do post comentado', async () => {
    const { controller, conquistas, ordem } = montar();
    await controller.comentar(2, { texto: 'Boa ideia!' } as never, req);
    // Elegibilidade lida quando a ação é aceita, passada à conferência.
    expect(conquistas.aposAtividadeNoFeed).toHaveBeenCalledWith(
      req.user,
      '2026/1',
      conquistas.aceita,
    );
    expect(ordem).toEqual(['elegibilidade', 'commit', 'conquistas']);
  });

  it('sem o módulo de conquistas (testes do feed), a ação segue normal', async () => {
    const controller = new PublicacoesController(
      { criar: async () => ({ id: 1, programa: null }) } as never,
      {} as FeedStreamService,
      {} as FeedMidiasService,
      {} as FeedPolicy,
    );
    await expect(controller.criar({} as never, req)).resolves.toEqual({
      id: 1,
      programa: null,
    });
  });
});

describe('regras das correções do F32', () => {
  it('passadas suficientes para subir todos os níveis numa consulta', () => {
    // Nível sobe no máximo NIVEIS.length - 1 vezes; +1 passada inicial.
    expect(PASSADAS_MAX).toBeGreaterThanOrEqual(NIVEIS.length);
  });

  it('imagem: protocolo em minúsculas, espaços fora, vazia vira null', () => {
    expect(normalizarImagemConquista('HTTPS://a.b/C.PNG')).toBe(
      'https://a.b/C.PNG',
    );
    expect(normalizarImagemConquista('  https://a.b/c ')).toBe('https://a.b/c');
    expect(normalizarImagemConquista('   ')).toBeNull();
    expect(normalizarImagemConquista(null)).toBeNull();
    expect(normalizarImagemConquista(undefined)).toBeNull();
  });
});
