import { avaliarSegredoJwt, decidirSynchronize } from './seguranca.js';

describe('decidirSynchronize', () => {
  it('padrão é desligado', () => {
    expect(decidirSynchronize('localhost', undefined, undefined)).toBe(false);
    expect(decidirSynchronize('db.remoto.com', 'false', undefined)).toBe(false);
  });

  it('liga só em banco local fora de produção', () => {
    expect(decidirSynchronize('localhost', 'true', 'development')).toBe(true);
    expect(decidirSynchronize('127.0.0.1', 'true', undefined)).toBe(true);
  });

  it('recusa synchronize em banco remoto', () => {
    expect(() =>
      decidirSynchronize('db.projeto.supabase.co', 'true', undefined),
    ).toThrow(/só é permitido em banco local/);
  });

  it('recusa synchronize em produção', () => {
    expect(() => decidirSynchronize('localhost', 'true', 'production')).toThrow(
      /produção/,
    );
  });
});

describe('avaliarSegredoJwt', () => {
  it('placeholder em desenvolvimento funciona com aviso', () => {
    const r = avaliarSegredoJwt('gere-uma-senha', 'development');
    expect(r.aviso).toMatch(/valor de exemplo/);
  });

  it('placeholder, ausente ou curto em produção → erro', () => {
    for (const valor of [undefined, 'gere-uma-senha', 'curto-demais']) {
      expect(() => avaliarSegredoJwt(valor, 'production')).toThrow(
        /obrigatória/,
      );
    }
  });

  it('segredo real passa sem aviso', () => {
    const real = 'x'.repeat(40);
    expect(avaliarSegredoJwt(real, 'production')).toEqual({ segredo: real });
  });
});
