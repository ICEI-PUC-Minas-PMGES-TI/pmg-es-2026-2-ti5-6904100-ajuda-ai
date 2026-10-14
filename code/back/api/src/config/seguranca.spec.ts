import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { repositorioEmMemoria } from '../../test/helpers/repositorio-memoria.js';
import { ProgramaEntity } from '../programas/entities/programa.entity.js';
import { ProgramasService } from '../programas/programas.service.js';
import { UsuarioEntity } from '../usuarios/entities/usuario.entity.js';
import { UsuariosService } from '../usuarios/usuarios.service.js';
import {
  avaliarSegredoJwt,
  decidirSynchronize,
  opcoesSsl,
  validarSeedDemo,
} from './seguranca.js';

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

describe('opcoesSsl', () => {
  const pasta = mkdtempSync(join(tmpdir(), 'ca-'));
  writeFileSync(
    join(pasta, 'ca.crt'),
    ['-----BEGIN CERTIFICATE-----', 'X', '-----END CERTIFICATE-----'].join(
      '\n',
    ),
  );
  writeFileSync(join(pasta, 'lixo.txt'), 'não é certificado');

  it('DB_SSL=false desliga TLS (banco local)', () => {
    expect(opcoesSsl('false', 'ca.crt', pasta)).toBe(false);
  });

  it('padrão é TLS validado pela cadeia do sistema', () => {
    expect(opcoesSsl(undefined, undefined, pasta)).toBe(true);
  });

  it('com DB_SSL_CA valida contra a CA informada, sem desligar a verificação', () => {
    const r = opcoesSsl('true', 'ca.crt', pasta);
    expect(r).toMatchObject({ rejectUnauthorized: true });
    expect(typeof r === 'object' && r.ca).toContain('BEGIN CERTIFICATE');
  });

  it('CA ausente ou inválida → erro claro', () => {
    expect(() => opcoesSsl('true', 'nao-existe.crt', pasta)).toThrow(
      /não encontrado/,
    );
    expect(() => opcoesSsl('true', 'lixo.txt', pasta)).toThrow(/PEM/);
  });
});

describe('dados demo (SEED_DEMO_DATA)', () => {
  const original = process.env.SEED_DEMO_DATA;
  afterEach(() => {
    process.env.SEED_DEMO_DATA = original;
  });

  it('recusa seed em banco remoto ou produção', () => {
    expect(() =>
      validarSeedDemo('db.x.supabase.co', 'true', undefined),
    ).toThrow(/só é permitido em banco local/);
    expect(() => validarSeedDemo('localhost', 'true', 'production')).toThrow();
    expect(() =>
      validarSeedDemo('db.x.supabase.co', 'false', undefined),
    ).not.toThrow();
    expect(() =>
      validarSeedDemo('localhost', 'true', 'development'),
    ).not.toThrow();
  });

  it('desligado: iniciar não grava alunos nem cria ciclo', async () => {
    process.env.SEED_DEMO_DATA = 'false';
    const usuarios: UsuarioEntity[] = [];
    await new UsuariosService(repositorioEmMemoria(usuarios)).onModuleInit();
    expect(usuarios).toHaveLength(0);

    const programas: ProgramaEntity[] = [];
    const servico = new ProgramasService(repositorioEmMemoria(programas));
    await servico.onModuleInit();
    expect(programas).toHaveLength(0);
    await expect(servico.garantirProgramaAtual()).rejects.toThrow(
      /não cadastrado/,
    );
    expect(programas).toHaveLength(0);
  });
});
