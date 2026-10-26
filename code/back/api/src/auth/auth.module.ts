import { TypeOrmModule } from '@nestjs/typeorm';
import { ParticipacaoEntity } from '../participacoes/entities/participacao.entity.js';
import { Logger, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { avaliarSegredoJwt } from '../config/seguranca.js';
import { UsuariosModule } from '../usuarios/usuarios.module.js';
import { AuthController } from './auth.controller.js';
import { CadastroAprovadoGuard } from './cadastro-aprovado.guard.js';
import { JwtAuthGuard } from './jwt-auth.guard.js';
import { JwtOpcionalGuard } from './jwt-opcional.guard.js';
import { MicrosoftTokenVerifier } from './microsoft-token.verifier.js';
import { AuthService } from './auth.service.js';
import { RolesGuard } from './roles.guard.js';

function obterSegredoJwt(configuracao: ConfigService): string {
  const { segredo, aviso } = avaliarSegredoJwt(
    configuracao.get<string>('JWT_SECRET'),
    configuracao.get<string>('NODE_ENV'),
  );
  if (aviso) new Logger('Auth').warn(aviso);
  return segredo;
}

@Module({
  imports: [
    TypeOrmModule.forFeature([ParticipacaoEntity]),
    ConfigModule,
    UsuariosModule,
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
  providers: [
    AuthService,
    JwtAuthGuard,
    JwtOpcionalGuard,
    RolesGuard,
    CadastroAprovadoGuard,
    MicrosoftTokenVerifier,
  ],
  exports: [
    JwtModule,
    UsuariosModule,
    AuthService,
    JwtAuthGuard,
    JwtOpcionalGuard,
    RolesGuard,
    CadastroAprovadoGuard,
  ],
})
export class AuthModule {}
