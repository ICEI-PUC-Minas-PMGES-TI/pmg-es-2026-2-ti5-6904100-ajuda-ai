import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import {
  buscarCoordenadorPorEmail,
  buscarUsuarioPorEmail,
  Usuario,
} from '../dados/dados.js';
import { buscarContaDemo } from '../dados/demo-gamificacao.js';
import type { UsuarioEntity } from '../usuarios/entities/usuario.entity.js';
import {
  serializarUsuario,
  UsuarioSerializado,
  UsuariosService,
} from '../usuarios/usuarios.service.js';
import type { AccessTokenPayload } from './authenticated-request.js';
import { MicrosoftTokenVerifier } from './microsoft-token.verifier.js';

export interface LoginResponse {
  situacao: 'autenticado';
  accessToken: string;
  tokenType: 'Bearer';
  expiresIn: number;
  usuario: Usuario | UsuarioSerializado;
}

export interface OnboardingResponse {
  situacao: 'onboarding';
  tokenType: 'Bearer';
  expiresIn: number;
  onboardingToken: string;
  identidade: { nome: string; email: string };
}

const ONBOARDING_SEGUNDOS = 15 * 60;

@Injectable()
export class AuthService {
  constructor(
    private readonly jwtService: JwtService,
    private readonly microsoftTokenVerifier: MicrosoftTokenVerifier,
    private readonly usuariosService: UsuariosService,
  ) {}

  async autenticarComMicrosoft(
    idToken: string,
  ): Promise<LoginResponse | OnboardingResponse> {
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

    const coordenador = buscarCoordenadorPorEmail(email);
    if (coordenador) {
      return this.assinar(coordenador, coordenador);
    }
    const usuario = await this.usuariosService.buscarPorEmail(email);
    if (usuario) return this.emitirSessao(usuario);

    const nome = identidade.name?.trim() || email.split('@')[0];
    const onboardingToken = await this.jwtService.signAsync(
      {
        sub: identidade.subject,
        email,
        nome,
        escopo: 'onboarding',
      },
      { expiresIn: ONBOARDING_SEGUNDOS },
    );
    return {
      situacao: 'onboarding',
      tokenType: 'Bearer',
      expiresIn: ONBOARDING_SEGUNDOS,
      onboardingToken,
      identidade: { nome, email },
    };
  }

  /**
   * E-mail comprovado por um JWT de onboarding ou por uma sessão normal.
   * O corpo do cadastro não escolhe essa conta.
   */
  async identidadeDoCadastro(
    autorizacao?: string,
  ): Promise<{ email: string; nome?: string }> {
    const token = autorizacao?.startsWith('Bearer ')
      ? autorizacao.slice('Bearer '.length).trim()
      : '';
    if (!token) {
      throw new UnauthorizedException(
        'Conclua o login Microsoft antes de enviar o cadastro.',
      );
    }
    try {
      const payload =
        await this.jwtService.verifyAsync<AccessTokenPayload>(token);
      const email = payload.email?.trim().toLowerCase();
      if (!email) {
        throw new UnauthorizedException('Token de cadastro sem e-mail.');
      }
      if (payload.escopo && payload.escopo !== 'onboarding' && payload.escopo !== 'acesso') {
        throw new UnauthorizedException('Token de cadastro inválido.');
      }
      return { email, nome: payload.nome };
    } catch (erro) {
      if (erro instanceof UnauthorizedException) throw erro;
      throw new UnauthorizedException('Token de cadastro inválido ou expirado.');
    }
  }

  /**
   * Login de desenvolvimento, sem Microsoft e sem senha. Só aceita um e-mail
   * da base demo (`USUARIOS`). Ativo apenas com AUTH_DEMO_ENABLED=true e fora
   * de produção. Aluno demo precisa existir em `usuarios` (`npm run seed:demo`).
   */
  async autenticarDemo(emailInformado: string): Promise<LoginResponse> {
    if (process.env.AUTH_DEMO_ENABLED !== 'true') {
      throw new UnauthorizedException('Login demo desabilitado.');
    }
    if (process.env.NODE_ENV === 'production') {
      throw new UnauthorizedException('Login demo indisponível em produção.');
    }
    // Contas demo antigas (dados.ts) e as da gamificação (demo-gamificacao.ts).
    // Mesmas proteções: só com AUTH_DEMO_ENABLED, nunca em produção, e só
    // para e-mails da lista fixa.
    const antiga = buscarUsuarioPorEmail(emailInformado);
    const demo = antiga ?? buscarContaDemo(emailInformado);
    if (!demo) {
      throw new UnauthorizedException('Usuário demo não autorizado.');
    }
    // Cada base tem o próprio seed: a mensagem aponta o comando certo.
    return this.entrar(
      demo.email,
      antiga
        ? 'Usuário demo ainda não está no banco. Execute npm run seed:demo uma vez.'
        : 'Conta demo da gamificação ainda não está no banco. Execute npm run seed:demo-gamificacao (em banco compartilhado, com --compartilhado e autorização da equipe).',
    );
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
    const accessToken = await this.jwtService.signAsync(
      {
        sub: String(identidade.id),
        email: identidade.email,
        perfil: identidade.perfil,
        escopo: 'acesso',
      },
      { expiresIn: 3600 },
    );

    return {
      situacao: 'autenticado',
      accessToken,
      tokenType: 'Bearer',
      expiresIn: 3600,
      usuario,
    };
  }
}
