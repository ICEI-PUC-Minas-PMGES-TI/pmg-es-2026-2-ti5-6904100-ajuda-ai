import { FileInterceptor } from '@nestjs/platform-express';
import { AzureBlobStorageService } from '../storage/azure-blob-storage.service.js';
import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  NotFoundException,
  Post,
  Put,
  Patch,
  ServiceUnavailableException,
  UploadedFile,
  UseInterceptors,
  Req,
  Query,
  UseGuards,
} from '@nestjs/common';
import type { AuthenticatedRequest } from '../auth/authenticated-request.js';
import { AuthService } from '../auth/auth.service.js';
import {
  CadastroAprovadoGuard,
  type ParticipanteRequest,
} from '../auth/cadastro-aprovado.guard.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { JwtOpcionalGuard } from '../auth/jwt-opcional.guard.js';
import { buscarCoordenadorPorEmail } from '../dados/dados.js';
import type { RespostasCadastro } from '../participacoes/entities/participacao.entity.js';
import { serializarParticipacao } from '../participacoes/perfil.js';
import { serializarUsuario } from '../usuarios/usuarios.service.js';
import { UsuariosService } from '../usuarios/usuarios.service.js';
import { CadastroService } from './cadastro.service.js';
import { CadastroDto } from './dto/cadastro.dto.js';

/** Cadastro do aluno (público) e consulta do próprio cadastro. */
@Controller('cadastro')
export class CadastroController {
  constructor(
    private readonly cadastroService: CadastroService,
    private readonly authService: AuthService,
    private readonly usuariosService: UsuariosService,
  ) {}

  /**
   * Cria a solicitação de cadastro (status PENDENTE) e devolve a sessão do
   * aluno para ele acompanhar a análise. O e-mail vem do token Microsoft
   * (onboarding ou sessão), nunca do valor livre do corpo.
   */
  @Post()
  async cadastrar(
    @Headers('authorization') autorizacao: string | undefined,
    @Body() corpo: CadastroDto,
  ) {
    const identidade = await this.authService.identidadeDoCadastro(autorizacao);
    const informado = corpo.email.trim().toLowerCase();
    if (informado !== identidade.email) {
      throw new BadRequestException(
        'O e-mail do cadastro deve ser o da conta Microsoft autenticada.',
      );
    }
    return this.cadastroService.cadastrar({
      ...corpo,
      email: identidade.email,
    });
  }

  /** Completa perfil com token de onboarding ou acesso, sem criar inscrição. */
  @Put('perfil')
  async completarPerfil(
    @Headers('authorization') autorizacao: string | undefined,
    @Body() corpo: Record<string, unknown>,
  ) {
    const identidade = await this.authService.identidadeDoCadastro(autorizacao);
    if (buscarCoordenadorPorEmail(identidade.email))
      throw new BadRequestException('Conta da coordenação.');
    const usuario = await this.usuariosService.atualizarPerfil(
      identidade.email,
      corpo,
      true,
    );
    return this.authService.emitirSessao(usuario);
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  meuCadastro(@Req() requisicao: AuthenticatedRequest) {
    return this.cadastroService.situacaoDoCadastro(requisicao.user.email);
  }
}

/** Quem sou eu: coordenador mockado ou aluno do banco. */
@Controller('me')
@UseGuards(JwtAuthGuard)
export class MeController {
  constructor(
    private readonly usuariosService: UsuariosService,
    private readonly cadastroService: CadastroService,
    private readonly storage: AzureBlobStorageService,
  ) {}

  @Get()
  async perfil(@Req() requisicao: AuthenticatedRequest) {
    const coordenador = buscarCoordenadorPorEmail(requisicao.user.email);
    if (coordenador) return coordenador;
    const usuario = await this.usuariosService.buscarPorEmail(
      requisicao.user.email,
    );
    if (!usuario) throw new NotFoundException('Usuário não encontrado.');
    return serializarUsuario(usuario);
  }

  @Patch()
  async atualizar(
    @Req() requisicao: AuthenticatedRequest,
    @Body() corpo: Record<string, unknown>,
  ) {
    return serializarUsuario(
      await this.usuariosService.atualizarPerfil(requisicao.user.email, corpo),
    );
  }

  private async chaveFoto(requisicao: AuthenticatedRequest) {
    const usuario = await this.usuariosService.buscarPorEmail(
      requisicao.user.email,
    );
    if (!usuario) throw new NotFoundException('Perfil não encontrado.');
    return `usuarios/${usuario.id}/avatar.img`;
  }

  @Put('foto')
  @UseInterceptors(
    FileInterceptor('foto', {
      limits: { fileSize: 5 * 1024 * 1024, files: 1 },
    }),
  )
  async foto(
    @Req() requisicao: AuthenticatedRequest,
    @UploadedFile() arquivo: { buffer: Buffer } | undefined,
  ) {
    const chave = await this.chaveFoto(requisicao);
    if (!arquivo?.buffer?.length)
      throw new BadRequestException('Envie uma foto PNG, JPEG ou WebP.');
    await this.storage.substituirFotoPerfil(chave, arquivo.buffer);
    return this.storage.sasLeitura('profiles', chave);
  }

  @Get('foto')
  async lerFoto(@Req() requisicao: AuthenticatedRequest) {
    const chave = await this.chaveFoto(requisicao);
    try {
      if (!(await this.storage.existe('profiles', chave))) return { url: null };
      return this.storage.sasLeitura('profiles', chave);
    } catch (erro) {
      // Em desenvolvimento sem Azure, o perfil segue com iniciais — sem erro na UI.
      if (erro instanceof ServiceUnavailableException) return { url: null };
      throw erro;
    }
  }

  /** Padrinho ↔ apadrinhados: só para cadastros aprovados. */
  @Get('vinculos')
  @UseGuards(CadastroAprovadoGuard)
  vinculos(
    @Req() requisicao: ParticipanteRequest,
    @Query('programa') programa?: string,
  ) {
    return this.cadastroService.vinculosDe(requisicao.usuario.email, programa);
  }
}

interface CorpoCadastroAntigo {
  usuarioId?: string;
  programa?: string;
  respostas?: RespostasCadastro;
}

/**
 * Rotas antigas de envio (usadas pelo app mobile e por "Editar candidatura").
 * Passam pelo mesmo CadastroService: mesmas validações (inclusive a regra do
 * 1º período) e o cadastro fica PENDENTE até a coordenação decidir.
 * A identidade vem do JWT (sessão ou onboarding). `x-user-id` não escolhe o e-mail.
 */
@Controller('participacoes')
@UseGuards(JwtOpcionalGuard)
export class CadastroParticipacoesController {
  constructor(
    private readonly cadastroService: CadastroService,
    private readonly authService: AuthService,
  ) {}

  @Post('candidatura-padrinho')
  async registrarCandidatura(
    @Req() requisicao: AuthenticatedRequest,
    @Body() corpo: CorpoCadastroAntigo,
  ) {
    const { participacao } = await this.cadastroService.registrar(
      CadastroService.dadosDasRespostas(
        await this.emailAutenticado(requisicao),
        'padrinho',
        corpo.respostas,
        corpo.programa,
      ),
    );
    return serializarParticipacao(participacao);
  }

  @Post('cadastro-apadrinhado')
  async cadastrarApadrinhado(
    @Req() requisicao: AuthenticatedRequest,
    @Body() corpo: CorpoCadastroAntigo,
  ) {
    const { participacao } = await this.cadastroService.registrar(
      CadastroService.dadosDasRespostas(
        await this.emailAutenticado(requisicao),
        'apadrinhado',
        corpo.respostas,
        corpo.programa,
      ),
    );
    return serializarParticipacao(participacao);
  }

  private async emailAutenticado(
    requisicao: AuthenticatedRequest,
  ): Promise<string> {
    const identidade = await this.authService.identidadeDoCadastro(
      requisicao.headers.authorization,
    );
    return identidade.email;
  }
}
