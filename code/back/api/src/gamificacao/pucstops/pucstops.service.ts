import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
  ServiceUnavailableException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { DataSource, QueryFailedError } from 'typeorm';
import { SCHEMA_MAPA, SRID, schemaPostgis } from '../../mapa/postgis.js';
import { notificacaoNivel } from '../../notificacoes/notificacoes.js';
import { NotificacoesService } from '../../notificacoes/notificacoes.service.js';
import { ParticipacoesService } from '../../participacoes/participacoes.service.js';
import { nivelDe } from '../economia.js';
import {
  ehViolacaoUnica,
  SCHEMA_GAMIFICACAO,
  travarCarteira,
} from '../gamificacao.js';
import { creditarGanho } from '../ganhos.js';
import type {
  ColetaPucStopDto,
  ColetarPucStopDto,
  MinhaColetaDto,
  MotivoRecusaColeta,
  PucStopDto,
} from './pucstops.dto.js';

const m = `"${SCHEMA_MAPA}"`;
const g = `"${SCHEMA_GAMIFICACAO}"`;

/**
 * Margem técnica somada ao raio físico na geofence. Zero: vale o raio que a
 * coordenação cadastrou (`distância <= raio`), e a precisão informada pelo
 * aparelho não aumenta o raio (o cliente poderia mentir nela).
 */
export const MARGEM_TECNICA_METROS = 0;

/**
 * Leitura com incerteza maior que isto é recusada (`precisao-insuficiente`):
 * metade do maior raio aceito (200 m). Com um círculo de incerteza desse
 * tamanho a leitura não distingue dentro de fora; evita coleta por posição
 * aproximada de rede. Não é proteção contra GPS falso.
 */
export const PRECISAO_MAXIMA_METROS = 100;

/** Id gerado pelo banco (`gen_random_uuid()`), sempre em minúsculas. */
export const ID_PUCSTOP =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

function recusa(
  motivo: MotivoRecusaColeta,
  message: string,
  extra: Record<string, unknown> = {},
) {
  const corpo = { message, motivo, ...extra };
  return motivo === 'ja-coletado'
    ? new ConflictException({ ...corpo, statusCode: 409 })
    : new UnprocessableEntityException({ ...corpo, statusCode: 422 });
}

const arredondar = (metros: number) => Math.round(metros * 10) / 10;

/**
 * PucStops: leitura pública e coleta (claim) autenticada com geofence no
 * servidor. A coordenada recebida é usada só na consulta de distância: não é
 * gravada, não vai para log e não sai na resposta (só a distância).
 */
@Injectable()
export class PucStopsService {
  private readonly logger = new Logger('PucStops');
  private geo?: Promise<string>;

  constructor(
    private readonly dataSource: DataSource,
    @Optional() private readonly notificacoes?: NotificacoesService,
  ) {}

  private schemaGeo(): Promise<string> {
    return (this.geo ??= schemaPostgis((sql, p) =>
      this.dataSource.query(sql, p),
    ).catch((erro: unknown) => {
      this.geo = undefined;
      throw erro;
    }));
  }

  private async selecionar(filtro: string, parametros: unknown[]) {
    const geo = await this.schemaGeo();
    return (await this.dataSource.query(
      `SELECT "id", "nome", ${geo}.ST_Y("localizacao") AS latitude, ${geo}.ST_X("localizacao") AS longitude, ` +
        `"raio_metros" AS "raioMetros", "xp" FROM ${m}."pucstops" WHERE "ativo" AND ${filtro} ORDER BY "nome", "id"`,
      parametros,
    )) as PucStopDto[];
  }

  /**
   * Só ativos: desativado pela coordenação some do mapa dos alunos. Lista
   * vazia é resposta normal (nenhum PucStop cadastrado ainda).
   */
  listar(): Promise<PucStopDto[]> {
    return this.selecionar('true', []);
  }

  async detalhe(id: string): Promise<PucStopDto> {
    const [pucstop] = ID_PUCSTOP.test(id)
      ? await this.selecionar(`"id" = $1`, [id])
      : [];
    if (!pucstop) throw new NotFoundException('PucStop não encontrado.');
    return pucstop;
  }

  /**
   * Coletas do ciclo atual (o totem volta a ficar disponível a cada ciclo).
   * As de ciclos anteriores continuam no banco como histórico.
   */
  async minhasColetas(usuarioId: number): Promise<MinhaColetaDto[]> {
    const ciclo = ParticipacoesService.programaAtual();
    const linhas = (await this.dataSource.query(
      `SELECT "pucstop_id", "xp", "ciclo", "coletado_em" FROM ${g}."pucstop_coletas" ` +
        `WHERE "usuario_id" = $1 AND "ciclo" = $2 ORDER BY "coletado_em", "id"`,
      [usuarioId, ciclo],
    )) as Array<{
      pucstop_id: string;
      xp: number;
      ciclo: string;
      coletado_em: Date;
    }>;
    return linhas.map((l) => ({
      pucstopId: l.pucstop_id,
      xp: l.xp,
      ciclo: l.ciclo,
      claimedAt: l.coletado_em.toISOString(),
    }));
  }

  /**
   * Coleta numa transação: PucStop ativo → geofence (PostGIS, geodésica) →
   * trava a carteira do usuário → coleta anterior? → ledger + saldo + coleta →
   * commit. Qualquer falha desfaz tudo. Duas coletas simultâneas do mesmo
   * usuário se enfileiram na trava da carteira; os UNIQUE de coleta e de
   * `chave_idempotencia` são a última barreira.
   */
  async coletar(
    usuarioId: number,
    id: string,
    leitura: ColetarPucStopDto,
  ): Promise<ColetaPucStopDto> {
    if (!ID_PUCSTOP.test(id)) {
      throw new NotFoundException('PucStop não encontrado.');
    }
    if (
      leitura.accuracy !== undefined &&
      leitura.accuracy > PRECISAO_MAXIMA_METROS
    ) {
      throw recusa(
        'precisao-insuficiente',
        'Localização imprecisa demais. Tente novamente ao ar livre.',
      );
    }
    const geo = await this.schemaGeo();
    const qr = this.dataSource.createQueryRunner();
    await qr.connect();
    await qr.startTransaction();
    try {
      const usuario = `${geo}.ST_SetSRID(${geo}.ST_MakePoint($2, $3), ${SRID})::${geo}.geography`;
      const [p] = (await qr
        .query(
          `SELECT "id", "nome", "xp", "raio_metros", "ativo", ` +
            `${geo}.ST_Distance("localizacao"::${geo}.geography, ${usuario}) AS distancia, ` +
            `${geo}.ST_DWithin("localizacao"::${geo}.geography, ${usuario}, "raio_metros" + $4) AS dentro ` +
            `FROM ${m}."pucstops" WHERE "id" = $1 FOR SHARE`,
          [id, leitura.longitude, leitura.latitude, MARGEM_TECNICA_METROS],
        )
        .catch((erro: unknown) => {
          // QueryFailedError carrega SQL e parâmetros (a posição do usuário).
          // Não o repassar ao logger padrão de exceções do Nest, nem como cause.
          if (!(erro instanceof QueryFailedError)) throw erro;
          this.logger.warn('Consulta de geofence indisponível.');
          throw new ServiceUnavailableException(
            'Não foi possível validar a localização agora. Tente novamente.',
          );
        })) as Array<{
        id: string;
        nome: string;
        xp: number;
        raio_metros: number;
        ativo: boolean;
        distancia: number;
        dentro: boolean;
      }>;
      if (!p) throw new NotFoundException('PucStop não encontrado.');
      if (!p.ativo) {
        throw recusa('inativo', 'Este PucStop está indisponível.');
      }
      const distanciaMetros = arredondar(p.distancia);
      if (!p.dentro) {
        throw recusa(
          'fora-do-alcance',
          'Aproxime-se do PucStop para coletar.',
          {
            distanciaMetros,
            raioMetros: p.raio_metros,
          },
        );
      }

      // A trava da carteira serializa as coletas do usuário: o teto do ciclo
      // é lido e consumido sem corrida.
      const saldoAntes = await travarCarteira(qr, usuarioId);
      const ciclo = ParticipacoesService.programaAtual();
      const [anterior] = (await qr.query(
        `SELECT 1 FROM ${g}."pucstop_coletas" WHERE "usuario_id" = $1 AND "pucstop_id" = $2 AND "ciclo" = $3`,
        [usuarioId, id, ciclo],
      )) as unknown[];
      if (anterior) {
        throw recusa(
          'ja-coletado',
          'Você já coletou este PucStop neste semestre.',
        );
      }
      const [{ xp_acumulado: xpAntes }] = (await qr.query(
        `SELECT "xp_acumulado" FROM ${g}."xp_carteiras" WHERE "usuario_id" = $1`,
        [usuarioId],
      )) as Array<{ xp_acumulado: number }>;

      const ganho = await creditarGanho(qr, {
        usuarioId,
        fonte: 'TOTEM',
        xp: p.xp,
        ciclo,
        referenciaTipo: 'pucstop',
        referenciaId: p.id,
        descricao: `PucStop: ${p.nome}`,
        chaveIdempotencia: `pucstop:${p.id}:usuario:${usuarioId}:ciclo:${ciclo}`,
      });
      const [coleta] = (await qr.query(
        `INSERT INTO ${g}."pucstop_coletas" ("usuario_id", "pucstop_id", "movimentacao_id", "xp", "xp_configurado", "ciclo") ` +
          `VALUES ($1, $2, $3, $4, $5, $6) RETURNING "coletado_em"`,
        [
          usuarioId,
          p.id,
          ganho.movimentacao?.movimentacaoId ?? null,
          ganho.xp,
          p.xp,
          ciclo,
        ],
      )) as Array<{ coletado_em: Date }>;
      await qr.commitTransaction();
      this.logger.log(
        `coleta pucstop=${p.id} usuario=${usuarioId} ciclo=${ciclo} xp=${ganho.xp}/${p.xp}`,
      );
      const xpAcumulado = ganho.movimentacao?.xpAcumulado ?? xpAntes;
      const moedas = ganho.movimentacao?.saldo ?? saldoAntes;
      const nivel = nivelDe(xpAcumulado);
      const subiuDeNivel = nivel.numero > nivelDe(xpAntes).numero;
      if (subiuDeNivel && this.notificacoes) {
        await this.notificacoes.criar(usuarioId, notificacaoNivel(xpAcumulado));
      }
      return {
        pucstopId: p.id,
        xpGanho: ganho.xp,
        moedasGanhas: ganho.moedas,
        xpConfigurado: p.xp,
        limiteAtingido: ganho.limitado,
        xpTotal: moedas,
        moedas,
        xpAcumulado,
        nivel,
        subiuDeNivel,
        ciclo,
        claimedAt: (
          ganho.movimentacao?.criadoEm ?? coleta.coletado_em
        ).toISOString(),
        distanciaMetros,
      };
    } catch (erro) {
      await qr.rollbackTransaction();
      // Corrida que escapou da trava (ex.: outra instância sem a carteira
      // ainda criada): o UNIQUE decide, sem 500.
      if (
        ehViolacaoUnica(erro, 'uq_pucstop_coletas_usuario_pucstop_ciclo') ||
        ehViolacaoUnica(erro, 'uq_xp_movimentacoes_chave')
      ) {
        throw recusa('ja-coletado', 'Você já coletou este PucStop.');
      }
      throw erro;
    } finally {
      await qr.release();
    }
  }
}
