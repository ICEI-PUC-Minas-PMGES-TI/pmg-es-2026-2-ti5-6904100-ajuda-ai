import {
  Body,
  Controller,
  Get,
  Headers,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { AuthenticatedRequest } from '../auth/authenticated-request.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { JwtOpcionalGuard } from '../auth/jwt-opcional.guard.js';
import { Roles } from '../auth/roles.decorator.js';
import { RolesGuard } from '../auth/roles.guard.js';
import { ProgramasService } from '../programas/programas.service.js';
import { montarEtapas, ROTULOS_STATUS_PROGRAMA } from '../programas/etapas.js';
import { UsuariosService } from '../usuarios/usuarios.service.js';
import type { ParticipacaoEntity } from './entities/participacao.entity.js';
import { ParticipacoesService } from './participacoes.service.js';
import { perfilDoRegistro, serializarParticipacao } from './perfil.js';

/**
 * Rotas do aluno. Com token (login demo/cadastro), a identidade vem do token
 * e `x-user-id` é ignorado. Sem token, vale o modo antigo do app mobile:
 * e-mail institucional em `x-user-id` ou `usuarioId`. Os envios de cadastro
 * ficam no CadastroModule. Ações que mudam o status do programa ficam só com
 * a coordenação.
 */
@Controller('participacoes')
@UseGuards(JwtOpcionalGuard)
export class ParticipacoesController {
  constructor(
    private readonly participacoesService: ParticipacoesService,
    private readonly programasService: ProgramasService,
    private readonly usuariosService: UsuariosService,
  ) {}

  @Get()
  async listar(
    @Req() requisicao: AuthenticatedRequest,
    @Headers('x-user-id') headerUsuarioId?: string,
    @Query('usuarioId') queryUsuarioId?: string,
  ) {
    const registros = await this.participacoesService.listarPorUsuario(
      this.usuarioId(headerUsuarioId, queryUsuarioId, requisicao),
    );
    return registros.map(serializarParticipacao);
  }

  /**
   * Situação do aluno no ciclo: candidatura, vínculo com padrinho/grupo e
   * etapas do programa. Alimenta Perfil, Status da candidatura e
   * "Seu padrinho foi definido".
   */
  @Get('situacao')
  async situacao(
    @Req() requisicao: AuthenticatedRequest,
    @Headers('x-user-id') headerUsuarioId?: string,
    @Query('usuarioId') queryUsuarioId?: string,
    @Query('programa') programaQuery?: string,
  ) {
    const usuarioId = this.usuarioId(
      headerUsuarioId,
      queryUsuarioId,
      requisicao,
    );
    const usuario = await this.usuariosService.buscarPorEmail(usuarioId);
    // Dados de padrinho/apadrinhados só para cadastros aprovados.
    const aprovado = usuario?.statusCadastro === 'aprovado';
    const codigo =
      programaQuery?.trim() || ParticipacoesService.programaAtual();
    const programa =
      (await this.programasService.buscarPorCodigo(codigo)) ??
      (await this.programasService.garantirProgramaAtual());
    const registro = await this.participacoesService.registroPrincipal(
      usuarioId,
      programa.codigo,
    );

    let padrinho: Record<string, unknown> | null = null;
    let apadrinhados: Array<Record<string, unknown>> = [];
    const grupo = registro?.grupo?.trim() || null;
    if (aprovado && registro && grupo && registro.papel === 'apadrinhado') {
      const registroPadrinho =
        await this.participacoesService.buscarPadrinhoDoGrupo(
          programa.codigo,
          grupo,
        );
      if (registroPadrinho) {
        padrinho = { ...perfilDoRegistro(registroPadrinho), grupo };
      }
    }
    if (aprovado && registro && grupo && registro.papel === 'padrinho') {
      const lista = await this.participacoesService.listarApadrinhadosDoGrupo(
        programa.codigo,
        grupo,
      );
      apadrinhados = lista.map((item) => ({
        ...perfilDoRegistro(item),
        grupo,
      }));
    }

    return {
      usuarioId,
      programa: {
        codigo: programa.codigo,
        titulo: programa.titulo,
        etapaAtual: programa.etapaAtual,
        statusRotulo: ROTULOS_STATUS_PROGRAMA[programa.etapaAtual],
        inscricoesAbertas: programa.inscricoesAbertas,
        etapas: montarEtapas(programa),
      },
      situacao: ParticipacoesService.situacaoDe(registro),
      cadastro: usuario
        ? {
            status: usuario.statusCadastro,
            tipoParticipacao: usuario.tipoParticipacao,
            motivoRejeicao: usuario.motivoRejeicao ?? null,
            analisadoEm: usuario.analisadoEm ?? null,
            criadoEm: usuario.criadoEm,
          }
        : null,
      perfil: perfilDoRegistro(
        registro ?? ({ usuarioId, respostas: null } as ParticipacaoEntity),
      ),
      registro: registro ? serializarParticipacao(registro) : null,
      grupo,
      padrinho,
      apadrinhados,
    };
  }

  /** Aprovação/match manual — restrito à coordenação. */
  @Post('confirmar')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('coordenador')
  async confirmar(
    @Body()
    corpo: {
      usuarioId?: string;
      papel?: 'padrinho' | 'apadrinhado';
      programa?: string;
      grupo?: string;
      apadrinhados?: number;
      inicioEm?: string;
    },
  ) {
    const registro = await this.participacoesService.confirmarIngresso({
      usuarioId: this.usuarioId(undefined, corpo.usuarioId),
      papel: corpo.papel ?? 'padrinho',
      programa: corpo.programa,
      grupo: corpo.grupo,
      apadrinhados: corpo.apadrinhados,
      inicioEm: corpo.inicioEm,
    });
    return serializarParticipacao(registro);
  }

  /** Rejeição manual — restrito à coordenação. */
  @Post('rejeitar-candidatura')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('coordenador')
  async rejeitar(@Body() corpo: { usuarioId?: string; programa?: string }) {
    const registro = await this.participacoesService.rejeitarCandidatura({
      usuarioId: this.usuarioId(undefined, corpo.usuarioId),
      programa: corpo.programa,
    });
    return registro ? serializarParticipacao(registro) : null;
  }

  private usuarioId(
    header?: string,
    fallback?: string,
    requisicao?: AuthenticatedRequest,
  ): string {
    const doToken =
      requisicao?.user?.perfil !== 'coordenador' ? requisicao?.user?.email : '';
    return (doToken || header?.trim() || fallback?.trim() || '').toLowerCase();
  }
}
