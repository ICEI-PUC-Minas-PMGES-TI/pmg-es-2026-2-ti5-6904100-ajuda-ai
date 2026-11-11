import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { DataSource } from 'typeorm';
import type { AuthenticatedRequest } from '../auth/authenticated-request.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { Roles } from '../auth/roles.decorator.js';
import { RolesGuard } from '../auth/roles.guard.js';
import { usuarioDoTokenOuNulo } from '../gamificacao/gamificacao.js';
import { regiaoCampus } from '../mapa/campus-limite.js';
import { CARDAPIO_TAMANHO_MAX } from './campus.js';
import { CardapiosService } from './cardapios/cardapios.service.js';
import { AtualizarEventoDto, CriarEventoDto } from './eventos/eventos.dto.js';
import { EventosService } from './eventos/eventos.service.js';
import { schemaGeoEmCache } from './geo.js';
import {
  AtualizarRestauranteDto,
  CardapioDoDiaQuery,
  CriarRestauranteDto,
  EnviarCardapioDto,
} from './restaurantes/restaurantes.dto.js';
import { RestaurantesService } from './restaurantes/restaurantes.service.js';

const UUID = new ParseUUIDPipe({ version: '4' });

/* ===== Leitura pública (aluno, sem login), como o resto de /mapa ===== */

@Controller('mapa/eventos')
export class EventosController {
  constructor(private readonly eventos: EventosService) {}

  /** Ativos que ainda não acabaram, por início. `[]` sem eventos. */
  @Get()
  listar() {
    return this.eventos.publicos();
  }

  @Get(':id')
  detalhe(@Param('id') id: string) {
    return this.eventos.publico(id);
  }
}

@Controller('mapa/restaurantes')
export class RestaurantesController {
  constructor(
    private readonly restaurantes: RestaurantesService,
    private readonly cardapios: CardapiosService,
  ) {}

  @Get()
  listar() {
    return this.restaurantes.publicos();
  }

  @Get(':id')
  detalhe(@Param('id') id: string) {
    return this.restaurantes.publico(id);
  }

  /** Cardápio vigente na data (padrão: hoje, horário de Brasília). */
  @Get(':id/cardapio')
  cardapio(@Param('id') id: string, @Query() consulta: CardapioDoDiaQuery) {
    return this.cardapios.doDia(id, consulta.data);
  }
}

/* ===== Coordenação (mesmos guards de /coordenacao) ===== */

/** Região onde a coordenação pode posicionar conteúdo (seletor no mapa). */
@Controller('coordenacao/campus')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('coordenador')
export class CampusAdminController {
  private readonly geo: () => Promise<string>;

  constructor(private readonly dataSource: DataSource) {
    this.geo = schemaGeoEmCache(dataSource);
  }

  @Get()
  async regiao() {
    return regiaoCampus(
      (sql, p) => this.dataSource.query(sql, p),
      await this.geo(),
    );
  }
}

@Controller('coordenacao/eventos')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('coordenador')
export class EventosAdminController {
  constructor(
    private readonly eventos: EventosService,
    private readonly dataSource: DataSource,
  ) {}

  @Get()
  listar() {
    return this.eventos.listar();
  }

  @Get(':id')
  detalhe(@Param('id', UUID) id: string) {
    return this.eventos.detalhe(id);
  }

  @Post()
  async criar(
    @Req() requisicao: AuthenticatedRequest,
    @Body() dados: CriarEventoDto,
  ) {
    return this.eventos.criar(
      dados,
      await usuarioDoTokenOuNulo(this.dataSource, requisicao.user),
    );
  }

  @Patch(':id')
  atualizar(@Param('id', UUID) id: string, @Body() dados: AtualizarEventoDto) {
    return this.eventos.atualizar(id, dados);
  }

  /** "Excluir": some do mapa dos alunos; o registro fica. */
  @Post(':id/desativar')
  @HttpCode(200)
  desativar(@Param('id', UUID) id: string) {
    return this.eventos.definirAtivo(id, false);
  }

  @Post(':id/ativar')
  @HttpCode(200)
  ativar(@Param('id', UUID) id: string) {
    return this.eventos.definirAtivo(id, true);
  }
}

@Controller('coordenacao/restaurantes')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('coordenador')
export class RestaurantesAdminController {
  constructor(
    private readonly restaurantes: RestaurantesService,
    private readonly cardapios: CardapiosService,
    private readonly dataSource: DataSource,
  ) {}

  @Get()
  listar() {
    return this.restaurantes.listar();
  }

  /** Antes de `:id`: prédios CAFETERIA do mapa ativo, para cadastrar rápido. */
  @Get('sugestoes')
  sugestoes() {
    return this.restaurantes.sugestoes();
  }

  @Get(':id')
  detalhe(@Param('id', UUID) id: string) {
    return this.restaurantes.detalhe(id);
  }

  @Post()
  async criar(
    @Req() requisicao: AuthenticatedRequest,
    @Body() dados: CriarRestauranteDto,
  ) {
    return this.restaurantes.criar(
      dados,
      await usuarioDoTokenOuNulo(this.dataSource, requisicao.user),
    );
  }

  @Patch(':id')
  atualizar(
    @Param('id', UUID) id: string,
    @Body() dados: AtualizarRestauranteDto,
  ) {
    return this.restaurantes.atualizar(id, dados);
  }

  @Post(':id/desativar')
  @HttpCode(200)
  desativar(@Param('id', UUID) id: string) {
    return this.restaurantes.definirAtivo(id, false);
  }

  @Post(':id/ativar')
  @HttpCode(200)
  ativar(@Param('id', UUID) id: string) {
    return this.restaurantes.definirAtivo(id, true);
  }

  @Get(':id/cardapios')
  listarCardapios(@Param('id', UUID) id: string) {
    return this.cardapios.listar(id);
  }

  /**
   * Multipart: `arquivo` (PNG/JPEG/WebP/PDF, até 10 MB; tipo conferido pelos
   * bytes), `validoDe`, `validoAte` e opcional `substitui` (id do anterior).
   */
  @Post(':id/cardapios')
  @UseInterceptors(
    FileInterceptor('arquivo', {
      limits: { fileSize: CARDAPIO_TAMANHO_MAX, files: 1, fields: 5 },
    }),
  )
  async enviarCardapio(
    @Req() requisicao: AuthenticatedRequest,
    @Param('id', UUID) id: string,
    @Body() vigencia: EnviarCardapioDto,
    @UploadedFile() arquivo?: { buffer: Buffer },
  ) {
    return this.cardapios.enviar(
      id,
      arquivo?.buffer,
      vigencia,
      await usuarioDoTokenOuNulo(this.dataSource, requisicao.user),
    );
  }
}

@Controller('coordenacao/cardapios')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('coordenador')
export class CardapiosAdminController {
  constructor(private readonly cardapios: CardapiosService) {}

  /** Remove o arquivo do Azure e o registro (cardápio não é histórico). */
  @Delete(':id')
  remover(@Param('id', UUID) id: string) {
    return this.cardapios.remover(id);
  }
}
