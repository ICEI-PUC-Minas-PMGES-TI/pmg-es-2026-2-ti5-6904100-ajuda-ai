import {
  Body,
  Controller,
  Get,
  Headers,
  NotFoundException,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { AuthenticatedRequest } from '../auth/authenticated-request.js';
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
  constructor(private readonly cadastroService: CadastroService) {}

  /**
   * Cria a solicitação de cadastro (status PENDENTE) e devolve a sessão do
   * aluno para ele acompanhar a análise.
   */
  @Post()
  cadastrar(@Body() corpo: CadastroDto) {
    return this.cadastroService.cadastrar(corpo);
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

  /** Padrinho ↔ apadrinhados: só para cadastros aprovados. */
  @Get('vinculos')
  @UseGuards(CadastroAprovadoGuard)
  vinculos(@Req() requisicao: ParticipanteRequest) {
    return this.cadastroService.vinculosDe(requisicao.usuario.email);
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
 * Com token, a identidade vem do token; sem token, de `x-user-id`.
 */
@Controller('participacoes')
@UseGuards(JwtOpcionalGuard)
export class CadastroParticipacoesController {
  constructor(private readonly cadastroService: CadastroService) {}

  @Post('candidatura-padrinho')
  async registrarCandidatura(
    @Req() requisicao: AuthenticatedRequest,
    @Body() corpo: CorpoCadastroAntigo,
    @Headers('x-user-id') headerUsuarioId?: string,
  ) {
    const { participacao } = await this.cadastroService.registrar(
      CadastroService.dadosDasRespostas(
        this.usuarioId(requisicao, headerUsuarioId, corpo.usuarioId),
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
    @Headers('x-user-id') headerUsuarioId?: string,
  ) {
    const { participacao } = await this.cadastroService.registrar(
      CadastroService.dadosDasRespostas(
        this.usuarioId(requisicao, headerUsuarioId, corpo.usuarioId),
        'apadrinhado',
        corpo.respostas,
        corpo.programa,
      ),
    );
    return serializarParticipacao(participacao);
  }

  private usuarioId(
    requisicao: AuthenticatedRequest,
    header?: string,
    fallback?: string,
  ): string {
    return (
      requisicao.user?.email ||
      header?.trim() ||
      fallback?.trim() ||
      ''
    ).toLowerCase();
  }
}
