import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { AuthController } from './auth.controller.js';
import { JwtAuthGuard } from './jwt-auth.guard.js';
import { MicrosoftTokenVerifier } from './microsoft-token.verifier.js';
import { AuthService } from './auth.service.js';
import { RolesGuard } from './roles.guard.js';

function obterSegredoJwt(configuracao: ConfigService): string {
  const segredo = configuracao.get<string>('JWT_SECRET');
  if (segredo) {
    return segredo;
  }
  if (configuracao.get<string>('NODE_ENV') === 'production') {
    throw new Error('JWT_SECRET é obrigatória em produção.');
  }
  return 'ajuda-ai-development-secret-change-me';
}

@Module({
  imports: [
    ConfigModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configuracao: ConfigService) => ({
        secret: obterSegredoJwt(configuracao),
        signOptions: { expiresIn: '1h' },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtAuthGuard, RolesGuard, MicrosoftTokenVerifier],
  exports: [JwtModule, AuthService, JwtAuthGuard, RolesGuard],
})
export class AuthModule {}
