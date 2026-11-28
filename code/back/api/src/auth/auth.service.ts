import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import {
  ambientePublicado,
  chavesIguais,
  type ModoLoginDemo,
  modoLoginDemo,
} from '../config/ambiente.js';
import {
  buscarCoordenadorPorEmail,
  buscarUsuarioPorEmail,
  coordenadoresConfigurados,
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
    // Lista separada por vírgula (ex.: "pucminas.edu.br,sga.pucminas.edu.br"):
    // domínio exato depois do @, sem aceitar subdomínio por acaso.
    const dominiosPermitidos = (process.env.AUTH_ALLOWED_DOMAIN ?? 'pucminas.edu.br')
      .split(',')
      .map((d) => d.trim().toLowerCase().replace(/^@/, ''))
      .filter(Boolean);
    const dominio = email.slice(email.lastIndexOf('@') + 1);

    if (!dominiosPermitidos.includes(dominio)) {
      throw new UnauthorizedException(
        `Use uma conta institucional (${dominiosPermitidos.map((d) => `@${d}`).join(' ou ')}).`,
      );
    }

    // Em ambiente publicado, os e-mails da base demo (inclusive a coordenadora
    // fictícia) só entram pelo login demo protegido. Assim uma pessoa real com
    // um desses endereços não herda o perfil de demonstração.
    const coordenadorConfigurado = coordenadoresConfigurados().some(
      (c) => c.email === email,
    );
    if (
      ambientePublicado() &&
      !coordenadorConfigurado &&
      (buscarUsuarioPorEmail(email) || buscarContaDemo(email))
    ) {
      throw new UnauthorizedException(
        'Esta conta é reservada às demonstrações do Ajuda-aí.',
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
  ): Promise<{
    email: string;
    nome?: string;
    /**
     * SEG-006: com token de ACESSO, a sessão devolvida pelo cadastro não pode
     * durar além dele (senão um token roubado se renovaria para sempre).
     * Só o onboarding — que vem do login Microsoft — abre sessão nova.
     */
    expiraEm?: number;
  }> {
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
      // Escopo obrigatório: tokens antigos sem escopo não servem mais.
      if (payload.escopo !== 'onboarding' && payload.escopo !== 'acesso') {
        throw new UnauthorizedException('Token de cadastro inválido.');
      }
      const exp = (payload as { exp?: number }).exp;
      return {
        email,
        nome: payload.nome,
        expiraEm: payload.escopo === 'acesso' ? exp : undefined,
      };
    } catch (erro) {
      if (erro instanceof UnauthorizedException) throw erro;
      throw new UnauthorizedException('Token de cadastro inválido ou expirado.');
    }
  }

  /**
   * Login de demonstração, sem Microsoft e sem senha. Só aceita um e-mail da
   * base demo (`USUARIOS` e contas da gamificação). Regras em `modoLoginDemo`:
   * - produção ou AUTH_DEMO_ENABLED≠true → desligado;
   * - desenvolvimento isolado (banco local ou API só em loopback) → aberto;
   * - qualquer outro caso (homologação, banco compartilhado, HOST de rede) →
   *   exige a chave de demonstração (cabeçalho X-Demo-Chave) ou a sessão
   *   Microsoft de um operador listado em DEMO_OPERADORES.
   * Aluno demo precisa existir em `usuarios` (`npm run seed:demo`).
   */
  async autenticarDemo(
    emailInformado: string,
    acesso: { chave?: string; autorizacao?: string } = {},
  ): Promise<LoginResponse> {
    const regra = modoLoginDemo();
    if (regra.modo === 'desligado') {
      throw new UnauthorizedException(
        regra.motivo === 'produção'
          ? 'Login demo indisponível em produção.'
          : 'Login demo desabilitado.',
      );
    }
    if (regra.modo === 'protegido' && !(await this.portaDemoAberta(regra, acesso))) {
      throw new UnauthorizedException(
        'Login demo restrito: informe a chave de demonstração ou entre como operador.',
      );
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
  async emitirSessao(
    usuario: UsuarioEntity,
    /** Teto (epoch em segundos): a nova sessão não passa deste instante (SEG-006). */
    expiraAte?: number,
  ): Promise<LoginResponse> {
    return this.assinar(
      {
        id: usuario.id,
        email: usuario.email,
        perfil: usuario.tipoParticipacao,
      },
      serializarUsuario(usuario),
      expiraAte,
    );
  }

  /** Chave de demonstração OU sessão Microsoft de um operador autorizado. */
  private async portaDemoAberta(
    regra: Extract<ModoLoginDemo, { modo: 'protegido' }>,
    acesso: { chave?: string; autorizacao?: string },
  ): Promise<boolean> {
    if (regra.chave && acesso.chave && chavesIguais(acesso.chave.trim(), regra.chave)) {
      return true;
    }
    const token = acesso.autorizacao?.startsWith('Bearer ')
      ? acesso.autorizacao.slice('Bearer '.length).trim()
      : '';
    if (!token || !regra.operadores.length) return false;
    try {
      const payload = await this.jwtService.verifyAsync<AccessTokenPayload>(token);
      const email = payload.email?.trim().toLowerCase();
      return payload.escopo === 'acesso' && !!email && regra.operadores.includes(email);
    } catch {
      return false;
    }
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
    expiraAte?: number,
  ): Promise<LoginResponse> {
    const SESSAO_SEGUNDOS = 3600;
    const restante =
      expiraAte === undefined
        ? SESSAO_SEGUNDOS
        : Math.min(SESSAO_SEGUNDOS, Math.floor(expiraAte - Date.now() / 1000));
    if (restante <= 0) {
      throw new UnauthorizedException('Sessão expirada. Entre novamente.');
    }
    const accessToken = await this.jwtService.signAsync(
      {
        sub: String(identidade.id),
        email: identidade.email,
        perfil: identidade.perfil,
        escopo: 'acesso',
      },
      { expiresIn: restante },
    );

    return {
      situacao: 'autenticado',
      accessToken,
      tokenType: 'Bearer',
      expiresIn: restante,
      usuario,
    };
  }
}
