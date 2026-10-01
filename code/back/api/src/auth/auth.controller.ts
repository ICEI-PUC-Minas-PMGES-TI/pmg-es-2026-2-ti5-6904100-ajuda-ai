import { Body, Controller, Post } from '@nestjs/common';
import { LoginDemoDto } from './dto/login-demo.dto.js';
import { LoginDto } from './dto/login.dto.js';
import { AuthService } from './auth.service.js';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('login')
  login(@Body() corpo: LoginDto) {
    return this.authService.autenticarComMicrosoft(corpo.idToken);
  }

  @Post('login-demo')
  loginDemo(@Body() corpo: LoginDemoDto) {
    return this.authService.autenticarDemo(corpo.email);
  }
}
