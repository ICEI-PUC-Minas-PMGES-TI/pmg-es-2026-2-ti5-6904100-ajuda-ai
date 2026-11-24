import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { DataSource, type EntityManager } from 'typeorm';
import { SCHEMA_MAPA } from '../../mapa/postgis.js';
import { ParticipacoesService } from '../../participacoes/participacoes.service.js';
import { SCHEMA_GAMIFICACAO, schemaUsuarios } from '../gamificacao.js';
import type {
  AtualizarMissaoDto,
  CriarMissaoDto,
  MissaoAdminDto,
} from './missoes.dto.js';
import {
  CODIGO_MISSAO,
  ID_MISSAO,
  normalizarCodigo,
  type RequisitoMissao,
  sqlMissaoVisivel,
  type TipoMissao,
  xpMaximoDe,
} from './missoes.js';
import { joinsEvento, sqlLocalEvento } from './requisitos.js';

const g = `"${SCHEMA_GAMIFICACAO}"`;
const mp = `"${SCHEMA_MAPA}"`;

interface Linha {
  id: string;
  titulo: string;
  descricao: string;
  tipo: TipoMissao;
  requisito: RequisitoMissao | null;
  quantidade: number;
  alvo_id: string | null;
  alvo_nome: string | null;
  codigo: string | null;
  xp: number;
  ativa: boolean;
  inicio: Date | null;
  fim: Date | null;
  ciclo: string;
  vigente_agora: boolean;
  conclusoes: number;
  xp_creditado_total: number;
  criado_por: number | null;
  criado_em: Date;
  atualizado_em: Date;
}

const SELECT =
  `SELECT m."id", m."titulo", m."descricao", m."tipo", m."requisito", m."quantidade", m."alvo_id", m."codigo", ` +
  `COALESCE(ps."nome", ev."titulo") AS alvo_nome, m."xp", m."ativa", m."inicio", m."fim", m."ciclo", ` +
  `(${sqlMissaoVisivel('m')}) AS vigente_agora, ` +
  `(SELECT count(*)::int FROM ${g}."missoes_conclusoes" c WHERE c."missao_id" = m."id") AS conclusoes, ` +
  `(SELECT COALESCE(sum(c."xp_creditado"), 0)::int FROM ${g}."missoes_conclusoes" c WHERE c."missao_id" = m."id") AS xp_creditado_total, ` +
  `m."criado_por", m."criado_em", m."atualizado_em" FROM ${g}."missoes" m ` +
  `LEFT JOIN ${mp}."pucstops" ps ON m."requisito" = 'PUCSTOPS' AND ps."id" = m."alvo_id" ` +
  `LEFT JOIN ${mp}."eventos" ev ON m."requisito" = 'EVENTO' AND ev."id" = m."alvo_id"`;

function paraDto(l: Linha): MissaoAdminDto {
  return {
    id: l.id,
    titulo: l.titulo,
    descricao: l.descricao,
    tipo: l.tipo,
    requisito: l.requisito,
    quantidade: l.quantidade,
    alvoId: l.alvo_id,
    alvoNome: l.alvo_nome,
    codigo: l.codigo,
    xp: l.xp,
    ativa: l.ativa,
    inicio: l.inicio?.toISOString() ?? null,
    fim: l.fim?.toISOString() ?? null,
    ciclo: l.ciclo,
    vigenteAgora: l.vigente_agora,
    conclusoes: l.conclusoes,
    xpCreditadoTotal: l.xp_creditado_total,
    criadoPor: l.criado_por,
    criadoEm: l.criado_em.toISOString(),
    atualizadoEm: l.atualizado_em.toISOString(),
  };
}

function data(valor: string | null | undefined): Date | null {
  return valor ? new Date(valor) : null;
}

function exigirRegras(
  tipo: TipoMissao,
  xp: number,
  inicio: Date | null,
  fim: Date | null,
  fimNovo: boolean,
  agora: Date,
): void {
  if (xp > xpMaximoDe(tipo)) {
    throw new BadRequestException(
      tipo === 'SEMANAL'
        ? `Missão semanal limitada a ${xpMaximoDe(tipo)} XP.`
        : `Missão limitada a ${xpMaximoDe(tipo)} XP.`,
    );
  }
  if (inicio && fim && fim <= inicio) {
    throw new BadRequestException('O fim precisa ser depois do início.');
  }
  if (fimNovo && fim && fim <= agora) {
    throw new BadRequestException('O fim precisa estar no futuro.');
  }
}

interface Requisito {
  requisito: RequisitoMissao;
  quantidade: number;
  alvoId: string | null;
  codigo: string | null;
}

function alvoInvalido(message: string): UnprocessableEntityException {
  return new UnprocessableEntityException({
    statusCode: 422,
    message,
    motivo: 'alvo-invalido',
  });
}

@Injectable()
export class MissoesAdminService {
  private readonly logger = new Logger('MissoesAdmin');

  constructor(private readonly dataSource: DataSource) {}

  async listar(
    status?: 'ativa' | 'inativa',
    ciclo = ParticipacoesService.programaAtual(),
  ): Promise<MissaoAdminDto[]> {
    const linhas = (await this.dataSource.query(
      `${SELECT} WHERE m."ciclo" = $1 AND ($2::boolean IS NULL OR m."ativa" = $2) ORDER BY m."criado_em" DESC`,
      [ciclo, status === undefined ? null : status === 'ativa'],
    )) as Linha[];
    return linhas.map(paraDto);
  }

  async detalhe(id: string): Promise<MissaoAdminDto> {
    return this.buscar(this.dataSource.manager, id, false);
  }

  async criar(
    dados: CriarMissaoDto,
    criadoPor: number | null,
    agora = new Date(),
  ): Promise<MissaoAdminDto> {
    const inicio = data(dados.inicio);
    const fim = data(dados.fim);
    exigirRegras(dados.tipo, dados.xp, inicio, fim, true, agora);
    const ciclo = ParticipacoesService.programaAtual(agora);
    await this.exigirPrograma(ciclo);
    const r = await this.validarRequisito(
      this.dataSource.manager,
      dados.tipo,
      {
        requisito: dados.requisito,
        quantidade: dados.quantidade ?? 1,
        alvoId: dados.alvoId ?? null,
        codigo: dados.codigo ?? null,
      },
      true,
    );
    const ativar = dados.ativar === true;
    const [{ id }] = (await this.dataSource.query(
      `INSERT INTO ${g}."missoes" ("titulo", "descricao", "tipo", "xp", "ativa", "inicio", "fim", "ciclo", "criado_por", "requisito", "quantidade", "alvo_id", "codigo") ` +
        `VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13) RETURNING "id"`,
      [
        dados.titulo.trim(),
        dados.descricao.trim(),
        dados.tipo,
        dados.xp,
        ativar,
        inicio,
        fim,
        ciclo,
        criadoPor,
        r.requisito,
        r.quantidade,
        r.alvoId,
        r.codigo,
      ],
    )) as Array<{ id: string }>;
    this.logger.log(
      `missao criada id=${id} requisito=${r.requisito} ativa=${ativar}`,
    );
    return this.detalhe(id);
  }

  async atualizar(
    id: string,
    dados: AtualizarMissaoDto,
    agora = new Date(),
  ): Promise<MissaoAdminDto> {
    const { atualizadoEm, ...campos } = dados;
    if (Object.values(campos).every((v) => v === undefined)) {
      throw new BadRequestException('Nada para alterar.');
    }
    await this.dataSource.transaction(async (m) => {
      const atual = await this.buscar(m, id, true);
      if (new Date(atualizadoEm).toISOString() !== atual.atualizadoEm) {
        throw new ConflictException({
          statusCode: 409,
          message:
            'Outra pessoa alterou esta missão enquanto você editava. Feche e abra de novo para ver os dados atuais.',
          motivo: 'missao-alterada',
          atualizadoEm: atual.atualizadoEm,
        });
      }
      const comConclusoes = atual.conclusoes > 0;
      if (
        comConclusoes &&
        dados.tipo !== undefined &&
        dados.tipo !== atual.tipo
      ) {
        throw new ConflictException({
          statusCode: 409,
          message:
            'Esta missão já foi concluída por alunos; o tipo não pode mudar.',
          motivo: 'missao-com-conclusoes',
        });
      }
      const requisito = dados.requisito ?? atual.requisito;
      const quantidade = dados.quantidade ?? atual.quantidade;
      const alvoId = dados.alvoId === undefined ? atual.alvoId : dados.alvoId;
      if (
        comConclusoes &&
        atual.requisito !== null &&
        (requisito !== atual.requisito ||
          quantidade !== atual.quantidade ||
          alvoId !== atual.alvoId)
      ) {
        throw new ConflictException({
          statusCode: 409,
          message:
            'Esta missão já foi concluída por alunos; o requisito não pode mudar. Crie outra missão.',
          motivo: 'missao-com-conclusoes',
        });
      }
      const tipo = dados.tipo ?? atual.tipo;
      const xp = dados.xp ?? atual.xp;
      const inicio =
        dados.inicio === undefined ? data(atual.inicio) : data(dados.inicio);
      const fim = dados.fim === undefined ? data(atual.fim) : data(dados.fim);
      exigirRegras(tipo, xp, inicio, fim, dados.fim != null, agora);
      const mudouRegra =
        requisito !== atual.requisito ||
        quantidade !== atual.quantidade ||
        alvoId !== atual.alvoId;
      const mudouCodigo = requisito === 'CODIGO' && dados.codigo !== undefined;
      const r = !requisito
        ? null
        : !mudouRegra && !mudouCodigo
          ? { requisito, quantidade, alvoId, codigo: atual.codigo }
          : await this.validarRequisito(
              m,
              tipo,
              {
                requisito,
                quantidade,
                alvoId,
                codigo:
                  dados.codigo === undefined
                    ? requisito === atual.requisito
                      ? atual.codigo
                      : null
                    : dados.codigo,
              },
              alvoId !== atual.alvoId || requisito !== atual.requisito,
            );
      await m.query(
        `UPDATE ${g}."missoes" SET "titulo" = $2, "descricao" = $3, "tipo" = $4, "xp" = $5, "inicio" = $6, "fim" = $7, ` +
          `"requisito" = $8, "quantidade" = $9, "alvo_id" = $10, "codigo" = $11, "atualizado_em" = now() WHERE "id" = $1`,
        [
          id,
          dados.titulo?.trim() ?? atual.titulo,
          dados.descricao?.trim() ?? atual.descricao,
          tipo,
          xp,
          inicio,
          fim,
          r?.requisito ?? null,
          r?.quantidade ?? 1,
          r?.alvoId ?? null,
          r?.codigo ?? null,
        ],
      );
    });
    this.logger.log(
      `missao atualizada id=${id} campos=${Object.keys(campos).join(',')}`,
    );
    return this.detalhe(id);
  }

  async definirAtiva(id: string, ativa: boolean): Promise<MissaoAdminDto> {
    await this.dataSource.transaction(async (m) => {
      const atual = await this.buscar(m, id, true);
      if (atual.ativa === ativa) return;
      if (ativa && !atual.requisito) {
        throw new UnprocessableEntityException({
          statusCode: 422,
          message:
            'Escolha como o aluno comprova esta missão (requisito) antes de ativar.',
          motivo: 'sem-requisito',
        });
      }
      if (ativa && atual.requisito) {
        await this.validarRequisito(
          m,
          atual.tipo,
          {
            requisito: atual.requisito,
            quantidade: atual.quantidade,
            alvoId: atual.alvoId,
            codigo: atual.codigo,
          },
          true,
        );
      }
      if (ativa && atual.fim && new Date(atual.fim) <= new Date()) {
        throw new UnprocessableEntityException({
          statusCode: 422,
          message:
            'O prazo desta missão já terminou. Ajuste o fim antes de ativar.',
          motivo: 'fora-do-periodo',
          fim: atual.fim,
        });
      }
      await m.query(
        `UPDATE ${g}."missoes" SET "ativa" = $2, "atualizado_em" = now() WHERE "id" = $1`,
        [id, ativa],
      );
    });
    this.logger.log(`missao ${ativa ? 'ativada' : 'desativada'} id=${id}`);
    return this.detalhe(id);
  }

  private async validarRequisito(
    m: EntityManager,
    tipo: TipoMissao,
    r: Requisito,
    alvoNovo: boolean,
  ): Promise<Requisito> {
    const { requisito, quantidade } = r;
    if (r.alvoId && requisito !== 'PUCSTOPS' && requisito !== 'EVENTO') {
      throw new BadRequestException('alvoId só vale para PucStop ou evento.');
    }
    if (r.codigo && requisito !== 'CODIGO') {
      throw new BadRequestException('codigo só vale para missão com código.');
    }
    if (
      (requisito === 'EVENTO' ||
        requisito === 'CODIGO' ||
        (requisito === 'PUCSTOPS' && r.alvoId)) &&
      quantidade !== 1
    ) {
      throw new BadRequestException(
        'Este requisito é cumprido uma vez só: quantidade deve ser 1.',
      );
    }

    if (requisito === 'CODIGO') {
      const codigo = r.codigo ? normalizarCodigo(r.codigo) : '';
      if (!CODIGO_MISSAO.test(codigo)) {
        throw new BadRequestException(
          'Código: de 4 a 20 letras, números ou hífen (ex.: CALOURO26).',
        );
      }
      return { requisito, quantidade, alvoId: null, codigo };
    }

    if (requisito === 'EVENTO') {
      if (tipo !== 'UNICA') {
        throw new BadRequestException(
          'Missão de evento é única: o evento acontece uma vez.',
        );
      }
      if (!r.alvoId) {
        throw new BadRequestException('Escolha o evento da missão (alvoId).');
      }
      const [evento] = (await m.query(
        `SELECT e."ativo", e."fim" > now() AS futuro, ${sqlLocalEvento('e')} IS NOT NULL AS tem_local ` +
          `FROM ${mp}."eventos" e ${joinsEvento('e')} WHERE e."id" = $1`,
        [r.alvoId],
      )) as Array<{ ativo: boolean; futuro: boolean; tem_local: boolean }>;
      if (!evento || !evento.ativo) {
        throw alvoInvalido('Evento não encontrado ou desativado.');
      }
      if (!evento.tem_local) {
        throw alvoInvalido(
          'O evento precisa de um local no mapa para o check-in.',
        );
      }
      if (alvoNovo && !evento.futuro) {
        throw alvoInvalido('Este evento já terminou.');
      }
      return { requisito, quantidade, alvoId: r.alvoId, codigo: null };
    }

    if (requisito === 'PUCSTOPS') {
      if (tipo !== 'UNICA') {
        throw new BadRequestException(
          'Missão de PucStop é única: cada totem é coletado uma vez por semestre.',
        );
      }
      if (r.alvoId) {
        const [ps] = (await m.query(
          `SELECT "ativo" FROM ${mp}."pucstops" WHERE "id" = $1`,
          [r.alvoId],
        )) as Array<{ ativo: boolean }>;
        if (!ps || !ps.ativo) {
          throw alvoInvalido('PucStop não encontrado ou desativado.');
        }
      } else {
        const [{ total }] = (await m.query(
          `SELECT count(*)::int AS total FROM ${mp}."pucstops" WHERE "ativo"`,
        )) as Array<{ total: number }>;
        if (quantidade > total) {
          throw alvoInvalido(
            total === 1
              ? 'Só existe 1 PucStop ativo no campus.'
              : `Só existem ${total} PucStops ativos no campus.`,
          );
        }
      }
      return { requisito, quantidade, alvoId: r.alvoId, codigo: null };
    }

    return { requisito, quantidade, alvoId: null, codigo: null };
  }

  private async exigirPrograma(ciclo: string): Promise<void> {
    const [programa] = (await this.dataSource.query(
      `SELECT 1 FROM ${schemaUsuarios(this.dataSource)}."programas" WHERE "codigo" = $1`,
      [ciclo],
    )) as unknown[];
    if (!programa) {
      throw new BadRequestException(
        `Ciclo ${ciclo} não cadastrado. A coordenação precisa abrir o ciclo em Programas.`,
      );
    }
  }

  private async buscar(
    m: EntityManager,
    id: string,
    travar: boolean,
  ): Promise<MissaoAdminDto> {
    if (!ID_MISSAO.test(id)) {
      throw new NotFoundException('Missão não encontrada.');
    }
    if (travar) {
      await m.query(`SELECT 1 FROM ${g}."missoes" WHERE "id" = $1 FOR UPDATE`, [
        id,
      ]);
    }
    const [linha] = (await m.query(`${SELECT} WHERE m."id" = $1`, [
      id,
    ])) as Linha[];
    if (!linha) throw new NotFoundException('Missão não encontrada.');
    return paraDto(linha);
  }
}
