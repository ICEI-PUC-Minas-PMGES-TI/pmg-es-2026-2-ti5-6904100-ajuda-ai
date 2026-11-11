/** [longitude, latitude] em WGS84, como no GeoJSON. */
export type Coordenada = [number, number];

/** Raio da Terra usado pelo PUCMaps ao gerar `distanceMeters` (haversine). */
const RAIO_TERRA_M = 6371e3;
const RAD = Math.PI / 180;

export function distanciaMetros(a: Coordenada, b: Coordenada): number {
  const dLat = (b[1] - a[1]) * RAD;
  const dLon = (b[0] - a[0]) * RAD;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(a[1] * RAD) * Math.cos(b[1] * RAD) * Math.sin(dLon / 2) ** 2;
  return 2 * RAIO_TERRA_M * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

export function comprimentoMetros(linha: readonly Coordenada[]): number {
  let total = 0;
  for (let i = 1; i < linha.length; i++) {
    total += distanciaMetros(linha[i - 1], linha[i]);
  }
  return total;
}

export interface Projecao {
  /** Ponto mais próximo sobre a linha. */
  ponto: Coordenada;
  /** Distância do ponto consultado até a linha, em metros. */
  distancia: number;
  /** Índice do segmento (entre `linha[segmento]` e `linha[segmento + 1]`). */
  segmento: number;
  /** Metros ao longo da linha, do início até `ponto`. */
  aoLongo: number;
}

/**
 * Projeção de um ponto sobre uma polilinha. Plano local equirretangular em
 * torno do ponto: erro desprezível na escala do campus (centenas de metros).
 */
export function projetarNaLinha(
  p: Coordenada,
  linha: readonly Coordenada[],
): Projecao {
  const kx = Math.cos(p[1] * RAD) * RAD * RAIO_TERRA_M;
  const ky = RAD * RAIO_TERRA_M;
  const xy = (c: Coordenada) => [(c[0] - p[0]) * kx, (c[1] - p[1]) * ky];
  let melhor: Projecao | null = null;
  let percorrido = 0;
  for (let i = 0; i < linha.length - 1; i++) {
    const [ax, ay] = xy(linha[i]);
    const [bx, by] = xy(linha[i + 1]);
    const dx = bx - ax;
    const dy = by - ay;
    const l2 = dx * dx + dy * dy;
    const t =
      l2 === 0 ? 0 : Math.max(0, Math.min(1, -(ax * dx + ay * dy) / l2));
    const ponto: Coordenada = [
      linha[i][0] + (linha[i + 1][0] - linha[i][0]) * t,
      linha[i][1] + (linha[i + 1][1] - linha[i][1]) * t,
    ];
    const distancia = Math.hypot(ax + dx * t, ay + dy * t);
    const segmentoM = distanciaMetros(linha[i], linha[i + 1]);
    if (!melhor || distancia < melhor.distancia) {
      melhor = {
        ponto,
        distancia,
        segmento: i,
        aoLongo: percorrido + segmentoM * t,
      };
    }
    percorrido += segmentoM;
  }
  if (!melhor) throw new Error('Linha sem segmentos.');
  return melhor;
}

/** Ray casting num polígono GeoJSON (anel externo e buracos). */
export function dentroDoPoligono(
  p: Coordenada,
  aneis: readonly (readonly Coordenada[])[],
): boolean {
  let dentro = false;
  for (const anel of aneis) {
    for (let i = 0, j = anel.length - 1; i < anel.length; j = i++) {
      const [xi, yi] = anel[i];
      const [xj, yj] = anel[j];
      if (
        yi > p[1] !== yj > p[1] &&
        p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi
      ) {
        dentro = !dentro;
      }
    }
  }
  return dentro;
}

/** Distância (m) de um ponto ao contorno de um polígono; 0 se estiver dentro. */
export function distanciaAoPoligono(
  p: Coordenada,
  aneis: readonly (readonly Coordenada[])[],
): number {
  if (dentroDoPoligono(p, aneis)) return 0;
  return Math.min(...aneis.map((anel) => projetarNaLinha(p, anel).distancia));
}
