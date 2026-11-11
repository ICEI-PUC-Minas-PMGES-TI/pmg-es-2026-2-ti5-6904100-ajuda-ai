import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { DataSource } from 'typeorm';
import { SCHEMA_MAPA } from '../../mapa/postgis.js';
import { NOME_RESTAURANTE } from '../campus.js';
import {
  exigirAlgumCampo,
  exigirUuid,
  montarSet,
  schemaGeoEmCache,
  textoAparado,
} from '../geo.js';
import {
  abertoAgora,
  agoraNoCampus,
  validarHorarios,
  type FaixaHorario,
} from '../horarios.js';
import {
  colunasLocal,
  joinsLocal,
  localDaLinha,
  parametrosLocal,
  pontoDeParametros,
  validarLocal,
  type ColunasLocal,
} from '../local.js';
import type {
  AtualizarRestauranteDto,
  CriarRestauranteDto,
  RestauranteAdminDto,
  RestauranteDto,
  SugestaoRestauranteDto,
} from './restaurantes.dto.js';

const m = `"${SCHEMA_MAPA}"`;
const VERSAO_ATIVA = `(SELECT "id" FROM ${m}."versoes" WHERE "status" = 'ativa')`;

interface LinhaRestaurante extends ColunasLocal {
  id: string;
  nome: string;
  descricao: string;
  horarios: FaixaHorario[];
  ativo: boolean;
  criado_por: number | null;
  criado_em: Date;
  atualizado_em: Date;
  cardapio_hoje: boolean;
  cardapios: number;
}

function publico(l: LinhaRestaurante, agora: Date): RestauranteDto {
  return {
    id: l.id,
    nome: l.nome,
    descricao: l.descricao,
    local: localDaLinha(l),
    horarios: l.horarios,
    abertoAgora: abertoAgora(l.horarios, agora),
    cardapioHoje: l.cardapio_hoje,
  };
}

/**
 * Restaurantes/lanchonetes do campus. Leitura pública só dos ativos;
 * "excluir" desativa (cardápios ficam, mas saem do público junto).
 */
@Injectable()
export class RestaurantesService {
  private readonly logger = new Logger('Restaurantes');
  private readonly geo: () => Promise<string>;

  constructor(private readonly dataSource: DataSource) {
    this.geo = schemaGeoEmCache(dataSource);
  }

  private consultar = (sql: string, p?: unknown[]) =>
    this.dataSource.query(sql, p);

  private async selecionar(
    filtro: string,
    parametros: unknown[],
    agora: Date,
  ): Promise<LinhaRestaurante[]> {
    const geo = await this.geo();
    const n = parametros.length + 1;
    return (await this.dataSource.query(
      `SELECT r."id", r."nome", r."descricao", r."horarios", r."ativo", r."criado_por", r."criado_em", ` +
        `r."atualizado_em", ${colunasLocal(geo, 'r')}, ` +
        `EXISTS (SELECT 1 FROM ${m}."cardapios" c WHERE c."restaurante_id" = r."id" ` +
        `AND $${n}::date BETWEEN c."valido_de" AND c."valido_ate") AS cardapio_hoje, ` +
        `(SELECT count(*)::int FROM ${m}."cardapios" c WHERE c."restaurante_id" = r."id") AS cardapios ` +
        `FROM ${m}."restaurantes" r ${joinsLocal('r')} WHERE ${filtro} ORDER BY r."nome", r."id"`,
      [...parametros, agoraNoCampus(agora).data],
    )) as LinhaRestaurante[];
  }

  private admin(l: LinhaRestaurante, agora: Date): RestauranteAdminDto {
    return {
      ...publico(l, agora),
      ativo: l.ativo,
      criadoPor: l.criado_por,
      criadoEm: l.criado_em.toISOString(),
      atualizadoEm: l.atualizado_em.toISOString(),
      cardapios: l.cardapios,
    };
  }

  async publicos(agora = new Date()): Promise<RestauranteDto[]> {
    return (await this.selecionar(`r."ativo"`, [], agora)).map((l) =>
      publico(l, agora),
    );
  }

  async publico(id: string, agora = new Date()): Promise<RestauranteDto> {
    exigirUuid(id, 'Restaurante');
    const [l] = await this.selecionar(`r."ativo" AND r."id" = $1`, [id], agora);
    if (!l) throw new NotFoundException('Restaurante não encontrado.');
    return publico(l, agora);
  }

  /** Para o cardápio público: o restaurante precisa existir e estar ativo. */
  async exigirAtivo(id: string): Promise<void> {
    await this.publico(id);
  }

  async listar(agora = new Date()): Promise<RestauranteAdminDto[]> {
    return (await this.selecionar('true', [], agora)).map((l) =>
      this.admin(l, agora),
    );
  }

  async detalhe(id: string, agora = new Date()): Promise<RestauranteAdminDto> {
    exigirUuid(id, 'Restaurante');
    const [l] = await this.selecionar(`r."id" = $1`, [id], agora);
    if (!l) throw new NotFoundException('Restaurante não encontrado.');
    return this.admin(l, agora);
  }

  /**
   * Prédios `CAFETERIA` da versão ativa (cantinas, RU, trailer…): os
   * estabelecimentos reais do mapa, para a coordenação cadastrar sem digitar.
   */
  async sugestoes(): Promise<SugestaoRestauranteDto[]> {
    const geo = await this.geo();
    const linhas = (await this.dataSource.query(
      `SELECT p."id", p."nome", ` +
        `CASE WHEN p."poligono" IS NULL THEN ${geo}.ST_Y(p."localizacao") ELSE (${geo}.ST_YMin(p."poligono") + ${geo}.ST_YMax(p."poligono")) / 2 END AS latitude, ` +
        `CASE WHEN p."poligono" IS NULL THEN ${geo}.ST_X(p."localizacao") ELSE (${geo}.ST_XMin(p."poligono") + ${geo}.ST_XMax(p."poligono")) / 2 END AS longitude, ` +
        `EXISTS (SELECT 1 FROM ${m}."restaurantes" r WHERE r."predio_id" = p."id") AS cadastrado ` +
        `FROM ${m}."predios" p WHERE p."versao_id" = ${VERSAO_ATIVA} AND p."tipo" = 'CAFETERIA' ORDER BY p."nome", p."id"`,
    )) as Array<{
      id: string;
      nome: string | null;
      latitude: number;
      longitude: number;
      cadastrado: boolean;
    }>;
    return linhas.map((l) => ({
      predioId: l.id,
      nome: l.nome,
      latitude: l.latitude,
      longitude: l.longitude,
      cadastrado: l.cadastrado,
    }));
  }

  async criar(
    dados: CriarRestauranteDto,
    criadoPor: number | null,
  ): Promise<RestauranteAdminDto> {
    const horarios = validarHorarios(dados.horarios ?? []);
    const local = await validarLocal(
      this.consultar,
      await this.geo(),
      dados.local,
    );
    const geo = await this.geo();
    const [{ id }] = (await this.dataSource.query(
      `INSERT INTO ${m}."restaurantes" ("nome", "descricao", "predio_id", "area_id", "localizacao", "horarios", "ativo", "criado_por") ` +
        `VALUES ($1, $2, $3, $4, ${pontoDeParametros(geo, 5, 6)}, $7::jsonb, $8, $9) RETURNING "id"`,
      [
        textoAparado(dados.nome, 'nome', NOME_RESTAURANTE),
        (dados.descricao ?? '').trim(),
        ...parametrosLocal(local),
        JSON.stringify(horarios),
        dados.ativo ?? true,
        criadoPor,
      ],
    )) as Array<{ id: string }>;
    this.logger.log(`restaurante criado id=${id}`);
    return this.detalhe(id);
  }

  async atualizar(
    id: string,
    dados: AtualizarRestauranteDto,
  ): Promise<RestauranteAdminDto> {
    exigirAlgumCampo(dados);
    if (dados.local === null) {
      throw new BadRequestException(
        'local: um restaurante precisa de um lugar no mapa.',
      );
    }
    await this.detalhe(id);
    const campos: Array<[string, unknown, ((n: number) => string)?]> = [];
    if (dados.nome !== undefined)
      campos.push(['nome', textoAparado(dados.nome, 'nome', NOME_RESTAURANTE)]);
    if (dados.descricao !== undefined)
      campos.push(['descricao', dados.descricao.trim()]);
    if (dados.horarios !== undefined)
      campos.push([
        'horarios',
        JSON.stringify(validarHorarios(dados.horarios)),
        (n) => `$${n}::jsonb`,
      ]);
    const { sql, parametros } = montarSet(campos, 2);
    let setLocal = '';
    if (dados.local !== undefined) {
      const local = await validarLocal(
        this.consultar,
        await this.geo(),
        dados.local,
      );
      const n = 2 + parametros.length;
      parametros.push(...parametrosLocal(local));
      setLocal =
        `, "predio_id" = $${n}, "area_id" = $${n + 1}::uuid, ` +
        `"localizacao" = ${pontoDeParametros(await this.geo(), n + 2, n + 3)}`;
    }
    await this.dataSource.query(
      `UPDATE ${m}."restaurantes" SET ${sql}${setLocal} WHERE "id" = $1`,
      [id, ...parametros],
    );
    this.logger.log(
      `restaurante atualizado id=${id} campos=${Object.keys(dados).join(',')}`,
    );
    return this.detalhe(id);
  }

  async definirAtivo(id: string, ativo: boolean): Promise<RestauranteAdminDto> {
    const atual = await this.detalhe(id);
    if (atual.ativo === ativo) return atual;
    await this.dataSource.query(
      `UPDATE ${m}."restaurantes" SET "ativo" = $2, "atualizado_em" = now() WHERE "id" = $1`,
      [id, ativo],
    );
    this.logger.log(`restaurante ${ativo ? 'ativado' : 'desativado'} id=${id}`);
    return this.detalhe(id);
  }
}
