import { Body, Controller, Post } from '@nestjs/common';
import { AuthService } from './auth.service.js';
import type { Perfil } from '../dados/dados.js';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('login')
  login(@Body() corpo: { perfil?: Perfil }) {
    return this.authService.autenticar(corpo?.perfil);
  }
}
