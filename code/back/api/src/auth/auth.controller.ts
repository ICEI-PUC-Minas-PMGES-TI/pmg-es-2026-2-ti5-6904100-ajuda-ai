import { Body, Controller, Post } from '@nestjs/common';
import { LoginDto } from './dto/login.dto.js';
import { AuthService } from './auth.service.js';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('login')
  login(@Body() corpo: LoginDto) {
    return this.authService.autenticarComMicrosoft(corpo.idToken);
  }
}
