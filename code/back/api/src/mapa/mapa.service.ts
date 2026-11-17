import {
  BadRequestException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { DataSource } from 'typeorm';
import {
  LIMITE_BUSCA_MAXIMO,
  LIMITE_BUSCA_PADRAO,
  type AreaDto,
  type PredioDto,
  type PredioResumoDto,
  type ResultadoBuscaDto,
  type SalaDto,
  type VersaoMapaDto,
} from './dto/mapa.dto.js';
import { SCHEMA_MAPA, schemaDaExtensao, schemaPostgis } from './postgis.js';

const m = `"${SCHEMA_MAPA}"`;

/**
 * Id da versão ativa como subconsulta: dados e versão numa ida só ao banco.
 * Resultado vazio → [exigirVersaoAtiva] decide entre "sem versão ativa" (503)
 * e "não há dados" ([]/404).
 */
const VERSAO_ATIVA = `(SELECT "id" FROM ${m}."versoes" WHERE "status" = 'ativa')`;

interface Esquemas {
  /** Schema do PostGIS, já entre aspas (`"extensions"`). */
  geo: string;
  /** Expressão SQL que normaliza um texto como `normalizeCampusQuery` do app. */
  normalizar: (expressao: string) => string;
}

/**
 * Leitura do mapa da versão `ativa`. Só SELECT parametrizado: a entrada do
 * usuário nunca entra no texto do SQL. Os nomes de schema vêm do catálogo
 * (`pg_extension`), não da requisição.
 *
 * Usa SQL direto (não Repository) porque precisa de funções PostGIS e
 * `unaccent` qualificadas pelo schema real, sem depender do `search_path`.
 */
@Injectable()
export class MapaService {
  constructor(private readonly dataSource: DataSource) {}

  private esquemas?: Promise<Esquemas>;

  private carregarEsquemas(): Promise<Esquemas> {
    return (this.esquemas ??= (async () => {
      const consultar = (sql: string, p?: unknown[]) =>
        this.dataSource.query(sql, p);
      const geo = await schemaPostgis(consultar);
      const u = await schemaDaExtensao(consultar, 'unaccent');
      if (!u) throw new Error('Extensão unaccent ausente.');
      // Dicionário qualificado: o unaccent(text) de 1 argumento procura o
      // dicionário pelo search_path.
      const dicionario = `'${u.replaceAll("'", "''")}.unaccent'::regdictionary`;
      return {
        geo,
        normalizar: (e: string) =>
          `btrim(regexp_replace(lower(${u}.unaccent(${dicionario}, coalesce(${e}, ''))), '\\s+', ' ', 'g'))`,
      };
    })().catch((erro: unknown) => {
      this.esquemas = undefined;
      throw erro;
    }));
  }

  /** Centro do prédio: bbox do polígono (= `center` do app) ou o ponto. */
  private centroPredio(g: string): string {
    return (
      `CASE WHEN p."poligono" IS NULL THEN ${g}.ST_Y(p."localizacao") ` +
      `ELSE (${g}.ST_YMin(p."poligono") + ${g}.ST_YMax(p."poligono")) / 2 END AS latitude, ` +
      `CASE WHEN p."poligono" IS NULL THEN ${g}.ST_X(p."localizacao") ` +
      `ELSE (${g}.ST_XMin(p."poligono") + ${g}.ST_XMax(p."poligono")) / 2 END AS longitude`
    );
  }

  private async exigirVersaoAtiva(): Promise<void> {
    const [linha] = (await this.dataSource.query(
      `SELECT "id" FROM ${m}."versoes" WHERE "status" = 'ativa'`,
    )) as Array<{ id: string }>;
    if (!linha) {
      throw new ServiceUnavailableException(
        'Mapa indisponível: nenhuma versão ativa.',
      );
    }
  }

  /** Lista vazia só é resposta válida se existir versão ativa. */
  private async lista<T>(linhas: T[]): Promise<T[]> {
    if (!linhas.length) await this.exigirVersaoAtiva();
    return linhas;
  }

  async versao(): Promise<VersaoMapaDto> {
    const [v] = (await this.dataSource.query(
      `SELECT "codigo", "versao_assets", "origem", "ativada_em", ` +
        `(SELECT count(*)::int FROM ${m}."predios" p WHERE p."versao_id" = v."id") AS predios, ` +
        `(SELECT count(*)::int FROM ${m}."areas" a WHERE a."versao_id" = v."id") AS areas, ` +
        `(SELECT count(*)::int FROM ${m}."salas" s WHERE s."versao_id" = v."id") AS salas ` +
        `FROM ${m}."versoes" v WHERE v."status" = 'ativa'`,
    )) as Array<{
      codigo: string;
      versao_assets: string | null;
      origem: Record<string, unknown>;
      ativada_em: Date;
      predios: number;
      areas: number;
      salas: number;
    }>;
    if (!v) {
      throw new ServiceUnavailableException(
        'Mapa indisponível: nenhuma versão ativa.',
      );
    }
    const origem = v.origem ?? {};
    return {
      codigo: v.codigo,
      status: 'ativa',
      versaoAssets: v.versao_assets,
      origem: {
        projeto: String(origem.projeto ?? ''),
        versao: typeof origem.versao === 'number' ? origem.versao : null,
        atualizadaEm:
          typeof origem.atualizadaEm === 'string' ? origem.atualizadaEm : null,
      },
      ativadaEm: v.ativada_em.toISOString(),
      contagens: { predios: v.predios, areas: v.areas, salas: v.salas },
    };
  }

  async predios(): Promise<PredioResumoDto[]> {
    const { geo: g } = await this.carregarEsquemas();
    const linhas = (await this.dataSource.query(
      `SELECT p."id", p."nome", p."codigo", p."tipo" AS categoria, p."altura", ${this.centroPredio(g)}, ` +
        `${g}.ST_AsGeoJSON(p."poligono")::json AS geometria ` +
        `FROM ${m}."predios" p WHERE p."versao_id" = ${VERSAO_ATIVA} ORDER BY p."id"`,
    )) as PredioResumoDto[];
    return (await this.lista(linhas)).map(resumo);
  }

  async predio(id: string): Promise<PredioDto> {
    const { geo: g } = await this.carregarEsquemas();
    const [linha] = (await this.dataSource.query(
      `SELECT p."id", p."nome", p."codigo", p."tipo" AS categoria, p."altura", ${this.centroPredio(g)}, ` +
        `p."osm_id" AS "osmId", p."altura_base" AS "alturaBase", p."entradas", ` +
        `${g}.ST_AsGeoJSON(p."poligono")::json AS geometria ` +
        `FROM ${m}."predios" p WHERE p."versao_id" = ${VERSAO_ATIVA} AND p."id" = $1`,
      [id],
    )) as PredioDto[];
    if (!linha) {
      await this.exigirVersaoAtiva();
      throw new NotFoundException('Prédio não encontrado.');
    }
    return {
      ...resumo(linha),
      osmId: linha.osmId,
      alturaBase: linha.alturaBase,
      entradas: linha.entradas,
      geometria: linha.geometria,
    };
  }

  async areas(): Promise<AreaDto[]> {
    const { geo: g } = await this.carregarEsquemas();
    return this.lista(
      (await this.dataSource.query(
        `SELECT a."id", a."nome", a."tipo" AS categoria, ` +
          `${g}.ST_Y(a."localizacao") AS latitude, ${g}.ST_X(a."localizacao") AS longitude, ` +
          `${g}.ST_AsGeoJSON(a."poligono")::json AS geometria ` +
          `FROM ${m}."areas" a WHERE a."versao_id" = ${VERSAO_ATIVA} ORDER BY a."nome", a."id"`,
      )) as AreaDto[],
    );
  }

  /** A versão importada não tem salas: hoje sempre `[]`. */
  async salas(): Promise<SalaDto[]> {
    const { geo: g } = await this.carregarEsquemas();
    return this.lista(
      (await this.dataSource.query(
        `SELECT s."id", s."predio_id" AS "predioId", s."nome", s."andar", s."tipo" AS categoria, ` +
          `${g}.ST_Y(s."localizacao") AS latitude, ${g}.ST_X(s."localizacao") AS longitude ` +
          `FROM ${m}."salas" s WHERE s."versao_id" = ${VERSAO_ATIVA} ORDER BY s."predio_id", s."nome", s."id"`,
      )) as SalaDto[],
    );
  }

  /**
   * Busca na versão ativa com o mesmo ranking da busca local do app:
   * 0 código exato, 1 nome exato, 2 nome começa, 3 código começa, 4 nome
   * contém. Empate: prédio, área, sala; depois nome, código e id. Sem LIKE:
   * `starts_with`/`strpos` não interpretam `%` ou `_` da entrada.
   */
  async buscar(q?: string, limite?: string): Promise<ResultadoBuscaDto[]> {
    const limit = limite === undefined ? LIMITE_BUSCA_PADRAO : Number(limite);
    if (!Number.isInteger(limit) || limit < 1 || limit > LIMITE_BUSCA_MAXIMO) {
      throw new BadRequestException(
        `limit deve ser um inteiro entre 1 e ${LIMITE_BUSCA_MAXIMO}.`,
      );
    }
    if (!q || !q.trim()) return [];
    const { geo: g, normalizar: n } = await this.carregarEsquemas();
    const linhas = (await this.dataSource.query(
      `WITH ativa AS ${VERSAO_ATIVA}, consulta AS (SELECT ${n('$1::text')} AS t), lugares AS (` +
        `SELECT 'predio' AS tipo, 0 AS ordem, p."id", p."nome", p."codigo", p."tipo" AS categoria, ` +
        `${this.centroPredio(g)} FROM ${m}."predios" p ` +
        `WHERE p."versao_id" = (SELECT "id" FROM ativa) AND (p."nome" IS NOT NULL OR p."codigo" IS NOT NULL) ` +
        `UNION ALL SELECT 'area', 1, a."id"::text, a."nome", NULL, a."tipo", ` +
        `${g}.ST_Y(a."localizacao"), ${g}.ST_X(a."localizacao") FROM ${m}."areas" a WHERE a."versao_id" = (SELECT "id" FROM ativa) ` +
        `UNION ALL SELECT 'sala', 2, s."id"::text, s."nome", NULL, s."tipo", ` +
        `${g}.ST_Y(s."localizacao"), ${g}.ST_X(s."localizacao") FROM ${m}."salas" s WHERE s."versao_id" = (SELECT "id" FROM ativa)` +
        `), normalizados AS (` +
        `SELECT l.*, ${n('l."nome"')} AS n, ${n('l."codigo"')} AS c FROM lugares l` +
        `), classificados AS (` +
        `SELECT x.*, CASE ` +
        `WHEN x.c <> '' AND x.c = q.t THEN 0 ` +
        `WHEN x.n <> '' AND x.n = q.t THEN 1 ` +
        `WHEN starts_with(x.n, q.t) THEN 2 ` +
        `WHEN starts_with(x.c, q.t) THEN 3 ` +
        `WHEN strpos(x.n, q.t) > 0 THEN 4 END AS rank ` +
        `FROM normalizados x, consulta q WHERE q.t <> ''` +
        `) SELECT "id", tipo, "nome", "codigo", categoria, latitude, longitude FROM classificados ` +
        `WHERE rank IS NOT NULL ORDER BY rank, ordem, n, c, "id" LIMIT $2`,
      [q, limit],
    )) as ResultadoBuscaDto[];
    return (await this.lista(linhas)).map((l) => ({
      id: l.id,
      tipo: l.tipo,
      nome: l.nome,
      codigo: l.codigo,
      categoria: l.categoria,
      latitude: l.latitude,
      longitude: l.longitude,
    }));
  }
}

function resumo(l: PredioResumoDto): PredioResumoDto {
  return {
    id: l.id,
    nome: l.nome,
    codigo: l.codigo,
    categoria: l.categoria,
    altura: l.altura,
    latitude: l.latitude,
    longitude: l.longitude,
    geometria: l.geometria,
  };
}
