import { StorageSharedKeyCredential } from '@azure/storage-blob';

/** Placeholder de `.env.example`. Nunca é uma credencial válida. */
const PLACEHOLDER = 'cole-a-connection-string-aqui';

export const SAS_LEITURA_PADRAO_MINUTOS = 15;
export const SAS_LEITURA_MAX_MINUTOS = 60;
export const SAS_UPLOAD_PADRAO_MINUTOS = 10;
export const SAS_UPLOAD_MAX_MINUTOS = 15;

const AVISO_AUSENTE =
  'AZURE_STORAGE_CONNECTION_STRING ausente ou com valor de exemplo: a API sobe, mas operações de arquivo falham até a connection string real estar no .env. Aceitável só em desenvolvimento.';

/**
 * Em produção a connection string é obrigatória. Fora de produção, ausência
 * ou placeholder não derrubam a API: devolvem um aviso. Valor presente e
 * inválido falha nos dois ambientes. A mensagem não repete o valor recebido.
 */
export function resolverConnectionStringAzure(
  valor: string | undefined,
  nodeEnv: string | undefined,
): { connectionString: string } | { aviso: string } {
  const texto = valor?.trim() ?? '';
  if (!texto || texto === PLACEHOLDER) {
    if (nodeEnv === 'production') {
      throw new Error(
        'AZURE_STORAGE_CONNECTION_STRING é obrigatória em produção. Defina a connection string no ambiente; não a coloque no código.',
      );
    }
    return { aviso: AVISO_AUSENTE };
  }
  return { connectionString: exigirConnectionStringAzure(texto) };
}

/**
 * Exige uma connection string utilizável.
 * A mensagem não repete o valor recebido.
 */
export function exigirConnectionStringAzure(valor: string | undefined): string {
  const texto = valor?.trim() ?? '';
  if (!texto || texto === PLACEHOLDER) {
    throw new Error(
      'AZURE_STORAGE_CONNECTION_STRING é obrigatória. Defina a connection string no .env local; não a coloque no código.',
    );
  }
  const campos = lerCampos(texto);
  if (!campos.get('AccountName') || !campos.get('AccountKey')) {
    throw new Error(
      'AZURE_STORAGE_CONNECTION_STRING inválida: informe AccountName e AccountKey. O valor não foi registrado.',
    );
  }
  return texto;
}

export function credencialCompartilhada(
  connectionString: string,
): StorageSharedKeyCredential {
  const campos = lerCampos(exigirConnectionStringAzure(connectionString));
  return new StorageSharedKeyCredential(
    campos.get('AccountName') as string,
    campos.get('AccountKey') as string,
  );
}

export function minutosSas(
  valor: string | undefined,
  padrao: number,
  maximo: number,
  nome: string,
): number {
  if (valor === undefined || valor.trim() === '') return padrao;
  const texto = valor.trim();
  if (!/^\d+$/.test(texto)) {
    throw new Error(
      `${nome} deve ser um inteiro de minutos entre 1 e ${maximo}.`,
    );
  }
  const minutos = Number(texto);
  if (minutos < 1 || minutos > maximo) {
    throw new Error(`${nome} deve estar entre 1 e ${maximo} minutos.`);
  }
  return minutos;
}

function lerCampos(connectionString: string): Map<string, string> {
  const campos = new Map<string, string>();
  for (const parte of connectionString.split(';')) {
    const indice = parte.indexOf('=');
    if (indice <= 0) continue;
    campos.set(parte.slice(0, indice).trim(), parte.slice(indice + 1).trim());
  }
  return campos;
}
