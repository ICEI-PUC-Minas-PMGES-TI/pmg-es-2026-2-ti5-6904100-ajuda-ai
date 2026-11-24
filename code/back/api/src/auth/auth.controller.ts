import {
  Body,
  Controller,
  Headers,
  HttpException,
  HttpStatus,
  Ip,
  Post,
} from '@nestjs/common';
import { LoginDemoDto } from './dto/login-demo.dto.js';
import { LoginDto } from './dto/login.dto.js';
import { AuthService } from './auth.service.js';
import { LimiteTentativas } from './limite-tentativas.js';

@Controller('auth')
export class AuthController {
  // Por IP. Em ambiente publicado o IP vem do proxy (trust proxy em main.ts).
  private readonly limiteLogin = new LimiteTentativas(30, 5 * 60_000);
  private readonly limiteDemo = new LimiteTentativas(10, 5 * 60_000);

  constructor(private readonly authService: AuthService) {}

  @Post('login')
  login(@Body() corpo: LoginDto, @Ip() ip: string) {
    this.verificarLimite(this.limiteLogin, ip);
    return this.authService.autenticarComMicrosoft(corpo.idToken);
  }

  @Post('login-demo')
  loginDemo(
    @Body() corpo: LoginDemoDto,
    @Ip() ip: string,
    @Headers('x-demo-chave') chave?: string,
    @Headers('authorization') autorizacao?: string,
  ) {
    this.verificarLimite(this.limiteDemo, ip);
    return this.authService.autenticarDemo(corpo.email, { chave, autorizacao });
  }

  private verificarLimite(limite: LimiteTentativas, ip: string) {
    if (!limite.registrar(ip || 'desconhecido')) {
      throw new HttpException(
        'Muitas tentativas de login. Aguarde alguns minutos.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }
}
