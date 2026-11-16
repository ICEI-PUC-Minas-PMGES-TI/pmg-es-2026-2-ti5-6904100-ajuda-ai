import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { DataSource } from 'typeorm';
import {
  exigirNoCampus,
  MARGEM_CAMPUS_METROS,
  regiaoCampus,
} from '../../mapa/campus-limite.js';
import { SCHEMA_MAPA, SRID, schemaPostgis } from '../../mapa/postgis.js';
import { ParticipacoesService } from '../../participacoes/participacoes.service.js';
import {
  LIMITES,
  moedasPorXp,
  RECOMPENSA_TOTEM_PADRAO,
  RECOMPENSAS_TOTEM,
} from '../economia.js';
import { SCHEMA_GAMIFICACAO, schemaUsuarios } from '../gamificacao.js';
import type {
  OrcamentoTotensDto,
  AtualizarPucStopDto,
  CampusPucStopsDto,
  CriarPucStopDto,
  PucStopAdminDto,
} from './pucstops-admin.dto.js';
import { ID_PUCSTOP } from './pucstops.service.js';

const m = `"${SCHEMA_MAPA}"`;
const g = `"${SCHEMA_GAMIFICACAO}"`;

/** Margem compartilhada com os demais conteúdos posicionados no campus. */
export { MARGEM_CAMPUS_METROS };

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

  /** Quanto XP os totens ativos oferecem, frente ao teto por aluno e ciclo. */
  /**
   * Economia dos totens para a coordenação. Informativo: o cadastro nunca é
   * bloqueado (o teto individual já limita o que cada aluno recebe).
   */
  async orcamento(): Promise<OrcamentoTotensDto> {
    const ciclo = ParticipacoesService.programaAtual();
    const u = schemaUsuarios(this.dataSource);
    const [[linha], porXp, [eleg]] = await Promise.all([
      this.dataSource.query(
        `SELECT count(*) FILTER (WHERE "ativo")::int AS ativos, count(*) FILTER (WHERE NOT "ativo")::int AS inativos, ` +
          `COALESCE(sum("xp") FILTER (WHERE "ativo"), 0)::int AS potencial FROM ${m}."pucstops"`,
      ) as Promise<
        Array<{ ativos: number; inativos: number; potencial: number }>
      >,
      this.dataSource.query(
        `SELECT "xp", count(*)::int AS totens FROM ${m}."pucstops" WHERE "ativo" GROUP BY 1`,
      ) as Promise<Array<{ xp: number; totens: number }>>,
      // Mesma regra de quem pode coletar (PermissoesAlunoService): aprovado
      // ou em andamento no ciclo atual, sem término, ciclo não encerrado.
      this.dataSource.query(
        `SELECT count(DISTINCT p."usuario_id")::int AS n FROM ${u}."participacoes" p ` +
          `JOIN ${u}."programas" g ON g."codigo" = p."programa" ` +
          `WHERE p."programa" = $1 AND p."status" IN ('aprovado', 'em_andamento') AND p."termino_em" IS NULL ` +
          `AND p."papel" IN ('padrinho', 'apadrinhado', 'candidato') AND g."etapa_atual" <> 'encerramento'`,
        [ciclo],
      ) as Promise<Array<{ n: number }>>,
    ]);
    const contagem = new Map(porXp.map((l) => [l.xp, l.totens]));
    const media = linha.ativos
      ? Math.round((linha.potencial / linha.ativos) * 10) / 10
      : 0;
    return {
      ativos: linha.ativos,
      inativos: linha.inativos,
      xpPotencial: linha.potencial,
      moedasPotenciais: moedasPorXp(linha.potencial),
      recompensaMedia: media,
      distribuicao: RECOMPENSAS_TOTEM.map((xp) => ({
        xp,
        totens: contagem.get(xp) ?? 0,
      })),
      limitePorCiclo: LIMITES.totensPorCiclo,
      excedeLimite: linha.potencial > LIMITES.totensPorCiclo,
      ciclo,
      participantesElegiveis: eleg.n,
      emissaoMaximaEstimada: moedasPorXp(
        eleg.n * Math.min(linha.potencial, LIMITES.totensPorCiclo),
      ),
      opcoes: [...RECOMPENSAS_TOTEM],
      padrao: RECOMPENSA_TOTEM_PADRAO,
    };
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
    return regiaoCampus(
      (sql, p) => this.dataSource.query(sql, p),
      await this.schemaGeo(),
    );
  }

  /** 422 `fora-do-campus` ou 503 sem versão ativa (ver `campus-limite.ts`). */
  private async exigirNoCampus(
    latitude: number,
    longitude: number,
  ): Promise<void> {
    await exigirNoCampus(
      (sql, p) => this.dataSource.query(sql, p),
      await this.schemaGeo(),
      latitude,
      longitude,
    );
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
