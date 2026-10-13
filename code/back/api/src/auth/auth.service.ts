import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { buscarCoordenadorPorEmail, Usuario } from '../dados/dados.js';
import type { UsuarioEntity } from '../usuarios/entities/usuario.entity.js';
import {
  serializarUsuario,
  UsuarioSerializado,
  UsuariosService,
} from '../usuarios/usuarios.service.js';
import { MicrosoftTokenVerifier } from './microsoft-token.verifier.js';

export interface LoginResponse {
  accessToken: string;
  tokenType: 'Bearer';
  expiresIn: number;
  usuario: Usuario | UsuarioSerializado;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly jwtService: JwtService,
    private readonly microsoftTokenVerifier: MicrosoftTokenVerifier,
    private readonly usuariosService: UsuariosService,
  ) {}

  async autenticarComMicrosoft(idToken: string): Promise<LoginResponse> {
    const identidade = await this.microsoftTokenVerifier.verificar(idToken);
    const email = identidade.email.trim().toLowerCase();
    const dominioPermitido = (
      process.env.AUTH_ALLOWED_DOMAIN ?? 'pucminas.edu.br'
    ).toLowerCase();

    if (!email.endsWith(`@${dominioPermitido}`)) {
      throw new UnauthorizedException(
        `Use uma conta institucional @${dominioPermitido}.`,
      );
    }

    return this.entrar(
      email,
      'Usuário autenticado, mas não cadastrado no Ajuda-aí.',
    );
  }

  /**
   * Login de desenvolvimento (sem Microsoft): coordenador mockado ou aluno
   * já cadastrado, só pelo e-mail. Ativo apenas quando AUTH_DEMO_ENABLED=true.
   */
  async autenticarDemo(emailInformado: string): Promise<LoginResponse> {
    if (process.env.AUTH_DEMO_ENABLED !== 'true') {
      throw new UnauthorizedException('Login demo desabilitado.');
    }
    if (process.env.NODE_ENV === 'production') {
      throw new UnauthorizedException('Login demo indisponível em produção.');
    }
    return this.entrar(emailInformado, 'Usuário não cadastrado no Ajuda-aí.');
  }

  /**
   * Sessão de um aluno do banco. Usada também logo após o cadastro: alunos
   * pendentes/rejeitados recebem token para acompanhar o próprio cadastro;
   * as permissões de participante são checadas rota a rota.
   */
  async emitirSessao(usuario: UsuarioEntity): Promise<LoginResponse> {
    return this.assinar(
      {
        id: usuario.id,
        email: usuario.email,
        perfil: usuario.tipoParticipacao,
      },
      serializarUsuario(usuario),
    );
  }

  private async entrar(
    emailInformado: string,
    mensagemNaoCadastrado: string,
  ): Promise<LoginResponse> {
    const email = emailInformado.trim().toLowerCase();
    const coordenador = buscarCoordenadorPorEmail(email);
    if (coordenador) {
      return this.assinar(coordenador, coordenador);
    }
    const usuario = await this.usuariosService.buscarPorEmail(email);
    if (!usuario) {
      throw new UnauthorizedException(mensagemNaoCadastrado);
    }
    return this.emitirSessao(usuario);
  }

  private async assinar(
    identidade: Pick<Usuario, 'id' | 'email' | 'perfil'>,
    usuario: Usuario | UsuarioSerializado,
  ): Promise<LoginResponse> {
    const accessToken = await this.jwtService.signAsync({
      sub: String(identidade.id),
      email: identidade.email,
      perfil: identidade.perfil,
    });

    return {
      accessToken,
      tokenType: 'Bearer',
      expiresIn: 3600,
      usuario,
    };
  }
}
