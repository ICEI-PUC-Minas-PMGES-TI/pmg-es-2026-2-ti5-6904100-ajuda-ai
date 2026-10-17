import { UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthService } from '../src/auth/auth.service.js';
import type { MicrosoftTokenVerifier } from '../src/auth/microsoft-token.verifier.js';
import { UsuarioEntity } from '../src/usuarios/entities/usuario.entity.js';
import { UsuariosService } from '../src/usuarios/usuarios.service.js';
import { repositorioEmMemoria } from './helpers/repositorio-memoria.js';

describe('AuthService', () => {
  const verificar = vi.fn();
  const jwtService = new JwtService({ secret: 'segredo-de-teste' });
  const microsoftTokenVerifier = {
    verificar,
  } as unknown as MicrosoftTokenVerifier;
  let service: AuthService;

  beforeEach(async () => {
    const usuarios = new UsuariosService(repositorioEmMemoria<UsuarioEntity>());
    await usuarios.onModuleInit(); // semeia os alunos demo
    service = new AuthService(jwtService, microsoftTokenVerifier, usuarios);
  });

  afterEach(() => {
    vi.clearAllMocks();
    delete process.env.AUTH_ALLOWED_DOMAIN;
    delete process.env.AUTH_DEMO_ENABLED;
  });

  it('emite um JWT para uma conta institucional cadastrada', async () => {
    verificar.mockResolvedValue({
      subject: 'microsoft-user-id',
      email: 'camila@pucminas.edu.br',
      name: 'Camila Duarte',
    });

    const resposta = await service.autenticarComMicrosoft('id-token-valido');
    const payload = await jwtService.verifyAsync(resposta.accessToken);

    expect(resposta.tokenType).toBe('Bearer');
    expect(resposta.expiresIn).toBe(3600);
    expect(resposta.usuario).toMatchObject({
      email: 'camila@pucminas.edu.br',
      statusCadastro: 'aprovado',
    });
    expect(resposta.situacao).toBe('autenticado');
    expect(payload).toMatchObject({
      email: 'camila@pucminas.edu.br',
      perfil: 'apadrinhado',
      escopo: 'acesso',
    });
  });

  it('rejeita uma conta fora do domínio institucional', async () => {
    verificar.mockResolvedValue({
      subject: 'microsoft-user-id',
      email: 'camila@gmail.com',
    });

    await expect(
      service.autenticarComMicrosoft('id-token-valido'),
    ).rejects.toThrow(UnauthorizedException);
  });

  it('conta institucional nova recebe onboarding, sem sessão do sistema', async () => {
    verificar.mockResolvedValue({
      subject: 'microsoft-user-id',
      email: 'nao-cadastrado@pucminas.edu.br',
      name: 'Aluno Novo',
    });

    const resposta = await service.autenticarComMicrosoft('id-token-valido');
    expect(resposta.situacao).toBe('onboarding');
    if (resposta.situacao !== 'onboarding') return;
    expect(resposta.identidade).toEqual({
      nome: 'Aluno Novo',
      email: 'nao-cadastrado@pucminas.edu.br',
    });
    expect(resposta.expiresIn).toBe(15 * 60);
    const payload = await jwtService.verifyAsync(resposta.onboardingToken);
    expect(payload).toMatchObject({
      email: 'nao-cadastrado@pucminas.edu.br',
      escopo: 'onboarding',
    });
    expect(payload.perfil).toBeUndefined();
  });

  it('token de onboarding expirado não autoriza o cadastro', async () => {
    const expirado = await jwtService.signAsync(
      {
        sub: 's',
        email: 'novo@pucminas.edu.br',
        nome: 'Novo',
        escopo: 'onboarding',
      },
      { expiresIn: -10 },
    );
    await expect(service.identidadeDoCadastro(`Bearer ${expirado}`)).rejects.toThrow(
      /expirado/,
    );
  });

  it('cadastro usa o e-mail do token e recusa outro e-mail', async () => {
    const token = await jwtService.signAsync({
      sub: 's',
      email: 'gabriel@pucminas.edu.br',
      nome: 'Gabriel',
      escopo: 'onboarding',
    });
    await expect(
      service.identidadeDoCadastro(`Bearer ${token}`),
    ).resolves.toMatchObject({ email: 'gabriel@pucminas.edu.br' });
  });

  it('login demo do coordenador mockado', async () => {
    process.env.AUTH_DEMO_ENABLED = 'true';
    const resposta = await service.autenticarDemo('renata@pucminas.edu.br');
    const payload = await jwtService.verifyAsync(resposta.accessToken);

    expect(payload).toMatchObject({ perfil: 'coordenador' });
  });

  it('login demo de aluno pendente também funciona (para acompanhar)', async () => {
    process.env.AUTH_DEMO_ENABLED = 'true';
    const resposta = await service.autenticarDemo(
      'ana.beatriz@pucminas.edu.br',
    );

    expect(resposta.usuario).toMatchObject({
      perfil: 'padrinho',
      statusCadastro: 'pendente',
    });
  });

  it('login demo recusa e-mail que não está na base demo', async () => {
    process.env.AUTH_DEMO_ENABLED = 'true';
    await expect(
      service.autenticarDemo('intruso@pucminas.edu.br'),
    ).rejects.toThrow('não autorizado');
    await expect(service.autenticarDemo('alguem@gmail.com')).rejects.toThrow(
      'não autorizado',
    );
  });

  it('login demo devolve o papel de cada usuário da base', async () => {
    process.env.AUTH_DEMO_ENABLED = 'true';
    const camila = await service.autenticarDemo('camila@pucminas.edu.br');
    const thiago = await service.autenticarDemo('thiago@pucminas.edu.br');
    const ana = await service.autenticarDemo('ana.beatriz@pucminas.edu.br');
    const renata = await service.autenticarDemo('renata@pucminas.edu.br');

    expect(camila.usuario).toMatchObject({ perfil: 'apadrinhado' });
    expect(thiago.usuario).toMatchObject({ perfil: 'padrinho' });
    expect(ana.usuario).toMatchObject({
      perfil: 'padrinho',
      statusCadastro: 'pendente',
    });
    expect(renata.usuario).toMatchObject({ perfil: 'coordenador' });
    expect(camila.situacao).toBe('autenticado');
  });

  it('login demo recusado em produção', async () => {
    process.env.AUTH_DEMO_ENABLED = 'true';
    const ambiente = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    try {
      await expect(
        service.autenticarDemo('renata@pucminas.edu.br'),
      ).rejects.toThrow('produção');
    } finally {
      if (ambiente === undefined) delete process.env.NODE_ENV;
      else process.env.NODE_ENV = ambiente;
    }
  });

  it('login demo desabilitado', async () => {
    await expect(
      service.autenticarDemo('renata@pucminas.edu.br'),
    ).rejects.toThrow('desabilitado');
  });
});
