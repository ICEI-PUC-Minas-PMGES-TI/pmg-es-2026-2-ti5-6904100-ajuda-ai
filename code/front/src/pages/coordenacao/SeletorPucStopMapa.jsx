import { useEffect, useRef, useState } from 'react';
import Icon from '../../components/Icon';

/** Token público (pk.) do Mapbox, o mesmo usado pelo app mobile. */
export const MAPBOX_TOKEN = (import.meta.env.VITE_MAPBOX_ACCESS_TOKEN || '').trim();
export const MAPBOX_ESTILO = (import.meta.env.VITE_MAPBOX_STYLE_URI || '').trim() || 'mapbox://styles/mapbox/streets-v12';

const RAIO_TERRA_M = 6371008.8;
const VAZIO = { type: 'FeatureCollection', features: [] };
const COR = '#4a34cf';

const rad = (graus) => (graus * Math.PI) / 180;
const graus = (radianos) => (radianos * 180) / Math.PI;

/** Distância em metros entre dois pontos {latitude, longitude} (haversine). */
export function distanciaMetros(a, b) {
  const dLat = rad(b.latitude - a.latitude);
  const dLon = rad(b.longitude - a.longitude);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.latitude)) * Math.cos(rad(b.latitude)) * Math.sin(dLon / 2) ** 2;
  return 2 * RAIO_TERRA_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * Polígono GeoJSON ([lon, lat]) aproximando o círculo da geofence: cada vértice
 * é o ponto de destino a `raioMetros` do centro no rumo correspondente (esfera).
 */
export function circuloGeofence(latitude, longitude, raioMetros, pontos = 64) {
  const lat1 = rad(latitude);
  const lon1 = rad(longitude);
  const d = raioMetros / RAIO_TERRA_M;
  const anel = [];
  for (let i = 0; i < pontos; i += 1) {
    const rumo = (2 * Math.PI * i) / pontos;
    const lat2 = Math.asin(Math.sin(lat1) * Math.cos(d) + Math.cos(lat1) * Math.sin(d) * Math.cos(rumo));
    const lon2 = lon1 + Math.atan2(Math.sin(rumo) * Math.sin(d) * Math.cos(lat1), Math.cos(d) - Math.sin(lat1) * Math.sin(lat2));
    anel.push([graus(lon2), graus(lat2)]);
  }
  anel.push(anel[0]);
  return { type: 'Polygon', coordinates: [anel] };
}

function dentroDoAnel(lon, lat, anel) {
  let dentro = false;
  for (let i = 0, j = anel.length - 1; i < anel.length; j = i, i += 1) {
    const [xi, yi] = anel[i];
    const [xj, yj] = anel[j];
    if ((yi > lat) !== (yj > lat) && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) dentro = !dentro;
  }
  return dentro;
}

/**
 * Ponto dentro de um Polygon/MultiPolygon GeoJSON (ray casting; buracos contam
 * como fora). Só orienta a coordenação: quem decide é o servidor.
 */
export function pontoDentroDoPoligono(lon, lat, geometria) {
  if (!geometria || !Number.isFinite(lon) || !Number.isFinite(lat)) return false;
  const poligonos = geometria.type === 'MultiPolygon' ? geometria.coordinates
    : geometria.type === 'Polygon' ? [geometria.coordinates] : [];
  return poligonos.some(([externo, ...buracos]) => Array.isArray(externo)
    && dentroDoAnel(lon, lat, externo)
    && !buracos.some((buraco) => dentroDoAnel(lon, lat, buraco)));
}

/** Motivo para não carregar o mapa, ou '' se o token parece utilizável. */
export function problemaDoToken(token) {
  if (!token) return 'Mapa indisponível: configure VITE_MAPBOX_ACCESS_TOKEN (token público pk. do Mapbox) para escolher a posição no mapa.';
  if (!token.startsWith('pk.')) return 'Mapa indisponível: VITE_MAPBOX_ACCESS_TOKEN deve ser um token público (pk.), nunca um token secreto (sk.).';
  return '';
}

function feicoesOutros(outros) {
  return {
    type: 'FeatureCollection',
    features: (outros || [])
      .filter((p) => Number.isFinite(p.latitude) && Number.isFinite(p.longitude))
      .map((p) => ({
        type: 'Feature',
        properties: { nome: p.nome, ativo: Boolean(p.ativo) },
        geometry: { type: 'Point', coordinates: [p.longitude, p.latitude] },
      })),
  };
}

const arredondar = (valor) => Number(valor.toFixed(7));

/**
 * Seletor de posição do PucStop sobre o mapa do campus (Mapbox GL JS).
 * Clique posiciona o marcador (também arrastável) e chama `onChange({latitude, longitude})`;
 * a geofence de `raioMetros` é desenhada em volta. Coordenadas nunca são digitadas.
 */
export default function SeletorPucStopMapa({
  campus,
  erroCampus = '',
  ponto,
  raioMetros,
  outros = [],
  onChange,
  token = MAPBOX_TOKEN,
  estilo = MAPBOX_ESTILO,
}) {
  const containerRef = useRef(null);
  const mapaRef = useRef(null);
  const mapboxRef = useRef(null);
  const marcadorRef = useRef(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const [pronto, setPronto] = useState(false);
  const [falha, setFalha] = useState('');

  const problemaToken = problemaDoToken(token);
  const temPonto = Number.isFinite(ponto?.latitude) && Number.isFinite(ponto?.longitude);
  const fora = temPonto && campus?.limite && !pontoDentroDoPoligono(ponto.longitude, ponto.latitude, campus.limite);
  const indisponivel = problemaToken || falha;

  // Cria o mapa uma vez que haja token e área do campus; mapbox-gl é carregado sob demanda.
  useEffect(() => {
    if (problemaToken || !campus?.bbox || !containerRef.current) return undefined;
    let cancelado = false;
    let mapa = null;
    (async () => {
      try {
        const [modulo] = await Promise.all([import('mapbox-gl'), import('mapbox-gl/dist/mapbox-gl.css')]);
        if (cancelado || !containerRef.current) return;
        const mapboxgl = modulo.default || modulo;
        mapboxgl.accessToken = token;
        mapboxRef.current = mapboxgl;
        const { west, south, east, north } = campus.bbox;
        mapa = new mapboxgl.Map({
          container: containerRef.current,
          style: estilo,
          bounds: [[west, south], [east, north]],
          fitBoundsOptions: { padding: 24 },
          attributionControl: true,
        });
        mapaRef.current = mapa;
        mapa.addControl(new mapboxgl.NavigationControl({ showCompass: false }), 'top-right');
        let carregado = false;
        mapa.on('error', (evento) => {
          // Antes do 'load' o erro impede o mapa (token/estilo inválido); depois, é só um tile.
          if (!carregado && !cancelado) setFalha(`Mapa indisponível: não foi possível carregar o Mapbox${evento?.error?.message ? ` (${evento.error.message})` : ''}. Verifique o token e as restrições de URL.`);
        });
        mapa.on('load', () => {
          if (cancelado) return;
          carregado = true;
          mapa.resize();
          mapa.addSource('area-permitida', { type: 'geojson', data: { type: 'Feature', properties: {}, geometry: campus.limite } });
          mapa.addLayer({ id: 'area-permitida-fill', type: 'fill', source: 'area-permitida', paint: { 'fill-color': COR, 'fill-opacity': 0.06 } });
          mapa.addLayer({ id: 'area-permitida-line', type: 'line', source: 'area-permitida', paint: { 'line-color': COR, 'line-width': 2, 'line-dasharray': [2, 1.5], 'line-opacity': 0.7 } });
          mapa.addSource('outros-pucstops', { type: 'geojson', data: VAZIO });
          mapa.addLayer({
            id: 'outros-pucstops',
            type: 'circle',
            source: 'outros-pucstops',
            paint: {
              'circle-radius': 5,
              'circle-color': ['case', ['get', 'ativo'], '#8b7cf0', '#a3a1b5'],
              'circle-stroke-color': '#fff',
              'circle-stroke-width': 1.5,
            },
          });
          mapa.addSource('geofence', { type: 'geojson', data: VAZIO });
          mapa.addLayer({ id: 'geofence-fill', type: 'fill', source: 'geofence', paint: { 'fill-color': COR, 'fill-opacity': 0.18 } });
          mapa.addLayer({ id: 'geofence-line', type: 'line', source: 'geofence', paint: { 'line-color': COR, 'line-width': 1.5 } });
          mapa.on('click', (evento) => {
            onChangeRef.current?.({ latitude: arredondar(evento.lngLat.lat), longitude: arredondar(evento.lngLat.lng) });
          });
          setPronto(true);
        });
      } catch (error) {
        if (!cancelado) setFalha(`Mapa indisponível: ${error?.message || 'falha ao iniciar o Mapbox'} (verifique o suporte a WebGL do navegador).`);
      }
    })();
    return () => {
      cancelado = true;
      setPronto(false);
      marcadorRef.current?.remove();
      marcadorRef.current = null;
      mapa?.remove();
      mapaRef.current = null;
    };
  }, [problemaToken, token, estilo, campus]);

  // Marcador + círculo da geofence acompanham o ponto e o raio.
  useEffect(() => {
    const mapa = mapaRef.current;
    const mapboxgl = mapboxRef.current;
    if (!pronto || !mapa || !mapboxgl) return;
    if (!temPonto) {
      marcadorRef.current?.remove();
      marcadorRef.current = null;
      mapa.getSource('geofence')?.setData(VAZIO);
      return;
    }
    const posicao = [ponto.longitude, ponto.latitude];
    if (!marcadorRef.current) {
      const marcador = new mapboxgl.Marker({ draggable: true, color: COR }).setLngLat(posicao).addTo(mapa);
      marcador.getElement().setAttribute('aria-label', 'Posição do PucStop (arraste para mover)');
      marcador.on('dragend', () => {
        const { lat, lng } = marcador.getLngLat();
        onChangeRef.current?.({ latitude: arredondar(lat), longitude: arredondar(lng) });
      });
      marcadorRef.current = marcador;
    } else {
      marcadorRef.current.setLngLat(posicao);
    }
    const raio = Number(raioMetros);
    mapa.getSource('geofence')?.setData(Number.isFinite(raio) && raio > 0
      ? { type: 'Feature', properties: {}, geometry: circuloGeofence(ponto.latitude, ponto.longitude, raio) }
      : VAZIO);
  }, [pronto, temPonto, ponto?.latitude, ponto?.longitude, raioMetros]);

  // Outros PucStops (contexto), em pontos discretos.
  useEffect(() => {
    if (!pronto) return;
    mapaRef.current?.getSource('outros-pucstops')?.setData(feicoesOutros(outros));
  }, [pronto, outros]);

  return (
    <div className="pucstop-picker">
      {indisponivel ? (
        <p className="detail-warn" role="alert"><Icon name="alert" size={16} /> {indisponivel}</p>
      ) : erroCampus ? (
        <p className="detail-warn" role="alert"><Icon name="alert" size={16} /> Área do campus indisponível: {erroCampus}</p>
      ) : !campus ? (
        <div className="pucstop-map pucstop-map-loading" role="status"><div className="coord-spinner" aria-hidden="true" /><span>Carregando área do campus…</span></div>
      ) : (
        <>
          <div
            ref={containerRef}
            className="pucstop-map"
            role="region"
            aria-label="Mapa do campus: clique para posicionar o PucStop ou arraste o marcador"
          />
          <p className="pucstop-legend">
            <span><i className="legend-area" aria-hidden="true" /> Área permitida</span>
            <span><i className="legend-geofence" aria-hidden="true" /> Geofence</span>
            {outros.length > 0 && <span><i className="legend-outros" aria-hidden="true" /> Outros PucStops</span>}
          </p>
        </>
      )}
      <p className="pucstop-coords" aria-live="polite">
        {temPonto
          ? <>Posição: <span>{ponto.latitude.toFixed(6)}, {ponto.longitude.toFixed(6)}</span></>
          : 'Nenhuma posição escolhida.'}
      </p>
      {fora && (
        <p className="detail-warn" role="alert">
          <Icon name="alert" size={16} /> O ponto está fora da área permitida do campus. O servidor vai recusar; escolha um ponto dentro da área destacada.
        </p>
      )}
    </div>
  );
}
