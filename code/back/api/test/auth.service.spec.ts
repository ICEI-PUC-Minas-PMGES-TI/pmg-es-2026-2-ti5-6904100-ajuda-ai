import { UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthService } from '../src/auth/auth.service.js';
import type { MicrosoftTokenVerifier } from '../src/auth/microsoft-token.verifier.js';

describe('AuthService', () => {
  const verificar = vi.fn();
  const jwtService = new JwtService({ secret: 'segredo-de-teste' });
  const microsoftTokenVerifier = {
    verificar,
  } as unknown as MicrosoftTokenVerifier;
  let service: AuthService;

  beforeEach(() => {
    service = new AuthService(jwtService, microsoftTokenVerifier);
  });

  afterEach(() => {
    vi.clearAllMocks();
    delete process.env.AUTH_ALLOWED_DOMAIN;
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
    expect(resposta.usuario.email).toBe('camila@pucminas.edu.br');
    expect(payload).toMatchObject({
      sub: '1',
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
});
