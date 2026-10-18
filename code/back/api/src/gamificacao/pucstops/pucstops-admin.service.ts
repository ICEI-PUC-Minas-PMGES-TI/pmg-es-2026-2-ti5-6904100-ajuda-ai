import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { DataSource } from 'typeorm';
import { SCHEMA_MAPA, SRID, schemaPostgis } from '../../mapa/postgis.js';
import { SCHEMA_GAMIFICACAO } from '../gamificacao.js';
import type {
  AtualizarPucStopDto,
  CampusPucStopsDto,
  CriarPucStopDto,
  PucStopAdminDto,
} from './pucstops-admin.dto.js';
import { ID_PUCSTOP } from './pucstops.service.js';

const m = `"${SCHEMA_MAPA}"`;
const g = `"${SCHEMA_GAMIFICACAO}"`;

/**
 * Tolerância além da envoltória do campus. Cobre calçadas e entradas na borda
 * dos prédios/caminhos mapeados, mas recusa um clique na rua ao lado ou um
 * PucStop a quilômetros da PUC.
 */
export const MARGEM_CAMPUS_METROS = 30;

/**
 * Envoltória convexa do campus na versão ativa do mapa: prédios, áreas e nós
 * do grafo de caminhos. NULL sem versão ativa. Os PucStops não pertencem à
 * versão; ela só define, no momento da escrita, onde um PucStop é aceito.
 */
function envoltoriaCampus(geo: string): string {
  const ativa = `(SELECT "id" FROM ${m}."versoes" WHERE "status" = 'ativa')`;
  return (
    `(SELECT ${geo}.ST_ConvexHull(${geo}.ST_Collect(x.g)) FROM (` +
    `SELECT coalesce(p."poligono", p."localizacao") AS g FROM ${m}."predios" p WHERE p."versao_id" = ${ativa} ` +
    `UNION ALL SELECT coalesce(a."poligono", a."localizacao") FROM ${m}."areas" a WHERE a."versao_id" = ${ativa} ` +
    `UNION ALL SELECT n."localizacao" FROM ${m}."nos_grafo" n WHERE n."versao_id" = ${ativa}` +
    `) x)`
  );
}

interface LinhaAdmin {
  id: string;
  nome: string;
  latitude: number;
  longitude: number;
  raio_metros: number;
  xp: number;
  ativo: boolean;
  criado_por: number | null;
  criado_em: Date;
  atualizado_em: Date;
  coletas: number;
}

function paraDto(l: LinhaAdmin): PucStopAdminDto {
  return {
    id: l.id,
    nome: l.nome,
    latitude: l.latitude,
    longitude: l.longitude,
    raioMetros: l.raio_metros,
    xp: l.xp,
    ativo: l.ativo,
    criadoPor: l.criado_por,
    criadoEm: l.criado_em.toISOString(),
    atualizadoEm: l.atualizado_em.toISOString(),
    coletas: l.coletas,
  };
}

/**
 * CRUD da coordenação. Nunca apaga linha: "excluir" desativa. Coletas e
 * ledger não são tocados por nenhuma operação daqui; mudar XP vale só para as
 * próximas coletas (a coleta grava o XP concedido naquele momento).
 *
 * Concorrência com a coleta: a coleta lê o PucStop com `FOR SHARE` na sua
 * transação, e cada UPDATE daqui espera por ela (e vice-versa). Uma coleta
 * usa ou o XP/posição de antes ou o de depois da edição, nunca uma mistura.
 */
@Injectable()
export class PucStopsAdminService {
  private readonly logger = new Logger('PucStopsAdmin');
  private geo?: Promise<string>;

  constructor(private readonly dataSource: DataSource) {}

  private schemaGeo(): Promise<string> {
    return (this.geo ??= schemaPostgis((sql, p) =>
      this.dataSource.query(sql, p),
    ).catch((erro: unknown) => {
      this.geo = undefined;
      throw erro;
    }));
  }

  private async selecionar(
    filtro: string,
    parametros: unknown[],
  ): Promise<PucStopAdminDto[]> {
    const geo = await this.schemaGeo();
    const linhas = (await this.dataSource.query(
      `SELECT p."id", p."nome", ${geo}.ST_Y(p."localizacao") AS latitude, ${geo}.ST_X(p."localizacao") AS longitude, ` +
        `p."raio_metros", p."xp", p."ativo", p."criado_por", p."criado_em", p."atualizado_em", ` +
        `(SELECT count(*)::int FROM ${g}."pucstop_coletas" c WHERE c."pucstop_id" = p."id") AS coletas ` +
        `FROM ${m}."pucstops" p WHERE ${filtro} ORDER BY p."nome", p."id"`,
      parametros,
    )) as LinhaAdmin[];
    return linhas.map(paraDto);
  }

  listar(): Promise<PucStopAdminDto[]> {
    return this.selecionar('true', []);
  }

  async detalhe(id: string): Promise<PucStopAdminDto> {
    const [pucstop] = ID_PUCSTOP.test(id)
      ? await this.selecionar(`p."id" = $1`, [id])
      : [];
    if (!pucstop) throw new NotFoundException('PucStop não encontrado.');
    return pucstop;
  }

  /** Região aceita, para o seletor do mapa mostrar o mesmo limite. */
  async campus(): Promise<CampusPucStopsDto> {
    const geo = await this.schemaGeo();
    const [linha] = (await this.dataSource.query(
      `SELECT ${geo}.ST_AsGeoJSON(r, 6)::json AS limite, ` +
        `${geo}.ST_XMin(r) AS west, ${geo}.ST_YMin(r) AS south, ${geo}.ST_XMax(r) AS east, ${geo}.ST_YMax(r) AS north, ` +
        `${geo}.ST_Y(${geo}.ST_Centroid(r)) AS latitude, ${geo}.ST_X(${geo}.ST_Centroid(r)) AS longitude ` +
        `FROM (SELECT ${geo}.ST_Buffer(${envoltoriaCampus(geo)}::${geo}.geography, $1)::${geo}.geometry AS r) t WHERE r IS NOT NULL`,
      [MARGEM_CAMPUS_METROS],
    )) as Array<{
      limite: CampusPucStopsDto['limite'];
      west: number;
      south: number;
      east: number;
      north: number;
      latitude: number;
      longitude: number;
    }>;
    if (!linha) throw semMapa();
    return {
      limite: linha.limite,
      margemMetros: MARGEM_CAMPUS_METROS,
      bbox: {
        west: linha.west,
        south: linha.south,
        east: linha.east,
        north: linha.north,
      },
      centro: { latitude: linha.latitude, longitude: linha.longitude },
    };
  }

  /**
   * Recusa posição fora do campus da versão ativa (422 `fora-do-campus`) ou
   * quando não há mapa ativo para conferir (503). Distância geodésica.
   */
  private async exigirNoCampus(
    latitude: number,
    longitude: number,
  ): Promise<void> {
    const geo = await this.schemaGeo();
    const ponto = `${geo}.ST_SetSRID(${geo}.ST_MakePoint($1, $2), ${SRID})::${geo}.geography`;
    const [r] = (await this.dataSource.query(
      `SELECT ${geo}.ST_DWithin(c::${geo}.geography, ${ponto}, $3) AS dentro, ` +
        `${geo}.ST_Distance(c::${geo}.geography, ${ponto}) AS distancia ` +
        `FROM (SELECT ${envoltoriaCampus(geo)} AS c) t`,
      [longitude, latitude, MARGEM_CAMPUS_METROS],
    )) as Array<{ dentro: boolean | null; distancia: number | null }>;
    if (r?.dentro === null || r?.dentro === undefined) throw semMapa();
    if (!r.dentro) {
      throw new UnprocessableEntityException({
        statusCode: 422,
        motivo: 'fora-do-campus',
        message: 'Escolha um ponto dentro do campus.',
        distanciaMetros: Math.round(r.distancia ?? 0),
      });
    }
  }

  async criar(
    dados: CriarPucStopDto,
    criadoPor: number | null,
  ): Promise<PucStopAdminDto> {
    await this.exigirNoCampus(dados.latitude, dados.longitude);
    const geo = await this.schemaGeo();
    const [{ id }] = (await this.dataSource.query(
      `INSERT INTO ${m}."pucstops" ("nome", "localizacao", "raio_metros", "xp", "ativo", "criado_por") ` +
        `VALUES ($1, ${geo}.ST_SetSRID(${geo}.ST_MakePoint($2, $3), ${SRID}), $4, $5, $6, $7) RETURNING "id"`,
      [
        dados.nome.trim(),
        dados.longitude,
        dados.latitude,
        dados.raioMetros,
        dados.xp,
        dados.ativo ?? true,
        criadoPor,
      ],
    )) as Array<{ id: string }>;
    this.logger.log(`pucstop criado id=${id}`);
    return this.detalhe(id);
  }

  async atualizar(
    id: string,
    dados: AtualizarPucStopDto,
  ): Promise<PucStopAdminDto> {
    if (!ID_PUCSTOP.test(id)) {
      throw new NotFoundException('PucStop não encontrado.');
    }
    const { nome, latitude, longitude, xp, raioMetros } = dados;
    if ((latitude === undefined) !== (longitude === undefined)) {
      throw new BadRequestException(
        'latitude e longitude devem ser enviadas juntas.',
      );
    }
    if ([nome, latitude, xp, raioMetros].every((v) => v === undefined)) {
      throw new BadRequestException('Nada para alterar.');
    }
    if (latitude !== undefined && longitude !== undefined) {
      await this.exigirNoCampus(latitude, longitude);
    }
    const geo = await this.schemaGeo();
    const atualizados = (await this.dataSource.query(
      `UPDATE ${m}."pucstops" SET ` +
        `"nome" = coalesce($2, "nome"), ` +
        `"localizacao" = CASE WHEN $3::float8 IS NULL THEN "localizacao" ` +
        `ELSE ${geo}.ST_SetSRID(${geo}.ST_MakePoint($3::float8, $4::float8), ${SRID}) END, ` +
        `"xp" = coalesce($5, "xp"), "raio_metros" = coalesce($6, "raio_metros"), ` +
        `"atualizado_em" = now() WHERE "id" = $1 RETURNING "id"`,
      [
        id,
        nome?.trim() ?? null,
        longitude ?? null,
        latitude ?? null,
        xp ?? null,
        raioMetros ?? null,
      ],
    )) as [Array<{ id: string }>, number];
    if (!atualizados[1]) throw new NotFoundException('PucStop não encontrado.');
    this.logger.log(
      `pucstop atualizado id=${id} campos=${Object.keys(dados).join(',')}`,
    );
    return this.detalhe(id);
  }

  /**
   * "Excluir" e reativar. Idempotente. Reativar confere de novo a posição:
   * o campus da versão ativa pode ter mudado desde a criação.
   */
  async definirAtivo(id: string, ativo: boolean): Promise<PucStopAdminDto> {
    const atual = await this.detalhe(id);
    if (atual.ativo === ativo) return atual;
    if (ativo) await this.exigirNoCampus(atual.latitude, atual.longitude);
    await this.dataSource.query(
      `UPDATE ${m}."pucstops" SET "ativo" = $2, "atualizado_em" = now() WHERE "id" = $1`,
      [id, ativo],
    );
    this.logger.log(`pucstop ${ativo ? 'ativado' : 'desativado'} id=${id}`);
    return this.detalhe(id);
  }
}

function semMapa() {
  return new ServiceUnavailableException(
    'Mapa do campus sem versão ativa: não há como conferir a posição do PucStop.',
  );
}
