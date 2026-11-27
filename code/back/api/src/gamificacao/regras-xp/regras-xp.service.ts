import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, type EntityManager } from 'typeorm';
import { LIMITES } from '../economia.js';
import {
  ehViolacaoUnica,
  SCHEMA_GAMIFICACAO,
  schemaUsuarios,
} from '../gamificacao.js';
import { ParticipacoesService } from '../../participacoes/participacoes.service.js';
import type { AtualizarRegraXpDto, CriarRegraXpDto } from './regras-xp.dto.js';
import type { ElegibilidadeXp, RegraXpEntity } from './regras-xp.entity.js';

const REGRAS = `"${SCHEMA_GAMIFICACAO}"."regras_xp"`;
const VERSOES = `"${SCHEMA_GAMIFICACAO}"."regras_xp_versoes"`;
const REGRA_ATUAL = `FROM ${REGRAS} r JOIN ${VERSOES} v
  ON v."regra_id" = r."id" AND v."versao" = r."versao_atual"`;
const COLUNAS_REGRA = `r."id", r."acao", r."programa", r."ativo", r."versao_atual" AS "versaoAtual",
  r."criado_por" AS "criadoPor", r."criado_em" AS "criadoEm",
  r."atualizado_em" AS "atualizadoEm", to_jsonb(v) AS "versao"`;

interface LinhaVersao {
  id: number;
  regra_id: number;
  versao: number;
  valor_xp: number;
  elegibilidade: ElegibilidadeXp;
  limite_repeticoes: number | null;
  combinavel_com: string[];
  criado_por: string | null;
  criado_em: string;
}

interface LinhaRegra extends RegraXpEntity {
  versao: LinhaVersao;
}

interface RegraTravada {
  acao: string;
  versao_atual: number;
}

interface Consulta {
  query(sql: string, parametros?: unknown[]): Promise<unknown>;
}

interface ValorVigente {
  regraId: number;
  versao: number;
  valorXp: number;
  elegibilidade: ElegibilidadeXp;
}

interface GanhoDoEvento extends ValorVigente {
  acao: string;
  limiteRepeticoes: number | null;
}

export interface RegraVigente extends GanhoDoEvento {
  combinavelCom: string[];
}

function paraVersao(linha: LinhaVersao) {
  return {
    id: linha.id,
    regraId: linha.regra_id,
    versao: linha.versao,
    valorXp: linha.valor_xp,
    elegibilidade: linha.elegibilidade,
    limiteRepeticoes: linha.limite_repeticoes,
    combinavelCom: linha.combinavel_com,
    criadoPor: linha.criado_por,
    criadoEm: new Date(linha.criado_em),
  };
}

function acaoDuplicada(): ConflictException {
  return new ConflictException({
    statusCode: 409,
    message: 'Já existe uma regra ativa para esta ação neste ciclo.',
    motivo: 'acao-duplicada',
  });
}

export function tetoDaAcao(acao: string): number {
  return acao.startsWith('MISSAO_') ? LIMITES.porMissao : LIMITES.geralPorCiclo;
}

function validarValor(acao: string, valorXp: number): void {
  const teto = tetoDaAcao(acao);
  if (valorXp > teto) {
    throw new BadRequestException([`valorXp não pode ser maior que ${teto}`]);
  }
}

function exigirId(id: number): void {
  if (!Number.isInteger(id) || id < 1 || id > 2_147_483_647) {
    throw new NotFoundException('Regra de XP não encontrada.');
  }
}

@Injectable()
export class RegrasXpService {
  private readonly logger = new Logger('RegrasXp');

  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  async listar() {
    const regras = (await this.dataSource.query(
      `SELECT ${COLUNAS_REGRA} ${REGRA_ATUAL} ORDER BY r."acao", r."programa" NULLS FIRST`,
    )) as LinhaRegra[];
    return regras.map(({ versao, ...regra }) => ({
      ...regra,
      versao: paraVersao(versao),
    }));
  }

  async detalhe(id: number) {
    exigirId(id);
    return this.detalheComManager(this.dataSource.manager, id);
  }

  async criar(dados: CriarRegraXpDto, criadoPor: string) {
    validarValor(dados.acao, dados.valorXp);
    const programa = dados.programa ?? null;
    try {
      return await this.dataSource.transaction(async (manager) => {
        if (programa) await this.exigirPrograma(manager, programa);
        const [existente] = (await manager.query(
          `SELECT "id", "ativo", "versao_atual" FROM ${REGRAS}
            WHERE "acao" = $1 AND "programa" IS NOT DISTINCT FROM $2 FOR UPDATE`,
          [dados.acao, programa],
        )) as Array<{ id: number; ativo: boolean; versao_atual: number }>;
        if (existente?.ativo) throw acaoDuplicada();
        if (existente) {
          await this.inserirVersao(
            manager,
            existente.id,
            existente.versao_atual + 1,
            dados,
            criadoPor,
          );
          return this.detalheComManager(manager, existente.id);
        }

        const [{ id }] = (await manager.query(
          `INSERT INTO ${REGRAS} ("acao", "programa", "ativo", "criado_por") VALUES ($1, $2, false, $3) RETURNING "id"`,
          [dados.acao, programa, criadoPor],
        )) as Array<{ id: number }>;
        await this.inserirVersao(manager, id, 1, dados, criadoPor);
        return this.detalheComManager(manager, id);
      });
    } catch (erro) {
      if (ehViolacaoUnica(erro, 'uq_regras_xp_acao_programa'))
        throw acaoDuplicada();
      throw erro;
    }
  }

  async atualizar(id: number, dados: AtualizarRegraXpDto, criadoPor: string) {
    exigirId(id);
    return this.dataSource.transaction(async (manager) => {
      const regra = await this.travarRegra(manager, id);
      validarValor(regra.acao, dados.valorXp);
      const [atual] = (await manager.query(
        `SELECT "limite_repeticoes", "combinavel_com" FROM ${VERSOES}
          WHERE "regra_id" = $1 AND "versao" = $2`,
        [id, regra.versao_atual],
      )) as Array<Pick<LinhaVersao, 'limite_repeticoes' | 'combinavel_com'>>;
      await this.inserirVersao(
        manager,
        id,
        regra.versao_atual + 1,
        {
          ...dados,
          limiteRepeticoes:
            dados.limiteRepeticoes === undefined
              ? atual.limite_repeticoes
              : dados.limiteRepeticoes,
          combinavelCom: dados.combinavelCom ?? atual.combinavel_com,
        },
        criadoPor,
      );
      return this.detalheComManager(manager, id);
    });
  }

  async definirAtivo(id: number, ativo: boolean) {
    exigirId(id);
    return this.dataSource.transaction(async (manager) => {
      await this.travarRegra(manager, id);
      await manager.query(
        `UPDATE ${REGRAS} SET "ativo" = $2, "atualizado_em" = now() WHERE "id" = $1`,
        [id, ativo],
      );
      this.logger.log(`regra ${id} ${ativo ? 'ativada' : 'desativada'}`);
      return this.detalheComManager(manager, id);
    });
  }

  async valorVigente(
    acao: string,
    executor: Consulta = this.dataSource,
    programa = ParticipacoesService.programaAtual(),
  ): Promise<ValorVigente | null> {
    const [regra] = await this.regrasVigentes([acao], programa, executor);
    if (!regra) return null;
    const { regraId, versao, valorXp, elegibilidade } = regra;
    return { regraId, versao, valorXp, elegibilidade };
  }

  async configuracoesVigentes(
    acoes: readonly string[],
    executor: Consulta,
    programa: string,
  ) {
    return this.regrasVigentes(acoes, programa, executor);
  }

  async selecionarGanhosDoEvento(
    acoes: readonly string[],
    programa = ParticipacoesService.programaAtual(),
  ): Promise<GanhoDoEvento[]> {
    if (!acoes.length) return [];
    const regras = await this.regrasVigentes(acoes, programa);
    regras.sort((a, b) => b.valorXp - a.valorXp || a.regraId - b.regraId);
    const selecionadas: RegraVigente[] = [];
    for (const regra of regras) {
      const combina = selecionadas.every(
        (outra) =>
          regra.combinavelCom.includes(outra.acao) ||
          outra.combinavelCom.includes(regra.acao),
      );
      if (combina) selecionadas.push(regra);
    }
    return selecionadas.map(
      ({
        acao,
        regraId,
        versao,
        valorXp,
        elegibilidade,
        limiteRepeticoes,
      }) => ({
        acao,
        regraId,
        versao,
        valorXp,
        elegibilidade,
        limiteRepeticoes,
      }),
    );
  }

  private async regrasVigentes(
    acoes: readonly string[],
    programa: string,
    executor: Consulta = this.dataSource,
  ): Promise<RegraVigente[]> {
    return (await executor.query(
      `SELECT DISTINCT ON (r."acao") r."acao", r."id" AS "regraId", v."versao",
        v."valor_xp" AS "valorXp", v."elegibilidade",
        v."limite_repeticoes" AS "limiteRepeticoes", v."combinavel_com" AS "combinavelCom"
        ${REGRA_ATUAL} WHERE r."ativo" AND r."acao" = ANY($1::varchar[])
          AND (r."programa" IS NULL OR r."programa" = $2)
        ORDER BY r."acao", (r."programa" IS NULL)`,
      [acoes, programa],
    )) as RegraVigente[];
  }

  private async exigirPrograma(
    manager: EntityManager,
    programa: string,
  ): Promise<void> {
    const [existe] = (await manager.query(
      `SELECT 1 FROM ${schemaUsuarios(this.dataSource)}."programas" WHERE "codigo" = $1`,
      [programa],
    )) as unknown[];
    if (!existe) {
      throw new NotFoundException(`Ciclo ${programa} não cadastrado.`);
    }
  }

  private async detalheComManager(manager: EntityManager, id: number) {
    const [linha] = (await manager.query(
      `SELECT ${COLUNAS_REGRA}, (
        SELECT jsonb_agg(to_jsonb(h) ORDER BY h."versao" DESC)
        FROM ${VERSOES} h WHERE h."regra_id" = r."id"
      ) AS "versoes" ${REGRA_ATUAL} WHERE r."id" = $1`,
      [id],
    )) as Array<LinhaRegra & { versoes: LinhaVersao[] }>;
    if (!linha) throw new NotFoundException('Regra de XP não encontrada.');
    const { versao, versoes, ...regra } = linha;
    return {
      ...regra,
      versao: paraVersao(versao),
      versoes: versoes.map(paraVersao),
    };
  }

  private async travarRegra(
    manager: EntityManager,
    id: number,
  ): Promise<RegraTravada> {
    const [regra] = (await manager.query(
      `SELECT "acao", "versao_atual" FROM ${REGRAS} WHERE "id" = $1 FOR UPDATE`,
      [id],
    )) as RegraTravada[];
    if (!regra) throw new NotFoundException('Regra de XP não encontrada.');
    return regra;
  }

  private async inserirVersao(
    manager: EntityManager,
    regraId: number,
    versao: number,
    dados: AtualizarRegraXpDto,
    criadoPor: string,
  ): Promise<void> {
    await manager.query(
      `INSERT INTO ${VERSOES} ("regra_id", "versao", "valor_xp", "elegibilidade",
        "limite_repeticoes", "combinavel_com", "criado_por")
        VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7)`,
      [
        regraId,
        versao,
        dados.valorXp,
        dados.elegibilidade,
        dados.limiteRepeticoes ?? null,
        JSON.stringify(dados.combinavelCom ?? []),
        criadoPor,
      ],
    );
    await manager.query(
      `UPDATE ${REGRAS} SET "versao_atual" = $2, "atualizado_em" = now() WHERE "id" = $1`,
      [regraId, versao],
    );
    this.logger.log(
      `regra ${regraId} versao=${versao} xp=${dados.valorXp} elegibilidade=${dados.elegibilidade} por=${criadoPor}`,
    );
  }
}
