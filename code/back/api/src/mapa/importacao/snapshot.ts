import { createHash } from 'node:crypto';
import type { LineString, Point, Polygon, Position } from 'typeorm';
import type { EntradaMapa } from '../entities/predio.entity.js';

/**
 * Snapshot geográfico versionado no Git (`scripts/mapa/dados/<codigo>.json`):
 * fonte reproduzível do importador. Gerado por `scripts/mapa/exportar-pucmaps.mjs`.
 */
export const FORMATO_SNAPSHOT = 'ajuda-ai/mapa-snapshot';

export interface PredioSnapshot {
  id: string;
  idOrigem: string | null;
  osmId: string | null;
  codigo: string | null;
  nome: string | null;
  tipo: string | null;
  altura: number | null;
  alturaBase: number | null;
  entradas: EntradaMapa[];
  localizacao: Point;
  poligono: Polygon | null;
}

export interface AreaSnapshot {
  id: string;
  nome: string;
  tipo: string;
  entradas: EntradaMapa[];
  localizacao: Point;
  poligono: Polygon | null;
}

export interface SalaSnapshot {
  id: string;
  predioId: string;
  nome: string;
  andar: number;
  capacidade: number;
  tipo: string;
  localizacao: Point;
}

export interface NoSnapshot {
  id: string;
  predioId: string | null;
  salaId: string | null;
  nivel: number;
  camada: number;
  localizacao: Point;
}

export interface ArestaSnapshot {
  id: string;
  origem: string;
  destino: string;
  distanciaM: number;
  tempoCaminhadaS: number;
  acessivel: boolean;
  gerada: boolean;
  camada: number;
  geometria: LineString | null;
}

export interface SnapshotMapa {
  formato: typeof FORMATO_SNAPSHOT;
  schemaVersion: 1;
  codigo: string;
  versaoAssets: string | null;
  hashDados: string;
  origem: { projeto: string; [campo: string]: unknown };
  predios: PredioSnapshot[];
  areas: AreaSnapshot[];
  salas: SalaSnapshot[];
  nos: NoSnapshot[];
  arestas: ArestaSnapshot[];
}

/**
 * SHA-256 do conteúdo importado (código + registros, na ordem do arquivo).
 * Independe de formatação e de `origem` (data de exportação etc.).
 */
export function hashDados(dados: {
  codigo: string;
  predios: unknown[];
  areas: unknown[];
  salas: unknown[];
  nos: unknown[];
  arestas: unknown[];
}): string {
  const { codigo, predios, areas, salas, nos, arestas } = dados;
  return createHash('sha256')
    .update(JSON.stringify({ codigo, predios, areas, salas, nos, arestas }))
    .digest('hex');
}

export class SnapshotInvalidoError extends Error {
  constructor(readonly problemas: string[]) {
    super(
      `Snapshot do mapa inválido (${problemas.length} problema(s)):\n  ` +
        problemas.slice(0, 20).join('\n  '),
    );
  }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const CHAVE_PREDIO = /^[A-Za-z0-9_]{1,64}$/;
const CODIGO_VERSAO = /^[a-z0-9][a-z0-9.-]{0,63}$/;

type Registro = Record<string, unknown>;

/** Valida estrutura, identidade, referências e geometria antes de qualquer escrita. */
export function validarSnapshot(bruto: unknown): SnapshotMapa {
  const erros: string[] = [];
  const s = bruto as Registro;
  if (!s || typeof s !== 'object')
    throw new SnapshotInvalidoError(['não é um objeto']);
  if (s.formato !== FORMATO_SNAPSHOT || s.schemaVersion !== 1) {
    throw new SnapshotInvalidoError(['formato/schemaVersion desconhecido']);
  }
  if (typeof s.codigo !== 'string' || !CODIGO_VERSAO.test(s.codigo)) {
    erros.push('codigo inválido');
  }
  if (s.versaoAssets !== null && typeof s.versaoAssets !== 'string') {
    erros.push('versaoAssets inválido');
  }
  const origem = s.origem as Registro | undefined;
  if (!origem || typeof origem.projeto !== 'string')
    erros.push('origem.projeto ausente');
  for (const lista of ['predios', 'areas', 'salas', 'nos', 'arestas']) {
    if (!Array.isArray(s[lista])) erros.push(`${lista} ausente`);
  }
  if (erros.length) throw new SnapshotInvalidoError(erros);

  const predios = s.predios as Registro[];
  const areas = s.areas as Registro[];
  const salas = s.salas as Registro[];
  const nos = s.nos as Registro[];
  const arestas = s.arestas as Registro[];
  if (!predios.length) erros.push('nenhum prédio');
  if (!nos.length) erros.push('nenhum nó');

  const unicos = (nome: string, ids: unknown[]) => {
    const vistos = new Set<unknown>();
    for (const id of ids) {
      if (id === null) continue;
      if (vistos.has(id)) erros.push(`${nome}: id repetido ${String(id)}`);
      vistos.add(id);
    }
    return vistos;
  };
  const idsPredios = unicos(
    'prédios',
    predios.map((p) => p.id),
  );
  unicos(
    'prédios (idOrigem)',
    predios.map((p) => p.idOrigem),
  );
  unicos(
    'áreas',
    areas.map((a) => a.id),
  );
  const idsSalas = unicos(
    'salas',
    salas.map((r) => r.id),
  );
  const idsNos = unicos(
    'nós',
    nos.map((n) => n.id),
  );
  unicos(
    'arestas',
    arestas.map((e) => e.id),
  );

  for (const p of predios) {
    const r = `prédio ${String(p.id)}`;
    if (typeof p.id !== 'string' || !CHAVE_PREDIO.test(p.id))
      erros.push(`${r}: chave inválida`);
    if (p.idOrigem !== null && !uuid(p.idOrigem))
      erros.push(`${r}: idOrigem inválido`);
    for (const campo of ['osmId', 'codigo', 'nome', 'tipo']) {
      if (p[campo] !== null && typeof p[campo] !== 'string')
        erros.push(`${r}: ${campo} inválido`);
    }
    for (const campo of ['altura', 'alturaBase']) {
      if (
        p[campo] !== null &&
        !(finito(p[campo]) && (p[campo] as number) >= 0)
      ) {
        erros.push(`${r}: ${campo} inválido`);
      }
    }
    entradas(r, p.entradas, erros);
    ponto(r, p.localizacao, erros);
    if (p.poligono !== null) poligono(r, p.poligono, erros);
  }
  for (const a of areas) {
    const r = `área ${String(a.id)}`;
    if (!uuid(a.id)) erros.push(`${r}: id inválido`);
    if (!texto(a.nome) || !texto(a.tipo)) erros.push(`${r}: nome/tipo ausente`);
    entradas(r, a.entradas, erros);
    ponto(r, a.localizacao, erros);
    if (a.poligono !== null) poligono(r, a.poligono, erros);
  }
  for (const sala of salas) {
    const r = `sala ${String(sala.id)}`;
    if (!uuid(sala.id)) erros.push(`${r}: id inválido`);
    if (!idsPredios.has(sala.predioId))
      erros.push(`${r}: prédio ${String(sala.predioId)} inexistente`);
    if (!texto(sala.nome) || !texto(sala.tipo))
      erros.push(`${r}: nome/tipo ausente`);
    if (!Number.isInteger(sala.andar)) erros.push(`${r}: andar inválido`);
    if (!Number.isInteger(sala.capacidade) || (sala.capacidade as number) < 0) {
      erros.push(`${r}: capacidade inválida`);
    }
    ponto(r, sala.localizacao, erros);
  }
  for (const n of nos) {
    const r = `nó ${String(n.id)}`;
    if (!uuid(n.id)) erros.push(`${r}: id inválido`);
    if (n.predioId !== null && !idsPredios.has(n.predioId)) {
      erros.push(`${r}: prédio ${String(n.predioId)} inexistente`);
    }
    if (n.salaId !== null && !idsSalas.has(n.salaId)) {
      erros.push(`${r}: sala ${String(n.salaId)} inexistente`);
    }
    if (!finito(n.nivel) || Math.abs(n.nivel as number) >= 1000)
      erros.push(`${r}: nível inválido`);
    if (!Number.isInteger(n.camada)) erros.push(`${r}: camada inválida`);
    ponto(r, n.localizacao, erros);
  }
  for (const e of arestas) {
    const r = `aresta ${String(e.id)}`;
    if (!uuid(e.id)) erros.push(`${r}: id inválido`);
    if (!idsNos.has(e.origem))
      erros.push(`${r}: nó de origem ${String(e.origem)} inexistente`);
    if (!idsNos.has(e.destino))
      erros.push(`${r}: nó de destino ${String(e.destino)} inexistente`);
    if (e.origem === e.destino) erros.push(`${r}: laço (origem = destino)`);
    if (!finito(e.distanciaM) || (e.distanciaM as number) < 0)
      erros.push(`${r}: distância inválida`);
    if (
      !Number.isInteger(e.tempoCaminhadaS) ||
      (e.tempoCaminhadaS as number) < 0
    ) {
      erros.push(`${r}: tempo inválido`);
    }
    if (typeof e.acessivel !== 'boolean' || typeof e.gerada !== 'boolean') {
      erros.push(`${r}: acessivel/gerada inválido`);
    }
    if (!Number.isInteger(e.camada)) erros.push(`${r}: camada inválida`);
    if (e.geometria === null) {
      if (e.distanciaM !== 0)
        erros.push(`${r}: sem geometria com distância > 0`);
    } else {
      linha(r, e.geometria, erros);
    }
  }
  if (!erros.length) {
    const calculado = hashDados(s as unknown as SnapshotMapa);
    if (s.hashDados !== calculado) {
      erros.push(
        `hashDados diverge do conteúdo (declarado ${String(s.hashDados)}, calculado ${calculado})`,
      );
    }
  }
  if (erros.length) throw new SnapshotInvalidoError(erros);
  return s as unknown as SnapshotMapa;
}

function uuid(valor: unknown): boolean {
  return typeof valor === 'string' && UUID.test(valor);
}

function texto(valor: unknown): boolean {
  return typeof valor === 'string' && valor.trim().length > 0;
}

function finito(valor: unknown): boolean {
  return typeof valor === 'number' && Number.isFinite(valor);
}

function posicao(valor: unknown): valor is Position {
  return (
    Array.isArray(valor) &&
    valor.length === 2 &&
    finito(valor[0]) &&
    finito(valor[1]) &&
    Math.abs(valor[0] as number) <= 180 &&
    Math.abs(valor[1] as number) <= 90
  );
}

function ponto(r: string, g: unknown, erros: string[]): void {
  const p = g as Registro | null;
  if (!p || p.type !== 'Point' || !posicao(p.coordinates))
    erros.push(`${r}: ponto inválido`);
}

function poligono(r: string, g: unknown, erros: string[]): void {
  const p = g as Registro | null;
  const aneis = p?.coordinates;
  const ok =
    p?.type === 'Polygon' &&
    Array.isArray(aneis) &&
    aneis.length > 0 &&
    aneis.every(
      (anel) =>
        Array.isArray(anel) &&
        anel.length >= 4 &&
        anel.every(posicao) &&
        (anel[0] as Position)[0] === (anel.at(-1) as Position)[0] &&
        (anel[0] as Position)[1] === (anel.at(-1) as Position)[1],
    );
  if (!ok) erros.push(`${r}: polígono inválido`);
}

function linha(r: string, g: unknown, erros: string[]): void {
  const l = g as Registro | null;
  const pontos = l?.coordinates;
  const ok =
    l?.type === 'LineString' &&
    Array.isArray(pontos) &&
    pontos.length >= 2 &&
    pontos.every(posicao);
  if (!ok) erros.push(`${r}: linha inválida`);
}

function entradas(r: string, valor: unknown, erros: string[]): void {
  const ok =
    Array.isArray(valor) &&
    valor.every((e) => {
      const x = e as Registro;
      return (
        texto(x?.id) &&
        typeof x.name === 'string' &&
        finito(x.level) &&
        finito(x.latitude) &&
        finito(x.longitude)
      );
    });
  if (!ok) erros.push(`${r}: entradas inválidas`);
}
