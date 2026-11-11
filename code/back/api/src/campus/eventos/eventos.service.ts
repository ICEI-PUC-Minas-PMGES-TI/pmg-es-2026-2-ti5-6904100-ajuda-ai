import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { DataSource } from 'typeorm';
import { SCHEMA_MAPA } from '../../mapa/postgis.js';
import { DURACAO_EVENTO_MAX_DIAS, TITULO_EVENTO } from '../campus.js';
import {
  exigirAlgumCampo,
  exigirUuid,
  montarSet,
  schemaGeoEmCache,
  textoAparado,
} from '../geo.js';
import {
  colunasLocal,
  joinsLocal,
  localDaLinha,
  parametrosLocal,
  pontoDeParametros,
  SEM_LOCAL,
  validarLocal,
  type ColunasLocal,
  type LocalEntradaDto,
  type LocalGravado,
} from '../local.js';
import type {
  AtualizarEventoDto,
  CriarEventoDto,
  EventoAdminDto,
  EventoDto,
  SituacaoEvento,
} from './eventos.dto.js';

const m = `"${SCHEMA_MAPA}"`;
const DIA_MS = 24 * 60 * 60 * 1000;

interface LinhaEvento extends ColunasLocal {
  id: string;
  titulo: string;
  descricao: string;
  inicio: Date;
  fim: Date;
  ativo: boolean;
  criado_por: number | null;
  criado_em: Date;
  atualizado_em: Date;
}

function situacao(l: LinhaEvento, agora: number): SituacaoEvento {
  if (l.fim.getTime() <= agora) return 'encerrado';
  return l.inicio.getTime() <= agora ? 'acontecendo' : 'em-breve';
}

function publico(l: LinhaEvento, agora: number): EventoDto {
  return {
    id: l.id,
    titulo: l.titulo,
    descricao: l.descricao,
    inicio: l.inicio.toISOString(),
    fim: l.fim.toISOString(),
    situacao: situacao(l, agora),
    local: localDaLinha(l),
  };
}

/** Período válido: fim depois do início e no máximo [DURACAO_EVENTO_MAX_DIAS]. */
function exigirPeriodo(inicio: Date, fim: Date): void {
  if (Number.isNaN(inicio.getTime()) || Number.isNaN(fim.getTime())) {
    throw new BadRequestException('Data/hora inválida.');
  }
  if (fim <= inicio) {
    throw new BadRequestException('O fim do evento deve ser depois do início.');
  }
  if (fim.getTime() - inicio.getTime() > DURACAO_EVENTO_MAX_DIAS * DIA_MS) {
    throw new BadRequestException(
      `Um evento dura no máximo ${DURACAO_EVENTO_MAX_DIAS} dias.`,
    );
  }
}

/**
 * Eventos do campus. Leitura pública só dos ativos que ainda não acabaram;
 * a coordenação vê todos. "Excluir" desativa (o histórico fica).
 */
@Injectable()
export class EventosService {
  private readonly logger = new Logger('Eventos');
  private readonly geo: () => Promise<string>;

  constructor(private readonly dataSource: DataSource) {
    this.geo = schemaGeoEmCache(dataSource);
  }

  private consultar = (sql: string, p?: unknown[]) =>
    this.dataSource.query(sql, p);

  private async selecionar(
    filtro: string,
    parametros: unknown[],
    ordem: string,
  ): Promise<LinhaEvento[]> {
    const geo = await this.geo();
    return (await this.dataSource.query(
      `SELECT e."id", e."titulo", e."descricao", e."inicio", e."fim", e."ativo", e."criado_por", ` +
        `e."criado_em", e."atualizado_em", ${colunasLocal(geo, 'e')} ` +
        `FROM ${m}."eventos" e ${joinsLocal('e')} WHERE ${filtro} ORDER BY ${ordem}`,
      parametros,
    )) as LinhaEvento[];
  }

  private admin(l: LinhaEvento, agora = Date.now()): EventoAdminDto {
    return {
      ...publico(l, agora),
      ativo: l.ativo,
      criadoPor: l.criado_por,
      criadoEm: l.criado_em.toISOString(),
      atualizadoEm: l.atualizado_em.toISOString(),
    };
  }

  /** Ativos que não acabaram, do mais próximo ao mais distante. */
  async publicos(): Promise<EventoDto[]> {
    const agora = Date.now();
    return (
      await this.selecionar(
        `e."ativo" AND e."fim" > now()`,
        [],
        `e."inicio", e."id"`,
      )
    ).map((l) => publico(l, agora));
  }

  /** Detalhe público: ativo (mesmo encerrado, para quem tem o link). */
  async publico(id: string): Promise<EventoDto> {
    exigirUuid(id, 'Evento');
    const [linha] = await this.selecionar(
      `e."ativo" AND e."id" = $1`,
      [id],
      `e."id"`,
    );
    if (!linha) throw new NotFoundException('Evento não encontrado.');
    return publico(linha, Date.now());
  }

  /** Coordenação: todos, os mais recentes primeiro. */
  async listar(): Promise<EventoAdminDto[]> {
    const agora = Date.now();
    return (await this.selecionar('true', [], `e."inicio" DESC, e."id"`)).map(
      (l) => this.admin(l, agora),
    );
  }

  async detalhe(id: string): Promise<EventoAdminDto> {
    exigirUuid(id, 'Evento');
    const [linha] = await this.selecionar(`e."id" = $1`, [id], `e."id"`);
    if (!linha) throw new NotFoundException('Evento não encontrado.');
    return this.admin(linha);
  }

  private async local(entrada: LocalEntradaDto): Promise<LocalGravado> {
    return validarLocal(this.consultar, await this.geo(), entrada);
  }

  async criar(
    dados: CriarEventoDto,
    criadoPor: number | null,
  ): Promise<EventoAdminDto> {
    const inicio = new Date(dados.inicio);
    const fim = new Date(dados.fim);
    exigirPeriodo(inicio, fim);
    const local = dados.local ? await this.local(dados.local) : SEM_LOCAL;
    const geo = await this.geo();
    const [{ id }] = (await this.dataSource.query(
      `INSERT INTO ${m}."eventos" ("titulo", "descricao", "inicio", "fim", "predio_id", "area_id", "localizacao", "ativo", "criado_por") ` +
        `VALUES ($1, $2, $3, $4, $5, $6, ${pontoDeParametros(geo, 7, 8)}, $9, $10) RETURNING "id"`,
      [
        textoAparado(dados.titulo, 'titulo', TITULO_EVENTO),
        (dados.descricao ?? '').trim(),
        inicio,
        fim,
        ...parametrosLocal(local),
        dados.ativo ?? true,
        criadoPor,
      ],
    )) as Array<{ id: string }>;
    this.logger.log(`evento criado id=${id}`);
    return this.detalhe(id);
  }

  async atualizar(
    id: string,
    dados: AtualizarEventoDto,
  ): Promise<EventoAdminDto> {
    exigirAlgumCampo(dados);
    const atual = await this.detalhe(id);
    const inicio = new Date(dados.inicio ?? atual.inicio);
    const fim = new Date(dados.fim ?? atual.fim);
    exigirPeriodo(inicio, fim);
    const campos: Array<[string, unknown]> = [];
    if (dados.titulo !== undefined)
      campos.push([
        'titulo',
        textoAparado(dados.titulo, 'titulo', TITULO_EVENTO),
      ]);
    if (dados.descricao !== undefined)
      campos.push(['descricao', dados.descricao.trim()]);
    if (dados.inicio !== undefined) campos.push(['inicio', inicio]);
    if (dados.fim !== undefined) campos.push(['fim', fim]);
    const { sql, parametros } = montarSet(campos, 2);
    let setLocal = '';
    if (dados.local !== undefined) {
      const local =
        dados.local === null ? SEM_LOCAL : await this.local(dados.local);
      const n = 2 + parametros.length;
      parametros.push(...parametrosLocal(local));
      setLocal =
        `, "predio_id" = $${n}, "area_id" = $${n + 1}::uuid, ` +
        `"localizacao" = ${pontoDeParametros(await this.geo(), n + 2, n + 3)}`;
    }
    await this.dataSource.query(
      `UPDATE ${m}."eventos" SET ${sql}${setLocal} WHERE "id" = $1`,
      [id, ...parametros],
    );
    this.logger.log(
      `evento atualizado id=${id} campos=${Object.keys(dados).join(',')}`,
    );
    return this.detalhe(id);
  }

  /** "Excluir" (desativar) e reativar; idempotente. */
  async definirAtivo(id: string, ativo: boolean): Promise<EventoAdminDto> {
    const atual = await this.detalhe(id);
    if (atual.ativo === ativo) return atual;
    await this.dataSource.query(
      `UPDATE ${m}."eventos" SET "ativo" = $2, "atualizado_em" = now() WHERE "id" = $1`,
      [id, ativo],
    );
    this.logger.log(`evento ${ativo ? 'ativado' : 'desativado'} id=${id}`);
    return this.detalhe(id);
  }
}
