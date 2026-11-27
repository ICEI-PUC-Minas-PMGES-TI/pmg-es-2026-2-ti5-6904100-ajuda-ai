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
  AtualizarConquistaDto,
  ConquistaAdminDto,
  CriarConquistaDto,
  CriterioDto,
} from './conquistas.dto.js';
import {
  CRITERIOS_CONQUISTA,
  type CriterioConquista,
  DEFINICAO_CRITERIOS,
  estadoDaConquista,
  type EstadoConquista,
  ID_CONQUISTA,
  problemaDaRegra,
  type PublicoConquista,
  textoCriterio,
} from './conquistas.js';

const g = `"${SCHEMA_GAMIFICACAO}"`;

interface Linha {
  id: string;
  nome: string;
  descricao: string;
  imagem_url: string | null;
  criterio: CriterioConquista;
  meta: number;
  publico: PublicoConquista;
  programa_codigo: string | null;
  xp: number;
  ativa: boolean;
  publicada_em: Date | null;
  desbloqueios: number;
  criado_por: number | null;
  criado_em: Date;
  atualizado_em: Date;
}

const SELECT =
  `SELECT c."id", c."nome", c."descricao", c."imagem_url", c."criterio", c."meta", c."publico", c."programa_codigo", ` +
  `c."xp", c."ativa", c."publicada_em", c."criado_por", c."criado_em", c."atualizado_em", ` +
  `(SELECT count(*)::int FROM ${g}."conquistas_desbloqueios" d WHERE d."conquista_id" = c."id") AS desbloqueios ` +
  `FROM ${g}."conquistas" c`;

function paraDto(l: Linha): ConquistaAdminDto {
  return {
    id: l.id,
    nome: l.nome,
    descricao: l.descricao,
    imagemUrl: l.imagem_url,
    criterio: l.criterio,
    criterioTexto: textoCriterio(l.criterio, l.meta),
    meta: l.meta,
    publico: l.publico,
    programaCodigo: l.programa_codigo,
    xp: l.xp,
    estado: estadoDaConquista(l.ativa, l.publicada_em),
    publicadaEm: l.publicada_em?.toISOString() ?? null,
    desbloqueios: l.desbloqueios,
    podeExcluir: l.desbloqueios === 0,
    criadoPor: l.criado_por,
    criadoEm: l.criado_em.toISOString(),
    atualizadoEm: l.atualizado_em.toISOString(),
  };
}

function regraInvalida(mensagem: string): BadRequestException {
  return new BadRequestException({
    statusCode: 400,
    message: mensagem,
    motivo: 'regra-invalida',
  });
}

/** Campos que valem como o aluno viu: congelados depois da 1ª publicação. */
const CONGELADOS = ['criterio', 'meta', 'publico', 'programaCodigo', 'xp'] as const;

function jaPublicada(campos: string[]): ConflictException {
  return new ConflictException({
    statusCode: 409,
    message:
      'Esta conquista já foi publicada: critério, meta, público, programa e XP ficam como os alunos viram. ' +
      'Ainda dá para mudar nome, descrição e imagem. Para mudar o resto, arquive e crie outra.',
    motivo: 'conquista-publicada',
    campos,
  });
}

@Injectable()
export class ConquistasAdminService {
  private readonly logger = new Logger('ConquistasAdmin');

  constructor(private readonly dataSource: DataSource) {}

  /** Condições suportadas, para o formulário da coordenação. */
  criterios(): CriterioDto[] {
    return CRITERIOS_CONQUISTA.map((c) => ({ ...DEFINICAO_CRITERIOS[c] }));
  }

  async listar(estado?: EstadoConquista): Promise<ConquistaAdminDto[]> {
    const filtro = {
      rascunho: `WHERE NOT c."ativa" AND c."publicada_em" IS NULL`,
      publicada: `WHERE c."ativa"`,
      arquivada: `WHERE NOT c."ativa" AND c."publicada_em" IS NOT NULL`,
    } as const;
    const linhas = (await this.dataSource.query(
      `${SELECT} ${estado ? filtro[estado] : ''} ORDER BY c."criado_em" DESC`,
    )) as Linha[];
    return linhas.map(paraDto);
  }

  async detalhe(id: string): Promise<ConquistaAdminDto> {
    return this.buscar(this.dataSource.manager, id, false);
  }

  async criar(
    dados: CriarConquistaDto,
    criadoPor: number | null,
  ): Promise<ConquistaAdminDto> {
    const publico = dados.publico ?? 'TODOS';
    const xp = dados.xp ?? 0;
    const problema = problemaDaRegra({
      criterio: dados.criterio,
      meta: dados.meta,
      publico,
      xp,
    });
    if (problema) throw regraInvalida(problema);
    const programa = dados.programaCodigo ?? null;
    await this.exigirPrograma(this.dataSource.manager, programa);
    const publicar = dados.publicar === true;
    const [{ id }] = (await this.dataSource.query(
      `INSERT INTO ${g}."conquistas" ("nome", "descricao", "imagem_url", "criterio", "meta", "publico", "programa_codigo", "xp", "ativa", "publicada_em", "criado_por") ` +
        `VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, CASE WHEN $9 THEN now() END, $10) RETURNING "id"`,
      [
        dados.nome.trim(),
        dados.descricao.trim(),
        dados.imagemUrl?.trim() || null,
        dados.criterio,
        dados.meta,
        publico,
        programa,
        xp,
        publicar,
        criadoPor,
      ],
    )) as Array<{ id: string }>;
    this.logger.log(
      `conquista criada id=${id} criterio=${dados.criterio} meta=${dados.meta} publicada=${publicar}`,
    );
    return this.detalhe(id);
  }

  async atualizar(
    id: string,
    dados: AtualizarConquistaDto,
  ): Promise<ConquistaAdminDto> {
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
            'Outra pessoa alterou esta conquista enquanto você editava. Feche e abra de novo para ver os dados atuais.',
          motivo: 'conquista-alterada',
          atualizadoEm: atual.atualizadoEm,
        });
      }
      const novo = {
        criterio: dados.criterio ?? atual.criterio,
        meta: dados.meta ?? atual.meta,
        publico: dados.publico ?? atual.publico,
        programaCodigo:
          dados.programaCodigo === undefined
            ? atual.programaCodigo
            : dados.programaCodigo,
        xp: dados.xp ?? atual.xp,
      };
      if (atual.publicadaEm) {
        const mudaram = CONGELADOS.filter((c) => novo[c] !== atual[c]);
        if (mudaram.length) throw jaPublicada([...mudaram]);
      }
      const problema = problemaDaRegra(novo);
      if (problema) throw regraInvalida(problema);
      if (novo.programaCodigo !== atual.programaCodigo) {
        await this.exigirPrograma(m, novo.programaCodigo);
      }
      await m.query(
        `UPDATE ${g}."conquistas" SET "nome" = $2, "descricao" = $3, "imagem_url" = $4, "criterio" = $5, "meta" = $6, ` +
          `"publico" = $7, "programa_codigo" = $8, "xp" = $9, "atualizado_em" = now() WHERE "id" = $1`,
        [
          id,
          dados.nome?.trim() ?? atual.nome,
          dados.descricao?.trim() ?? atual.descricao,
          dados.imagemUrl === undefined
            ? atual.imagemUrl
            : dados.imagemUrl?.trim() || null,
          novo.criterio,
          novo.meta,
          novo.publico,
          novo.programaCodigo,
          novo.xp,
        ],
      );
    });
    this.logger.log(`conquista atualizada id=${id}`);
    return this.detalhe(id);
  }

  /**
   * Publica (idempotente). `publicada_em` guarda a primeira publicação e
   * nunca é sobrescrito: republicar uma arquivada mantém a mesma regra.
   */
  async publicar(id: string): Promise<ConquistaAdminDto> {
    await this.dataSource.transaction(async (m) => {
      const atual = await this.buscar(m, id, true);
      if (atual.estado === 'publicada') return;
      await this.exigirPrograma(m, atual.programaCodigo);
      await m.query(
        `UPDATE ${g}."conquistas" SET "ativa" = true, "publicada_em" = COALESCE("publicada_em", now()), "atualizado_em" = now() WHERE "id" = $1`,
        [id],
      );
    });
    this.logger.log(`conquista publicada id=${id}`);
    return this.detalhe(id);
  }

  /** Arquiva (idempotente): sai da vitrine; quem já obteve continua com ela. */
  async arquivar(id: string): Promise<ConquistaAdminDto> {
    await this.dataSource.transaction(async (m) => {
      const atual = await this.buscar(m, id, true);
      if (atual.estado !== 'publicada') {
        if (atual.estado === 'rascunho') {
          throw new ConflictException({
            statusCode: 409,
            message: 'Rascunho não é arquivado: exclua ou publique.',
            motivo: 'conquista-rascunho',
          });
        }
        return;
      }
      await m.query(
        `UPDATE ${g}."conquistas" SET "ativa" = false, "atualizado_em" = now() WHERE "id" = $1`,
        [id],
      );
    });
    this.logger.log(`conquista arquivada id=${id}`);
    return this.detalhe(id);
  }

  /** Só sem uso (nenhum desbloqueio). Com uso, arquive. */
  async excluir(id: string): Promise<void> {
    await this.dataSource.transaction(async (m) => {
      const atual = await this.buscar(m, id, true);
      if (atual.desbloqueios > 0) {
        throw new ConflictException({
          statusCode: 409,
          message:
            'Esta conquista já foi obtida por alunos e não pode ser excluída. Arquive para tirá-la da vitrine.',
          motivo: 'conquista-em-uso',
          desbloqueios: atual.desbloqueios,
        });
      }
      await m.query(`DELETE FROM ${g}."conquistas" WHERE "id" = $1`, [id]);
    });
    this.logger.log(`conquista excluida id=${id}`);
  }

  private async exigirPrograma(
    m: EntityManager,
    codigo: string | null,
  ): Promise<void> {
    if (codigo === null) return;
    const [programa] = (await m.query(
      `SELECT 1 FROM ${schemaUsuarios(this.dataSource)}."programas" WHERE "codigo" = $1`,
      [codigo],
    )) as unknown[];
    if (!programa) {
      throw regraInvalida(
        `Programa ${codigo} não existe. Escolha um ciclo cadastrado em Programas ou deixe para todos os ciclos.`,
      );
    }
  }

  private async buscar(
    m: EntityManager,
    id: string,
    travar: boolean,
  ): Promise<ConquistaAdminDto> {
    if (!ID_CONQUISTA.test(id)) {
      throw new NotFoundException('Conquista não encontrada.');
    }
    if (travar) {
      await m.query(
        `SELECT 1 FROM ${g}."conquistas" WHERE "id" = $1 FOR UPDATE`,
        [id],
      );
    }
    const [linha] = (await m.query(`${SELECT} WHERE c."id" = $1`, [
      id,
    ])) as Linha[];
    if (!linha) throw new NotFoundException('Conquista não encontrada.');
    return paraDto(linha);
  }
}
