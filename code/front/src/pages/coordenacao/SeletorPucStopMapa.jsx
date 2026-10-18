import SeletorPontoMapa from './SeletorPontoMapa';

export {
  MAPBOX_TOKEN,
  MAPBOX_ESTILO,
  distanciaMetros,
  circuloGeofence,
  pontoDentroDoPoligono,
  problemaDoToken,
} from './SeletorPontoMapa';

/**
 * Seletor de posição do PucStop sobre o mapa do campus: o mapa genérico
 * (SeletorPontoMapa) com a geofence de `raioMetros` desenhada em volta do
 * ponto e os outros PucStops como contexto.
 */
export default function SeletorPucStopMapa({ outros = [], ...props }) {
  return (
    <SeletorPontoMapa
      {...props}
      outros={outros}
      geofence
      rotuloOutros="Outros PucStops"
      rotuloMapa="Mapa do campus: clique para posicionar o PucStop ou arraste o marcador"
      rotuloMarcador="Posição do PucStop (arraste para mover)"
    />
  );
}
