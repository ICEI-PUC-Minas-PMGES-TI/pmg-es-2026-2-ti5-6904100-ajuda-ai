import { randomUUID } from 'node:crypto';
import {
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { DataSource, type EntityManager } from 'typeorm';
import { schemaUsuarios } from '../gamificacao/gamificacao.js';
import { CHECKIN_ANTECEDENCIA_MIN } from '../gamificacao/missoes/missoes.js';
import { SCHEMA_MAPA } from '../mapa/postgis.js';
import {
  type NovaNotificacao,
  notificacaoConviteEncontro,
  notificacaoEncontroAlterado,
  notificacaoEncontroCancelado,
} from '../notificacoes/notificacoes.js';
import { NotificacoesService } from '../notificacoes/notificacoes.service.js';
import { ParticipacoesService } from '../participacoes/participacoes.service.js';
import type {
  CriarEncontroDto,
  EditarEncontroDto,
  ResponderConviteDto,
} from './encontros.dto.js';
import {
  type ConviteDto,
  DURACAO_ENCONTRO_MAX_HORAS,
  type EncontroDto,
  type EstadoEncontroDto,
  ID_ENCONTRO,
  type RespostaConvite,
  type TipoAlteracaoEncontro,
  recusa,
  type StatusEncontro,
  TOLERANCIA_FIM_ENCONTRO_MIN,
} from './encontros.js';

const m = `"${SCHEMA_MAPA}"`;

const ESTADO_DO_ENCONTRO =
  `jsonb_build_object('inicio', e."inicio", 'fim', e."fim", 'pucstopId', e."pucstop_id", ` +
  `'local', e."local_nome", 'descricao', e."descricao")`;

function paraIso(valor: string): string {
  return new Date(valor).toISOString();
}

function estadoDto(estado: EstadoSalvo): EstadoEncontroDto {
  return {
    inicio: paraIso(estado.inicio),
    fim: paraIso(estado.fim),
    local: { pucstopId: estado.pucstopId, nome: estado.local },
    descricao: estado.descricao,
  };
}

interface LinhaEncontro {
  id: string;
  programa: string;
  organizador_id: number;
  organizador_nome: string;
  organizador_presenca: Date | null;
  pucstop_id: string;
  pucstop_nome: string;
  pucstop_ativo: boolean;
  inicio: Date;
  fim: Date;
  descricao: string | null;
  status: StatusEncontro;
  cancelado_em: Date | null;
  realizado: boolean;
  convites: ConviteDto[];
  historico: LinhaAlteracao[];
}

interface EstadoSalvo {
  inicio: string;
  fim: string;
  pucstopId: string;
  local: string;
  descricao: string | null;
}

interface LinhaAlteracao {
  tipo: TipoAlteracaoEncontro;
  autorId: number;
  autorNome: string;
  em: string;
  anterior: EstadoSalvo;
  novo: EstadoSalvo | null;
  respostasAnteriores: Array<{
    usuarioId: number;
    nome: string;
    resposta: RespostaConvite;
    respondidoEm: string | null;
  }>;
}

interface EncontroTravado {
  id: string;
  organizador_id: number;
  pucstop_id: string;
  inicio: Date;
  fim: Date;
  descricao: string | null;
  status: StatusEncontro;
}

@Injectable()
export class EncontrosService {
  private readonly logger = new Logger('Encontros');

  constructor(
    private readonly dataSource: DataSource,
    @Optional() private readonly notificacoes?: NotificacoesService,
  ) {}

  private get u(): string {
    return schemaUsuarios(this.dataSource);
  }

  private selecao(): string {
    const u = this.u;
    return (
      `SELECT e."id", e."programa", e."organizador_id", e."pucstop_id", e."inicio", e."fim", ` +
      `e."descricao", e."status", e."cancelado_em", ` +
      `uo."nome" AS "organizador_nome", po."confirmado_em" AS "organizador_presenca", ` +
      `e."local_nome" AS "pucstop_nome", ps."ativo" AS "pucstop_ativo", ` +
      `(r."encontro_id" IS NOT NULL) AS "realizado", ` +
      `(SELECT COALESCE(jsonb_agg(jsonb_build_object(` +
      `'usuarioId', uc."id", 'nome', uc."nome", 'resposta', c."resposta", ` +
      `'respondidoEm', c."respondido_em", 'presenteEm', pc."confirmado_em"` +
      `) ORDER BY uc."nome"), '[]'::jsonb) ` +
      `FROM ${u}."encontro_convites" c ` +
      `JOIN ${u}."usuarios" uc ON uc."id" = c."apadrinhado_id" ` +
      `LEFT JOIN ${u}."encontro_presencas" pc ON pc."encontro_id" = c."encontro_id" ` +
      `AND pc."usuario_id" = c."apadrinhado_id" ` +
      `WHERE c."encontro_id" = e."id") AS "convites", ` +
      `(SELECT COALESCE(jsonb_agg(jsonb_build_object(` +
      `'tipo', a."tipo", 'autorId', a."autor_id", 'autorNome', ua."nome", 'em', a."criado_em", ` +
      `'anterior', a."anterior", 'novo', a."novo", 'respostasAnteriores', a."respostas_anteriores"` +
      `) ORDER BY a."criado_em", a."id"), '[]'::jsonb) ` +
      `FROM ${u}."encontro_alteracoes" a ` +
      `JOIN ${u}."usuarios" ua ON ua."id" = a."autor_id" ` +
      `WHERE a."encontro_id" = e."id") AS "historico" ` +
      `FROM ${u}."encontros" e ` +
      `JOIN ${u}."usuarios" uo ON uo."id" = e."organizador_id" ` +
      `JOIN ${m}."pucstops" ps ON ps."id" = e."pucstop_id" ` +
      `LEFT JOIN ${u}."encontro_realizacoes" r ON r."encontro_id" = e."id" ` +
      `LEFT JOIN ${u}."encontro_presencas" po ON po."encontro_id" = e."id" ` +
      `AND po."usuario_id" = e."organizador_id" `
    );
  }

  private filtroParticipante(): string {
    return (
      `(e."organizador_id" = $1 OR EXISTS (SELECT 1 FROM ${this.u}."encontro_convites" c ` +
      `WHERE c."encontro_id" = e."id" AND c."apadrinhado_id" = $1))`
    );
  }

  private paraDto(linha: LinhaEncontro, usuarioId: number): EncontroDto {
    const souOrganizador = linha.organizador_id === usuarioId;
    const meuConvite =
      linha.convites.find((c) => c.usuarioId === usuarioId) ?? null;
    const agendado = linha.status === 'agendado';
    return {
      id: linha.id,
      programa: linha.programa,
      organizador: {
        usuarioId: linha.organizador_id,
        nome: linha.organizador_nome,
        presenteEm: linha.organizador_presenca?.toISOString() ?? null,
      },
      local: {
        pucstopId: linha.pucstop_id,
        nome: linha.pucstop_nome,
        ativo: linha.pucstop_ativo,
      },
      inicio: linha.inicio.toISOString(),
      fim: linha.fim.toISOString(),
      descricao: linha.descricao,
      status: linha.status,
      canceladoEm: linha.cancelado_em?.toISOString() ?? null,
      convites: souOrganizador
        ? linha.convites
        : meuConvite
          ? [meuConvite]
          : [],
      realizado: linha.realizado,
      historico: linha.historico.map((a) => ({
        tipo: a.tipo,
        autor: { usuarioId: a.autorId, nome: a.autorNome },
        em: paraIso(a.em),
        anterior: estadoDto(a.anterior),
        novo: a.novo ? estadoDto(a.novo) : null,
        respostasAnteriores: a.respostasAnteriores
          .filter((r) => souOrganizador || r.usuarioId === usuarioId)
          .map((r) => ({
            ...r,
            respondidoEm: r.respondidoEm ? paraIso(r.respondidoEm) : null,
          })),
      })),
      souOrganizador,
      meuConvite,
      checkinAbre: new Date(
        linha.inicio.getTime() - CHECKIN_ANTECEDENCIA_MIN * 60_000,
      ).toISOString(),
      checkinFecha: new Date(
        linha.fim.getTime() + TOLERANCIA_FIM_ENCONTRO_MIN * 60_000,
      ).toISOString(),
      podeConfirmarPresenca:
        agendado &&
        (souOrganizador
          ? !linha.organizador_presenca
          : meuConvite?.resposta === 'aceito' && !meuConvite.presenteEm),
      podeResponder: agendado && meuConvite !== null && !meuConvite.presenteEm,
      podeRemarcar:
        agendado &&
        souOrganizador &&
        !linha.organizador_presenca &&
        !linha.convites.some((c) => c.presenteEm),
    };
  }

  async apadrinhadosVinculados(
    padrinhoId: number,
    programa = ParticipacoesService.programaAtual(),
  ): Promise<Array<{ id: number; nome: string }>> {
    const u = this.u;
    return (await this.dataSource.query(
      `SELECT DISTINCT ua."id", ua."nome" FROM ${u}."participacoes" pp ` +
        `JOIN ${u}."usuarios" up ON lower(pp."usuario_id") = lower(up."email") ` +
        `JOIN ${u}."programas" pg ON pg."codigo" = pp."programa" ` +
        `JOIN ${u}."matching_vinculos" mv ON mv."padrinho_participacao_id" = pp."id" ` +
        `AND mv."ativo" AND mv."programa_id" = pg."id" ` +
        `JOIN ${u}."participacoes" pa ON pa."id" = mv."apadrinhado_participacao_id" ` +
        `JOIN ${u}."usuarios" ua ON lower(pa."usuario_id") = lower(ua."email") ` +
        `WHERE up."id" = $1 AND pp."programa" = $2 AND pp."papel" = 'padrinho'
          AND pp."termino_em" IS NULL AND pa."termino_em" IS NULL
          ORDER BY ua."nome", ua."id"`,
      [padrinhoId, programa],
    )) as Array<{ id: number; nome: string }>;
  }

  private exigirPeriodo(inicioIso: string, fimIso: string): [Date, Date] {
    const inicio = new Date(inicioIso);
    const fim = new Date(fimIso);
    if (fim <= inicio) {
      throw recusa(
        'periodo-invalido',
        'O fim do encontro precisa ser depois do início.',
      );
    }
    if (
      fim.getTime() - inicio.getTime() >
      DURACAO_ENCONTRO_MAX_HORAS * 3_600_000
    ) {
      throw recusa(
        'periodo-invalido',
        `Um encontro pode durar no máximo ${DURACAO_ENCONTRO_MAX_HORAS} horas.`,
      );
    }
    return [inicio, fim];
  }

  private async exigirPucStopAtivo(
    executor: Pick<EntityManager, 'query'>,
    pucstopId: string,
  ): Promise<string> {
    const [pucstop] = (await executor.query(
      `SELECT "id", "ativo" FROM ${m}."pucstops" WHERE "id" = $1 FOR SHARE`,
      [pucstopId],
    )) as Array<{ id: string; ativo: boolean }>;
    if (!pucstop) throw new NotFoundException('PucStop não encontrado.');
    if (!pucstop.ativo) {
      throw recusa(
        'pucstop-inativo',
        'Escolha um PucStop ativo para o encontro.',
      );
    }
    return pucstop.id;
  }

  async criar(
    organizadorId: number,
    dados: CriarEncontroDto,
  ): Promise<EncontroDto> {
    const programa = ParticipacoesService.programaAtual();
    const [inicio, fim] = this.exigirPeriodo(dados.inicio, dados.fim);
    const u = this.u;

    const vinculados = await this.apadrinhadosVinculados(
      organizadorId,
      programa,
    );
    const foraDoVinculo = dados.apadrinhadoIds.filter(
      (id) => !vinculados.some((aluno) => aluno.id === id),
    );
    if (foraDoVinculo.length) {
      throw recusa(
        'nao-vinculado',
        'Só dá para convidar apadrinhados vinculados a você neste semestre.',
        { apadrinhadoIds: foraDoVinculo },
      );
    }

    const encontro = await this.dataSource.transaction(async (manager) => {
      const pucstopId = await this.exigirPucStopAtivo(manager, dados.pucstopId);
      const [criado] = (await manager.query(
        `INSERT INTO ${u}."encontros" ` +
          `("programa", "organizador_id", "pucstop_id", "inicio", "fim", "descricao") ` +
          `VALUES ($1, $2, $3, $4, $5, $6) RETURNING "id"`,
        [
          programa,
          organizadorId,
          pucstopId,
          inicio,
          fim,
          dados.descricao?.trim() || null,
        ],
      )) as Array<{ id: string }>;
      const valores = dados.apadrinhadoIds
        .map((_, i) => `($1, $${i + 2})`)
        .join(', ');
      await manager.query(
        `INSERT INTO ${u}."encontro_convites" ("encontro_id", "apadrinhado_id") VALUES ${valores}`,
        [criado.id, ...dados.apadrinhadoIds],
      );
      const novo = await this.detalhe(organizadorId, criado.id, manager);
      await this.avisar(
        manager,
        novo,
        dados.apadrinhadoIds,
        notificacaoConviteEncontro,
      );
      return novo;
    });

    this.logger.log(
      `encontro criado id=${encontro.id} organizador=${organizadorId} convidados=${dados.apadrinhadoIds.length}`,
    );
    return encontro;
  }

  async listar(
    usuarioId: number,
    quando: 'futuros' | 'anteriores' = 'futuros',
  ): Promise<EncontroDto[]> {
    const futuros = quando === 'futuros';
    const linhas = (await this.dataSource.query(
      `${this.selecao()} WHERE ${this.filtroParticipante()} ` +
        `AND e."fim" ${futuros ? '>=' : '<'} now() ` +
        `ORDER BY e."inicio" ${futuros ? 'ASC' : 'DESC'}`,
      [usuarioId],
    )) as LinhaEncontro[];
    return linhas.map((linha) => this.paraDto(linha, usuarioId));
  }

  async detalhe(
    usuarioId: number,
    id: string,
    executor: Pick<EntityManager, 'query'> = this.dataSource,
  ): Promise<EncontroDto> {
    if (!ID_ENCONTRO.test(id)) {
      throw new NotFoundException('Encontro não encontrado.');
    }
    const [linha] = (await executor.query(
      `${this.selecao()} WHERE e."id" = $2 AND ${this.filtroParticipante()}`,
      [usuarioId, id],
    )) as LinhaEncontro[];
    if (!linha) throw new NotFoundException('Encontro não encontrado.');
    return this.paraDto(linha, usuarioId);
  }

  private async travarComoOrganizador(
    manager: EntityManager,
    usuarioId: number,
    id: string,
  ): Promise<EncontroTravado> {
    if (!ID_ENCONTRO.test(id)) {
      throw new NotFoundException('Encontro não encontrado.');
    }
    const u = this.u;
    const [encontro] = (await manager.query(
      `SELECT "id", "organizador_id", "pucstop_id", "inicio", "fim", "descricao", "status" ` +
        `FROM ${u}."encontros" WHERE "id" = $1 FOR UPDATE`,
      [id],
    )) as EncontroTravado[];
    if (!encontro) throw new NotFoundException('Encontro não encontrado.');
    if (encontro.organizador_id !== usuarioId) {
      const [convite] = (await manager.query(
        `SELECT 1 FROM ${u}."encontro_convites" WHERE "encontro_id" = $1 AND "apadrinhado_id" = $2`,
        [id, usuarioId],
      )) as unknown[];
      if (!convite) throw new NotFoundException('Encontro não encontrado.');
      throw new ForbiddenException('Só o organizador altera este encontro.');
    }
    if (encontro.status === 'cancelado') {
      throw recusa('encontro-cancelado', 'Este encontro foi cancelado.');
    }
    return encontro;
  }

  private async estadoAtual(
    manager: EntityManager,
    id: string,
  ): Promise<{ estado: EstadoSalvo; respostas: unknown[] }> {
    const u = this.u;
    const [linha] = (await manager.query(
      `SELECT ${ESTADO_DO_ENCONTRO} AS "estado", ` +
        `(SELECT COALESCE(jsonb_agg(jsonb_build_object('usuarioId', uc."id", 'nome', uc."nome", ` +
        `'resposta', c."resposta", 'respondidoEm', c."respondido_em") ORDER BY uc."id"), '[]'::jsonb) ` +
        `FROM ${u}."encontro_convites" c JOIN ${u}."usuarios" uc ON uc."id" = c."apadrinhado_id" ` +
        `WHERE c."encontro_id" = e."id" AND c."resposta" <> 'pendente') AS "respostas" ` +
        `FROM ${u}."encontros" e WHERE e."id" = $1`,
      [id],
    )) as Array<{ estado: EstadoSalvo; respostas: unknown[] }>;
    return linha;
  }

  private async registrarAlteracao(
    manager: EntityManager,
    id: string,
    tipo: TipoAlteracaoEncontro,
    autorId: number,
    anterior: EstadoSalvo,
    respostas: unknown[],
  ): Promise<void> {
    await manager.query(
      `INSERT INTO ${this.u}."encontro_alteracoes" ` +
        `("encontro_id", "tipo", "autor_id", "anterior", "novo", "respostas_anteriores") ` +
        `SELECT e."id", $2::varchar, $3, $4::jsonb, ` +
        `CASE WHEN $2::varchar = 'cancelamento' THEN NULL ELSE ${ESTADO_DO_ENCONTRO} END, $5::jsonb ` +
        `FROM ${this.u}."encontros" e WHERE e."id" = $1`,
      [id, tipo, autorId, JSON.stringify(anterior), JSON.stringify(respostas)],
    );
  }

  private async temPresenca(
    executor: Pick<EntityManager, 'query'>,
    encontroId: string,
  ): Promise<boolean> {
    const [linha] = (await executor.query(
      `SELECT 1 FROM ${this.u}."encontro_presencas" WHERE "encontro_id" = $1 LIMIT 1`,
      [encontroId],
    )) as unknown[];
    return Boolean(linha);
  }

  async editar(
    usuarioId: number,
    id: string,
    dados: EditarEncontroDto,
  ): Promise<EncontroDto> {
    const u = this.u;
    const { encontro, reabriu } = await this.dataSource.transaction(
      async (manager) => {
        const encontro = await this.travarComoOrganizador(
          manager,
          usuarioId,
          id,
        );
        const inicioIso = dados.inicio ?? encontro.inicio.toISOString();
        const fimIso = dados.fim ?? encontro.fim.toISOString();
        const [inicio, fim] = this.exigirPeriodo(inicioIso, fimIso);
        const pucstopId = dados.pucstopId
          ? await this.exigirPucStopAtivo(manager, dados.pucstopId)
          : encontro.pucstop_id;

        const mudouQuandoOuOnde =
          inicio.getTime() !== encontro.inicio.getTime() ||
          fim.getTime() !== encontro.fim.getTime() ||
          pucstopId !== encontro.pucstop_id;
        if (mudouQuandoOuOnde && (await this.temPresenca(manager, id))) {
          throw recusa(
            'encontro-com-presenca',
            'Alguém já confirmou presença: não dá para mudar data ou local. Cancele e marque outro.',
          );
        }

        const descricao =
          dados.descricao === undefined
            ? encontro.descricao
            : dados.descricao?.trim() || null;
        const antes = await this.estadoAtual(manager, id);
        await manager.query(
          `UPDATE ${u}."encontros" SET "inicio" = $2, "fim" = $3, "pucstop_id" = $4, ` +
            `"descricao" = $5, "atualizado_em" = now() WHERE "id" = $1`,
          [id, inicio, fim, pucstopId, descricao],
        );
        if (mudouQuandoOuOnde) {
          await manager.query(
            `UPDATE ${u}."encontro_convites" SET "resposta" = 'pendente', "respondido_em" = NULL ` +
              `WHERE "encontro_id" = $1 AND "resposta" <> 'pendente'`,
            [id],
          );
        }
        if (mudouQuandoOuOnde || descricao !== encontro.descricao) {
          await this.registrarAlteracao(
            manager,
            id,
            mudouQuandoOuOnde ? 'remarcacao' : 'edicao',
            usuarioId,
            antes.estado,
            mudouQuandoOuOnde ? antes.respostas : [],
          );
        }
        const atualizado = await this.detalhe(usuarioId, id, manager);
        if (mudouQuandoOuOnde) {
          const operacao = randomUUID();
          await this.avisar(
            manager,
            atualizado,
            atualizado.convites.map((c) => c.usuarioId),
            (aviso) =>
              notificacaoEncontroAlterado(aviso, operacao, {
                inicio: new Date(antes.estado.inicio),
                local: antes.estado.local,
              }),
          );
        }
        return { encontro: atualizado, reabriu: mudouQuandoOuOnde };
      },
    );

    this.logger.log(`encontro editado id=${id} reabriu=${reabriu}`);
    return encontro;
  }

  async cancelar(
    usuarioId: number,
    id: string,
    email: string,
  ): Promise<EncontroDto> {
    const encontro = await this.dataSource.transaction(async (manager) => {
      await this.travarComoOrganizador(manager, usuarioId, id);
      const antes = await this.estadoAtual(manager, id);
      await this.registrarAlteracao(
        manager,
        id,
        'cancelamento',
        usuarioId,
        antes.estado,
        antes.respostas,
      );
      await manager.query(
        `UPDATE ${this.u}."encontros" SET "status" = 'cancelado', "cancelado_em" = now(), ` +
          `"cancelado_por" = $2, "atualizado_em" = now() WHERE "id" = $1`,
        [id, email],
      );
      const cancelado = await this.detalhe(usuarioId, id, manager);
      await this.avisar(
        manager,
        cancelado,
        cancelado.convites.map((c) => c.usuarioId),
        notificacaoEncontroCancelado,
      );
      return cancelado;
    });
    this.logger.log(`encontro cancelado id=${id} por=${email}`);
    return encontro;
  }

  async responder(
    usuarioId: number,
    id: string,
    dados: ResponderConviteDto,
  ): Promise<EncontroDto> {
    if (!ID_ENCONTRO.test(id)) {
      throw new NotFoundException('Encontro não encontrado.');
    }
    const u = this.u;
    await this.dataSource.transaction(async (manager) => {
      const [travado] = (await manager.query(
        `SELECT "id" FROM ${u}."encontros" WHERE "id" = $1 FOR UPDATE`,
        [id],
      )) as unknown[];
      if (!travado) throw new NotFoundException('Encontro não encontrado.');
      const [encontro] = (await manager.query(
        `SELECT e."status", c."resposta", ` +
          `(SELECT 1 FROM ${u}."encontro_presencas" p ` +
          `WHERE p."encontro_id" = e."id" AND p."usuario_id" = $2) AS "presenca" ` +
          `FROM ${u}."encontros" e ` +
          `JOIN ${u}."encontro_convites" c ON c."encontro_id" = e."id" AND c."apadrinhado_id" = $2 ` +
          `WHERE e."id" = $1`,
        [id, usuarioId],
      )) as Array<{
        status: StatusEncontro;
        resposta: string;
        presenca: number | null;
      }>;
      if (!encontro) throw new NotFoundException('Encontro não encontrado.');
      if (encontro.status === 'cancelado') {
        throw recusa('encontro-cancelado', 'Este encontro foi cancelado.');
      }
      if (encontro.presenca !== null) {
        throw recusa(
          'encontro-em-andamento',
          'Você já confirmou presença neste encontro: a resposta não muda mais.',
        );
      }
      await manager.query(
        `UPDATE ${u}."encontro_convites" SET "resposta" = $3, "respondido_em" = now() ` +
          `WHERE "encontro_id" = $1 AND "apadrinhado_id" = $2`,
        [id, usuarioId, dados.resposta],
      );
    });
    this.logger.log(
      `convite respondido encontro=${id} usuario=${usuarioId} resposta=${dados.resposta}`,
    );
    return this.detalhe(usuarioId, id);
  }

  private async avisar(
    executor: Pick<EntityManager, 'query'>,
    encontro: EncontroDto,
    destinatarios: number[],
    monta: (aviso: {
      id: string;
      inicio: Date;
      local: string;
    }) => NovaNotificacao,
  ): Promise<void> {
    if (!this.notificacoes || !destinatarios.length) return;
    const aviso = monta({
      id: encontro.id,
      inicio: new Date(encontro.inicio),
      local: encontro.local.nome,
    });
    await this.notificacoes.criarParaUsuarios(executor, destinatarios, aviso);
  }
}
