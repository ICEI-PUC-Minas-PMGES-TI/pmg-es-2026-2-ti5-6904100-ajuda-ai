import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Usuario, USUARIOS } from '../dados/dados.js';
import { MicrosoftTokenVerifier } from './microsoft-token.verifier.js';

export interface LoginResponse {
  accessToken: string;
  tokenType: 'Bearer';
  expiresIn: number;
  usuario: Usuario;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly jwtService: JwtService,
    private readonly microsoftTokenVerifier: MicrosoftTokenVerifier,
  ) {}

  async autenticarComMicrosoft(idToken: string): Promise<LoginResponse> {
    const identidade = await this.microsoftTokenVerifier.verificar(idToken);
    const email = identidade.email.trim().toLowerCase();
    const dominioPermitido = (
      process.env.AUTH_ALLOWED_DOMAIN ?? 'pucminas.edu.br'
    ).toLowerCase();

    if (!email.endsWith(`@${dominioPermitido}`)) {
      throw new UnauthorizedException(
        `Use uma conta institucional @${dominioPermitido}.`,
      );
    }

    const usuario = Object.values(USUARIOS).find(
      (item) => item.email.toLowerCase() === email,
    );

    if (!usuario) {
      throw new UnauthorizedException(
        'Usuário autenticado, mas não cadastrado no Ajuda-aí.',
      );
    }

    const accessToken = await this.jwtService.signAsync({
      sub: String(usuario.id),
      email: usuario.email,
      perfil: usuario.perfil,
    });

    return {
      accessToken,
      tokenType: 'Bearer',
      expiresIn: 3600,
      usuario,
    };
  }
}
