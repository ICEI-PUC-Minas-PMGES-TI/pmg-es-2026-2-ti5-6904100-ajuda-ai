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
  estadoDaMissao,
  ID_MISSAO,
  normalizarCodigo,
  type PublicoMissao,
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
  instrucoes?: string | null;
  tipo: TipoMissao;
  publico?: PublicoMissao;
  requisito: RequisitoMissao | null;
  quantidade: number;
  alvo_id: string | null;
  alvo_nome: string | null;
  pontos?: Array<{ id: string; nome: string | null; ativo: boolean }> | null;
  codigo: string | null;
  codigo_liberado_ate?: Date | null;
  xp: number;
  ativa: boolean;
  publicada_em?: Date | null;
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
  `SELECT m."id", m."titulo", m."descricao", m."instrucoes", m."tipo", m."publico", m."requisito", m."quantidade", m."alvo_id", m."codigo", ` +
  `CASE WHEN m."codigo_liberado_ate" > now() THEN m."codigo_liberado_ate" END AS codigo_liberado_ate, ` +
  `ev."titulo" AS alvo_nome, ` +
  `(SELECT json_agg(json_build_object('id', o."id", 'nome', ps."nome", 'ativo', COALESCE(ps."ativo", false)) ORDER BY o."n") ` +
  `FROM unnest(m."pucstops") WITH ORDINALITY AS o("id", "n") LEFT JOIN ${mp}."pucstops" ps ON ps."id" = o."id") AS pontos, ` +
  `m."xp", m."ativa", m."publicada_em", m."inicio", m."fim", m."ciclo", ` +
  `(${sqlMissaoVisivel('m')}) AS vigente_agora, ` +
  `(SELECT count(*)::int FROM ${g}."missoes_conclusoes" c WHERE c."missao_id" = m."id") AS conclusoes, ` +
  `(SELECT COALESCE(sum(c."xp_creditado"), 0)::int FROM ${g}."missoes_conclusoes" c WHERE c."missao_id" = m."id") AS xp_creditado_total, ` +
  `m."criado_por", m."criado_em", m."atualizado_em" FROM ${g}."missoes" m ` +
  `LEFT JOIN ${mp}."eventos" ev ON m."requisito" = 'EVENTO' AND ev."id" = m."alvo_id"`;

function paraDto(l: Linha): MissaoAdminDto {
  const publicadaEm = l.publicada_em ?? null;
  return {
    id: l.id,
    titulo: l.titulo,
    descricao: l.descricao,
    instrucoes: l.instrucoes ?? null,
    tipo: l.tipo,
    publico: l.publico ?? 'TODOS',
    requisito: l.requisito,
    quantidade: l.quantidade,
    alvoId: l.alvo_id,
    alvoNome: l.alvo_nome,
    pontos: l.pontos ?? [],
    codigo: l.codigo,
    codigoLiberadoAte: l.codigo_liberado_ate?.toISOString() ?? null,
    xp: l.xp,
    ativa: l.ativa,
    estado: estadoDaMissao(l.ativa, publicadaEm),
    publicadaEm: publicadaEm?.toISOString() ?? null,
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

function texto(valor: string | null | undefined): string | null {
  return valor?.trim() || null;
}

function unicos(pontos: string[]): string[] {
  return [...new Set(pontos.map((p) => p.toLowerCase()))];
}

function mesmosPontos(a: string[] | null, b: string[] | null): boolean {
  if (!a || !b) return a === b;
  const conjunto = new Set(a);
  return a.length === b.length && b.every((p) => conjunto.has(p));
}

/**
 * Antes da F22 a missão de PucStop tinha um ponto só, em `alvoId`. O
 * cliente antigo continua mandando assim; vira a lista de um ponto.
 */
function pontosPedidos(
  requisito: RequisitoMissao | null,
  alvoId: string | null | undefined,
  alvoIds: string[] | null | undefined,
): { alvoId: string | null | undefined; pontos: string[] | null | undefined } {
  if (requisito !== 'PUCSTOPS' || alvoId === undefined) {
    return { alvoId, pontos: alvoIds };
  }
  // Cliente novo manda a regra inteira: alvoId nulo e os pontos em alvoIds.
  if (alvoId === null) return { alvoId: undefined, pontos: alvoIds ?? null };
  if (alvoIds) {
    throw new BadRequestException(
      'Escolha os PucStops só em alvoIds (alvoId é do evento).',
    );
  }
  return { alvoId: undefined, pontos: [alvoId] };
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
  pontos: string[] | null;
  codigo: string | null;
}

function alvoInvalido(message: string): UnprocessableEntityException {
  return new UnprocessableEntityException({
    statusCode: 422,
    message,
    motivo: 'alvo-invalido',
  });
}

function jaPublicada(campos: string[]): ConflictException {
  return new ConflictException({
    statusCode: 409,
    message:
      'Esta missão já foi publicada: objetivo, meta, pontos, público, tipo, início e XP ficam como os alunos viram. ' +
      'Ainda dá para mudar título, descrição, instruções e código, e prorrogar o prazo. Para mudar o resto, arquive e crie outra.',
    motivo: 'missao-publicada',
    campos,
  });
}

/** Encurtar o prazo (ou criar um onde não havia) tira tempo de quem já está fazendo. */
function prazoSoProrroga(): ConflictException {
  return new ConflictException({
    statusCode: 409,
    message:
      'Esta missão já foi publicada: o prazo só pode ser prorrogado. Para encerrar antes, arquive a missão.',
    motivo: 'missao-publicada',
    campos: ['fim'],
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
    const pedido = pontosPedidos(dados.requisito, dados.alvoId, dados.alvoIds);
    const pontos = pedido.pontos ? unicos(pedido.pontos) : null;
    const publico = dados.publico ?? 'TODOS';
    const r = await this.validarRequisito(
      this.dataSource.manager,
      dados.tipo,
      publico,
      {
        requisito: dados.requisito,
        quantidade: dados.quantidade ?? pontos?.length ?? 1,
        alvoId: pedido.alvoId ?? null,
        pontos,
        codigo: dados.codigo ?? null,
      },
      true,
    );
    const ativar = dados.ativar === true;
    const [{ id }] = (await this.dataSource.query(
      `INSERT INTO ${g}."missoes" ("titulo", "descricao", "tipo", "xp", "ativa", "inicio", "fim", "ciclo", "criado_por", "requisito", "quantidade", "alvo_id", "codigo", "instrucoes", "publico", "pucstops", "publicada_em") ` +
        `VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16::uuid[], CASE WHEN $5 THEN now() END) RETURNING "id"`,
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
        texto(dados.instrucoes),
        publico,
        r.pontos,
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
      const requisito = dados.requisito ?? atual.requisito;
      const mudouRequisito = requisito !== atual.requisito;
      const pedido = pontosPedidos(requisito, dados.alvoId, dados.alvoIds);
      const pontosAtuais = atual.pontos.length
        ? atual.pontos.map((p) => p.id)
        : null;
      const pontos =
        pedido.pontos !== undefined
          ? pedido.pontos && unicos(pedido.pontos)
          : mudouRequisito
            ? null
            : pontosAtuais;
      const alvoId =
        pedido.alvoId !== undefined
          ? pedido.alvoId
          : mudouRequisito
            ? null
            : atual.alvoId;
      const quantidade =
        dados.quantidade ??
        (pedido.pontos !== undefined && pontos
          ? pontos.length
          : atual.quantidade);
      const tipo = dados.tipo ?? atual.tipo;
      const xp = dados.xp ?? atual.xp;
      const publico = dados.publico ?? atual.publico;
      const inicio =
        dados.inicio === undefined ? data(atual.inicio) : data(dados.inicio);
      const fimAtual = data(atual.fim);
      const fim = dados.fim === undefined ? fimAtual : data(dados.fim);
      const mudouPontos = !mesmosPontos(pontos, pontosAtuais);
      // Missão do auto-claim (antes dos requisitos) não tem regra que o
      // aluno tenha visto: pode ganhar o primeiro requisito. Se já foi
      // publicada, segue publicada (XP, tipo, público e início congelados)
      // e a janela recomeça agora; se nunca foi, continua rascunho.
      const legado = atual.requisito === null && requisito !== null;

      // Publicada uma vez, a versão que o aluno viu não muda: nem a regra
      // nem a recompensa. Vale também para a arquivada, que pode voltar.
      if (atual.publicadaEm) {
        const congelados = (
          [
            ['tipo', tipo !== atual.tipo],
            ['xp', xp !== atual.xp],
            ['publico', publico !== atual.publico],
            ['requisito', mudouRequisito && !legado],
            ['quantidade', quantidade !== atual.quantidade && !legado],
            ['alvoId', alvoId !== atual.alvoId && !legado],
            ['alvoIds', mudouPontos && !legado],
            [
              'inicio',
              (inicio?.getTime() ?? null) !==
                (data(atual.inicio)?.getTime() ?? null),
            ],
            // Prorrogar (ou tirar o prazo) só dá mais tempo. Encurtar, ou
            // criar prazo onde não havia, tira tempo de quem está fazendo.
            [
              'fim',
              fim !== null &&
                (fimAtual === null || fim.getTime() < fimAtual.getTime()),
            ],
          ] as const
        )
          .filter(([, mudou]) => mudou)
          .map(([campo]) => campo);
        if (congelados.length === 1 && congelados[0] === 'fim') {
          throw prazoSoProrroga();
        }
        if (congelados.length) throw jaPublicada(congelados);
      }

      exigirRegras(tipo, xp, inicio, fim, dados.fim != null, agora);
      const mudouRegra =
        tipo !== atual.tipo ||
        mudouRequisito ||
        quantidade !== atual.quantidade ||
        alvoId !== atual.alvoId ||
        mudouPontos ||
        publico !== atual.publico;
      const mudouCodigo =
        (requisito === 'CODIGO' || requisito === 'EVENTO') &&
        dados.codigo !== undefined;
      const r = !requisito
        ? null
        : !mudouRegra && !mudouCodigo
          ? {
              requisito,
              quantidade,
              alvoId,
              // Mesma lista: mantém a ordem gravada.
              pontos: pontosAtuais,
              codigo: atual.codigo,
            }
          : await this.validarRequisito(
              m,
              tipo,
              publico,
              {
                requisito,
                quantidade,
                alvoId,
                pontos: mudouPontos ? pontos : pontosAtuais,
                codigo:
                  dados.codigo === undefined
                    ? mudouRequisito
                      ? null
                      : atual.codigo
                    : dados.codigo,
              },
              alvoId !== atual.alvoId || mudouRequisito || mudouPontos,
            );
      await m.query(
        `UPDATE ${g}."missoes" SET "titulo" = $2, "descricao" = $3, "tipo" = $4, "xp" = $5, "inicio" = $6, "fim" = $7, ` +
          `"requisito" = $8, "quantidade" = $9, "alvo_id" = $10, "codigo" = $11, "instrucoes" = $12, "publico" = $13, ` +
          `"pucstops" = $14::uuid[], "atualizado_em" = now(), ` +
          `"publicada_em" = CASE WHEN $15 AND "publicada_em" IS NOT NULL THEN now() ELSE "publicada_em" END WHERE "id" = $1`,
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
          dados.instrucoes === undefined
            ? atual.instrucoes
            : texto(dados.instrucoes),
          publico,
          r?.pontos ?? null,
          legado,
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
          atual.publico,
          {
            requisito: atual.requisito,
            quantidade: atual.quantidade,
            alvoId: atual.alvoId,
            pontos: atual.pontos.length ? atual.pontos.map((p) => p.id) : null,
            codigo: atual.codigo,
          },
          true,
          Boolean(atual.publicadaEm),
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
      // Arquivar também fecha o código liberado.
      await m.query(
        `UPDATE ${g}."missoes" SET "ativa" = $2, "atualizado_em" = now(), ` +
          `"publicada_em" = CASE WHEN $2 THEN COALESCE("publicada_em", now()) ELSE "publicada_em" END, ` +
          `"codigo_liberado_ate" = CASE WHEN $2 THEN "codigo_liberado_ate" END WHERE "id" = $1`,
        [id, ativa],
      );
    });
    this.logger.log(`missao ${ativa ? 'ativada' : 'desativada'} id=${id}`);
    return this.detalhe(id);
  }

  /**
   * Libera o código por alguns minutos, na hora da atividade. Fora desse
   * tempo o aluno recebe 422 `codigo-fechado`: o código repassado depois não
   * serve. Liberar de novo recomeça a contagem. Não mexe em `atualizado_em`,
   * para não derrubar quem está editando a missão.
   */
  async liberarCodigo(id: string, minutos: number): Promise<MissaoAdminDto> {
    await this.dataSource.transaction(async (m) => {
      const atual = await this.buscar(m, id, true);
      if (atual.requisito !== 'CODIGO' && atual.requisito !== 'EVENTO') {
        throw new UnprocessableEntityException({
          statusCode: 422,
          message: 'Esta missão não usa código.',
          motivo: 'sem-codigo',
        });
      }
      if (!atual.ativa) {
        throw new UnprocessableEntityException({
          statusCode: 422,
          message: 'Publique a missão antes de liberar o código.',
          motivo: 'missao-nao-publicada',
        });
      }
      if (!atual.vigenteAgora) {
        throw new UnprocessableEntityException({
          statusCode: 422,
          message:
            'A missão está fora do período: os alunos não a veem agora. Ajuste o início ou o fim antes de liberar o código.',
          motivo: 'fora-do-periodo',
        });
      }
      await m.query(
        `UPDATE ${g}."missoes" SET "codigo_liberado_ate" = now() + make_interval(mins => $2) WHERE "id" = $1`,
        [id, minutos],
      );
    });
    this.logger.log(`codigo liberado missao=${id} minutos=${minutos}`);
    return this.detalhe(id);
  }

  async encerrarCodigo(id: string): Promise<MissaoAdminDto> {
    await this.dataSource.transaction(async (m) => {
      await this.buscar(m, id, true);
      await m.query(
        `UPDATE ${g}."missoes" SET "codigo_liberado_ate" = NULL WHERE "id" = $1`,
        [id],
      );
    });
    this.logger.log(`codigo encerrado missao=${id}`);
    return this.detalhe(id);
  }

  /** Só rascunho (nunca publicado). A publicada é arquivada, não apagada. */
  async excluir(id: string): Promise<void> {
    await this.dataSource.transaction(async (m) => {
      const atual = await this.buscar(m, id, true);
      if (atual.publicadaEm || atual.conclusoes > 0) {
        throw new ConflictException({
          statusCode: 409,
          message:
            'Só rascunhos podem ser excluídos. Esta missão já foi publicada: arquive para tirá-la dos alunos.',
          motivo: 'missao-publicada',
        });
      }
      await m.query(`DELETE FROM ${g}."missoes" WHERE "id" = $1`, [id]);
    });
    this.logger.log(`missao excluida id=${id}`);
  }

  private async validarRequisito(
    m: EntityManager,
    tipo: TipoMissao,
    publico: PublicoMissao,
    r: Requisito,
    alvoNovo: boolean,
    republicacao = false,
  ): Promise<Requisito> {
    const { requisito, quantidade } = r;
    if (r.alvoId && requisito !== 'PUCSTOPS' && requisito !== 'EVENTO') {
      throw new BadRequestException('alvoId só vale para PucStop ou evento.');
    }
    if (r.pontos && requisito !== 'PUCSTOPS') {
      throw new BadRequestException(
        'alvoIds só vale para missão de PucStops.',
      );
    }
    if (r.codigo && requisito !== 'CODIGO' && requisito !== 'EVENTO') {
      throw new BadRequestException(
        'codigo só vale para missão de código ou de evento.',
      );
    }
    if (publico === 'APADRINHADOS' && requisito === 'FEED_PUBLICACOES') {
      throw new BadRequestException(
        'Só padrinhos com dupla publicam no feed: escolha outro público ou outro objetivo.',
      );
    }
    const pontos = r.pontos ? unicos(r.pontos) : null;
    if (pontos && quantidade !== pontos.length) {
      throw new BadRequestException(
        `Com pontos escolhidos, a meta é visitar todos: quantidade deve ser ${pontos.length}.`,
      );
    }
    if ((requisito === 'EVENTO' || requisito === 'CODIGO') && quantidade !== 1) {
      throw new BadRequestException(
        'Este requisito é cumprido uma vez só: quantidade deve ser 1.',
      );
    }

    const codigo = r.codigo ? normalizarCodigo(r.codigo) : '';
    const exigirCodigo = (mensagem: string) => {
      if (!CODIGO_MISSAO.test(codigo)) throw new BadRequestException(mensagem);
    };

    if (requisito === 'CODIGO') {
      exigirCodigo(
        'Código: de 4 a 20 letras, números ou hífen (ex.: CALOURO26).',
      );
      return { requisito, quantidade, alvoId: null, pontos: null, codigo };
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
      exigirCodigo(
        'Check-in de evento também exige o código mostrado no evento: de 4 a 20 letras, números ou hífen.',
      );
      return { requisito, quantidade, alvoId: r.alvoId, pontos: null, codigo };
    }

    if (requisito === 'PUCSTOPS') {
      if (tipo !== 'UNICA') {
        throw new BadRequestException(
          'Missão de PucStop é única: cada totem é coletado uma vez por semestre.',
        );
      }
      if (republicacao) {
        // Ponto desativado depois da publicação não conta para o aluno
        // (requisitos.ts, metaEfetiva): basta sobrar um ponto ativo.
        const [{ ativos }] = (await m.query(
          `SELECT count(*)::int AS ativos FROM ${mp}."pucstops" WHERE "ativo" AND ($1::uuid[] IS NULL OR "id" = ANY($1::uuid[]))`,
          [pontos],
        )) as Array<{ ativos: number }>;
        if (!ativos) {
          throw alvoInvalido(
            pontos
              ? 'Todos os PucStops do roteiro foram desativados. Crie outra missão.'
              : 'Nenhum PucStop ativo no campus.',
          );
        }
      } else if (pontos) {
        const ativos = (await m.query(
          `SELECT "id" FROM ${mp}."pucstops" WHERE "ativo" AND "id" = ANY($1::uuid[])`,
          [pontos],
        )) as unknown[];
        if (ativos.length !== pontos.length) {
          throw alvoInvalido(
            pontos.length === 1
              ? 'PucStop não encontrado ou desativado.'
              : 'Algum dos PucStops escolhidos não existe ou foi desativado.',
          );
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
      return { requisito, quantidade, alvoId: null, pontos, codigo: null };
    }

    return { requisito, quantidade, alvoId: null, pontos: null, codigo: null };
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
