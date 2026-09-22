import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import type { AuthenticatedRequest } from '../auth/authenticated-request.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { UsuariosService } from './usuarios.service.js';

@Controller('me')
@UseGuards(JwtAuthGuard)
export class UsuariosController {
  constructor(private readonly usuariosService: UsuariosService) {}

  @Get()
  perfil(@Req() requisicao: AuthenticatedRequest) {
    return this.usuariosService.buscarPorId(Number(requisicao.user.sub));
  }

  @Get('vinculos')
  vinculos(@Req() requisicao: AuthenticatedRequest) {
    return this.usuariosService.listarVinculosPorId(
      Number(requisicao.user.sub),
    );
  }
}
