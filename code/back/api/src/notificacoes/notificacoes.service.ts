import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import {
  SCHEMA_GAMIFICACAO,
  schemaUsuarios,
} from '../gamificacao/gamificacao.js';
import { sqlMissaoVisivel } from '../gamificacao/missoes/missoes.js';
import {
  CHAVE_MISSAO_NOVA,
  ID_NOTIFICACAO,
  LIMITE_NOTIFICACOES,
  type NotificacaoDto,
  type NotificacoesDto,
  type NovaNotificacao,
  notificacaoMissaoNova,
  type TipoNotificacao,
} from './notificacoes.js';

interface Linha {
  id: string;
  tipo: TipoNotificacao;
  titulo: string;
  mensagem: string;
  link: string | null;
  lida_em: Date | null;
  criado_em: Date;
}

function paraDto(l: Linha): NotificacaoDto {
  return {
    id: l.id,
    tipo: l.tipo,
    titulo: l.titulo,
    mensagem: l.mensagem,
    link: l.link,
    lida: l.lida_em !== null,
    lidaEm: l.lida_em?.toISOString() ?? null,
    criadoEm: l.criado_em.toISOString(),
  };
}

@Injectable()
export class NotificacoesService {
  private readonly logger = new Logger('Notificacoes');

  constructor(private readonly dataSource: DataSource) {}

  private get tabela(): string {
    return `${schemaUsuarios(this.dataSource)}."notificacoes"`;
  }

  async listar(
    usuarioId: number,
    limite: number = LIMITE_NOTIFICACOES.padrao,
  ): Promise<NotificacoesDto> {
    const [itens, naoLidas] = await Promise.all([
      this.dataSource.query(
        `SELECT "id", "tipo", "titulo", "mensagem", "link", "lida_em", "criado_em" FROM ${this.tabela} ` +
          `WHERE "usuario_id" = $1 ORDER BY "criado_em" DESC, "id" DESC LIMIT $2`,
        [usuarioId, limite],
      ) as Promise<Linha[]>,
      this.naoLidas(usuarioId),
    ]);
    return { naoLidas, itens: itens.map(paraDto) };
  }

  async marcarLida(
    usuarioId: number,
    id: string,
  ): Promise<{ id: string; lida: true; lidaEm: string; naoLidas: number }> {
    if (!ID_NOTIFICACAO.test(id)) {
      throw new NotFoundException('Notificação não encontrada.');
    }
    const [registro] = linhasAtualizadas<{ id: string; lida_em: Date }>(
      await this.dataSource.query(
        `UPDATE ${this.tabela} SET "lida_em" = COALESCE("lida_em", now()) ` +
          `WHERE "id" = $1 AND "usuario_id" = $2 RETURNING "id", "lida_em"`,
        [id, usuarioId],
      ),
    );
    if (!registro) throw new NotFoundException('Notificação não encontrada.');
    return {
      id: registro.id,
      lida: true,
      lidaEm: registro.lida_em.toISOString(),
      naoLidas: await this.naoLidas(usuarioId),
    };
  }

  async marcarTodas(
    usuarioId: number,
  ): Promise<{ atualizadas: number; naoLidas: number }> {
    const linhas = linhasAtualizadas(
      await this.dataSource.query(
        `UPDATE ${this.tabela} SET "lida_em" = now() WHERE "usuario_id" = $1 AND "lida_em" IS NULL RETURNING "id"`,
        [usuarioId],
      ),
    );
    return { atualizadas: linhas.length, naoLidas: 0 };
  }

  async criar(usuarioId: number, nova: NovaNotificacao): Promise<void> {
    try {
      await this.dataSource.query(
        `INSERT INTO ${this.tabela} ("usuario_id", "tipo", "titulo", "mensagem", "link", "chave") ` +
          `VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT ("usuario_id", "chave") DO NOTHING`,
        [
          usuarioId,
          nova.tipo,
          nova.titulo,
          nova.mensagem,
          nova.link,
          nova.chave,
        ],
      );
    } catch (erro) {
      this.logger.warn(
        `falha ao notificar usuario=${usuarioId} chave=${nova.chave}: ${(erro as Error).message}`,
      );
    }
  }

  async sincronizarMissoes(usuarioId: number, ciclo: string): Promise<void> {
    try {
      const missoes = (await this.dataSource.query(
        `SELECT m."id", m."titulo", m."xp" FROM "${SCHEMA_GAMIFICACAO}"."missoes" m ` +
          `WHERE m."ciclo" = $2 AND ${sqlMissaoVisivel('m')} ` +
          `AND NOT EXISTS (SELECT 1 FROM ${this.tabela} n WHERE n."usuario_id" = $1 AND n."chave" = $3 || m."id"::text) ` +
          `ORDER BY m."criado_em", m."id"`,
        [usuarioId, ciclo, CHAVE_MISSAO_NOVA],
      )) as Array<{ id: string; titulo: string; xp: number }>;
      for (const missao of missoes) {
        await this.criar(usuarioId, notificacaoMissaoNova(missao));
      }
    } catch (erro) {
      this.logger.warn(
        `falha ao avisar missões usuario=${usuarioId} ciclo=${ciclo}: ${(erro as Error).message}`,
      );
    }
  }

  private async naoLidas(usuarioId: number): Promise<number> {
    const [{ total }] = (await this.dataSource.query(
      `SELECT count(*)::int AS total FROM ${this.tabela} WHERE "usuario_id" = $1 AND "lida_em" IS NULL`,
      [usuarioId],
    )) as Array<{ total: number }>;
    return Number(total);
  }
}

function linhasAtualizadas<T = unknown>(resultado: unknown): T[] {
  if (!Array.isArray(resultado)) return [];
  if (
    resultado.length === 2 &&
    Array.isArray(resultado[0]) &&
    typeof resultado[1] === 'number'
  ) {
    return resultado[0] as T[];
  }
  return resultado as T[];
}
