import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import {
  SCHEMA_GAMIFICACAO,
  schemaUsuarios,
} from '../gamificacao/gamificacao.js';
import {
  type AcessoMissoes,
  sqlMissaoAlcancavel,
  sqlMissaoCumprivel,
  sqlMissaoVisivel,
} from '../gamificacao/missoes/missoes.js';
import {
  CHAVE_MISSAO_NOVA,
  ID_NOTIFICACAO,
  LIMITE_NOTIFICACOES,
  type NotificacaoDto,
  type NotificacoesDto,
  type NovaNotificacao,
  notificacaoMissaoNova,
  notificacaoVinculo,
  prefixoVinculo,
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
    antes?: string,
  ): Promise<NotificacoesDto> {
    if (antes !== undefined) await this.exigirPropria(usuarioId, antes);
    // Busca uma a mais para saber se ainda há páginas.
    const [linhas, naoLidas] = await Promise.all([
      this.dataSource.query(
        `SELECT "id", "tipo", "titulo", "mensagem", "link", "lida_em", "criado_em" FROM ${this.tabela} n ` +
          `WHERE n."usuario_id" = $1 AND ($3::uuid IS NULL OR (n."criado_em", n."id") < ` +
          `(SELECT a."criado_em", a."id" FROM ${this.tabela} a WHERE a."id" = $3 AND a."usuario_id" = $1)) ` +
          `ORDER BY n."criado_em" DESC, n."id" DESC LIMIT $2`,
        [usuarioId, limite + 1, antes ?? null],
      ) as Promise<Linha[]>,
      this.naoLidas(usuarioId),
    ]);
    return {
      naoLidas,
      itens: linhas.slice(0, limite).map(paraDto),
      temMais: linhas.length > limite,
    };
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
    ateId?: string,
  ): Promise<{ atualizadas: number; naoLidas: number }> {
    if (ateId !== undefined) await this.exigirPropria(usuarioId, ateId);
    const linhas = linhasAtualizadas(
      await this.dataSource.query(
        `UPDATE ${this.tabela} n SET "lida_em" = now() WHERE n."usuario_id" = $1 AND n."lida_em" IS NULL ` +
          `AND ($2::uuid IS NULL OR (n."criado_em", n."id") <= ` +
          `(SELECT a."criado_em", a."id" FROM ${this.tabela} a WHERE a."id" = $2 AND a."usuario_id" = $1)) ` +
          `RETURNING n."id"`,
        [usuarioId, ateId ?? null],
      ),
    );
    return {
      atualizadas: linhas.length,
      naoLidas: await this.naoLidas(usuarioId),
    };
  }

  /** 404 para id malformado ou de outro usuário (sem revelar qual). */
  private async exigirPropria(usuarioId: number, id: string): Promise<void> {
    if (!ID_NOTIFICACAO.test(id)) {
      throw new NotFoundException('Notificação não encontrada.');
    }
    const [existe] = (await this.dataSource.query(
      `SELECT 1 FROM ${this.tabela} WHERE "id" = $1 AND "usuario_id" = $2`,
      [id, usuarioId],
    )) as unknown[];
    if (!existe) throw new NotFoundException('Notificação não encontrada.');
  }

  async criar(usuarioId: number, nova: NovaNotificacao): Promise<void> {
    try {
      await this.inserir(usuarioId, [nova]);
    } catch (erro) {
      this.logger.warn(
        `falha ao notificar usuario=${usuarioId} chave=${nova.chave}: ${(erro as Error).message}`,
      );
    }
  }

  async criarParaUsuarios(
    executor: Pick<DataSource, 'query'>,
    usuarios: readonly number[],
    nova: NovaNotificacao,
  ): Promise<void> {
    await executor.query(
      `INSERT INTO ${this.tabela} ("usuario_id", "tipo", "titulo", "mensagem", "link", "chave", "criado_em")
       SELECT usuario_id, $2, $3, $4, $5, $6, clock_timestamp()
       FROM unnest($1::int[]) AS destinatarios(usuario_id)
       ON CONFLICT ("usuario_id", "chave") DO NOTHING`,
      [usuarios, nova.tipo, nova.titulo, nova.mensagem, nova.link, nova.chave],
    );
  }

  /**
   * Para quem é conhecido pelo e-mail (participações). Sem conta ainda,
   * não há sino para avisar. Nunca derruba quem chamou.
   */
  async criarParaEmail(email: string, nova: NovaNotificacao): Promise<void> {
    try {
      const [usuario] = (await this.dataSource.query(
        `SELECT "id" FROM ${schemaUsuarios(this.dataSource)}."usuarios" WHERE lower("email") = lower($1)`,
        [email],
      )) as Array<{ id: number }>;
      if (usuario) await this.inserir(usuario.id, [nova]);
    } catch (erro) {
      this.logger.warn(
        `falha ao notificar chave=${nova.chave}: ${(erro as Error).message}`,
      );
    }
  }

  private async inserir(
    usuarioId: number,
    novas: NovaNotificacao[],
  ): Promise<void> {
    const valores = novas.map((_, i) => {
      const p = 2 + i * 5;
      return `($1, $${p}, $${p + 1}, $${p + 2}, $${p + 3}, $${p + 4})`;
    });
    await this.dataSource.query(
      `INSERT INTO ${this.tabela} ("usuario_id", "tipo", "titulo", "mensagem", "link", "chave") ` +
        `VALUES ${valores.join(', ')} ON CONFLICT ("usuario_id", "chave") DO NOTHING`,
      [
        usuarioId,
        ...novas.flatMap((n) => [
          n.tipo,
          n.titulo,
          n.mensagem,
          n.link,
          n.chave,
        ]),
      ],
    );
  }

  async sincronizarMissoes(
    usuarioId: number,
    ciclo: string,
    acesso: AcessoMissoes = { podePublicar: false, temPar: false },
  ): Promise<void> {
    const u = schemaUsuarios(this.dataSource);
    try {
      const missoes = (await this.dataSource.query(
        `SELECT m."id", m."titulo", m."xp" FROM "${SCHEMA_GAMIFICACAO}"."missoes" m ` +
          `WHERE m."ciclo" = $2 AND ${sqlMissaoVisivel('m')} AND ${sqlMissaoAlcancavel('m', acesso)} AND ${sqlMissaoCumprivel('m')} ` +
          `AND GREATEST(m."publicada_em", COALESCE(m."inicio", m."publicada_em")) >= (` +
          `SELECT min(pa."criado_em") FROM ${u}."participacoes" pa JOIN ${u}."usuarios" us ` +
          `ON lower(pa."usuario_id") = lower(us."email") WHERE us."id" = $1 AND pa."programa" = $2) ` +
          `AND NOT EXISTS (SELECT 1 FROM ${this.tabela} n WHERE n."usuario_id" = $1 AND n."chave" = $3 || m."id"::text) ` +
          `ORDER BY m."publicada_em", m."id"`,
        [usuarioId, ciclo, CHAVE_MISSAO_NOVA],
      )) as Array<{ id: string; titulo: string; xp: number }>;
      if (missoes.length > 0) {
        await this.inserir(usuarioId, missoes.map(notificacaoMissaoNova));
      }
    } catch (erro) {
      this.logger.warn(
        `falha ao avisar missões usuario=${usuarioId} ciclo=${ciclo}: ${(erro as Error).message}`,
      );
    }
  }

  /**
   * Avisa cada pessoa nova na dupla (participações em `parceiros`). Quem já
   * foi avisado não é avisado de novo; trocar de dupla no mesmo ciclo gera
   * outro aviso. Nunca derruba a leitura do sino.
   */
  async sincronizarVinculo(
    usuarioId: number,
    programa: string,
    papel: 'padrinho' | 'apadrinhado',
    parceiros: number[],
  ): Promise<void> {
    if (parceiros.length === 0) return;
    const prefixo = prefixoVinculo(programa);
    try {
      const avisados = new Set(
        (
          (await this.dataSource.query(
            `SELECT "chave" FROM ${this.tabela} WHERE "usuario_id" = $1 AND starts_with("chave", $2)`,
            [usuarioId, prefixo],
          )) as Array<{ chave: string }>
        ).map((l) => l.chave),
      );
      const novos = [...new Set(parceiros)].filter(
        (id) => !avisados.has(`${prefixo}${id}`),
      );
      if (novos.length === 0) return;
      const primeiro = avisados.size === 0 && novos.length === 1;
      await this.inserir(
        usuarioId,
        novos.map((id) => notificacaoVinculo(programa, papel, id, primeiro)),
      );
    } catch (erro) {
      this.logger.warn(
        `falha ao avisar vínculo usuario=${usuarioId} ciclo=${programa}: ${(erro as Error).message}`,
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
