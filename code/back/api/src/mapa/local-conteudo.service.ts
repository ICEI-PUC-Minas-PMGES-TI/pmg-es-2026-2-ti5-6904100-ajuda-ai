import { randomUUID } from 'node:crypto';
import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { DataSource } from 'typeorm';
import { detectarTipoCardapio } from '../campus/cardapios/cardapio-arquivo.js';
import { CARDAPIO_TAMANHO_MAX } from '../campus/campus.js';
import { AzureBlobStorageService } from '../storage/azure-blob-storage.service.js';
import { montarNomeBlob } from '../storage/blob-chave.js';
import { CONTAINERS } from '../storage/containers.js';
import type {
  ConteudoLocalDto,
  ImagemLocalDto,
} from './dto/local-conteudo.dto.js';
import { IMAGENS_LOCAL_MAX } from './dto/local-conteudo.dto.js';
import { SCHEMA_MAPA } from './postgis.js';

const m = `"${SCHEMA_MAPA}"`;
const CONTAINER = CONTAINERS.restaurantMenus;
const CACHE_IMUTAVEL = 'public, max-age=31536000, immutable';
const VERSAO_ATIVA = `(SELECT "id" FROM ${m}."versoes" WHERE "status" = 'ativa')`;

interface LinhaImagem {
  id: string;
  arquivo: string;
  tipo_conteudo: string;
  tamanho_bytes: number;
  ordem: number;
}

@Injectable()
export class LocalConteudoService {
  private readonly logger = new Logger('LocalConteudo');

  constructor(
    private readonly dataSource: DataSource,
    private readonly storage: AzureBlobStorageService,
  ) {}

  private async exigirLocal(localId: string): Promise<void> {
    const [local] = (await this.dataSource.query(
      `SELECT 1 FROM ${m}."predios" WHERE "versao_id" = ${VERSAO_ATIVA} AND "id" = $1`,
      [localId],
    )) as unknown[];
    if (!local)
      throw new NotFoundException('Local não encontrado no mapa ativo.');
  }

  private imagem(linha: LinhaImagem): ImagemLocalDto {
    const url = this.storage.urlPublica(CONTAINER, linha.arquivo);
    return {
      id: linha.id,
      url,
      originalUrl: url,
      tipoConteudo: linha.tipo_conteudo,
      tamanhoBytes: linha.tamanho_bytes,
      ordem: linha.ordem,
    };
  }

  async detalhe(localId: string): Promise<ConteudoLocalDto> {
    await this.exigirLocal(localId);
    const [info] = (await this.dataSource.query(
      `SELECT "descricao", "atualizado_em" FROM ${m}."local_informacoes" WHERE "local_id" = $1`,
      [localId],
    )) as Array<{ descricao: string; atualizado_em: Date }>;
    const imagens = (await this.dataSource.query(
      `SELECT "id", "arquivo", "tipo_conteudo", "tamanho_bytes", "ordem" ` +
        `FROM ${m}."local_imagens" WHERE "local_id" = $1 ORDER BY "ordem", "criado_em", "id"`,
      [localId],
    )) as LinhaImagem[];
    return {
      localId,
      descricao: info?.descricao ?? '',
      imagens: imagens.map((imagem) => this.imagem(imagem)),
      atualizadoEm: info?.atualizado_em.toISOString() ?? null,
    };
  }

  async atualizarDescricao(
    localId: string,
    descricao: string,
    usuarioId: number | null,
  ): Promise<ConteudoLocalDto> {
    await this.exigirLocal(localId);
    await this.dataSource.query(
      `INSERT INTO ${m}."local_informacoes" ("local_id", "descricao", "atualizado_por") VALUES ($1, $2, $3) ` +
        `ON CONFLICT ("local_id") DO UPDATE SET "descricao" = EXCLUDED."descricao", ` +
        `"atualizado_por" = EXCLUDED."atualizado_por", "atualizado_em" = now()`,
      [localId, descricao.trim(), usuarioId],
    );
    return this.detalhe(localId);
  }

  private exigirImagem(arquivo?: Buffer): { tipo: string; extensao: string } {
    if (!arquivo?.length || arquivo.length > CARDAPIO_TAMANHO_MAX) {
      throw new BadRequestException('Envie uma imagem de até 10 MB.');
    }
    const tipo = detectarTipoCardapio(arquivo);
    if (!tipo?.startsWith('image/')) {
      throw new BadRequestException('Envie uma imagem PNG, JPEG ou WebP.');
    }
    return {
      tipo,
      extensao:
        tipo === 'image/png' ? 'png' : tipo === 'image/jpeg' ? 'jpg' : 'webp',
    };
  }

  private nomeBlob(localId: string, extensao: string): string {
    const segmento = localId.replace(/[^A-Za-z0-9._-]/g, '_').slice(0, 120);
    return montarNomeBlob(['locais', segmento], extensao);
  }

  async adicionar(
    localId: string,
    arquivos: Buffer[],
    usuarioId: number | null,
  ): Promise<ConteudoLocalDto> {
    await this.exigirLocal(localId);
    if (!arquivos.length || arquivos.length > IMAGENS_LOCAL_MAX) {
      throw new BadRequestException(
        `Envie de 1 a ${IMAGENS_LOCAL_MAX} imagens.`,
      );
    }
    const enviados: Array<{
      id: string;
      arquivo: string;
      tipo: string;
      tamanho: number;
    }> = [];
    let persistenciaPreparada = false;
    try {
      for (const buffer of arquivos) {
        const { tipo, extensao } = this.exigirImagem(buffer);
        const id = randomUUID();
        const arquivo = this.nomeBlob(localId, extensao);
        await this.storage.enviar(CONTAINER, arquivo, buffer, tipo, {
          cacheControl: CACHE_IMUTAVEL,
        });
        enviados.push({ id, arquivo, tipo, tamanho: buffer.length });
      }
      await this.dataSource.transaction(async (manager) => {
        await manager.query(
          `INSERT INTO ${m}."local_informacoes" ("local_id") VALUES ($1) ON CONFLICT DO NOTHING`,
          [localId],
        );
        // A linha editorial é o mutex do local. O lock precisa vir antes da
        // contagem para que dois uploads simultâneos não ultrapassem o limite.
        await manager.query(
          `SELECT "local_id" FROM ${m}."local_informacoes" WHERE "local_id" = $1 FOR UPDATE`,
          [localId],
        );
        const [{ total }] = (await manager.query(
          `SELECT count(*)::int AS total FROM ${m}."local_imagens" WHERE "local_id" = $1`,
          [localId],
        )) as Array<{ total: number }>;
        if (total + enviados.length > IMAGENS_LOCAL_MAX) {
          throw new BadRequestException(
            `Cada local aceita até ${IMAGENS_LOCAL_MAX} imagens.`,
          );
        }
        for (let index = 0; index < enviados.length; index++) {
          const item = enviados[index]!;
          await manager.query(
            `INSERT INTO ${m}."local_imagens" ("id", "local_id", "arquivo", "tipo_conteudo", "tamanho_bytes", "ordem", "criado_por") ` +
              `VALUES ($1, $2::varchar, $3, $4, $5, $6 + (SELECT coalesce(max("ordem"), -1) + 1 FROM ${m}."local_imagens" WHERE "local_id" = $2::varchar), $7)`,
            [
              item.id,
              localId,
              item.arquivo,
              item.tipo,
              item.tamanho,
              index,
              usuarioId,
            ],
          );
        }
        persistenciaPreparada = true;
      });
    } catch (erro) {
      if (persistenciaPreparada) {
        this.logger.warn(`persistencia-incerta imagens-local=${localId}`);
        throw new ServiceUnavailableException({
          message:
            'Não foi possível confirmar as imagens. Reabra o local antes de tentar novamente.',
          motivo: 'resultado-indeterminado',
        });
      }
      await Promise.allSettled(
        enviados.map((item) => this.storage.excluir(CONTAINER, item.arquivo)),
      );
      throw erro;
    }
    return this.detalhe(localId);
  }

  async substituir(
    localId: string,
    imagemId: string,
    buffer: Buffer | undefined,
    usuarioId: number | null,
  ): Promise<ConteudoLocalDto> {
    await this.exigirLocal(localId);
    const { tipo, extensao } = this.exigirImagem(buffer);
    const novoArquivo = this.nomeBlob(localId, extensao);
    await this.storage.enviar(CONTAINER, novoArquivo, buffer!, tipo, {
      cacheControl: CACHE_IMUTAVEL,
    });
    let antigo: string | undefined;
    let persistenciaPreparada = false;
    try {
      antigo = await this.dataSource.transaction(async (manager) => {
        const [linha] = (await manager.query(
          `SELECT "arquivo" FROM ${m}."local_imagens" WHERE "id" = $1 AND "local_id" = $2 FOR UPDATE`,
          [imagemId, localId],
        )) as Array<{ arquivo: string }>;
        if (!linha) {
          throw new NotFoundException('Imagem não encontrada neste local.');
        }
        await manager.query(
          `UPDATE ${m}."local_imagens" SET "arquivo" = $3, "tipo_conteudo" = $4, ` +
            `"tamanho_bytes" = $5, "criado_por" = $6, "criado_em" = now() ` +
            `WHERE "id" = $1 AND "local_id" = $2`,
          [imagemId, localId, novoArquivo, tipo, buffer!.length, usuarioId],
        );
        persistenciaPreparada = true;
        return linha.arquivo;
      });
    } catch (erro) {
      if (persistenciaPreparada) {
        this.logger.warn(
          `persistencia-incerta substituicao-imagem=${imagemId}`,
        );
        throw new ServiceUnavailableException({
          message:
            'Não foi possível confirmar a substituição. Reabra o local antes de tentar novamente.',
          motivo: 'resultado-indeterminado',
        });
      }
      await this.storage.excluir(CONTAINER, novoArquivo).catch(() => undefined);
      throw erro;
    }
    if (antigo && antigo !== novoArquivo) {
      await this.storage
        .excluir(CONTAINER, antigo)
        .catch(() =>
          this.logger.warn(
            `limpeza-pendente imagem=${imagemId} blob=${antigo}`,
          ),
        );
    }
    return this.detalhe(localId);
  }

  async remover(localId: string, imagemId: string): Promise<ConteudoLocalDto> {
    await this.exigirLocal(localId);
    let removida: Array<{ arquivo: string }>;
    try {
      removida = (await this.dataSource.query(
        `WITH removida AS (` +
          `DELETE FROM ${m}."local_imagens" WHERE "id" = $1 AND "local_id" = $2 RETURNING "arquivo"` +
          `) SELECT "arquivo" FROM removida`,
        [imagemId, localId],
      )) as Array<{ arquivo: string }>;
    } catch {
      throw new ServiceUnavailableException(
        'Não foi possível confirmar a remoção da imagem.',
      );
    }
    if (!removida[0])
      throw new NotFoundException('Imagem não encontrada neste local.');
    await this.storage
      .excluir(CONTAINER, removida[0].arquivo)
      .catch(() =>
        this.logger.warn(
          `limpeza-pendente imagem=${imagemId} blob=${removida[0]!.arquivo}`,
        ),
      );
    return this.detalhe(localId);
  }
}
