import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { DataSource, type EntityManager } from 'typeorm';
import { ParticipacoesService } from '../../participacoes/participacoes.service.js';
import { SCHEMA_GAMIFICACAO } from '../gamificacao.js';
import type {
  AtualizarMissaoDto,
  CriarMissaoDto,
  MissaoAdminDto,
} from './missoes.dto.js';
import {
  ID_MISSAO,
  sqlMissaoVisivel,
  type TipoMissao,
  xpMaximoDe,
} from './missoes.js';

const g = `"${SCHEMA_GAMIFICACAO}"`;

interface Linha {
  id: string;
  titulo: string;
  descricao: string;
  tipo: TipoMissao;
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
  `SELECT m."id", m."titulo", m."descricao", m."tipo", m."xp", m."ativa", m."inicio", m."fim", m."ciclo", ` +
  `(${sqlMissaoVisivel('m')}) AS vigente_agora, ` +
  `(SELECT count(*)::int FROM ${g}."missoes_conclusoes" c WHERE c."missao_id" = m."id") AS conclusoes, ` +
  `(SELECT COALESCE(sum(c."xp_creditado"), 0)::int FROM ${g}."missoes_conclusoes" c WHERE c."missao_id" = m."id") AS xp_creditado_total, ` +
  `m."criado_por", m."criado_em", m."atualizado_em" FROM ${g}."missoes" m`;

function paraDto(l: Linha): MissaoAdminDto {
  return {
    id: l.id,
    titulo: l.titulo,
    descricao: l.descricao,
    tipo: l.tipo,
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
    const ativar = dados.ativar === true;
    const [{ id }] = (await this.dataSource.query(
      `INSERT INTO ${g}."missoes" ("titulo", "descricao", "tipo", "xp", "ativa", "inicio", "fim", "ciclo", "criado_por") ` +
        `VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING "id"`,
      [
        dados.titulo.trim(),
        dados.descricao.trim(),
        dados.tipo,
        dados.xp,
        ativar,
        inicio,
        fim,
        ParticipacoesService.programaAtual(agora),
        criadoPor,
      ],
    )) as Array<{ id: string }>;
    this.logger.log(`missao criada id=${id} ativa=${ativar}`);
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
      if (
        dados.tipo !== undefined &&
        dados.tipo !== atual.tipo &&
        atual.conclusoes > 0
      ) {
        throw new ConflictException({
          statusCode: 409,
          message:
            'Esta missão já foi concluída por alunos; o tipo não pode mudar.',
          motivo: 'missao-com-conclusoes',
        });
      }
      const tipo = dados.tipo ?? atual.tipo;
      const xp = dados.xp ?? atual.xp;
      const inicio =
        dados.inicio === undefined ? data(atual.inicio) : data(dados.inicio);
      const fim = dados.fim === undefined ? data(atual.fim) : data(dados.fim);
      exigirRegras(tipo, xp, inicio, fim, dados.fim != null, agora);
      await m.query(
        `UPDATE ${g}."missoes" SET "titulo" = $2, "descricao" = $3, "tipo" = $4, "xp" = $5, "inicio" = $6, "fim" = $7, ` +
          `"atualizado_em" = now() WHERE "id" = $1`,
        [
          id,
          dados.titulo?.trim() ?? atual.titulo,
          dados.descricao?.trim() ?? atual.descricao,
          tipo,
          xp,
          inicio,
          fim,
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
