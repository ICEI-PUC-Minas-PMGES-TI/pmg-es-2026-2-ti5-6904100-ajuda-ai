/**
 * Quem pode abrir o painel de QA da gamificação. Sem credencial no código:
 * a lista vem do ambiente e o login continua sendo o normal (Microsoft, ou
 * login demo fora de produção).
 *
 * - `GAMIFICACAO_QA_EMAILS`: e-mails autorizados, separados por vírgula.
 *   Vazio (padrão) = painel desligado para todos.
 * - Em produção (`APP_ENV=producao`, ou `NODE_ENV=production` sem `APP_ENV`) o painel só liga com
 *   `GAMIFICACAO_QA_PRODUCAO=true` além da lista: liberar em produção é
 *   sempre uma decisão explícita.
 */
export interface ConfigQaGamificacao {
  habilitado: boolean;
  emails: ReadonlySet<string>;
}

const EMAIL = /^[^@\s,]+@[^@\s,]+\.[^@\s,]+$/;

export function configQaGamificacao(
  env: NodeJS.ProcessEnv = process.env,
): ConfigQaGamificacao {
  const emails = new Set(
    (env.GAMIFICACAO_QA_EMAILS ?? '')
      .split(',')
      .map((e) => e.trim().toLowerCase())
      .filter((e) => EMAIL.test(e)),
  );
  // APP_ENV (quando definido) diz onde a API roda: homologação e produção usam
  // NODE_ENV=production nos dois, e só APP_ENV=producao liga a trava do QA.
  // Sem APP_ENV, vale NODE_ENV=production (lado seguro).
  const appEnv = env.APP_ENV?.trim().toLowerCase();
  const producao = appEnv ? appEnv === 'producao' : env.NODE_ENV === 'production';
  const liberadoEmProducao =
    env.GAMIFICACAO_QA_PRODUCAO?.trim().toLowerCase() === 'true';
  return {
    habilitado: emails.size > 0 && (!producao || liberadoEmProducao),
    emails,
  };
}

/** O e-mail (já autenticado pelo JWT) está na lista de QA? */
export function emailAutorizadoQa(
  config: ConfigQaGamificacao,
  email: unknown,
): boolean {
  if (!config.habilitado || typeof email !== 'string') return false;
  return config.emails.has(email.trim().toLowerCase());
}
