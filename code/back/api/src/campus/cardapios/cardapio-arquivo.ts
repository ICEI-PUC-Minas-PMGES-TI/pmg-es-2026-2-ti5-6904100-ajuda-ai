import { BadRequestException } from '@nestjs/common';
import { CARDAPIO_TAMANHO_MAX, type TipoCardapio } from '../campus.js';

const EXTENSAO: Record<TipoCardapio, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'application/pdf': 'pdf',
};

/**
 * Tipo real do arquivo pelos primeiros bytes (assinatura), nunca pelo
 * Content-Type nem pelo nome enviados: PNG, JPEG, WebP ou PDF.
 */
export function detectarTipoCardapio(dados: Buffer): TipoCardapio | null {
  if (
    dados.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
  )
    return 'image/png';
  if (dados[0] === 0xff && dados[1] === 0xd8 && dados[2] === 0xff)
    return 'image/jpeg';
  if (
    dados.toString('ascii', 0, 4) === 'RIFF' &&
    dados.toString('ascii', 8, 12) === 'WEBP'
  )
    return 'image/webp';
  if (dados.toString('ascii', 0, 5) === '%PDF-') return 'application/pdf';
  return null;
}

/** Recusa vazio, acima de 10 MB e formato fora da lista. */
export function exigirArquivoCardapio(dados: Buffer | undefined): TipoCardapio {
  if (!dados || !Buffer.isBuffer(dados) || dados.length === 0) {
    throw new BadRequestException(
      'Envie o arquivo do cardápio (campo "arquivo").',
    );
  }
  if (dados.length > CARDAPIO_TAMANHO_MAX) {
    throw new BadRequestException('O cardápio deve ter no máximo 10 MB.');
  }
  const tipo = detectarTipoCardapio(dados);
  if (!tipo) {
    throw new BadRequestException(
      'Formato de cardápio inválido. Envie PNG, JPEG, WebP ou PDF.',
    );
  }
  return tipo;
}

/** Nome determinístico do blob: restaurantes/<restaurante>/cardapios/<cardápio>.<ext>. */
export function nomeBlobCardapio(
  restauranteId: string,
  cardapioId: string,
  tipo: TipoCardapio,
): string {
  return `restaurantes/${restauranteId}/cardapios/${cardapioId}.${EXTENSAO[tipo]}`;
}
