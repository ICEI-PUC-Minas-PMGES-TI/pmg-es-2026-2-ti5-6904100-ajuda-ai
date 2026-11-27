import {
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { DataSource, QueryFailedError, type QueryRunner } from 'typeorm';
import { nivelDe, type NivelDto } from '../gamificacao/economia.js';
import {
  SCHEMA_GAMIFICACAO,
  schemaUsuarios,
  travarCarteira,
} from '../gamificacao/gamificacao.js';
import {
  creditarGanho,
  usoDoCiclo,
  type GanhoCreditado,
} from '../gamificacao/ganhos.js';
import {
  CHECKIN_ANTECEDENCIA_MIN,
  RAIO_EVENTO_METROS,
  xpPrevisto,
} from '../gamificacao/missoes/missoes.js';
import { MissoesService } from '../gamificacao/missoes/missoes.service.js';
import { PRECISAO_MAXIMA_METROS } from '../gamificacao/pucstops/pucstops.service.js';
import { RegrasXpService } from '../gamificacao/regras-xp/regras-xp.service.js';
import { SRID, schemaPostgis } from '../mapa/postgis.js';
import { notificacaoNivel } from '../notificacoes/notificacoes.js';
import { NotificacoesService } from '../notificacoes/notificacoes.service.js';
import type { ConfirmarPresencaDto } from './encontros.dto.js';
import {
  ACAO_XP_ENCONTRO,
  ID_ENCONTRO,
  recusa,
  TOLERANCIA_FIM_ENCONTRO_MIN,
} from './encontros.js';

const g = `"${SCHEMA_GAMIFICACAO}"`;
const ACAO_XP_MISSAO = 'MISSAO_ENCONTRO';

export interface PresencaDto {
  encontroId: string;
  confirmadoEm: string;
  distanciaMetros: number;
  encontroRealizado: boolean;
  xpGanho: number;
  moedasGanhas: number;
  xpConfigurado: number;
  limiteAtingido: boolean;
  moedas: number;
  xpAcumulado: number;
  nivel: NivelDto;
  subiuDeNivel: boolean;
}

interface SubidaDeNivel {
  usuarioId: number;
  xpAcumulado: number;
}

type RegraDeEncontro = Awaited<
  ReturnType<RegrasXpService['configuracoesVigentes']>
>[number];

interface EncontroParaPresenca {
  id: string;
  programa: string;
  organizador_id: number;
  inicio: Date;
  fim: Date;
  status: string;
  convidado: boolean;
  aceito: boolean;
  distancia: number | null;
  dentro: boolean;
  presenca: boolean;
}

@Injectable()
export class EncontrosPresencaService {
  private readonly logger = new Logger('EncontrosPresenca');
  private geo?: Promise<string>;

  constructor(
    private readonly dataSource: DataSource,
    private readonly regrasXp: RegrasXpService,
    private readonly notificacoes: NotificacoesService,
    private readonly missoes: MissoesService,
  ) {}

  private get u(): string {
    return schemaUsuarios(this.dataSource);
  }

  private schemaGeo(): Promise<string> {
    return (this.geo ??= schemaPostgis((sql, p) =>
      this.dataSource.query(sql, p),
    ).catch((erro: unknown) => {
      this.geo = undefined;
      throw erro;
    }));
  }

  async confirmar(
    usuarioId: number,
    id: string,
    leitura: ConfirmarPresencaDto,
  ): Promise<PresencaDto> {
    if (!ID_ENCONTRO.test(id)) {
      throw new NotFoundException('Encontro não encontrado.');
    }
    const geo = await this.schemaGeo();
    const qr = this.dataSource.createQueryRunner();
    await qr.connect();
    const niveis: SubidaDeNivel[] = [];
    let confirmou = false;
    try {
      await qr.startTransaction();
      const encontro = await this.carregar(qr, geo, usuarioId, id, leitura);
      if (encontro.status === 'cancelado') {
        throw recusa('encontro-cancelado', 'Este encontro foi cancelado.');
      }
      if (encontro.presenca) return await this.jaConfirmada(qr, usuarioId, id);
      this.exigirElegivel(encontro);
      this.exigirLocalizacao(leitura);
      this.exigirDistancia(encontro);

      const { saldo: saldoAntes, xpAcumulado: xpAntes } = await this.carteira(
        qr,
        usuarioId,
      );

      const distanciaMetros = Math.round(encontro.distancia ?? 0);
      const [presenca] = (await qr.query(
        `INSERT INTO ${this.u}."encontro_presencas" ` +
          `("encontro_id", "usuario_id", "distancia_metros") VALUES ($1, $2, $3) ` +
          `ON CONFLICT ("encontro_id", "usuario_id") DO NOTHING RETURNING "confirmado_em"`,
        [id, usuarioId, distanciaMetros],
      )) as Array<{ confirmado_em: Date }>;
      if (!presenca) {
        return await this.jaConfirmada(qr, usuarioId, id);
      }

      const { realizado, novo } = await this.registrarRealizacao(qr, encontro);
      const ganho = realizado
        ? await this.creditarPresentes(qr, encontro, usuarioId, novo, niveis)
        : null;

      await qr.commitTransaction();
      confirmou = true;
      this.logger.log(
        `presenca encontro=${id} usuario=${usuarioId} distancia=${distanciaMetros} realizado=${realizado}`,
      );
      const xpAcumulado = ganho?.xpAcumulado ?? xpAntes;
      const moedas = ganho?.saldo ?? saldoAntes;
      const nivel = nivelDe(xpAcumulado);
      const subiuDeNivel = niveis.some(
        (subida) => subida.usuarioId === usuarioId,
      );
      return {
        encontroId: id,
        confirmadoEm: presenca.confirmado_em.toISOString(),
        distanciaMetros,
        encontroRealizado: realizado,
        xpGanho: ganho?.encontro?.xp ?? 0,
        moedasGanhas: ganho?.encontro?.moedas ?? 0,
        xpConfigurado: ganho?.xpConfigurado ?? 0,
        limiteAtingido: ganho?.limiteAtingido ?? false,
        moedas,
        xpAcumulado,
        nivel,
        subiuDeNivel,
      };
    } finally {
      try {
        if (qr.isTransactionActive) await qr.rollbackTransaction();
      } finally {
        await qr.release();
      }
      for (const subida of confirmou ? niveis : []) {
        await this.notificacoes.criar(
          subida.usuarioId,
          notificacaoNivel(subida.xpAcumulado),
        );
      }
    }
  }

  private async carteira(
    qr: QueryRunner,
    usuarioId: number,
  ): Promise<{ saldo: number; xpAcumulado: number }> {
    const [linha] = (await qr.query(
      `SELECT "saldo", "xp_acumulado" FROM ${g}."xp_carteiras" WHERE "usuario_id" = $1`,
      [usuarioId],
    )) as Array<{ saldo: number; xp_acumulado: number }>;
    return {
      saldo: linha?.saldo ?? 0,
      xpAcumulado: linha?.xp_acumulado ?? 0,
    };
  }

  private exigirLocalizacao(leitura: ConfirmarPresencaDto): void {
    const numero = (v: unknown): v is number =>
      typeof v === 'number' && Number.isFinite(v);
    if (!numero(leitura.latitude) || !numero(leitura.longitude)) {
      throw recusa(
        'localizacao-obrigatoria',
        'Envie sua localização para confirmar presença.',
      );
    }
    if (!numero(leitura.accuracy)) {
      throw recusa(
        'localizacao-obrigatoria',
        'Envie a precisão da localização para confirmar presença.',
      );
    }
    if (leitura.accuracy > PRECISAO_MAXIMA_METROS) {
      throw recusa(
        'precisao-insuficiente',
        'Localização imprecisa demais. Tente de novo ao ar livre.',
      );
    }
  }

  private async carregar(
    qr: QueryRunner,
    geo: string,
    usuarioId: number,
    id: string,
    leitura: ConfirmarPresencaDto,
  ): Promise<EncontroParaPresenca> {
    const u = this.u;
    const [travado] = (await qr.query(
      `SELECT "id" FROM ${u}."encontros" WHERE "id" = $1 FOR UPDATE`,
      [id],
    )) as Array<{ id: string }>;
    if (!travado) throw new NotFoundException('Encontro não encontrado.');

    const ponto = `${geo}.ST_SetSRID(${geo}.ST_MakePoint($3, $4), ${SRID})::${geo}.geography`;
    const [encontro] = (await qr
      .query(
        `SELECT e."id", e."programa", e."organizador_id", e."inicio", e."fim", e."status", ` +
          `(c."encontro_id" IS NOT NULL) AS "convidado", ` +
          `(c."resposta" = 'aceito') AS "aceito", ` +
          `EXISTS (SELECT 1 FROM ${u}."encontro_presencas" p WHERE p."encontro_id" = e."id" AND p."usuario_id" = $2) AS "presenca", ` +
          `${geo}.ST_Distance(e."local_posicao"::${geo}.geography, ${ponto}) AS "distancia", ` +
          `${geo}.ST_DWithin(e."local_posicao"::${geo}.geography, ${ponto}, $5) AS "dentro" ` +
          `FROM ${u}."encontros" e ` +
          `LEFT JOIN ${u}."encontro_convites" c ON c."encontro_id" = e."id" ` +
          `AND c."apadrinhado_id" = $2 ` +
          `WHERE e."id" = $1`,
        [
          id,
          usuarioId,
          leitura.longitude ?? null,
          leitura.latitude ?? null,
          RAIO_EVENTO_METROS,
        ],
      )
      .catch((erro: unknown) => {
        if (!(erro instanceof QueryFailedError)) throw erro;
        this.logger.warn('Consulta de geofence indisponível.');
        throw new ServiceUnavailableException(
          'Não foi possível validar a localização agora. Tente de novo.',
        );
      })) as EncontroParaPresenca[];
    if (!encontro) throw new NotFoundException('Encontro não encontrado.');
    if (encontro.organizador_id !== usuarioId && !encontro.convidado) {
      throw new NotFoundException('Encontro não encontrado.');
    }
    return encontro;
  }

  private exigirElegivel(encontro: EncontroParaPresenca): void {
    if (encontro.convidado && !encontro.aceito) {
      throw recusa(
        'convite-nao-aceito',
        'Aceite o convite antes de confirmar presença.',
      );
    }
    const agora = Date.now();
    const abre = encontro.inicio.getTime() - CHECKIN_ANTECEDENCIA_MIN * 60_000;
    const fecha = encontro.fim.getTime() + TOLERANCIA_FIM_ENCONTRO_MIN * 60_000;
    if (agora < abre || agora > fecha) {
      throw recusa(
        'fora-da-janela',
        `A confirmação abre ${CHECKIN_ANTECEDENCIA_MIN} minutos antes do encontro e fecha ${TOLERANCIA_FIM_ENCONTRO_MIN} minutos depois do fim.`,
        {
          inicio: encontro.inicio.toISOString(),
          fim: encontro.fim.toISOString(),
        },
      );
    }
  }

  private exigirDistancia(encontro: EncontroParaPresenca): void {
    if (!encontro.dentro) {
      throw recusa(
        'fora-do-local',
        'Você precisa estar no local do encontro para confirmar presença.',
        {
          distanciaMetros: Math.round(encontro.distancia ?? 0),
          raioMetros: RAIO_EVENTO_METROS,
        },
      );
    }
  }

  private async registrarRealizacao(
    qr: QueryRunner,
    encontro: EncontroParaPresenca,
  ): Promise<{ realizado: boolean; novo: boolean }> {
    const u = this.u;
    const [{ organizador, convidados }] = (await qr.query(
      `SELECT ` +
        `EXISTS (SELECT 1 FROM ${u}."encontro_presencas" p ` +
        `WHERE p."encontro_id" = $1 AND p."usuario_id" = $2) AS "organizador", ` +
        `EXISTS (SELECT 1 FROM ${u}."encontro_presencas" p ` +
        `JOIN ${u}."encontro_convites" c ON c."encontro_id" = p."encontro_id" ` +
        `AND c."apadrinhado_id" = p."usuario_id" ` +
        `WHERE p."encontro_id" = $1 AND c."resposta" = 'aceito') AS "convidados"`,
      [encontro.id, encontro.organizador_id],
    )) as Array<{ organizador: boolean; convidados: boolean }>;
    if (!organizador || !convidados) return { realizado: false, novo: false };
    const [nova] = (await qr.query(
      `INSERT INTO ${u}."encontro_realizacoes" ("encontro_id") VALUES ($1)
       ON CONFLICT ("encontro_id") DO NOTHING RETURNING "encontro_id"`,
      [encontro.id],
    )) as Array<{ encontro_id: string }>;
    return { realizado: true, novo: nova !== undefined };
  }

  private async creditarPresentes(
    qr: QueryRunner,
    encontro: EncontroParaPresenca,
    usuarioAtual: number,
    novo: boolean,
    niveis: SubidaDeNivel[],
  ) {
    const regras = await this.regrasXp.configuracoesVigentes(
      [ACAO_XP_ENCONTRO, ACAO_XP_MISSAO],
      qr,
    );
    const regra = regras.find((r) => r.acao === ACAO_XP_ENCONTRO) ?? null;
    const daMissao = regras.find((r) => r.acao === ACAO_XP_MISSAO);
    const combinaMissao =
      regra?.combinavelCom.includes(ACAO_XP_MISSAO) === true ||
      daMissao?.combinavelCom.includes(ACAO_XP_ENCONTRO) === true;
    const presentes = novo
      ? ((await qr.query(
          `SELECT "usuario_id" FROM ${this.u}."encontro_presencas"
          WHERE "encontro_id" = $1 ORDER BY "usuario_id"`,
          [encontro.id],
        )) as Array<{ usuario_id: number }>)
      : [{ usuario_id: usuarioAtual }];
    let meuGanho = null;
    for (const { usuario_id: participante } of presentes) {
      const ganho = await this.creditar(
        qr,
        encontro,
        participante,
        regra,
        daMissao ?? null,
        combinaMissao,
        niveis,
      );
      if (participante === usuarioAtual) meuGanho = ganho;
    }
    return meuGanho;
  }

  private async creditar(
    qr: QueryRunner,
    encontro: EncontroParaPresenca,
    participante: number,
    regra: RegraDeEncontro | null,
    regraMissao: RegraDeEncontro | null,
    combinaMissao: boolean,
    niveis: SubidaDeNivel[],
  ) {
    const papel =
      encontro.organizador_id === participante ? 'padrinho' : 'apadrinhado';
    await travarCarteira(qr, participante);
    const antes = await this.carteira(qr, participante);
    const missoes = await this.missoes.missoesCumpridasPorEncontro(
      qr,
      participante,
      encontro.id,
      encontro.programa,
      papel,
    );
    const chave = `encontro:${encontro.id}:usuario:${participante}`;
    const configurada =
      regra &&
      (regra.elegibilidade === 'todos' || regra.elegibilidade === papel)
        ? regra
        : null;
    const situacao = configurada
      ? await this.situacaoCredito(
          qr,
          encontro,
          participante,
          chave,
          configurada.limiteRepeticoes,
        )
      : null;
    const xpEncontro =
      situacao === 'disponivel' ? (configurada?.valorXp ?? 0) : 0;
    const uso = missoes.length
      ? await usoDoCiclo(qr, participante, encontro.programa)
      : null;
    const missaoElegivel =
      missoes.length > 0 &&
      (!regraMissao ||
        ((regraMissao.elegibilidade === 'todos' ||
          regraMissao.elegibilidade === papel) &&
          (await this.missoes.dentroDoLimiteDaRegra(
            qr,
            participante,
            encontro.programa,
            regraMissao,
          ))));
    const xpDisponivel = uso
      ? xpPrevisto(xpEncontro, 'UNICA', uso)
      : xpEncontro;
    const candidatas = uso
      ? missoes
          .map((original) => ({
            missao: { ...original, xp: regraMissao?.valorXp ?? original.xp },
            xp: missaoElegivel
              ? xpPrevisto(
                  regraMissao?.valorXp ?? original.xp,
                  original.tipo,
                  uso,
                )
              : 0,
          }))
          .sort((a, b) => b.xp - a.xp)
      : [];
    const xpMissao = candidatas[0]?.xp ?? 0;
    const pagarEncontro =
      xpEncontro > 0 && (combinaMissao || xpDisponivel >= xpMissao);
    const pagarMissao = xpMissao > 0 && (combinaMissao || !pagarEncontro);
    const ganho: GanhoCreditado | null =
      pagarEncontro && configurada
        ? await creditarGanho(qr, {
            usuarioId: participante,
            fonte: 'ENCONTRO',
            xp: configurada.valorXp,
            ciclo: encontro.programa,
            referenciaTipo: ACAO_XP_ENCONTRO,
            referenciaId: `${encontro.id}:regra:${configurada.regraId}:v${configurada.versao}`,
            descricao: 'Encontro realizado',
            chaveIdempotencia: chave,
          })
        : null;
    await this.missoes.registrarMissoesDeEncontro(
      qr,
      participante,
      encontro.id,
      candidatas.map(({ missao }) => missao),
      pagarMissao,
      regraMissao,
    );
    const depois = pagarMissao
      ? await this.carteira(qr, participante)
      : {
          saldo: ganho?.movimentacao?.saldo ?? antes.saldo,
          xpAcumulado: ganho?.movimentacao?.xpAcumulado ?? antes.xpAcumulado,
        };
    if (
      nivelDe(depois.xpAcumulado).numero > nivelDe(antes.xpAcumulado).numero
    ) {
      niveis.push({ usuarioId: participante, xpAcumulado: depois.xpAcumulado });
    }
    return {
      ...depois,
      encontro: ganho,
      xpConfigurado: configurada?.valorXp ?? 0,
      limiteAtingido: situacao === 'repeticoes' || ganho?.limitado === true,
    };
  }

  private async situacaoCredito(
    qr: QueryRunner,
    encontro: EncontroParaPresenca,
    participante: number,
    chave: string,
    limite: number | null,
  ): Promise<'disponivel' | 'creditado' | 'repeticoes'> {
    const [ja] = (await qr.query(
      `SELECT 1 FROM ${g}."xp_movimentacoes" WHERE "chave_idempotencia" = $1`,
      [chave],
    )) as unknown[];
    if (ja) return 'creditado';
    if (limite === null) return 'disponivel';
    const [{ creditados }] = (await qr.query(
      `SELECT count(*)::int AS creditados FROM ${g}."xp_movimentacoes"
       WHERE "usuario_id" = $1 AND "ciclo" = $2 AND "referencia_tipo" = $3`,
      [participante, encontro.programa, ACAO_XP_ENCONTRO],
    )) as Array<{ creditados: number }>;
    return creditados < limite ? 'disponivel' : 'repeticoes';
  }

  private async jaConfirmada(
    qr: QueryRunner,
    usuarioId: number,
    id: string,
  ): Promise<PresencaDto> {
    const u = this.u;
    const [linha] = (await qr.query(
      `SELECT p."confirmado_em", p."distancia_metros", ` +
        `(r."encontro_id" IS NOT NULL) AS "realizado", ` +
        `COALESCE(c."saldo", 0) AS "moedas", COALESCE(c."xp_acumulado", 0) AS "xp_acumulado" ` +
        `FROM ${u}."encontro_presencas" p ` +
        `LEFT JOIN ${u}."encontro_realizacoes" r ON r."encontro_id" = p."encontro_id" ` +
        `LEFT JOIN ${g}."xp_carteiras" c ON c."usuario_id" = p."usuario_id" ` +
        `WHERE p."encontro_id" = $1 AND p."usuario_id" = $2`,
      [id, usuarioId],
    )) as Array<{
      confirmado_em: Date;
      distancia_metros: number;
      realizado: boolean;
      moedas: number;
      xp_acumulado: number;
    }>;
    if (!linha) throw new NotFoundException('Encontro não encontrado.');
    return {
      encontroId: id,
      confirmadoEm: linha.confirmado_em.toISOString(),
      distanciaMetros: linha.distancia_metros,
      encontroRealizado: linha.realizado,
      xpGanho: 0,
      moedasGanhas: 0,
      xpConfigurado: 0,
      limiteAtingido: false,
      moedas: linha.moedas,
      xpAcumulado: linha.xp_acumulado,
      nivel: nivelDe(linha.xp_acumulado),
      subiuDeNivel: false,
    };
  }
}
