import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { DataSource } from 'typeorm';
import { SCHEMA_MAPA, schemaPostgis } from '../postgis.js';
import type { Coordenada } from './geo.js';
import { construirGrafo, type Grafo } from './grafo.js';
import {
  calcularRota,
  RotaImpossivel,
  type PontaResolvida,
  type PontaRota,
} from './rota.js';
import type {
  CalcularRotaDto,
  PontaRespostaDto,
  PontaRotaDto,
  RotaDto,
} from './rotas.dto.js';

const m = `"${SCHEMA_MAPA}"`;

interface Cache {
  versaoId: string;
  grafo: Promise<Grafo>;
}

/**
 * Rotas sob demanda (ADR-0003) sobre o grafo da versão ativa, em memória.
 * O grafo é carregado uma vez por versão (promessa compartilhada entre
 * requisições simultâneas) e trocado quando a versão ativa muda. Nada é
 * gravado: a coordenada do pedido não é persistida nem registrada em log.
 */
@Injectable()
export class RotasService {
  private readonly logger = new Logger('MapaRotas');
  private cache?: Cache;

  constructor(private readonly dataSource: DataSource) {}

  async calcular(pedido: CalcularRotaDto): Promise<RotaDto> {
    const origem = ponta(pedido.origem, 'origem');
    const destino = ponta(pedido.destino, 'destino');
    // Só o tipo de destino vai para o log (coordenada nunca é registrada).
    const alvo = destino.tipo === 'predio' ? destino.predioId : 'coordenada';
    const acessivel = pedido.acessivel ?? false;
    const grafo = await this.grafoAtivo();
    const inicio = performance.now();
    try {
      const rota = calcularRota(grafo, { origem, destino, acessivel });
      const ms = performance.now() - inicio;
      this.logger.log(
        `rota ${grafo.versao} destino=${alvo} acessivel=${acessivel}: ` +
          `${Math.round(rota.distancia)} m, ${Math.round(rota.tempo)} s, ` +
          `${rota.visitados} nós visitados, ${ms.toFixed(1)} ms`,
      );
      return {
        versao: grafo.versao,
        acessivel,
        origem: resposta(rota.origem),
        destino: resposta(rota.destino),
        distanciaMetros: Math.round(rota.distancia * 10) / 10,
        tempoSegundos: Math.round(rota.tempo),
        nos: rota.nos,
        arestas: rota.arestas,
        geometria: { type: 'LineString', coordinates: rota.geometria },
      };
    } catch (erro) {
      if (!(erro instanceof RotaImpossivel)) throw erro;
      this.logger.log(
        `sem rota ${grafo.versao} destino=${alvo} acessivel=${acessivel}: ${erro.motivo}`,
      );
      if (erro.motivo === 'predio-inexistente')
        throw new NotFoundException(erro.message);
      throw new UnprocessableEntityException({
        message: erro.message,
        motivo: erro.motivo,
        statusCode: 422,
      });
    }
  }

  /** Grafo da versão ativa; recarrega só quando a versão ativa muda. */
  async grafoAtivo(): Promise<Grafo> {
    const [ativa] = (await this.dataSource.query(
      `SELECT "id", "codigo" FROM ${m}."versoes" WHERE "status" = 'ativa'`,
    )) as Array<{ id: string; codigo: string }>;
    if (!ativa) {
      throw new ServiceUnavailableException(
        'Mapa indisponível: nenhuma versão ativa.',
      );
    }
    if (this.cache?.versaoId !== ativa.id) {
      const carregamento = this.carregar(ativa.id, ativa.codigo);
      this.cache = { versaoId: ativa.id, grafo: carregamento };
      carregamento.catch(() => {
        if (this.cache?.grafo === carregamento) this.cache = undefined;
      });
    }
    return this.cache.grafo;
  }

  private async carregar(versaoId: string, codigo: string): Promise<Grafo> {
    const inicio = performance.now();
    const g = await schemaPostgis((sql, p) => this.dataSource.query(sql, p));
    const [nos, arestas, predios] = (await Promise.all([
      this.dataSource.query(
        `SELECT "id", "predio_id", ${g}.ST_X("localizacao") AS x, ${g}.ST_Y("localizacao") AS y ` +
          `FROM ${m}."nos_grafo" WHERE "versao_id" = $1`,
        [versaoId],
      ),
      this.dataSource.query(
        `SELECT "id", "no_origem_id", "no_destino_id", "distancia_m", "tempo_caminhada_s", "acessivel", ` +
          `${g}.ST_AsGeoJSON("geometria")::json -> 'coordinates' AS geometria ` +
          `FROM ${m}."arestas_grafo" WHERE "versao_id" = $1 ORDER BY "id"`,
        [versaoId],
      ),
      this.dataSource.query(
        `SELECT "id", "nome", ${g}.ST_AsGeoJSON("poligono")::json -> 'coordinates' AS poligono, ` +
          `CASE WHEN "poligono" IS NULL THEN ${g}.ST_X("localizacao") ` +
          `ELSE (${g}.ST_XMin("poligono") + ${g}.ST_XMax("poligono")) / 2 END AS x, ` +
          `CASE WHEN "poligono" IS NULL THEN ${g}.ST_Y("localizacao") ` +
          `ELSE (${g}.ST_YMin("poligono") + ${g}.ST_YMax("poligono")) / 2 END AS y ` +
          `FROM ${m}."predios" WHERE "versao_id" = $1`,
        [versaoId],
      ),
    ])) as [
      Array<{ id: string; predio_id: string | null; x: number; y: number }>,
      Array<{
        id: string;
        no_origem_id: string;
        no_destino_id: string;
        distancia_m: number;
        tempo_caminhada_s: number;
        acessivel: boolean;
        geometria: Coordenada[] | null;
      }>,
      Array<{
        id: string;
        nome: string | null;
        poligono: Coordenada[][] | null;
        x: number;
        y: number;
      }>,
    ];
    const grafo = construirGrafo({
      versao: codigo,
      nos: nos.map((n) => ({
        id: n.id,
        predioId: n.predio_id,
        coordenada: [n.x, n.y],
      })),
      arestas: arestas.map((e) => ({
        id: e.id,
        origem: e.no_origem_id,
        destino: e.no_destino_id,
        distancia: e.distancia_m,
        tempo: e.tempo_caminhada_s,
        acessivel: e.acessivel,
        geometria: e.geometria,
      })),
      predios: predios.map((p) => ({
        id: p.id,
        nome: p.nome,
        poligono: p.poligono,
        centro: [p.x, p.y],
      })),
    });
    this.logger.log(
      `grafo ${codigo} carregado: ${grafo.nos.size} nós, ${grafo.arestas.length} arestas, ` +
        `${grafo.predios.size} prédios em ${(performance.now() - inicio).toFixed(0)} ms`,
    );
    return grafo;
  }
}

function ponta(dto: PontaRotaDto, papel: string): PontaRota {
  const temId = dto.id !== undefined;
  const temCoordenada =
    dto.latitude !== undefined || dto.longitude !== undefined;
  if (temId === temCoordenada) {
    throw new BadRequestException(
      `${papel}: informe "id" de prédio OU "latitude" e "longitude".`,
    );
  }
  if (temId) return { tipo: 'predio', predioId: dto.id! };
  if (dto.latitude === undefined || dto.longitude === undefined) {
    throw new BadRequestException(
      `${papel}: informe "latitude" e "longitude".`,
    );
  }
  return { tipo: 'coordenada', coordenada: [dto.longitude, dto.latitude] };
}

function resposta(p: PontaResolvida): PontaRespostaDto {
  return {
    tipo: p.tipo,
    id: p.predio?.id ?? null,
    nome: p.predio?.nome ?? null,
    conexao: p.conexao,
    latitude: p.coordenada[1],
    longitude: p.coordenada[0],
  };
}
