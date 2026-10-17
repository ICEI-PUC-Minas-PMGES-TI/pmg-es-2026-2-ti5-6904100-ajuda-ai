import {
  Body,
  BadRequestException,
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
import { Roles } from '../auth/roles.decorator.js';
import { RolesGuard } from '../auth/roles.guard.js';
import { ProgramasService } from '../programas/programas.service.js';
import { montarEtapas, ROTULOS_STATUS_PROGRAMA } from '../programas/etapas.js';
import { UsuariosService } from '../usuarios/usuarios.service.js';
import { ParticipacoesService } from './participacoes.service.js';
import { perfilDoRegistro, serializarParticipacao } from './perfil.js';

/** Consultas do próprio aluno exigem JWT. Decisões são restritas à coordenação. */
@Controller('participacoes')
@UseGuards(JwtAuthGuard)
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
  @Get('programas')
  async programas() {
    return (await this.programasService.listar()).map((programa) => {
      let inscricoesDisponiveis = false;
      try {
        this.programasService.validarInscricoes(programa);
        inscricoesDisponiveis = true;
      } catch { /* Calendário fechado: consulta continua disponível. */ }
      return {
        codigo: programa.codigo,
        titulo: programa.titulo,
        etapaAtual: programa.etapaAtual,
        inscricoesDisponiveis,
        atual: programa.codigo === ParticipacoesService.programaAtual(),
      };
    });
  }

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
    const programa =
      await this.programasService.resolverConsulta(programaQuery);
    if (!programa)
      return {
        usuarioId,
        programa: null,
        situacao: 'nenhuma',
        registro: null,
        perfil: usuario
          ? {
              nome: usuario.nome,
              email: usuario.email,
              curso: usuario.curso,
              periodo: usuario.periodo,
              turno: usuario.turno,
              interesses: usuario.interesses ?? [],
            }
          : null,
        cadastro: null,
        grupo: null,
        padrinho: null,
        apadrinhados: [],
      };
    const registro = await this.participacoesService.registroPrincipal(
      usuarioId,
      programa.codigo,
    );

    const aprovado = await this.participacoesService.temVinculoValido(registro);
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
      situacao: await this.participacoesService.situacaoDoRegistro(registro),
      cadastro: usuario
        ? {
            status:
              registro?.status === 'nao_aprovado'
                ? 'rejeitado'
                : registro &&
                    ['pendente', 'em_analise'].includes(registro.status)
                  ? 'pendente'
                  : 'aprovado',
            tipoParticipacao:
              registro?.papel === 'candidato'
                ? 'padrinho'
                : (registro?.papel ?? 'nenhuma'),
            motivoRejeicao:
              registro?.status === 'nao_aprovado'
                ? (registro.respostas?._servidor?.decisao?.justificativa ??
                  null)
                : null,
            analisadoEm: registro?.respostas?._servidor?.decisao?.em ?? null,
            criadoEm: usuario.criadoEm,
          }
        : null,
      perfil: usuario
        ? {
            nome: usuario.nome,
            email: usuario.email,
            curso: usuario.curso,
            periodo: usuario.periodo,
            turno: usuario.turno,
            interesses: usuario.interesses ?? [],
          }
        : null,
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
  async rejeitar(
    @Body()
    corpo: {
      usuarioId?: string;
      programa?: string;
      justificativa?: string;
    },
  ) {
    const registro = await this.participacoesService.rejeitarCandidatura({
      usuarioId: this.usuarioId(undefined, corpo.usuarioId),
      programa: corpo.programa,
      justificativa: corpo.justificativa,
    });
    return registro ? serializarParticipacao(registro) : null;
  }

  private usuarioId(
    header?: string,
    fallback?: string,
    requisicao?: AuthenticatedRequest,
  ): string {
    if (!requisicao) return (fallback ?? '').trim().toLowerCase();
    const email = requisicao.user.email;
    if ([header, fallback].some((v) => v && v.trim().toLowerCase() !== email)) {
      throw new BadRequestException('Consulte apenas a própria participação.');
    }
    return email;
  }
}
