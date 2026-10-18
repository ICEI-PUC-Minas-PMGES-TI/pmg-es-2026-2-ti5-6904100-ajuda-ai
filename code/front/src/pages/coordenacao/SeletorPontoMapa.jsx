import { useEffect, useRef, useState } from 'react';
import Icon from '../../components/Icon';

/** Token público (pk.) do Mapbox, o mesmo usado pelo app mobile. */
export const MAPBOX_TOKEN = (import.meta.env.VITE_MAPBOX_ACCESS_TOKEN || '').trim();
export const MAPBOX_ESTILO = (import.meta.env.VITE_MAPBOX_STYLE_URI || '').trim() || 'mapbox://styles/mapbox/streets-v12';

const RAIO_TERRA_M = 6371008.8;
const VAZIO = { type: 'FeatureCollection', features: [] };
const COR = '#4a34cf';
const COR_DESTAQUE = '#e8590c';

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

/** Caixa [[oeste, sul], [leste, norte]] de uma geometria GeoJSON, ou null. */
export function caixaDaGeometria(geometria) {
  const coordenadas = [];
  const visitar = (valor) => {
    if (!Array.isArray(valor)) return;
    if (typeof valor[0] === 'number' && typeof valor[1] === 'number') coordenadas.push(valor);
    else valor.forEach(visitar);
  };
  visitar(geometria?.coordinates);
  const validas = coordenadas.filter(([lon, lat]) => Number.isFinite(lon) && Number.isFinite(lat));
  if (validas.length === 0) return null;
  const lons = validas.map((c) => c[0]);
  const lats = validas.map((c) => c[1]);
  return [[Math.min(...lons), Math.min(...lats)], [Math.max(...lons), Math.max(...lats)]];
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
 * Mapa do campus (Mapbox GL JS) para escolher um ponto: o clique posiciona o
 * marcador (também arrastável) e chama `onChange({latitude, longitude})`.
 * Sem `onChange`, o mapa só mostra (ex.: o prédio ou a área escolhidos em
 * `destaque`). Com `geofence`, desenha o círculo de `raioMetros` em volta do
 * ponto. A área permitida (`campus.limite`) é sempre desenhada. Coordenadas
 * nunca são digitadas.
 */
export default function SeletorPontoMapa({
  campus,
  erroCampus = '',
  ponto,
  geofence = false,
  raioMetros,
  outros = [],
  rotuloOutros = 'Outros pontos',
  destaque = null,
  rotuloDestaque = 'Local escolhido',
  rotuloMapa = 'Mapa do campus: clique para escolher o ponto ou arraste o marcador',
  rotuloMarcador = 'Ponto escolhido (arraste para mover)',
  mostrarCoordenadas = true,
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
  const rotuloMarcadorRef = useRef(rotuloMarcador);
  rotuloMarcadorRef.current = rotuloMarcador;
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
          mapa.addSource('destaque', { type: 'geojson', data: VAZIO });
          mapa.addLayer({ id: 'destaque-fill', type: 'fill', source: 'destaque', filter: ['!=', ['geometry-type'], 'Point'], paint: { 'fill-color': COR_DESTAQUE, 'fill-opacity': 0.25 } });
          mapa.addLayer({ id: 'destaque-line', type: 'line', source: 'destaque', filter: ['!=', ['geometry-type'], 'Point'], paint: { 'line-color': COR_DESTAQUE, 'line-width': 2 } });
          mapa.addLayer({
            id: 'destaque-ponto',
            type: 'circle',
            source: 'destaque',
            filter: ['==', ['geometry-type'], 'Point'],
            paint: { 'circle-radius': 8, 'circle-color': COR_DESTAQUE, 'circle-stroke-color': '#fff', 'circle-stroke-width': 2 },
          });
          mapa.addSource('outros-pontos', { type: 'geojson', data: VAZIO });
          mapa.addLayer({
            id: 'outros-pontos',
            type: 'circle',
            source: 'outros-pontos',
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

  // Marcador (+ círculo da geofence, se pedido) acompanham o ponto e o raio.
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
      marcador.getElement().setAttribute('aria-label', rotuloMarcadorRef.current);
      marcador.on('dragend', () => {
        const { lat, lng } = marcador.getLngLat();
        onChangeRef.current?.({ latitude: arredondar(lat), longitude: arredondar(lng) });
      });
      marcadorRef.current = marcador;
    } else {
      marcadorRef.current.setLngLat(posicao);
    }
    const raio = Number(raioMetros);
    mapa.getSource('geofence')?.setData(geofence && Number.isFinite(raio) && raio > 0
      ? { type: 'Feature', properties: {}, geometry: circuloGeofence(ponto.latitude, ponto.longitude, raio) }
      : VAZIO);
  }, [pronto, temPonto, ponto?.latitude, ponto?.longitude, raioMetros, geofence]);

  // Outros pontos (contexto), em círculos discretos.
  useEffect(() => {
    if (!pronto) return;
    mapaRef.current?.getSource('outros-pontos')?.setData(feicoesOutros(outros));
  }, [pronto, outros]);

  // Prédio/área escolhidos: destacados e enquadrados.
  useEffect(() => {
    const mapa = mapaRef.current;
    if (!pronto || !mapa) return;
    mapa.getSource('destaque')?.setData(destaque ? { type: 'Feature', properties: {}, geometry: destaque } : VAZIO);
    const caixa = destaque ? caixaDaGeometria(destaque) : null;
    if (caixa) mapa.fitBounds(caixa, { padding: 60, maxZoom: 18, duration: 500 });
  }, [pronto, destaque]);

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
            aria-label={rotuloMapa}
          />
          <p className="pucstop-legend">
            <span><i className="legend-area" aria-hidden="true" /> Área permitida</span>
            {geofence && <span><i className="legend-geofence" aria-hidden="true" /> Geofence</span>}
            {destaque && <span><i className="legend-destaque" aria-hidden="true" /> {rotuloDestaque}</span>}
            {outros.length > 0 && <span><i className="legend-outros" aria-hidden="true" /> {rotuloOutros}</span>}
          </p>
        </>
      )}
      {mostrarCoordenadas && (
        <p className="pucstop-coords" aria-live="polite">
          {temPonto
            ? <>Posição: <span>{ponto.latitude.toFixed(6)}, {ponto.longitude.toFixed(6)}</span></>
            : 'Nenhuma posição escolhida.'}
        </p>
      )}
      {fora && (
        <p className="detail-warn" role="alert">
          <Icon name="alert" size={16} /> O ponto está fora da área permitida do campus. O servidor vai recusar; escolha um ponto dentro da área destacada.
        </p>
      )}
    </div>
  );
}
