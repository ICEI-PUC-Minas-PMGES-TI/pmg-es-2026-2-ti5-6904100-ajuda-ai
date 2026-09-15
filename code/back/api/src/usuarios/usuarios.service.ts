import { Injectable, NotFoundException } from '@nestjs/common';
import { Perfil, Usuario, USUARIOS, VINCULOS } from '../dados/dados.js';

@Injectable()
export class UsuariosService {
  buscarPorPerfil(perfil: Perfil = 'apadrinhado'): Usuario {
    const usuario = USUARIOS[perfil];

    if (!usuario) {
      throw new NotFoundException('Usuário não encontrado.');
    }

    return usuario;
  }

  listarVinculos(perfil: Perfil = 'apadrinhado'): Usuario[] {
    const usuario = this.buscarPorPerfil(perfil);
    const ids = VINCULOS[usuario.id] ?? [];

    return Object.values(USUARIOS).filter((outro) => ids.includes(outro.id));
  }
}
