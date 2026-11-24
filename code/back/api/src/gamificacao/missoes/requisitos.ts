import {
  BadRequestException,
  HttpException,
  HttpStatus,
  UnprocessableEntityException,
} from '@nestjs/common';
import { timingSafeEqual } from 'node:crypto';
import type { QueryRunner } from 'typeorm';
import { SCHEMA_MAPA, SRID } from '../../mapa/postgis.js';
import { SCHEMA_GAMIFICACAO } from '../gamificacao.js';
import { PRECISAO_MAXIMA_METROS } from '../pucstops/pucstops.service.js';
import {
  CHECKIN_ANTECEDENCIA_MIN,
  COMENTARIO_MISSAO_MIN,
  JANELA_TENTATIVAS_CODIGO,
  MENSAGEM_MISSAO_MIN,
  normalizarCodigo,
  RAIO_EVENTO_METROS,
  type RequisitoMissao,
  TENTATIVAS_CODIGO_POR_HORA,
} from './missoes.js';

const g = `"${SCHEMA_GAMIFICACAO}"`;
const mp = `"${SCHEMA_MAPA}"`;
const VERSAO_ATIVA = `(SELECT "id" FROM ${mp}."versoes" WHERE "status" = 'ativa')`;

export const PARAMS_PROGRESSO = 3;

function janela(m: string, coluna: string): string {
  const semana = `($3::date::timestamp AT TIME ZONE 'America/Sao_Paulo')`;
  const desde = `GREATEST(COALESCE(${m}."inicio", ${m}."criado_em"), CASE WHEN ${m}."tipo" = 'SEMANAL' THEN ${semana} END)`;
  const ate = `COALESCE(LEAST(${m}."fim", CASE WHEN ${m}."tipo" = 'SEMANAL' THEN ${semana} + interval '7 days' END), 'infinity'::timestamptz)`;
  return `${coluna} >= ${desde} AND ${coluna} < ${ate}`;
}

export function sqlProgresso(m: string, u: string): string {
  return (
    `CASE ${m}."requisito" ` +
    `WHEN 'PUCSTOPS' THEN (SELECT count(DISTINCT c."pucstop_id") FROM ${g}."pucstop_coletas" c ` +
    `WHERE c."usuario_id" = $1 AND c."ciclo" = ${m}."ciclo" AND (${m}."alvo_id" IS NULL OR c."pucstop_id" = ${m}."alvo_id") ` +
    `) ` +
    `WHEN 'FEED_PUBLICACOES' THEN (SELECT count(*) FROM ${u}."publicacoes" p ` +
    `WHERE lower(p."owner_id") = $2 AND p."programa_codigo" = ${m}."ciclo" AND ${janela(m, 'p."criado_em"')}) ` +
    `WHEN 'FEED_COMENTARIOS' THEN (SELECT count(*) FROM ${u}."comentarios" k JOIN ${u}."publicacoes" p ON p."id" = k."publicacao_id" ` +
    `WHERE lower(k."autor_id") = $2 AND lower(p."owner_id") <> $2 AND p."programa_codigo" = ${m}."ciclo" ` +
    `AND char_length(btrim(k."texto")) >= ${COMENTARIO_MISSAO_MIN} ` +
    `AND ${janela(m, 'k."criado_em"')}) ` +
    `WHEN 'FEED_CURTIDAS' THEN (SELECT count(DISTINCT k."publicacao_id") FROM ${u}."curtidas" k JOIN ${u}."publicacoes" p ON p."id" = k."publicacao_id" ` +
    `WHERE lower(k."usuario_id") = $2 AND lower(p."owner_id") <> $2 AND p."programa_codigo" = ${m}."ciclo" ` +
    `AND ${janela(m, 'k."criado_em"')}) ` +
    `WHEN 'CHAT_MENSAGENS' THEN (SELECT count(*) FROM ${u}."mensagens_chat" x JOIN ${u}."participacoes" pa ON pa."id" = x."remetente_participacao_id" ` +
    `WHERE lower(pa."usuario_id") = $2 AND pa."programa" = ${m}."ciclo" AND char_length(btrim(x."texto")) >= ${MENSAGEM_MISSAO_MIN} ` +
    `AND ${janela(m, 'x."criada_em"')}) ` +
    `ELSE 0 END`
  );
}

export function sqlLocalEvento(e: string): string {
  return `COALESCE(lp."poligono", lp."localizacao", la."poligono", la."localizacao", ${e}."localizacao")`;
}

export function joinsEvento(e: string): string {
  return (
    `LEFT JOIN ${mp}."predios" lp ON lp."versao_id" = ${VERSAO_ATIVA} AND lp."id" = ${e}."predio_id" ` +
    `LEFT JOIN ${mp}."areas" la ON la."versao_id" = ${VERSAO_ATIVA} AND la."id" = ${e}."area_id"`
  );
}

export function recusa(
  motivo: string,
  message: string,
  extra: Record<string, unknown> = {},
): UnprocessableEntityException {
  return new UnprocessableEntityException({
    statusCode: 422,
    message,
    motivo,
    ...extra,
  });
}

const FALTA: Record<
  Exclude<RequisitoMissao, 'EVENTO' | 'CODIGO'>,
  (n: number) => string
> = {
  PUCSTOPS: (n) =>
    n === 1 ? 'Colete mais 1 PucStop.' : `Colete mais ${n} PucStops.`,
  FEED_PUBLICACOES: (n) =>
    n === 1
      ? 'Faça mais 1 publicação no feed.'
      : `Faça mais ${n} publicações no feed.`,
  FEED_COMENTARIOS: (n) =>
    n === 1
      ? 'Comente mais 1 vez em posts de colegas.'
      : `Comente mais ${n} vezes em posts de colegas.`,
  FEED_CURTIDAS: (n) =>
    n === 1
      ? 'Curta mais 1 publicação de colegas.'
      : `Curta mais ${n} publicações de colegas.`,
  CHAT_MENSAGENS: (n) =>
    n === 1
      ? 'Envie mais 1 mensagem no chat do grupo.'
      : `Envie mais ${n} mensagens no chat do grupo.`,
};

export interface MissaoParaVerificar {
  id: string;
  tipo: string;
  requisito: RequisitoMissao;
  quantidade: number;
  alvo_id: string | null;
  codigo: string | null;
}

export interface LeituraConclusao {
  latitude?: number;
  longitude?: number;
  accuracy?: number;
  codigo?: string;
}

export class CodigoErrado extends UnprocessableEntityException {
  constructor() {
    super({
      statusCode: 422,
      message: 'Código incorreto. Confira com a coordenação.',
      motivo: 'codigo-incorreto',
    });
  }
}

export async function verificarContagem(
  qr: QueryRunner,
  u: string,
  missao: MissaoParaVerificar,
  usuarioId: number,
  email: string,
  semana: string,
): Promise<{ atual: number; meta: number }> {
  const [{ atual }] = (await qr.query(
    `SELECT (${sqlProgresso('m', u)})::int AS atual FROM ${g}."missoes" m WHERE m."id" = $4`,
    [usuarioId, email, semana, missao.id],
  )) as Array<{ atual: number }>;
  const meta = missao.quantidade;
  if (atual < meta) {
    const requisito = missao.requisito as keyof typeof FALTA;
    throw recusa('requisito-pendente', FALTA[requisito](meta - atual), {
      progresso: { atual, meta },
    });
  }
  return { atual: Math.min(atual, meta), meta };
}

export async function verificarEvento(
  qr: QueryRunner,
  geo: string,
  missao: MissaoParaVerificar,
  leitura: LeituraConclusao,
): Promise<{ distanciaMetros: number; eventoId: string }> {
  if (leitura.latitude === undefined || leitura.longitude === undefined) {
    throw new BadRequestException({
      statusCode: 400,
      message: 'Envie sua localização para fazer o check-in no evento.',
      motivo: 'localizacao-obrigatoria',
    });
  }
  if (leitura.accuracy === undefined) {
    throw new BadRequestException({
      statusCode: 400,
      message: 'Envie a precisão da localização para fazer o check-in.',
      motivo: 'localizacao-obrigatoria',
    });
  }
  if (leitura.accuracy > PRECISAO_MAXIMA_METROS) {
    throw recusa(
      'precisao-insuficiente',
      'Localização imprecisa demais. Tente de novo perto de uma janela ou ao ar livre.',
    );
  }
  const ponto = `${geo}.ST_SetSRID(${geo}.ST_MakePoint($2, $3), ${SRID})::${geo}.geography`;
  const local = sqlLocalEvento('e');
  const [evento] = (await qr.query(
    `SELECT e."id", e."titulo", e."ativo", e."inicio", e."fim", ` +
      `now() >= e."inicio" - interval '${CHECKIN_ANTECEDENCIA_MIN} minutes' AS abriu, now() < e."fim" AS aberto, ` +
      `${local} IS NOT NULL AS tem_local, ` +
      `${geo}.ST_Distance(${local}::${geo}.geography, ${ponto}) AS distancia ` +
      `FROM ${mp}."eventos" e ${joinsEvento('e')} WHERE e."id" = $1`,
    [missao.alvo_id, leitura.longitude, leitura.latitude],
  )) as Array<{
    id: string;
    titulo: string;
    ativo: boolean;
    inicio: Date;
    fim: Date;
    abriu: boolean;
    aberto: boolean;
    tem_local: boolean;
    distancia: number | null;
  }>;
  if (!evento || !evento.ativo || !evento.tem_local) {
    throw recusa(
      'evento-indisponivel',
      'Este evento não está mais disponível para check-in.',
    );
  }
  if (!evento.abriu) {
    throw recusa(
      'evento-nao-comecou',
      `O check-in abre ${CHECKIN_ANTECEDENCIA_MIN} minutos antes do evento.`,
      { inicio: evento.inicio.toISOString() },
    );
  }
  if (!evento.aberto) {
    throw recusa('evento-encerrado', 'Este evento já terminou.', {
      fim: evento.fim.toISOString(),
    });
  }
  const distanciaMetros = Math.round(Number(evento.distancia));
  if (distanciaMetros > RAIO_EVENTO_METROS) {
    throw recusa(
      'fora-do-local',
      'Você precisa estar no local do evento para fazer o check-in.',
      { distanciaMetros, raioMetros: RAIO_EVENTO_METROS },
    );
  }
  return { distanciaMetros, eventoId: evento.id };
}

export async function exigirTentativasDeCodigo(
  qr: QueryRunner,
  missaoId: string,
  usuarioId: number,
): Promise<void> {
  const [{ erros }] = (await qr.query(
    `SELECT count(*)::int AS erros FROM ${g}."missoes_tentativas_codigo" ` +
      `WHERE "missao_id" = $1 AND "usuario_id" = $2 AND "criado_em" > now() - interval '${JANELA_TENTATIVAS_CODIGO}'`,
    [missaoId, usuarioId],
  )) as Array<{ erros: number }>;
  if (erros >= TENTATIVAS_CODIGO_POR_HORA) {
    throw new HttpException(
      {
        statusCode: 429,
        message:
          'Muitas tentativas com código errado. Tente de novo em uma hora.',
        motivo: 'muitas-tentativas',
      },
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }
}

export function verificarCodigo(
  missao: MissaoParaVerificar,
  leitura: LeituraConclusao,
): void {
  if (!leitura.codigo?.trim()) {
    throw new BadRequestException({
      statusCode: 400,
      message: 'Digite o código que a coordenação mostrou na atividade.',
      motivo: 'codigo-obrigatorio',
    });
  }
  const esperado = Buffer.from(missao.codigo ?? '');
  const digitado = Buffer.from(normalizarCodigo(leitura.codigo));
  const igual =
    esperado.length > 0 &&
    esperado.length === digitado.length &&
    timingSafeEqual(esperado, digitado);
  if (!igual) throw new CodigoErrado();
}
