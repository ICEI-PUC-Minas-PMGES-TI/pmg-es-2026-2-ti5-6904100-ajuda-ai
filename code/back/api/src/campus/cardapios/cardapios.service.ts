import { randomUUID } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
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
/** Cleanup secundário não pode prender a resposta da operação já confirmada. */
const TEMPO_LIMPEZA_MAX_MS = 3_000;

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
 * - remoção: DELETE ... RETURNING confirma a remoção da linha antes do blob;
 * - substituição: upload fora da transação; troca relacional atômica; cleanup
 *   depois do commit. Falha de cleanup mantém o sucesso e registra o órfão.
 * Commit sem confirmação preserva os arquivos para conferência, nunca os
 * apaga presumindo rollback.
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
    try {
      await this.storage.enviar(CONTAINER, nome, arquivo!, tipo, {
        cacheControl: CACHE_IMUTAVEL,
      });
    } catch (erro) {
      // Uma falha de transporte também pode ocultar um upload concluído.
      this.registrarPendente(id, nome, 'upload-nao-confirmado');
      throw erro;
    }
    let respostaPreparada: CardapioDto | undefined;
    let arquivoAntigo: string | undefined;
    let salvo: CardapioDto;
    try {
      salvo = await this.dataSource.transaction(async (manager) => {
        if (vigencia.substitui) {
          // O DELETE obtém a trava de linha e disputa a troca sem TOCTOU.
          // A remoção só fica visível junto do novo registro no commit.
          const [antigo] = (await manager.query(
            `WITH removido AS (DELETE FROM ${m}."cardapios" WHERE "id" = $1 AND "restaurante_id" = $2 RETURNING "arquivo") ` +
              `SELECT "arquivo" FROM removido`,
            [vigencia.substitui, restauranteId],
          )) as Array<{ arquivo: string }>;
          if (!antigo) {
            throw new ConflictException({
              message:
                'O cardápio foi alterado ou removido. Atualize a lista antes de substituir.',
              motivo: 'cardapio-alterado',
              statusCode: 409,
            });
          }
          arquivoAntigo = antigo.arquivo;
        }
        const [linha] = (await manager.query(
          `INSERT INTO ${m}."cardapios" ("id", "restaurante_id", "valido_de", "valido_ate", "arquivo", "tipo_conteudo", "tamanho_bytes", "criado_por") ` +
            `VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING ${this.colunas}`,
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
        )) as LinhaCardapio[];
        // urlPublica é cálculo local, sem chamada Azure. Prepara a resposta
        // antes do commit para não depender de outro SELECT após persistir.
        respostaPreparada = this.dto(linha);
        return respostaPreparada;
      });
    } catch (erro) {
      if (respostaPreparada) {
        // O callback acabou: o erro pode ser do COMMIT/ack/release. Apagar
        // o novo blob aqui poderia quebrar um registro já confirmado no banco.
        this.registrarPendente(id, nome, 'persistencia-incerta');
        throw new ServiceUnavailableException({
          message:
            'Não foi possível confirmar a gravação do cardápio. Recarregue a lista antes de repetir a operação.',
          motivo: 'resultado-indeterminado',
          statusCode: 503,
        });
      }
      // O callback falhou antes de pedir commit: a troca foi abortada.
      await this.limparBlob(id, nome, 'compensacao');
      throw erro;
    }
    this.logger.log(
      `cardápio enviado id=${id} restaurante=${restauranteId} tipo=${tipo}`,
    );
    if (arquivoAntigo) {
      await this.limparBlob(vigencia.substitui!, arquivoAntigo, 'substituicao');
    }
    return salvo;
  }

  /** Remove a referência antes do arquivo; cleanup não desfaz sucesso. */
  async remover(id: string): Promise<{ removido: true }> {
    exigirUuid(id, 'Cardápio');
    let removidas: Array<{ arquivo: string }>;
    try {
      // Uma única instrução autocommit; só quem removeu a linha recebe a
      // chave. Exclusões/trocas concorrentes não usam uma leitura obsoleta.
      removidas = (await this.dataSource.query(
        `WITH removido AS (DELETE FROM ${m}."cardapios" WHERE "id" = $1 RETURNING "arquivo") ` +
          `SELECT "arquivo" FROM removido`,
        [id],
      )) as Array<{ arquivo: string }>;
    } catch {
      // Sem confirmação do DELETE, não tocar no blob (inclusive ack perdido).
      this.logger.warn(`remocao-nao-confirmada cardapio=${id}`);
      throw new ServiceUnavailableException({
        message:
          'Não foi possível confirmar a remoção do cardápio. Recarregue a lista antes de repetir a operação.',
        motivo: 'resultado-indeterminado',
        statusCode: 503,
      });
    }
    const [linha] = removidas;
    if (!linha) throw new NotFoundException('Cardápio não encontrado.');
    await this.limparBlob(id, linha.arquivo, 'exclusao');
    this.logger.log(`cardápio removido id=${id}`);
    return { removido: true };
  }

  private registrarPendente(id: string, nome: string, etapa: string): void {
    // Só dados internos controlados: nunca erro bruto, URL/SAS ou credencial.
    this.logger.warn(
      `limpeza-pendente cardapio=${id} blob=${nome} etapa=${etapa}`,
    );
  }

  private async limparBlob(
    id: string,
    nome: string,
    etapa: string,
  ): Promise<void> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([
        this.storage.excluir(CONTAINER, nome),
        new Promise<never>((_, reject) => {
          timer = setTimeout(
            () => reject(new Error('cleanup excedeu o prazo')),
            TEMPO_LIMPEZA_MAX_MS,
          );
        }),
      ]);
    } catch (erro) {
      if (!(erro instanceof NotFoundException)) {
        this.registrarPendente(id, nome, etapa);
      }
    } finally {
      clearTimeout(timer);
    }
  }
}
