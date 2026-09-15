import { Controller, Get, Query } from '@nestjs/common';
import { UsuariosService } from './usuarios.service.js';
import type { Perfil } from '../dados/dados.js';

@Controller('me')
export class UsuariosController {
  constructor(private readonly usuariosService: UsuariosService) {}

  @Get()
  perfil(@Query('perfil') perfil?: Perfil) {
    return this.usuariosService.buscarPorPerfil(perfil);
  }

  @Get('vinculos')
  vinculos(@Query('perfil') perfil?: Perfil) {
    return this.usuariosService.listarVinculos(perfil);
  }
}
