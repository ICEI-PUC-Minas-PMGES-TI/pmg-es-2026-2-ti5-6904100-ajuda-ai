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
    expect(payload).toMatchObject({
      email: 'camila@pucminas.edu.br',
      perfil: 'apadrinhado',
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

  it('rejeita uma conta institucional que não está cadastrada', async () => {
    verificar.mockResolvedValue({
      subject: 'microsoft-user-id',
      email: 'nao-cadastrado@pucminas.edu.br',
    });

    await expect(
      service.autenticarComMicrosoft('id-token-valido'),
    ).rejects.toThrow('não cadastrado');
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

  it('login demo desabilitado', async () => {
    await expect(
      service.autenticarDemo('renata@pucminas.edu.br'),
    ).rejects.toThrow('desabilitado');
  });
});
