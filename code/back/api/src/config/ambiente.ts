import { timingSafeEqual } from 'node:crypto';
import { ehBancoLocal } from './seguranca.js';

/**
 * Ambiente lógico da aplicação, definido por APP_ENV:
 * - desenvolvimento: máquina de quem programa;
 * - homologacao: ambiente publicado com dados fictícios, para a equipe e a banca;
 * - producao: ambiente publicado com usuários reais.
 * Homologação e produção usam NODE_ENV=production (valor convencional, o do
 * Dockerfile); quem as diferencia é só o APP_ENV. APP_ENV, quando definido,
 * vale mais que NODE_ENV. Sem APP_ENV, NODE_ENV=production conta como produção
 * (o lado seguro): esquecer a variável nunca abre o login demo.
 */
export type AmbienteApp = 'desenvolvimento' | 'homologacao' | 'producao';

export function ambienteApp(
  appEnv = process.env.APP_ENV,
  nodeEnv = process.env.NODE_ENV,
): AmbienteApp {
  const valor = appEnv?.trim().toLowerCase();
  if (valor === 'producao' || valor === 'homologacao' || valor === 'desenvolvimento') {
    return valor;
  }
  if (valor) {
    throw new Error(
      `APP_ENV inválido: "${appEnv}". Use desenvolvimento, homologacao ou producao.`,
    );
  }
  return nodeEnv === 'production' ? 'producao' : 'desenvolvimento';
}

export function ambientePublicado(ambiente = ambienteApp()): boolean {
  return ambiente !== 'desenvolvimento';
}

/** Lista separada por vírgula, normalizada (minúsculas, sem vazios). */
export function listaDeEmails(valor: string | undefined): string[] {
  return (valor ?? '')
    .split(',')
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
}

/**
 * Origens aceitas pelo CORS. Fora do desenvolvimento a lista é obrigatória:
 * sem ela a API não sobe (melhor falhar no deploy do que aceitar qualquer site).
 * `true` = qualquer origem (só desenvolvimento, como hoje).
 */
export function origensCors(
  valor: string | undefined,
  ambiente: AmbienteApp,
): string[] | true {
  const origens = (valor ?? '')
    .split(',')
    .map((item) => item.trim().replace(/\/+$/, ''))
    .filter(Boolean);
  if (origens.length) {
    for (const origem of origens) {
      if (!/^https?:\/\/[^/\s]+$/.test(origem)) {
        throw new Error(`CORS_ORIGINS: origem inválida "${origem}" (use esquema://host[:porta]).`);
      }
      if (ambiente !== 'desenvolvimento' && origem.startsWith('http://')) {
        throw new Error(`CORS_ORIGINS: em ${ambiente} use apenas https (recebido "${origem}").`);
      }
    }
    return origens;
  }
  if (ambiente !== 'desenvolvimento') {
    throw new Error(`CORS_ORIGINS é obrigatória em ${ambiente} (ex.: https://app.exemplo.com).`);
  }
  return true;
}

/** Hosts de escuta que só aceitam conexões da própria máquina (o emulador Android usa 10.0.2.2 → 127.0.0.1). */
export function hostSoLocal(host: string | undefined): boolean {
  const valor = (host ?? '0.0.0.0').trim().toLowerCase();
  return valor === '127.0.0.1' || valor === 'localhost' || valor === '::1';
}

/**
 * Como o login demo (sem senha) se comporta:
 * - desligado: rota responde 401 sem revelar nada;
 * - aberto: qualquer chamada com e-mail da base demo entra (só desenvolvimento
 *   isolado: banco local OU API escutando só em loopback);
 * - protegido: exige uma "porta" — chave de demonstração ou sessão Microsoft de
 *   um operador autorizado (DEMO_OPERADORES).
 */
export type ModoLoginDemo =
  | { modo: 'desligado'; motivo: string }
  | { modo: 'aberto' }
  | { modo: 'protegido'; chave?: string; operadores: string[] };

export const TAMANHO_MINIMO_CHAVE_DEMO = 24;

export function modoLoginDemo(env: NodeJS.ProcessEnv = process.env): ModoLoginDemo {
  const ambiente = ambienteApp(env.APP_ENV, env.NODE_ENV);
  if (ambiente === 'producao') {
    return { modo: 'desligado', motivo: 'produção' };
  }
  if (env.AUTH_DEMO_ENABLED?.trim().toLowerCase() !== 'true') {
    return { modo: 'desligado', motivo: 'AUTH_DEMO_ENABLED diferente de true' };
  }
  const isolado =
    ambiente === 'desenvolvimento' &&
    (ehBancoLocal(env.DB_HOST ?? 'localhost') || hostSoLocal(env.HOST));
  if (isolado) return { modo: 'aberto' };

  const chave = env.DEMO_CHAVE_ACESSO?.trim();
  const operadores = listaDeEmails(env.DEMO_OPERADORES);
  const chaveValida = !!chave && chave.length >= TAMANHO_MINIMO_CHAVE_DEMO;
  if (!chaveValida && !operadores.length) {
    // Falha fechada: banco remoto/ambiente publicado sem porta configurada.
    return {
      modo: 'desligado',
      motivo:
        `ambiente exposto (${ambiente}, banco remoto ou HOST de rede) sem DEMO_CHAVE_ACESSO ` +
        `(≥ ${TAMANHO_MINIMO_CHAVE_DEMO} caracteres) nem DEMO_OPERADORES`,
    };
  }
  return { modo: 'protegido', chave: chaveValida ? chave : undefined, operadores };
}

/** Comparação em tempo constante (não vaza o tamanho do prefixo correto). */
export function chavesIguais(recebida: string | undefined, esperada: string): boolean {
  const a = Buffer.from(recebida ?? '', 'utf8');
  const b = Buffer.from(esperada, 'utf8');
  if (a.length !== b.length) {
    timingSafeEqual(b, b);
    return false;
  }
  return timingSafeEqual(a, b);
}
