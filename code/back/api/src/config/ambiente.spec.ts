import { describe, expect, it } from 'vitest';
import { LimiteTentativas } from '../auth/limite-tentativas.js';
import { bancoResponde } from '../saude.js';
import {
  ambienteApp,
  chavesIguais,
  hostSoLocal,
  modoLoginDemo,
  origensCors,
} from './ambiente.js';

const CHAVE = 'chave-de-demonstracao-com-32-chars!';

describe('ambienteApp', () => {
  it('APP_ENV explícito vence', () => {
    expect(ambienteApp('homologacao', 'production')).toBe('homologacao');
    expect(ambienteApp('PRODUCAO', undefined)).toBe('producao');
  });
  it('sem APP_ENV, NODE_ENV=production conta como produção', () => {
    expect(ambienteApp(undefined, 'production')).toBe('producao');
    expect(ambienteApp(undefined, undefined)).toBe('desenvolvimento');
  });
  it('recusa valor desconhecido', () => {
    expect(() => ambienteApp('staging', undefined)).toThrow(/APP_ENV inválido/);
  });
});

describe('origensCors', () => {
  it('desenvolvimento sem lista aceita qualquer origem (como hoje)', () => {
    expect(origensCors(undefined, 'desenvolvimento')).toBe(true);
  });
  it('ambiente publicado exige lista e https', () => {
    expect(() => origensCors('', 'homologacao')).toThrow(/obrigatória/);
    expect(() => origensCors('http://app.exemplo.com', 'producao')).toThrow(/https/);
    expect(origensCors('https://a.exemplo.com/, https://b.exemplo.com', 'producao')).toEqual([
      'https://a.exemplo.com',
      'https://b.exemplo.com',
    ]);
  });
  it('recusa origem com caminho', () => {
    expect(() => origensCors('https://a.exemplo.com/app', 'producao')).toThrow(/inválida/);
  });
});

describe('modoLoginDemo', () => {
  const base = { AUTH_DEMO_ENABLED: 'true' } as NodeJS.ProcessEnv;

  it('produção sempre desliga, mesmo com chave', () => {
    expect(modoLoginDemo({ ...base, APP_ENV: 'producao', DEMO_CHAVE_ACESSO: CHAVE }).modo).toBe('desligado');
    // Sem APP_ENV, NODE_ENV=production é produção: esquecer a variável não abre o demo.
    expect(modoLoginDemo({ ...base, NODE_ENV: 'production', DEMO_CHAVE_ACESSO: CHAVE }).modo).toBe('desligado');
    // APP_ENV vence um NODE_ENV não convencional: produção continua desligada.
    expect(modoLoginDemo({ ...base, NODE_ENV: 'homologacao', APP_ENV: 'producao', DEMO_CHAVE_ACESSO: CHAVE }).modo).toBe('desligado');
  });
  it('homologação funciona com NODE_ENV=production (o do Dockerfile)', () => {
    expect(
      modoLoginDemo({ ...base, NODE_ENV: 'production', APP_ENV: 'homologacao', DEMO_CHAVE_ACESSO: CHAVE }),
    ).toMatchObject({ modo: 'protegido', chave: CHAVE });
  });
  it('sem AUTH_DEMO_ENABLED=true fica desligado', () => {
    expect(modoLoginDemo({ DB_HOST: 'localhost' }).modo).toBe('desligado');
  });
  it('desenvolvimento com banco local fica aberto', () => {
    expect(modoLoginDemo({ ...base, DB_HOST: 'localhost', HOST: '0.0.0.0' }).modo).toBe('aberto');
  });
  it('banco remoto com API só em loopback fica aberto (emulador via 10.0.2.2)', () => {
    expect(modoLoginDemo({ ...base, DB_HOST: 'db.x.supabase.co', HOST: '127.0.0.1' }).modo).toBe('aberto');
  });
  it('SEG-001: banco remoto + HOST de rede sem porta configurada → desligado (falha fechada)', () => {
    const regra = modoLoginDemo({ ...base, DB_HOST: 'db.x.supabase.co', HOST: '0.0.0.0' });
    expect(regra.modo).toBe('desligado');
  });
  it('homologação exige chave longa ou operadores', () => {
    expect(modoLoginDemo({ ...base, APP_ENV: 'homologacao', DEMO_CHAVE_ACESSO: 'curta' }).modo).toBe('desligado');
    expect(modoLoginDemo({ ...base, APP_ENV: 'homologacao', DEMO_CHAVE_ACESSO: CHAVE })).toMatchObject({
      modo: 'protegido',
      chave: CHAVE,
    });
    expect(modoLoginDemo({ ...base, APP_ENV: 'homologacao', DEMO_OPERADORES: 'Op@pucminas.edu.br' })).toMatchObject({
      modo: 'protegido',
      operadores: ['op@pucminas.edu.br'],
    });
  });
  it('homologação nunca abre sem porta, mesmo com banco local', () => {
    expect(modoLoginDemo({ ...base, APP_ENV: 'homologacao', DB_HOST: 'localhost', HOST: '127.0.0.1' }).modo).toBe('desligado');
  });
});

describe('auxiliares', () => {
  it('hostSoLocal', () => {
    expect(hostSoLocal('127.0.0.1')).toBe(true);
    expect(hostSoLocal(undefined)).toBe(false);
    expect(hostSoLocal('0.0.0.0')).toBe(false);
  });
  it('chavesIguais compara em tempo constante e trata tamanhos diferentes', () => {
    expect(chavesIguais(CHAVE, CHAVE)).toBe(true);
    expect(chavesIguais('x', CHAVE)).toBe(false);
    expect(chavesIguais(undefined, CHAVE)).toBe(false);
  });
  it('LimiteTentativas barra a 11ª tentativa na janela e libera depois', () => {
    let agora = 0;
    const limite = new LimiteTentativas(10, 1000, () => agora);
    for (let i = 0; i < 10; i++) expect(limite.registrar('ip')).toBe(true);
    expect(limite.registrar('ip')).toBe(false);
    expect(limite.registrar('outro-ip')).toBe(true);
    agora = 1000;
    expect(limite.registrar('ip')).toBe(true);
  });
  it('bancoResponde: falha, prazo e banco não inicializado viram false', async () => {
    expect(await bancoResponde({ isInitialized: true, query: async () => [1] } as never)).toBe(true);
    expect(await bancoResponde({ isInitialized: false, query: async () => [1] } as never)).toBe(false);
    expect(
      await bancoResponde({ isInitialized: true, query: async () => { throw new Error('x'); } } as never),
    ).toBe(false);
    expect(
      await bancoResponde({ isInitialized: true, query: () => new Promise(() => {}) } as never, 20),
    ).toBe(false);
  });
});
