import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Regras de configuração que protegem banco e tokens. Ficam isoladas para
 * serem testadas sem subir a aplicação.
 */

/** Hosts considerados banco LOCAL de desenvolvimento (docker/máquina). */
const HOSTS_LOCAIS = new Set([
  'localhost',
  '127.0.0.1',
  '::1',
  'host.docker.internal',
  'postgres', // nome do serviço no docker compose
]);

export function ehBancoLocal(host: string): boolean {
  return HOSTS_LOCAIS.has(host.trim().toLowerCase());
}

/**
 * `synchronize` altera o schema ao iniciar. Padrão: DESLIGADO. Só pode ser
 * ligado (DB_SYNCHRONIZE=true) em banco local e fora de produção — num banco
 * remoto/compartilhado a API se recusa a subir em vez de alterar o schema
 * silenciosamente. Antes de produção: migrations.
 */
export function decidirSynchronize(
  host: string,
  valor: string | undefined,
  nodeEnv: string | undefined,
): boolean {
  if (valor?.trim().toLowerCase() !== 'true') return false;
  if (nodeEnv === 'production') {
    throw new Error(
      'DB_SYNCHRONIZE=true não é permitido em produção. Use migrations e DB_SYNCHRONIZE=false.',
    );
  }
  if (!ehBancoLocal(host)) {
    throw new Error(
      `DB_SYNCHRONIZE=true só é permitido em banco local (DB_HOST atual: ${host}). ` +
        'Em banco remoto/compartilhado use DB_SYNCHRONIZE=false.',
    );
  }
  return true;
}

/** Valores de exemplo/desenvolvimento que nunca podem assinar tokens reais. */
const SEGREDOS_PLACEHOLDER = new Set([
  'gere-uma-senha',
  'gere-uma-senha-longa-e-aleatoria',
  'ajuda-ai-development-secret-change-me',
]);

export const SEGREDO_DESENVOLVIMENTO = 'ajuda-ai-development-secret-change-me';

/**
 * Segredo do JWT. Em produção exige um valor real (não placeholder, ≥ 32
 * caracteres). Fora de produção aceita placeholder/ausência, mas devolve um
 * aviso para ser registrado no log.
 */
export function avaliarSegredoJwt(
  segredo: string | undefined,
  nodeEnv: string | undefined,
): { segredo: string; aviso?: string } {
  const valor = segredo?.trim() ?? '';
  const placeholder = !valor || SEGREDOS_PLACEHOLDER.has(valor);
  if (nodeEnv === 'production') {
    if (placeholder || valor.length < 32) {
      throw new Error(
        'JWT_SECRET real (≥ 32 caracteres, não o placeholder) é obrigatória em produção.',
      );
    }
    return { segredo: valor };
  }
  if (placeholder) {
    return {
      segredo: valor || SEGREDO_DESENVOLVIMENTO,
      aviso:
        'JWT_SECRET ausente ou com valor de exemplo: aceitável só em desenvolvimento. Defina um segredo real no .env.',
    };
  }
  return { segredo: valor };
}

/**
 * Opções de TLS do Postgres, usadas pela API e pelo `npm run db:verificar`.
 * - DB_SSL=false → sem TLS (banco local);
 * - DB_SSL=true (padrão) → TLS com validação do certificado;
 * - DB_SSL_CA=caminho → valida o servidor contra essa CA (ex.: a CA raiz
 *   do Supabase), mantendo `rejectUnauthorized` ligado. Caminho relativo à
 *   pasta da API.
 * A validação nunca é desligada.
 */
export function opcoesSsl(
  dbSsl: string | undefined,
  dbSslCa: string | undefined,
  pastaBase: string = process.cwd(),
): false | true | { ca: string; rejectUnauthorized: true } {
  if ((dbSsl ?? 'true').trim().toLowerCase() !== 'true') return false;
  const caminho = dbSslCa?.trim();
  if (!caminho) return true;
  const arquivo = resolve(pastaBase, caminho);
  let ca: string;
  try {
    ca = readFileSync(arquivo, 'utf8');
  } catch {
    throw new Error(`DB_SSL_CA: certificado não encontrado em ${arquivo}.`);
  }
  if (!ca.includes('BEGIN CERTIFICATE')) {
    throw new Error(`DB_SSL_CA: ${arquivo} não é um certificado PEM.`);
  }
  return { ca, rejectUnauthorized: true };
}

/**
 * Dados de demonstração (alunos, ciclos, participações, avisos) só são
 * gravados com SEED_DEMO_DATA=true. Padrão: desligado.
 */
export function seedDemoHabilitado(): boolean {
  return process.env.SEED_DEMO_DATA?.trim().toLowerCase() === 'true';
}

/**
 * SEED_DEMO_DATA=true só em banco local e fora de produção: num banco
 * remoto/compartilhado a API se recusa a iniciar em vez de inserir dados
 * fictícios.
 */
export function validarSeedDemo(
  host: string,
  valor: string | undefined,
  nodeEnv: string | undefined,
): void {
  if (valor?.trim().toLowerCase() !== 'true') return;
  if (nodeEnv === 'production' || !ehBancoLocal(host)) {
    throw new Error(
      `SEED_DEMO_DATA=true só é permitido em banco local fora de produção (DB_HOST atual: ${host}). ` +
        'Em banco remoto/compartilhado use SEED_DEMO_DATA=false.',
    );
  }
}
