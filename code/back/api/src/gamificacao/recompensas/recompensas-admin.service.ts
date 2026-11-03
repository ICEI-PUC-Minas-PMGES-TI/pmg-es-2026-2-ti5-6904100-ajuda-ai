import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { DataSource, type EntityManager } from 'typeorm';
import { SCHEMA_GAMIFICACAO, schemaUsuarios } from '../gamificacao.js';
import type {
  AjustarEstoqueDto,
  AjusteEstoqueDto,
  AtualizarRecompensaDto,
  CriarRecompensaDto,
  RecompensaAdminDto,
  RecompensaDetalheDto,
  VersaoRecompensaDto,
} from './recompensas-admin.dto.js';
import {
  CAMPOS_VERSIONADOS,
  ESTOQUE_MAX,
  REFERENCIA_RECOMPENSA,
  type PublicoRecompensa,
  type StatusRecompensa,
  type TipoAjusteEstoque,
} from './recompensas.js';

const g = `"${SCHEMA_GAMIFICACAO}"`;
const ID_RECOMPENSA =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Quem fez a operação: `usuarios.id` quando existe, e-mail do token sempre. */
export interface Responsavel {
  id: number | null;
  email: string | null;
}

interface Linha {
  id: string;
  nome: string;
  descricao: string;
  imagem_url: string | null;
  custo_xp: number;
  condicoes_retirada: string;
  estoque_ilimitado: boolean;
  estoque_total: number | null;
  estoque_comprometido: number;
  limite_por_aluno: number | null;
  publico: PublicoRecompensa;
  programa_codigo: string | null;
  disponivel_de: Date | null;
  disponivel_ate: Date | null;
  status: StatusRecompensa;
  versao: number;
  criado_por: number | null;
  criado_por_email: string | null;
  criado_em: Date;
  atualizado_em: Date;
  publicado_em: Date | null;
  arquivado_em: Date | null;
  disponivel_agora: boolean;
  transacoes: number;
}

const iso = (d: Date | null) => (d ? d.toISOString() : null);

function paraDto(l: Linha): RecompensaAdminDto {
  const ilimitado = l.estoque_ilimitado;
  return {
    id: l.id,
    nome: l.nome,
    descricao: l.descricao,
    imagemUrl: l.imagem_url,
    custoXp: l.custo_xp,
    condicoesRetirada: l.condicoes_retirada,
    estoque: {
      ilimitado,
      total: ilimitado ? null : l.estoque_total,
      comprometido: l.estoque_comprometido,
      disponivel: ilimitado
        ? null
        : Math.max(0, (l.estoque_total ?? 0) - l.estoque_comprometido),
    },
    limitePorAluno: l.limite_por_aluno,
    publico: l.publico,
    programaCodigo: l.programa_codigo,
    disponivelDe: iso(l.disponivel_de),
    disponivelAte: iso(l.disponivel_ate),
    status: l.status,
    disponivelAgora: l.disponivel_agora,
    versao: l.versao,
    transacoes: l.transacoes,
    podeExcluir: l.transacoes === 0 && l.estoque_comprometido === 0,
    criadoPor: l.criado_por,
    criadoPorEmail: l.criado_por_email,
    criadoEm: l.criado_em.toISOString(),
    atualizadoEm: l.atualizado_em.toISOString(),
    publicadoEm: iso(l.publicado_em),
    arquivadoEm: iso(l.arquivado_em),
  };
}

const SELECT =
  `SELECT r.*, ` +
  `(r."status" = 'publicada' AND (r."disponivel_de" IS NULL OR r."disponivel_de" <= now()) ` +
  `AND (r."disponivel_ate" IS NULL OR r."disponivel_ate" > now())) AS disponivel_agora, ` +
  `(SELECT count(*)::int FROM ${g}."xp_movimentacoes" m ` +
  `WHERE m."referencia_tipo" = '${REFERENCIA_RECOMPENSA}' AND m."referencia_id" = r."id"::text) AS transacoes ` +
  `FROM ${g}."recompensas" r`;

/** Valor final de um campo anulável do PATCH (`undefined` mantém o atual). */
function valorFinal<T>(
  enviado: T | null | undefined,
  atual: T | null,
): T | null {
  return enviado === undefined ? atual : enviado;
}

function texto(valor: string | null | undefined): string | null {
  if (valor === undefined || valor === null) return null;
  const t = valor.trim();
  return t ? t : null;
}

/**
 * Cadastro de recompensas da lojinha pela coordenação (F27).
 *
 * - Toda escrita trava a linha da recompensa (`FOR UPDATE`): ajustes de
 *   estoque e o resgate (F28, que também trava a linha) nunca leem o mesmo
 *   estoque; o CHECK do banco impede o total abaixo do comprometido.
 * - Mudar nome, descrição, imagem, custo ou condições cria nova versão; o
 *   resgate guarda a versão vista pelo aluno, então resgates anteriores
 *   mantêm as condições em que foram feitos.
 * - Excluir só sem transações (movimentações de XP com referência à
 *   recompensa) nem unidades comprometidas; as usadas são arquivadas.
 */
@Injectable()
export class RecompensasAdminService {
  private readonly logger = new Logger('RecompensasAdmin');

  constructor(private readonly dataSource: DataSource) {}

  async listar(status?: StatusRecompensa): Promise<RecompensaAdminDto[]> {
    const linhas = (await this.dataSource.query(
      `${SELECT} WHERE ($1::text IS NULL OR r."status" = $1) ` +
        `ORDER BY CASE r."status" WHEN 'publicada' THEN 0 WHEN 'rascunho' THEN 1 WHEN 'inativa' THEN 2 ELSE 3 END, ` +
        `lower(r."nome"), r."id"`,
      [status ?? null],
    )) as Linha[];
    return linhas.map(paraDto);
  }

  async detalhe(id: string): Promise<RecompensaDetalheDto> {
    const base = await this.buscar(this.dataSource.manager, id);
    const [versoes, ajustes] = await Promise.all([
      this.dataSource.query(
        `SELECT "versao", "nome", "descricao", "imagem_url", "custo_xp", "condicoes_retirada", "criado_por_email", "criado_em" ` +
          `FROM ${g}."recompensa_versoes" WHERE "recompensa_id" = $1 ORDER BY "versao" DESC`,
        [id],
      ) as Promise<
        Array<{
          versao: number;
          nome: string;
          descricao: string;
          imagem_url: string | null;
          custo_xp: number;
          condicoes_retirada: string;
          criado_por_email: string | null;
          criado_em: Date;
        }>
      >,
      this.dataSource.query(
        `SELECT * FROM ${g}."recompensa_estoque_ajustes" WHERE "recompensa_id" = $1 ORDER BY "id" DESC LIMIT 100`,
        [id],
      ) as Promise<
        Array<{
          id: string;
          tipo: TipoAjusteEstoque;
          quantidade: number | null;
          estoque_antes: number | null;
          estoque_depois: number | null;
          comprometido: number;
          motivo: string;
          responsavel_id: number | null;
          responsavel_email: string | null;
          criado_em: Date;
        }>
      >,
    ]);
    return {
      ...base,
      versoes: versoes.map((v): VersaoRecompensaDto => ({
        versao: v.versao,
        nome: v.nome,
        descricao: v.descricao,
        imagemUrl: v.imagem_url,
        custoXp: v.custo_xp,
        condicoesRetirada: v.condicoes_retirada,
        criadoPorEmail: v.criado_por_email,
        criadoEm: v.criado_em.toISOString(),
      })),
      ajustesEstoque: ajustes.map((a): AjusteEstoqueDto => ({
        id: String(a.id),
        tipo: a.tipo,
        quantidade: a.quantidade,
        estoqueAntes: a.estoque_antes,
        estoqueDepois: a.estoque_depois,
        comprometido: a.comprometido,
        motivo: a.motivo,
        responsavelId: a.responsavel_id,
        responsavelEmail: a.responsavel_email,
        criadoEm: a.criado_em.toISOString(),
      })),
    };
  }

  async criar(
    dados: CriarRecompensaDto,
    responsavel: Responsavel,
  ): Promise<RecompensaDetalheDto> {
    if (dados.estoqueIlimitado && dados.estoqueInicial !== undefined) {
      throw new BadRequestException(
        'estoqueInicial não se aplica a estoque ilimitado.',
      );
    }
    const de = dados.disponivelDe ?? null;
    const ate = dados.disponivelAte ?? null;
    this.exigirVigencia(de, ate);
    if (dados.publicar) this.exigirVigenciaAberta(ate);
    const programa = texto(dados.programaCodigo);
    if (programa) await this.exigirPrograma(programa);

    const nome = dados.nome.trim();
    const descricao = dados.descricao?.trim() ?? '';
    const imagem = texto(dados.imagemUrl);
    const condicoes = dados.condicoesRetirada.trim();
    const total = dados.estoqueIlimitado ? null : dados.estoqueInicial!;
    const status: StatusRecompensa = dados.publicar ? 'publicada' : 'rascunho';

    const id = await this.dataSource.transaction(async (m) => {
      const [{ id: novo }] = (await m.query(
        `INSERT INTO ${g}."recompensas" ("nome", "descricao", "imagem_url", "custo_xp", "condicoes_retirada", ` +
          `"estoque_ilimitado", "estoque_total", "limite_por_aluno", "publico", "programa_codigo", ` +
          `"disponivel_de", "disponivel_ate", "status", "publicado_em", "criado_por", "criado_por_email") ` +
          `VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13::varchar, CASE WHEN $13::varchar = 'publicada' THEN now() END, $14, $15) ` +
          `RETURNING "id"`,
        [
          nome,
          descricao,
          imagem,
          dados.custoXp,
          condicoes,
          dados.estoqueIlimitado,
          total,
          dados.limitePorAluno ?? null,
          dados.publico ?? 'todos',
          programa,
          de,
          ate,
          status,
          responsavel.id,
          responsavel.email,
        ],
      )) as Array<{ id: string }>;
      await this.gravarVersao(m, novo, 1, {
        nome,
        descricao,
        imagem,
        custo: dados.custoXp,
        condicoes,
        responsavel,
      });
      await this.gravarAjuste(m, novo, {
        tipo: dados.estoqueIlimitado ? 'ilimitado' : 'inicial',
        quantidade: total,
        antes: null,
        depois: total,
        comprometido: 0,
        motivo: 'Cadastro da recompensa',
        responsavel,
      });
      return novo;
    });
    this.logger.log(`recompensa criada id=${id} status=${status}`);
    return this.detalhe(id);
  }

  async atualizar(
    id: string,
    dados: AtualizarRecompensaDto,
    responsavel: Responsavel,
  ): Promise<RecompensaDetalheDto> {
    if (Object.values(dados).every((v) => v === undefined)) {
      throw new BadRequestException('Nada para alterar.');
    }
    if (dados.programaCodigo) await this.exigirPrograma(dados.programaCodigo);
    await this.dataSource.transaction(async (m) => {
      const atual = await this.buscar(m, id, true);
      this.exigirEditavel(atual);
      const de = valorFinal(dados.disponivelDe, atual.disponivelDe);
      const ate = valorFinal(dados.disponivelAte, atual.disponivelAte);
      this.exigirVigencia(de, ate);
      if (atual.status === 'publicada' && dados.disponivelAte !== undefined) {
        this.exigirVigenciaAberta(ate);
      }
      const novo = {
        nome: dados.nome?.trim() ?? atual.nome,
        descricao: dados.descricao?.trim() ?? atual.descricao,
        imagemUrl:
          dados.imagemUrl === undefined
            ? atual.imagemUrl
            : texto(dados.imagemUrl),
        custoXp: dados.custoXp ?? atual.custoXp,
        condicoesRetirada:
          dados.condicoesRetirada?.trim() ?? atual.condicoesRetirada,
      };
      const mudouVersao = CAMPOS_VERSIONADOS.some((c) => novo[c] !== atual[c]);
      const versao = mudouVersao ? atual.versao + 1 : atual.versao;
      await m.query(
        `UPDATE ${g}."recompensas" SET "nome" = $2, "descricao" = $3, "imagem_url" = $4, "custo_xp" = $5, ` +
          `"condicoes_retirada" = $6, "limite_por_aluno" = $7, "publico" = $8, "programa_codigo" = $9, ` +
          `"disponivel_de" = $10, "disponivel_ate" = $11, "versao" = $12, "atualizado_em" = now() WHERE "id" = $1`,
        [
          id,
          novo.nome,
          novo.descricao,
          novo.imagemUrl,
          novo.custoXp,
          novo.condicoesRetirada,
          valorFinal(dados.limitePorAluno, atual.limitePorAluno),
          dados.publico ?? atual.publico,
          dados.programaCodigo === undefined
            ? atual.programaCodigo
            : texto(dados.programaCodigo),
          de,
          ate,
          versao,
        ],
      );
      if (mudouVersao) {
        await this.gravarVersao(m, id, versao, {
          nome: novo.nome,
          descricao: novo.descricao,
          imagem: novo.imagemUrl,
          custo: novo.custoXp,
          condicoes: novo.condicoesRetirada,
          responsavel,
        });
      }
    });
    this.logger.log(
      `recompensa atualizada id=${id} campos=${Object.keys(dados).join(',')}`,
    );
    return this.detalhe(id);
  }

  /** Rascunho ou inativa → publicada. Idempotente. */
  async publicar(id: string): Promise<RecompensaDetalheDto> {
    await this.dataSource.transaction(async (m) => {
      const atual = await this.buscar(m, id, true);
      if (atual.status === 'publicada') return;
      this.exigirEditavel(atual);
      this.exigirVigenciaAberta(atual.disponivelAte);
      await m.query(
        `UPDATE ${g}."recompensas" SET "status" = 'publicada', "publicado_em" = now(), "atualizado_em" = now() WHERE "id" = $1`,
        [id],
      );
    });
    this.logger.log(`recompensa publicada id=${id}`);
    return this.detalhe(id);
  }

  /** Publicada → inativa (some da lojinha; resgates feitos continuam). */
  async desativar(id: string): Promise<RecompensaDetalheDto> {
    await this.dataSource.transaction(async (m) => {
      const atual = await this.buscar(m, id, true);
      if (atual.status === 'inativa') return;
      if (atual.status !== 'publicada') {
        throw new ConflictException(
          'Só recompensas publicadas podem ser desativadas.',
        );
      }
      await m.query(
        `UPDATE ${g}."recompensas" SET "status" = 'inativa', "atualizado_em" = now() WHERE "id" = $1`,
        [id],
      );
    });
    this.logger.log(`recompensa desativada id=${id}`);
    return this.detalhe(id);
  }

  /** Retira de vez preservando histórico. Idempotente; arquivada é só leitura. */
  async arquivar(id: string): Promise<RecompensaDetalheDto> {
    await this.dataSource.transaction(async (m) => {
      const atual = await this.buscar(m, id, true);
      if (atual.status === 'arquivada') return;
      await m.query(
        `UPDATE ${g}."recompensas" SET "status" = 'arquivada', "arquivado_em" = now(), "atualizado_em" = now() WHERE "id" = $1`,
        [id],
      );
    });
    this.logger.log(`recompensa arquivada id=${id}`);
    return this.detalhe(id);
  }

  /** Exclusão definitiva, só sem transações nem unidades comprometidas. */
  async excluir(id: string): Promise<{ excluida: true; id: string }> {
    await this.dataSource.transaction(async (m) => {
      const atual = await this.buscar(m, id, true);
      if (!atual.podeExcluir) {
        throw new ConflictException({
          message:
            'Esta recompensa já tem resgates registrados. Arquive-a para retirá-la da lojinha preservando o histórico.',
          motivo: 'recompensa-com-transacoes',
        });
      }
      await m.query(`DELETE FROM ${g}."recompensas" WHERE "id" = $1`, [id]);
    });
    this.logger.log(`recompensa excluída id=${id}`);
    return { excluida: true, id };
  }

  async ajustarEstoque(
    id: string,
    dados: AjustarEstoqueDto,
    responsavel: Responsavel,
  ): Promise<RecompensaDetalheDto> {
    await this.dataSource.transaction(async (m) => {
      const atual = await this.buscar(m, id, true);
      this.exigirEditavel(atual);
      const { ilimitado, total, comprometido } = atual.estoque;
      const q = dados.quantidade ?? null;
      let depois: number | null;
      switch (dados.tipo) {
        case 'reposicao':
          if (ilimitado) {
            throw new ConflictException(
              'Estoque ilimitado não recebe reposição.',
            );
          }
          if (!q) {
            throw new BadRequestException(
              'Reposição precisa de pelo menos 1 unidade.',
            );
          }
          depois = total! + q;
          if (depois > ESTOQUE_MAX) {
            throw new BadRequestException(
              `O estoque total não pode passar de ${ESTOQUE_MAX} unidades.`,
            );
          }
          break;
        case 'correcao':
          if (ilimitado) {
            throw new ConflictException(
              'Estoque ilimitado não tem total para corrigir; defina-o como limitado.',
            );
          }
          if (q === total) {
            throw new BadRequestException('O estoque já tem esse total.');
          }
          depois = q;
          break;
        case 'limitado':
          if (!ilimitado) {
            throw new ConflictException(
              'O estoque já é limitado; use reposição ou correção.',
            );
          }
          depois = q;
          break;
        case 'ilimitado':
          if (ilimitado) {
            throw new ConflictException('O estoque já é ilimitado.');
          }
          depois = null;
          break;
      }
      if (depois !== null && depois < comprometido) {
        throw new ConflictException({
          message: `O estoque não pode ficar abaixo das ${comprometido} unidade(s) já comprometidas com resgates.`,
          motivo: 'abaixo-do-comprometido',
        });
      }
      await m.query(
        `UPDATE ${g}."recompensas" SET "estoque_ilimitado" = $2, "estoque_total" = $3, "atualizado_em" = now() WHERE "id" = $1`,
        [id, depois === null, depois],
      );
      await this.gravarAjuste(m, id, {
        tipo: dados.tipo,
        quantidade: q,
        antes: total,
        depois,
        comprometido,
        motivo: dados.motivo.trim(),
        responsavel,
      });
    });
    this.logger.log(`estoque ajustado id=${id} tipo=${dados.tipo}`);
    return this.detalhe(id);
  }

  /* ===== apoio ===== */

  private async buscar(
    m: EntityManager,
    id: string,
    travar = false,
  ): Promise<RecompensaAdminDto> {
    if (!ID_RECOMPENSA.test(id)) {
      throw new NotFoundException('Recompensa não encontrada.');
    }
    if (travar) {
      // Trava antes de ler: a contagem de transações e o estoque lidos
      // abaixo valem até o fim da transação.
      await m.query(
        `SELECT 1 FROM ${g}."recompensas" WHERE "id" = $1 FOR UPDATE`,
        [id],
      );
    }
    const [linha] = (await m.query(`${SELECT} WHERE r."id" = $1`, [
      id,
    ])) as Linha[];
    if (!linha) throw new NotFoundException('Recompensa não encontrada.');
    return paraDto(linha);
  }

  private exigirEditavel(atual: RecompensaAdminDto): void {
    if (atual.status === 'arquivada') {
      throw new ConflictException({
        message: 'Recompensa arquivada não pode ser alterada.',
        motivo: 'recompensa-arquivada',
      });
    }
  }

  private exigirVigencia(de: string | null, ate: string | null): void {
    if (de && ate && new Date(de).getTime() >= new Date(ate).getTime()) {
      throw new BadRequestException(
        'O início da disponibilidade deve ser anterior ao fim.',
      );
    }
  }

  private exigirVigenciaAberta(ate: string | null): void {
    if (ate && new Date(ate).getTime() <= Date.now()) {
      throw new BadRequestException(
        'A vigência já terminou: ajuste a data final antes de publicar.',
      );
    }
  }

  private async exigirPrograma(codigo: string): Promise<void> {
    const [linha] = (await this.dataSource.query(
      `SELECT 1 FROM ${schemaUsuarios(this.dataSource)}."programas" WHERE "codigo" = $1`,
      [codigo.trim()],
    )) as unknown[];
    if (!linha) throw new BadRequestException('Programa não encontrado.');
  }

  private async gravarVersao(
    m: EntityManager,
    recompensaId: string,
    versao: number,
    v: {
      nome: string;
      descricao: string;
      imagem: string | null;
      custo: number;
      condicoes: string;
      responsavel: Responsavel;
    },
  ): Promise<void> {
    await m.query(
      `INSERT INTO ${g}."recompensa_versoes" ("recompensa_id", "versao", "nome", "descricao", "imagem_url", ` +
        `"custo_xp", "condicoes_retirada", "criado_por", "criado_por_email") VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        recompensaId,
        versao,
        v.nome,
        v.descricao,
        v.imagem,
        v.custo,
        v.condicoes,
        v.responsavel.id,
        v.responsavel.email,
      ],
    );
  }

  private async gravarAjuste(
    m: EntityManager,
    recompensaId: string,
    a: {
      tipo: TipoAjusteEstoque;
      quantidade: number | null;
      antes: number | null;
      depois: number | null;
      comprometido: number;
      motivo: string;
      responsavel: Responsavel;
    },
  ): Promise<void> {
    await m.query(
      `INSERT INTO ${g}."recompensa_estoque_ajustes" ("recompensa_id", "tipo", "quantidade", "estoque_antes", ` +
        `"estoque_depois", "comprometido", "motivo", "responsavel_id", "responsavel_email") ` +
        `VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        recompensaId,
        a.tipo,
        a.quantidade,
        a.antes,
        a.depois,
        a.comprometido,
        a.motivo,
        a.responsavel.id,
        a.responsavel.email,
      ],
    );
  }
}
