import { AreaEntity } from './area.entity.js';
import { ArestaGrafoEntity } from './aresta-grafo.entity.js';
import { NoGrafoEntity } from './no-grafo.entity.js';
import { PredioEntity } from './predio.entity.js';
import { SalaEntity } from './sala.entity.js';
import { VersaoMapaEntity } from './versao-mapa.entity.js';

export {
  AreaEntity,
  ArestaGrafoEntity,
  NoGrafoEntity,
  PredioEntity,
  SalaEntity,
  VersaoMapaEntity,
};

/** Entidades do schema `mapa` (sem módulo HTTP nesta fase). */
export const ENTIDADES_MAPA = [
  VersaoMapaEntity,
  PredioEntity,
  SalaEntity,
  AreaEntity,
  NoGrafoEntity,
  ArestaGrafoEntity,
];
