import 'reflect-metadata';
import {
  ExecutionContext,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { GUARDS_METADATA, METHOD_METADATA } from '@nestjs/common/constants.js';
import type { DataSource } from 'typeorm';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard.js';
import { NIVEIS, nivelDe } from '../economia.js';
import { configQaGamificacao, emailAutorizadoQa } from './qa-gamificacao.config.js';
import { QaGamificacaoController } from './qa-gamificacao.controller.js';
import { QaGamificacaoGuard } from './qa-gamificacao.guard.js';
import { QaGamificacaoService } from './qa-gamificacao.service.js';

// Conta já existente liberada pela lista (ex.: Camila no ambiente local).
const QA = { sub: '40', email: 'camila@pucminas.edu.br' };
const COMUM = { sub: '41', email: 'demo.sofia.martins@pucminas.edu.br' };

/** `usuarios` com as duas contas (id + e-mail, como `usuarioDoTokenOuNulo` confere). */
function banco(): DataSource & { query: ReturnType<typeof vi.fn> } {
  const linhas: Record<number, string> = { 40: QA.email, 41: COMUM.email };
  return {
    options: {},
    query: vi.fn(async (sql: string, [id]: [number]) => {
      if (!sql.includes('"usuarios"')) throw new Error(`SQL inesperado: ${sql}`);
      return linhas[id] ? [{ id, email: linhas[id] }] : [];
    }),
  } as unknown as DataSource & { query: ReturnType<typeof vi.fn> };
}

function contexto(user: unknown): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => ({ user, method: 'GET', path: '/qa/gamificacao/acesso' }),
    }),
  } as unknown as ExecutionContext;
}

const ENV_ORIGINAL = { ...process.env };
afterEach(() => {
  process.env = { ...ENV_ORIGINAL };
});

describe('configuração do painel de QA', () => {
  it('desligado por padrão (lista vazia)', () => {
    expect(configQaGamificacao({}).habilitado).toBe(false);
    expect(configQaGamificacao({ GAMIFICACAO_QA_EMAILS: ' , lixo ' }).habilitado).toBe(false);
  });

  it('lista normalizada (minúsculas, espaços, inválidos ignorados)', () => {
    const c = configQaGamificacao({
      GAMIFICACAO_QA_EMAILS: ' QA@PucMinas.edu.br , não-é-email ,outro@pucminas.edu.br',
    });
    expect(c.habilitado).toBe(true);
    expect([...c.emails]).toEqual(['qa@pucminas.edu.br', 'outro@pucminas.edu.br']);
    expect(emailAutorizadoQa(c, 'Qa@pucminas.edu.br')).toBe(true);
    expect(emailAutorizadoQa(c, 'aluno@pucminas.edu.br')).toBe(false);
    expect(emailAutorizadoQa(c, undefined)).toBe(false);
  });

  it('produção exige liberação explícita além da lista', () => {
    const base = { GAMIFICACAO_QA_EMAILS: QA.email, NODE_ENV: 'production' };
    expect(configQaGamificacao(base).habilitado).toBe(false);
    expect(
      configQaGamificacao({ ...base, GAMIFICACAO_QA_PRODUCAO: 'true' }).habilitado,
    ).toBe(true);
  });

  it('nenhuma conta tem acesso só por existir (nada fixo no código)', () => {
    expect(emailAutorizadoQa(configQaGamificacao({}), QA.email)).toBe(false);
  });
});

describe('guard do painel de QA (validação no backend)', () => {
  it('painel desligado → 404 para todos, inclusive a conta de QA', async () => {
    delete process.env.GAMIFICACAO_QA_EMAILS;
    const guard = new QaGamificacaoGuard(banco());
    await expect(guard.canActivate(contexto(QA))).rejects.toBeInstanceOf(NotFoundException);
  });

  it('usuário comum autenticado → 403', async () => {
    process.env.GAMIFICACAO_QA_EMAILS = QA.email;
    const guard = new QaGamificacaoGuard(banco());
    await expect(guard.canActivate(contexto(COMUM))).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('e-mail autorizado mas token de outro usuário (sub ≠ e-mail) → 403', async () => {
    process.env.GAMIFICACAO_QA_EMAILS = QA.email;
    const guard = new QaGamificacaoGuard(banco());
    await expect(
      guard.canActivate(contexto({ sub: '41', email: QA.email })),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('e-mail autorizado sem conta no banco → 403', async () => {
    process.env.GAMIFICACAO_QA_EMAILS = 'fantasma@pucminas.edu.br';
    const guard = new QaGamificacaoGuard(banco());
    await expect(
      guard.canActivate(contexto({ sub: '99', email: 'fantasma@pucminas.edu.br' })),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('conta de QA autorizada → passa (e o banco só é LIDO)', async () => {
    process.env.GAMIFICACAO_QA_EMAILS = `outra@pucminas.edu.br, ${QA.email.toUpperCase()}`;
    const ds = banco();
    const guard = new QaGamificacaoGuard(ds);
    await expect(guard.canActivate(contexto(QA))).resolves.toBe(true);
    for (const [sql] of ds.query.mock.calls) expect(sql).toMatch(/^SELECT /);
  });

  it('o controller exige JWT e o guard de QA, e só tem rotas GET', () => {
    const guards = Reflect.getMetadata(GUARDS_METADATA, QaGamificacaoController);
    expect(guards).toEqual([JwtAuthGuard, QaGamificacaoGuard]);
    const proto = QaGamificacaoController.prototype as unknown as Record<string, unknown>;
    const rotas = Object.getOwnPropertyNames(proto).filter((n) => n !== 'constructor');
    expect(rotas.sort()).toEqual(['acesso', 'simulacao']);
    for (const nome of rotas) {
      // RequestMethod.GET = 0
      expect(Reflect.getMetadata(METHOD_METADATA, proto[nome] as object)).toBe(0);
    }
  });
});

describe('simulação de qualquer nível (sem banco)', () => {
  const qa = new QaGamificacaoService();

  it('o acesso devolve a tabela REAL de níveis (sem limite artificial)', () => {
    const { niveis } = qa.acesso();
    expect(niveis).toEqual(NIVEIS.map((n) => ({ ...n })));
  });

  it.each(NIVEIS.map((n) => [n.numero] as const))(
    'nível %i: perfil simulado coerente com nivelDe (nível, barra, XP, emblema)',
    (numero) => {
      for (const progresso of [0, 50, 100]) {
        const s = qa.simular(numero, progresso);
        expect(s.simulado).toBe(true);
        expect(s.nivel.numero).toBe(numero);
        expect(s.nivel).toEqual(nivelDe(s.xpAcumulado));
        expect(s.moedas).toBe(s.xpAcumulado);
        expect(s.celebracao).toBeNull();
      }
    },
  );

  it('progresso posiciona a barra dentro do nível', () => {
    expect(qa.simular(5).nivel.progresso).toBe(50);
    expect(qa.simular(5, 0).xpAcumulado).toBe(500);
    expect(qa.simular(5, 100).nivel.numero).toBe(5);
    expect(qa.simular(10, 0).nivel.maximo).toBe(true);
  });

  it('nível inexistente → 404', () => {
    expect(() => qa.simular(0)).toThrow(NotFoundException);
    expect(() => qa.simular(NIVEIS.length + 1)).toThrow(NotFoundException);
  });

  it('repetir a simulação dá sempre o mesmo resultado (sem estado)', () => {
    expect(qa.simular(7, 30)).toEqual(qa.simular(7, 30));
  });
});
