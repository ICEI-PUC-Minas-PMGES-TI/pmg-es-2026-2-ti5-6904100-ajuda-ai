// Tipos do script `publicar-assets-mapa.mjs` (usados pelo teste).
export const CONTAINER: string;
export const CACHE_CONTROL: string;
export const CAMINHO_MANIFESTO: string;
export const CONTENT_TYPES: Record<string, string>;

export interface ItemPublicacao {
  caminho: string;
  blob: string;
  contentType: string;
  bytes: number;
  sha256: string;
  conteudo: Buffer;
}

export function validarVersao(versao: unknown): string;
export function validarCaminhoRelativo(caminho: unknown): string;
export function nomeDoBlob(versao: string, caminho: string): string;
export function contentTypePara(caminho: string): string;
export function sha256(buffer: Buffer | Uint8Array): string;
export function lerManifesto(texto: string): {
  versao: string;
  modelos: { caminho: string; bytes: number; sha256: string }[];
};
export function localizar(origem: string, caminho: string): string | null;
export function planejar(opcoes: {
  manifesto: string;
  origem?: string;
  versao?: string;
}): { versao: string; itens: ItemPublicacao[] };
export function lerArgumentos(argv: string[]): {
  manifesto: string;
  origem?: string;
  versao?: string;
  baseUrl?: string;
  dryRun?: boolean;
  retomar?: boolean;
  verificar?: boolean;
};
