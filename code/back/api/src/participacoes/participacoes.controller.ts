import {
  Body,
  Controller,
  Get,
  Headers,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { Roles } from '../auth/roles.decorator.js';
import { RolesGuard } from '../auth/roles.guard.js';
import { ProgramasService } from '../programas/programas.service.js';
import { montarEtapas, ROTULOS_STATUS_PROGRAMA } from '../programas/etapas.js';
import type {
  ParticipacaoEntity,
  RespostasCadastro,
} from './entities/participacao.entity.js';
import { ParticipacoesService } from './participacoes.service.js';
import { perfilDoRegistro, serializarParticipacao } from './perfil.js';

/**
 * Rotas do aluno. Ainda não há login no app do aluno: o usuário é
 * identificado pelo e-mail institucional (header `x-user-id` ou campo
 * `usuarioId`). Ações que mudam o status do programa ficam só com a
 * coordenação.
 */
@Controller('participacoes')
export class ParticipacoesController {
  constructor(
    private readonly participacoesService: ParticipacoesService,
    private readonly programasService: ProgramasService,
  ) {}

  @Get()
  async listar(
    @Headers('x-user-id') headerUsuarioId?: string,
    @Query('usuarioId') queryUsuarioId?: string,
  ) {
    const registros = await this.participacoesService.listarPorUsuario(
      this.usuarioId(headerUsuarioId, queryUsuarioId),
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
    @Headers('x-user-id') headerUsuarioId?: string,
    @Query('usuarioId') queryUsuarioId?: string,
    @Query('programa') programaQuery?: string,
  ) {
    const usuarioId = this.usuarioId(headerUsuarioId, queryUsuarioId);
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
    if (registro && grupo && registro.papel === 'apadrinhado') {
      const registroPadrinho =
        await this.participacoesService.buscarPadrinhoDoGrupo(
          programa.codigo,
          grupo,
        );
      if (registroPadrinho) {
        padrinho = { ...perfilDoRegistro(registroPadrinho), grupo };
      }
    }
    if (registro && grupo && registro.papel === 'padrinho') {
      const lista = await this.participacoesService.listarApadrinhadosDoGrupo(
        programa.codigo,
        grupo,
      );
      apadrinhados = lista.map((item) => ({ ...perfilDoRegistro(item), grupo }));
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
      perfil: perfilDoRegistro(
        registro ?? ({ usuarioId, respostas: null } as ParticipacaoEntity),
      ),
      registro: registro ? serializarParticipacao(registro) : null,
      grupo,
      padrinho,
      apadrinhados,
    };
  }

  @Post('candidatura-padrinho')
  async registrarCandidatura(
    @Body()
    corpo: { usuarioId?: string; programa?: string; respostas?: RespostasCadastro },
    @Headers('x-user-id') headerUsuarioId?: string,
  ) {
    const registro = await this.participacoesService.registrarCandidaturaPadrinho({
      usuarioId: this.usuarioId(headerUsuarioId, corpo.usuarioId),
      programa: corpo.programa,
      respostas: corpo.respostas,
    });
    return serializarParticipacao(registro);
  }

  @Post('cadastro-apadrinhado')
  async cadastrarApadrinhado(
    @Body()
    corpo: { usuarioId?: string; programa?: string; respostas?: RespostasCadastro },
    @Headers('x-user-id') headerUsuarioId?: string,
  ) {
    const registro = await this.participacoesService.cadastrarApadrinhado({
      usuarioId: this.usuarioId(headerUsuarioId, corpo.usuarioId),
      programa: corpo.programa,
      respostas: corpo.respostas,
    });
    return serializarParticipacao(registro);
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

  private usuarioId(header?: string, fallback?: string): string {
    return (header?.trim() || fallback?.trim() || '').toLowerCase();
  }
}
