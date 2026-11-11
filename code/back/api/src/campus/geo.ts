import { BadRequestException, NotFoundException } from '@nestjs/common';
import type { DataSource } from 'typeorm';
import { schemaPostgis } from '../mapa/postgis.js';

/** Schema do PostGIS lido uma vez (refeito se a consulta falhar). */
export function schemaGeoEmCache(
  dataSource: DataSource,
): () => Promise<string> {
  let geo: Promise<string> | undefined;
  return () =>
    (geo ??= schemaPostgis((sql, p) => dataSource.query(sql, p)).catch(
      (erro: unknown) => {
        geo = undefined;
        throw erro;
      },
    ));
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** Id de evento/restaurante/cardápio: UUID em minúsculas, senão 404. */
export function exigirUuid(id: string, nome: string): string {
  if (!UUID.test(id)) throw new NotFoundException(`${nome} não encontrado.`);
  return id;
}

/** PATCH vazio é erro de quem chamou, não "nada mudou". */
export function exigirAlgumCampo(dados: object): void {
  if (Object.values(dados).every((v) => v === undefined)) {
    throw new BadRequestException('Nada para alterar.');
  }
}

/** Monta `SET a = $n, ...` com os campos informados; devolve SQL e parâmetros. */
export function montarSet(
  campos: Array<
    [coluna: string, valor: unknown, expressao?: (n: number) => string]
  >,
  inicio: number,
): { sql: string; parametros: unknown[] } {
  const partes: string[] = [];
  const parametros: unknown[] = [];
  for (const [coluna, valor, expressao] of campos) {
    parametros.push(valor);
    const n = inicio + parametros.length - 1;
    partes.push(`"${coluna}" = ${expressao ? expressao(n) : `$${n}`}`);
  }
  partes.push(`"atualizado_em" = now()`);
  return { sql: partes.join(', '), parametros };
}

/** Texto sem espaços nas pontas dentro dos limites (antes de chegar à CHECK). */
export function textoAparado(
  valor: string,
  campo: string,
  limites: { min: number; max: number },
): string {
  const texto = valor.trim();
  if (texto.length < limites.min || texto.length > limites.max) {
    throw new BadRequestException(
      `${campo}: entre ${limites.min} e ${limites.max} caracteres.`,
    );
  }
  return texto;
}
