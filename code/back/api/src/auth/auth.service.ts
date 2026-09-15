import { Injectable, UnauthorizedException } from '@nestjs/common';
import { Perfil, Usuario, USUARIOS } from '../dados/dados.js';

@Injectable()
export class AuthService {
  autenticar(perfil: Perfil = 'apadrinhado'): { token: string; usuario: Usuario } {
    const usuario = USUARIOS[perfil];

    if (!usuario) {
      throw new UnauthorizedException('Perfil inválido.');
    }

    return { token: `token-simulado-${usuario.id}`, usuario };
  }
}
