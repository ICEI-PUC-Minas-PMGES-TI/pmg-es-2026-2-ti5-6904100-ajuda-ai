import { randomUUID } from 'node:crypto';
import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { DataSource } from 'typeorm';
import { SCHEMA_MAPA } from '../../mapa/postgis.js';
import { AzureBlobStorageService } from '../../storage/azure-blob-storage.service.js';
import { CONTAINERS } from '../../storage/containers.js';
import { VIGENCIA_CARDAPIO_MAX_DIAS } from '../campus.js';
import { exigirUuid } from '../geo.js';
import { agoraNoCampus } from '../horarios.js';
import type {
  CardapioDoDiaDto,
  CardapioDto,
} from '../restaurantes/restaurantes.dto.js';
import { RestaurantesService } from '../restaurantes/restaurantes.service.js';
import { exigirArquivoCardapio, nomeBlobCardapio } from './cardapio-arquivo.js';

const m = `"${SCHEMA_MAPA}"`;
const CONTAINER = CONTAINERS.restaurantMenus;
/** Nome do blob é único por cardápio (UUID): pode ficar em cache para sempre. */
const CACHE_IMUTAVEL = 'public, max-age=31536000, immutable';
const DIA_MS = 24 * 60 * 60 * 1000;

interface LinhaCardapio {
  id: string;
  restaurante_id: string;
  valido_de: string;
  valido_ate: string;
  arquivo: string;
  tipo_conteudo: string;
  tamanho_bytes: number;
  criado_em: Date;
}

/** `AAAA-MM-DD` que existe no calendário. */
function exigirData(valor: string, campo: string): Date {
  const data = new Date(`${valor}T00:00:00Z`);
  if (
    Number.isNaN(data.getTime()) ||
    data.toISOString().slice(0, 10) !== valor
  ) {
    throw new BadRequestException(`${campo}: data inexistente.`);
  }
  return data;
}

/**
 * Cardápios como arquivo (imagem/PDF) no container público `restaurant-menus`,
 * com vigência (de/até, inclusive). Upload mediado pelo backend: o front nunca
 * recebe credencial nem SAS. Consistência banco ↔ blob:
 *
 * - envio: grava o blob (`If-None-Match: *`, nome único), depois a linha; se a
 *   linha falhar, tenta apagar o blob e registra falhas de compensação;
 * - remoção: apaga o blob, depois a linha (se o Azure falhar, a linha fica e
 *   continua apontando para um arquivo que existe);
 * - substituição: grava o novo e só então remove o antigo.
 */
@Injectable()
export class CardapiosService {
  private readonly logger = new Logger('Cardapios');

  constructor(
    private readonly dataSource: DataSource,
    private readonly storage: AzureBlobStorageService,
    private readonly restaurantes: RestaurantesService,
  ) {}

  private dto(l: LinhaCardapio): CardapioDto {
    return {
      id: l.id,
      url: this.storage.urlPublica(CONTAINER, l.arquivo),
      tipoConteudo: l.tipo_conteudo,
      tamanhoBytes: l.tamanho_bytes,
      validoDe: l.valido_de,
      validoAte: l.valido_ate,
      criadoEm: l.criado_em.toISOString(),
    };
  }

  private colunas =
    `"id", "restaurante_id", to_char("valido_de", 'YYYY-MM-DD') AS valido_de, ` +
    `to_char("valido_ate", 'YYYY-MM-DD') AS valido_ate, "arquivo", "tipo_conteudo", "tamanho_bytes", "criado_em"`;

  /** Público: cardápio vigente na data (padrão: hoje em Brasília). */
  async doDia(restauranteId: string, data?: string): Promise<CardapioDoDiaDto> {
    await this.restaurantes.exigirAtivo(restauranteId);
    const dia = data ?? agoraNoCampus().data;
    exigirData(dia, 'data');
    const [linha] = (await this.dataSource.query(
      `SELECT ${this.colunas} FROM ${m}."cardapios" WHERE "restaurante_id" = $1 ` +
        `AND $2::date BETWEEN "valido_de" AND "valido_ate" ORDER BY "criado_em" DESC, "id" DESC LIMIT 1`,
      [restauranteId, dia],
    )) as LinhaCardapio[];
    return { data: dia, cardapio: linha ? this.dto(linha) : null };
  }

  /** Coordenação: todos os cardápios do restaurante, mais recentes primeiro. */
  async listar(restauranteId: string): Promise<CardapioDto[]> {
    await this.restaurantes.detalhe(restauranteId);
    const linhas = (await this.dataSource.query(
      `SELECT ${this.colunas} FROM ${m}."cardapios" WHERE "restaurante_id" = $1 ` +
        `ORDER BY "valido_de" DESC, "criado_em" DESC`,
      [restauranteId],
    )) as LinhaCardapio[];
    return linhas.map((l) => this.dto(l));
  }

  async enviar(
    restauranteId: string,
    arquivo: Buffer | undefined,
    vigencia: { validoDe: string; validoAte: string; substitui?: string },
    criadoPor: number | null,
  ): Promise<CardapioDto> {
    await this.restaurantes.detalhe(restauranteId);
    const de = exigirData(vigencia.validoDe, 'validoDe');
    const ate = exigirData(vigencia.validoAte, 'validoAte');
    if (ate < de) {
      throw new BadRequestException(
        'validoAte deve ser igual ou depois de validoDe.',
      );
    }
    if ((ate.getTime() - de.getTime()) / DIA_MS >= VIGENCIA_CARDAPIO_MAX_DIAS) {
      throw new BadRequestException(
        `Um cardápio vale no máximo ${VIGENCIA_CARDAPIO_MAX_DIAS} dias.`,
      );
    }
    if (vigencia.substitui) {
      exigirUuid(vigencia.substitui, 'Cardápio');
      const [antigo] = (await this.dataSource.query(
        `SELECT 1 FROM ${m}."cardapios" WHERE "id" = $1 AND "restaurante_id" = $2`,
        [vigencia.substitui, restauranteId],
      )) as unknown[];
      if (!antigo) {
        throw new NotFoundException(
          'Cardápio a substituir não encontrado neste restaurante.',
        );
      }
    }
    const tipo = exigirArquivoCardapio(arquivo);
    const id = randomUUID();
    const nome = nomeBlobCardapio(restauranteId, id, tipo);
    await this.storage.enviar(CONTAINER, nome, arquivo!, tipo, {
      cacheControl: CACHE_IMUTAVEL,
    });
    try {
      await this.dataSource.query(
        `INSERT INTO ${m}."cardapios" ("id", "restaurante_id", "valido_de", "valido_ate", "arquivo", "tipo_conteudo", "tamanho_bytes", "criado_por") ` +
          `VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          id,
          restauranteId,
          vigencia.validoDe,
          vigencia.validoAte,
          nome,
          tipo,
          arquivo!.length,
          criadoPor,
        ],
      );
    } catch (erro) {
      // Sem linha, o blob seria lixo: desfaz o envio.
      await this.storage
        .excluir(CONTAINER, nome)
        .catch((e: unknown) =>
          this.logger.error(`blob órfão ${nome}: ${String(e)}`),
        );
      throw erro;
    }
    this.logger.log(
      `cardápio enviado id=${id} restaurante=${restauranteId} tipo=${tipo}`,
    );
    if (vigencia.substitui) await this.remover(vigencia.substitui);
    const [linha] = (await this.dataSource.query(
      `SELECT ${this.colunas} FROM ${m}."cardapios" WHERE "id" = $1`,
      [id],
    )) as LinhaCardapio[];
    return this.dto(linha);
  }

  /** Remove arquivo e linha. Blob já ausente não impede remover a linha. */
  async remover(id: string): Promise<{ removido: true }> {
    exigirUuid(id, 'Cardápio');
    const [linha] = (await this.dataSource.query(
      `SELECT "arquivo" FROM ${m}."cardapios" WHERE "id" = $1`,
      [id],
    )) as Array<{ arquivo: string }>;
    if (!linha) throw new NotFoundException('Cardápio não encontrado.');
    try {
      await this.storage.excluir(CONTAINER, linha.arquivo);
    } catch (erro) {
      if (!(erro instanceof NotFoundException)) throw erro;
    }
    await this.dataSource.query(
      `DELETE FROM ${m}."cardapios" WHERE "id" = $1`,
      [id],
    );
    this.logger.log(`cardápio removido id=${id}`);
    return { removido: true };
  }
}
