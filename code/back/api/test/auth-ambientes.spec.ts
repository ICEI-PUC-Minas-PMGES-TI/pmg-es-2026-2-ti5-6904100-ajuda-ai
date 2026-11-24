import { UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthService } from '../src/auth/auth.service.js';
import type { MicrosoftTokenVerifier } from '../src/auth/microsoft-token.verifier.js';
import { buscarCoordenadorPorEmail } from '../src/dados/dados.js';
import { UsuarioEntity } from '../src/usuarios/entities/usuario.entity.js';
import { UsuariosService } from '../src/usuarios/usuarios.service.js';
import { repositorioEmMemoria } from './helpers/repositorio-memoria.js';

/**
 * Regras de autenticação por ambiente (hospedagem):
 * login demo protegido, coordenação configurada e e-mails demo reservados.
 */
const CHAVE = 'chave-de-demonstracao-com-32-chars!';
const VARIAVEIS = [
  'APP_ENV',
  'NODE_ENV',
  'AUTH_DEMO_ENABLED',
  'DB_HOST',
  'HOST',
  'DEMO_CHAVE_ACESSO',
  'DEMO_OPERADORES',
  'COORDENADORES_EMAILS',
] as const;

describe('Autenticação por ambiente', () => {
  const verificar = vi.fn();
  const jwtService = new JwtService({ secret: 'segredo-de-teste' });
  const microsoft = { verificar } as unknown as MicrosoftTokenVerifier;
  let service: AuthService;
  const original: Partial<Record<(typeof VARIAVEIS)[number], string | undefined>> = {};

  beforeEach(async () => {
    for (const v of VARIAVEIS) {
      original[v] = process.env[v];
      delete process.env[v];
    }
    process.env.NODE_ENV = 'test';
    const usuarios = new UsuariosService(repositorioEmMemoria<UsuarioEntity>());
    await usuarios.onModuleInit();
    service = new AuthService(jwtService, microsoft, usuarios);
  });

  afterEach(() => {
    vi.clearAllMocks();
    for (const v of VARIAVEIS) {
      if (original[v] === undefined) delete process.env[v];
      else process.env[v] = original[v];
    }
  });

  describe('login demo com NODE_ENV=production nos dois ambientes publicados', () => {
    it('homologação (APP_ENV=homologacao) entra com a chave', async () => {
      Object.assign(process.env, { NODE_ENV: 'production', APP_ENV: 'homologacao', AUTH_DEMO_ENABLED: 'true', DEMO_CHAVE_ACESSO: CHAVE });
      const ok = await service.autenticarDemo('camila@pucminas.edu.br', { chave: CHAVE });
      expect(ok.situacao).toBe('autenticado');
    });
    it('produção (APP_ENV=producao) recusa até com a chave', async () => {
      Object.assign(process.env, { NODE_ENV: 'production', APP_ENV: 'producao', AUTH_DEMO_ENABLED: 'true', DEMO_CHAVE_ACESSO: CHAVE });
      await expect(service.autenticarDemo('camila@pucminas.edu.br', { chave: CHAVE })).rejects.toThrow('produção');
    });
  });

  describe('login demo', () => {
    it('SEG-001: banco compartilhado com API na rede, sem porta → recusado', async () => {
      Object.assign(process.env, { AUTH_DEMO_ENABLED: 'true', DB_HOST: 'db.x.supabase.co', HOST: '0.0.0.0' });
      await expect(service.autenticarDemo('renata@pucminas.edu.br')).rejects.toThrow('Login demo desabilitado.');
    });

    it('homologação: sem chave → recusado; com chave errada → recusado; com a chave → entra', async () => {
      Object.assign(process.env, { AUTH_DEMO_ENABLED: 'true', APP_ENV: 'homologacao', DEMO_CHAVE_ACESSO: CHAVE });
      await expect(service.autenticarDemo('camila@pucminas.edu.br')).rejects.toThrow(/restrito/);
      await expect(
        service.autenticarDemo('camila@pucminas.edu.br', { chave: 'errada-errada-errada-errada-errada' }),
      ).rejects.toThrow(UnauthorizedException);
      const ok = await service.autenticarDemo('camila@pucminas.edu.br', { chave: CHAVE });
      expect(ok.usuario).toMatchObject({ email: 'camila@pucminas.edu.br' });
    });

    it('homologação: operador com sessão válida entra em qualquer perfil demo; outro usuário não', async () => {
      Object.assign(process.env, {
        AUTH_DEMO_ENABLED: 'true',
        APP_ENV: 'homologacao',
        DEMO_OPERADORES: 'operador@pucminas.edu.br',
      });
      const operador = await jwtService.signAsync({ sub: '1', email: 'operador@pucminas.edu.br', perfil: 'nenhuma', escopo: 'acesso' });
      const aluno = await jwtService.signAsync({ sub: '2', email: 'aluno@pucminas.edu.br', perfil: 'apadrinhado', escopo: 'acesso' });
      const onboarding = await jwtService.signAsync({ sub: '1', email: 'operador@pucminas.edu.br', escopo: 'onboarding' });

      const ok = await service.autenticarDemo('renata@pucminas.edu.br', { autorizacao: `Bearer ${operador}` });
      expect(ok.usuario).toMatchObject({ perfil: 'coordenador' });
      await expect(service.autenticarDemo('renata@pucminas.edu.br', { autorizacao: `Bearer ${aluno}` })).rejects.toThrow(/restrito/);
      await expect(service.autenticarDemo('renata@pucminas.edu.br', { autorizacao: `Bearer ${onboarding}` })).rejects.toThrow(/restrito/);
    });

    it('produção: desligado mesmo com chave correta', async () => {
      Object.assign(process.env, { AUTH_DEMO_ENABLED: 'true', APP_ENV: 'producao', DEMO_CHAVE_ACESSO: CHAVE });
      await expect(service.autenticarDemo('renata@pucminas.edu.br', { chave: CHAVE })).rejects.toThrow('produção');
    });

    it('desenvolvimento isolado (banco local) continua aberto como hoje', async () => {
      Object.assign(process.env, { AUTH_DEMO_ENABLED: 'true', DB_HOST: 'localhost' });
      const ok = await service.autenticarDemo('thiago@pucminas.edu.br');
      expect(ok.situacao).toBe('autenticado');
    });
  });

  describe('SEG-006: sessão não renova pelo cadastro', () => {
    it('token de acesso: a sessão devolvida expira junto com o token apresentado', async () => {
      const agora = Math.floor(Date.now() / 1000);
      const quase = await jwtService.signAsync(
        { sub: '1', email: 'camila@pucminas.edu.br', perfil: 'apadrinhado', escopo: 'acesso' },
        { expiresIn: 120 },
      );
      const identidade = await service.identidadeDoCadastro(`Bearer ${quase}`);
      expect(identidade.expiraEm).toBeGreaterThan(agora);
      const usuarios = new UsuariosService(repositorioEmMemoria<UsuarioEntity>());
      await usuarios.onModuleInit();
      const camila = await usuarios.buscarPorEmail('camila@pucminas.edu.br');
      const sessao = await service.emitirSessao(camila!, identidade.expiraEm);
      expect(sessao.expiresIn).toBeLessThanOrEqual(120);
      const payload = await jwtService.verifyAsync(sessao.accessToken);
      expect(payload.exp).toBeLessThanOrEqual(agora + 121);
    });

    it('token de onboarding (vindo do login Microsoft) abre sessão normal de 1 h', async () => {
      const onboarding = await jwtService.signAsync({ sub: 'ms', email: 'novo@pucminas.edu.br', escopo: 'onboarding' });
      const identidade = await service.identidadeDoCadastro(`Bearer ${onboarding}`);
      expect(identidade.expiraEm).toBeUndefined();
    });

    it('token sem escopo é recusado', async () => {
      const antigo = await jwtService.signAsync({ sub: '1', email: 'camila@pucminas.edu.br' });
      await expect(service.identidadeDoCadastro(`Bearer ${antigo}`)).rejects.toThrow(/inválido/);
    });

    it('teto já vencido não emite sessão', async () => {
      const usuarios = new UsuariosService(repositorioEmMemoria<UsuarioEntity>());
      await usuarios.onModuleInit();
      const camila = await usuarios.buscarPorEmail('camila@pucminas.edu.br');
      await expect(service.emitirSessao(camila!, Math.floor(Date.now() / 1000) - 5)).rejects.toThrow(/expirada/);
    });
  });

  describe('domínios institucionais', () => {
    afterEach(() => delete process.env.AUTH_ALLOWED_DOMAIN);

    it('aceita lista de domínios exatos (ex.: e-mail de aluno @sga)', async () => {
      process.env.AUTH_ALLOWED_DOMAIN = 'pucminas.edu.br, sga.pucminas.edu.br';
      verificar.mockResolvedValue({ subject: 'ms', email: 'aluno.novo@sga.pucminas.edu.br', name: 'Aluno' });
      const r = await service.autenticarComMicrosoft('id-token');
      expect(r.situacao).toBe('onboarding');
    });

    it('não aceita subdomínio nem domínio parecido fora da lista', async () => {
      process.env.AUTH_ALLOWED_DOMAIN = 'pucminas.edu.br';
      verificar.mockResolvedValue({ subject: 'ms', email: 'x@sga.pucminas.edu.br' });
      await expect(service.autenticarComMicrosoft('id-token')).rejects.toThrow(/institucional/);
      verificar.mockResolvedValue({ subject: 'ms', email: 'x@falsopucminas.edu.br' });
      await expect(service.autenticarComMicrosoft('id-token')).rejects.toThrow(/institucional/);
    });
  });

  describe('coordenação', () => {
    it('SEG-002: em produção a coordenadora fictícia não existe; só a lista configurada', () => {
      process.env.APP_ENV = 'producao';
      expect(buscarCoordenadorPorEmail('renata@pucminas.edu.br')).toBeUndefined();
      process.env.COORDENADORES_EMAILS = 'Coord.Real@pucminas.edu.br|Coordenação Real';
      expect(buscarCoordenadorPorEmail('coord.real@pucminas.edu.br')).toMatchObject({
        perfil: 'coordenador',
        nome: 'Coordenação Real',
      });
    });

    it('login Microsoft de coordenador configurado recebe perfil de coordenação', async () => {
      Object.assign(process.env, { APP_ENV: 'producao', COORDENADORES_EMAILS: 'coord.real@pucminas.edu.br' });
      verificar.mockResolvedValue({ subject: 'ms', email: 'coord.real@pucminas.edu.br' });
      const r = await service.autenticarComMicrosoft('id-token');
      expect(r.situacao).toBe('autenticado');
      if (r.situacao !== 'autenticado') return;
      const payload = await jwtService.verifyAsync(r.accessToken);
      expect(payload.perfil).toBe('coordenador');
    });

    it('ambiente publicado: e-mail reservado à demo não entra pelo Microsoft', async () => {
      process.env.APP_ENV = 'homologacao';
      verificar.mockResolvedValue({ subject: 'ms', email: 'renata@pucminas.edu.br' });
      await expect(service.autenticarComMicrosoft('id-token')).rejects.toThrow(/reservada/);
      verificar.mockResolvedValue({ subject: 'ms', email: 'camila@pucminas.edu.br' });
      await expect(service.autenticarComMicrosoft('id-token')).rejects.toThrow(/reservada/);
    });
  });
});
