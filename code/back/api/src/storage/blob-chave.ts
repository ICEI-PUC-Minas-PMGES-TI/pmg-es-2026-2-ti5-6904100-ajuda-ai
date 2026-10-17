import { randomUUID } from 'node:crypto';
import { BadRequestException } from '@nestjs/common';
import {
  ehContainerPermitido,
  type ContainerArmazenamento,
} from './containers.js';

/** Segmento opaco. Não aceita e-mail, barra, nem o nome original do arquivo. */
const SEGMENTO = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
const EXTENSAO = /^[a-z0-9]{1,8}$/;

/**
 * Caminho dentro do container, nunca o nome enviado pelo cliente.
 * Ex.: `usuario-id/<uuid>.webp`. A chave persistida inclui o container:
 * `profiles/usuario-id/<uuid>.webp`.
 */
export function montarNomeBlob(
  segmentos: readonly string[],
  extensao: string,
): string {
  if (segmentos.length > 4) {
    throw new BadRequestException('O caminho do blob é profundo demais.');
  }
  const pasta = segmentos.map((segmento) => validarSegmento(segmento));
  const ext = extensao.trim().toLowerCase().replace(/^\./, '');
  if (!EXTENSAO.test(ext)) {
    throw new BadRequestException('Extensão de blob inválida.');
  }
  const arquivo = `${randomUUID()}.${ext}`;
  return pasta.length === 0 ? arquivo : `${pasta.join('/')}/${arquivo}`;
}

export function validarNomeBlob(nome: string): string {
  if (typeof nome !== 'string') {
    throw new BadRequestException('Nome de blob inválido.');
  }
  const texto = nome.trim();
  if (
    texto.length === 0 ||
    texto.length > 1024 ||
    texto !== nome ||
    texto.includes('\\') ||
    texto.includes('\0') ||
    texto.startsWith('/') ||
    texto.includes('//')
  ) {
    throw new BadRequestException('Nome de blob inválido.');
  }
  const partes = texto.split('/');
  const arquivo = partes[partes.length - 1] ?? '';
  const ponto = arquivo.lastIndexOf('.');
  if (ponto <= 0 || arquivo.indexOf('.') !== ponto) {
    throw new BadRequestException(
      'O blob precisa de uma única extensão segura.',
    );
  }
  if (!EXTENSAO.test(arquivo.slice(ponto + 1))) {
    throw new BadRequestException('Extensão de blob inválida.');
  }
  for (const parte of partes) {
    validarSegmento(parte);
  }
  return texto;
}

export function montarChave(
  container: ContainerArmazenamento,
  blobName: string,
): string {
  return `${container}/${validarNomeBlob(blobName)}`;
}

export function dividirChave(chave: string): {
  container: ContainerArmazenamento;
  blobName: string;
} {
  if (typeof chave !== 'string') {
    throw new BadRequestException('Chave de blob inválida.');
  }
  const texto = chave.trim();
  const barra = texto.indexOf('/');
  if (barra <= 0 || texto !== chave) {
    throw new BadRequestException('Chave de blob inválida.');
  }
  const container = texto.slice(0, barra);
  if (!ehContainerPermitido(container)) {
    throw new BadRequestException('Container de armazenamento não permitido.');
  }
  return { container, blobName: validarNomeBlob(texto.slice(barra + 1)) };
}

function validarSegmento(segmento: string): string {
  if (
    typeof segmento !== 'string' ||
    !SEGMENTO.test(segmento.trim()) ||
    segmento !== segmento.trim()
  ) {
    throw new BadRequestException('Nome de blob inválido.');
  }
  return segmento;
}
