import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
  UploadedFile,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor, FilesInterceptor } from '@nestjs/platform-express';
import { DataSource } from 'typeorm';
import type { AuthenticatedRequest } from '../auth/authenticated-request.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { Roles } from '../auth/roles.decorator.js';
import { RolesGuard } from '../auth/roles.guard.js';
import { CARDAPIO_TAMANHO_MAX } from '../campus/campus.js';
import { usuarioDoTokenOuNulo } from '../gamificacao/gamificacao.js';
import { BuscaMapaQuery } from './dto/mapa.dto.js';
import {
  AtualizarInformacoesLocalDto,
  IMAGENS_LOCAL_MAX,
} from './dto/local-conteudo.dto.js';
import { LocalConteudoService } from './local-conteudo.service.js';
import { MapaService } from './mapa.service.js';

/**
 * Leitura pública do mapa do campus (dados abertos, sem login), como
 * `GET /avisos`. Só GET; nada de escrita, publicação ou administração.
 */
@Controller('mapa')
export class MapaController {
  constructor(
    private readonly mapa: MapaService,
    private readonly conteudo: LocalConteudoService,
  ) {}

  @Get('versao')
  versao() {
    return this.mapa.versao();
  }

  @Get('predios')
  predios() {
    return this.mapa.predios();
  }

  @Get('predios/:id')
  async predio(@Param('id') id: string) {
    const [predio, conteudo] = await Promise.all([
      this.mapa.predio(id),
      this.conteudo.detalhe(id),
    ]);
    return { ...predio, ...conteudo };
  }

  @Get('areas')
  areas() {
    return this.mapa.areas();
  }

  @Get('salas')
  salas() {
    return this.mapa.salas();
  }

  /** `q` vazio devolve `[]`; `limit` 1..20 (padrão 8). */
  @Get('busca')
  buscar(@Query() consulta: BuscaMapaQuery) {
    return this.mapa.buscar(consulta.q, consulta.limit);
  }
}

/** Edição editorial de locais; toda mutação exige coordenador. */
@Controller('coordenacao/mapa/predios')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('coordenador')
export class MapaLocaisAdminController {
  constructor(
    private readonly conteudo: LocalConteudoService,
    private readonly dataSource: DataSource,
  ) {}

  private usuario(requisicao: AuthenticatedRequest) {
    return usuarioDoTokenOuNulo(this.dataSource, requisicao.user);
  }

  @Patch(':id')
  async atualizar(
    @Req() requisicao: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() dados: AtualizarInformacoesLocalDto,
  ) {
    return this.conteudo.atualizarDescricao(
      id,
      dados.descricao,
      await this.usuario(requisicao),
    );
  }

  @Post(':id/imagens')
  @UseInterceptors(
    FilesInterceptor('arquivos', IMAGENS_LOCAL_MAX, {
      limits: {
        fileSize: CARDAPIO_TAMANHO_MAX,
        files: IMAGENS_LOCAL_MAX,
        fields: 2,
      },
    }),
  )
  async adicionarImagens(
    @Req() requisicao: AuthenticatedRequest,
    @Param('id') id: string,
    @UploadedFiles() arquivos?: Array<{ buffer: Buffer }>,
  ) {
    return this.conteudo.adicionar(
      id,
      (arquivos ?? []).map((arquivo) => arquivo.buffer),
      await this.usuario(requisicao),
    );
  }

  @Patch(':id/imagens/:imagemId')
  @UseInterceptors(
    FileInterceptor('arquivo', {
      limits: { fileSize: CARDAPIO_TAMANHO_MAX, files: 1, fields: 1 },
    }),
  )
  async substituirImagem(
    @Req() requisicao: AuthenticatedRequest,
    @Param('id') id: string,
    @Param('imagemId', new ParseUUIDPipe({ version: '4' })) imagemId: string,
    @UploadedFile() arquivo?: { buffer: Buffer },
  ) {
    return this.conteudo.substituir(
      id,
      imagemId,
      arquivo?.buffer,
      await this.usuario(requisicao),
    );
  }

  @Delete(':id/imagens/:imagemId')
  removerImagem(
    @Param('id') id: string,
    @Param('imagemId', new ParseUUIDPipe({ version: '4' })) imagemId: string,
  ) {
    return this.conteudo.remover(id, imagemId);
  }
}
