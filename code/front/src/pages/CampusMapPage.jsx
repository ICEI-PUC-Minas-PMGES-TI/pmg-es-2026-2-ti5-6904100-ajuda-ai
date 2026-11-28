import { useEffect, useRef, useState } from 'react';
import { api } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import Icon from '../components/Icon';
import Modal from '../components/Modal';
import './campus-map.css';

const TOKEN = import.meta.env.VITE_MAPBOX_ACCESS_TOKEN || '';
const STYLE = import.meta.env.VITE_MAPBOX_STYLE_URI || 'mapbox://styles/mapbox/standard';

function geoJson(predios) {
  return { type: 'FeatureCollection', features: predios.map((p) => ({
    type: 'Feature', id: p.id,
    geometry: p.geometria?.type ? p.geometria : { type: 'Point', coordinates: [p.longitude, p.latitude] },
    properties: { id: p.id, nome: p.nome || p.codigo || p.id, altura: Number(p.altura) || 5 },
  })) };
}

async function baixarOriginal(imagem) {
  const resposta = await fetch(imagem.originalUrl);
  if (!resposta.ok) throw new Error('Não foi possível baixar a imagem.');
  const blob = await resposta.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url; link.download = `ajuda-ai-local-${imagem.id}.${imagem.tipoConteudo?.split('/')[1] || 'jpg'}`;
  document.body.appendChild(link); link.click(); link.remove(); URL.revokeObjectURL(url);
}

export function VisualizadorImagem({ imagem, onFechar }) {
  const [zoom, setZoom] = useState(1);
  const [erro, setErro] = useState('');
  return <div className="local-image-viewer" role="dialog" aria-modal="true" aria-label="Imagem ampliada">
    <header><button type="button" onClick={onFechar} aria-label="Fechar"><Icon name="close" /></button>
      <div className="local-zoom"><button type="button" onClick={() => setZoom(z => Math.max(1, z - .5))} aria-label="Diminuir zoom">−</button><span>{Math.round(zoom * 100)}%</span><button type="button" onClick={() => setZoom(z => Math.min(5, z + .5))} aria-label="Aumentar zoom">+</button></div>
      <button type="button" onClick={() => baixarOriginal(imagem).catch(e => setErro(e.message))}><Icon name="download" /> Baixar imagem</button>
    </header>
    {erro && <p role="alert">{erro}</p>}
    <div className="local-image-stage"><img src={imagem.originalUrl} alt="" style={{ transform: `scale(${zoom})` }} /></div>
  </div>;
}

export function EditorLocal({ local, onFechar, onSalvo }) {
  const [descricao, setDescricao] = useState(local.descricao || '');
  const [imagensAtuais, setImagensAtuais] = useState(local.imagens || []);
  const [novas, setNovas] = useState([]);
  const [substituicoes, setSubstituicoes] = useState({});
  const [removidas, setRemovidas] = useState(new Set());
  const [salvando, setSalvando] = useState(false);
  const [progresso, setProgresso] = useState(0);
  const [erro, setErro] = useState('');

  function validar(arquivos) {
    const lista = [...arquivos];
    const invalido = lista.find(a => !['image/png', 'image/jpeg', 'image/webp'].includes(a.type) || a.size > 10 * 1024 * 1024);
    if (invalido) { setErro('Use imagens PNG, JPEG ou WebP de até 10 MB.'); return []; }
    return lista;
  }
  function adicionarNovas(arquivos) {
    const validas = validar(arquivos);
    if (!validas.length) return;
    const existentes = imagensAtuais.filter(i => !removidas.has(i.id)).length;
    const disponiveis = Math.max(0, 10 - existentes - novas.length);
    if (validas.length > disponiveis) setErro('Cada local aceita até 10 imagens.');
    setNovas(atual => [...atual, ...validas.slice(0, disponiveis)]);
  }
  async function salvar(e) {
    e.preventDefault(); setSalvando(true); setErro('');
    const total = (novas.length ? 1 : 0) + Object.keys(substituicoes).length + removidas.size + 1;
    let feitas = 0;
    try {
      // Libera vagas primeiro. Cada operação concluída sai da fila para que uma
      // nova tentativa após falha não repita upload, substituição ou remoção.
      for (const id of [...removidas]) {
        const salvo = await api.removerImagemLocal(local.id, id);
        setImagensAtuais(salvo.imagens || []);
        setRemovidas(atual => { const proximo = new Set(atual); proximo.delete(id); return proximo; });
        setProgresso(++feitas / total);
      }
      for (const [id, arquivo] of Object.entries(substituicoes)) {
        const salvo = await api.substituirImagemLocal(local.id, id, arquivo);
        setImagensAtuais(salvo.imagens || []);
        setSubstituicoes(atual => { const proximo = { ...atual }; delete proximo[id]; return proximo; });
        setProgresso(++feitas / total);
      }
      if (novas.length) {
        const salvo = await api.adicionarImagensLocal(local.id, novas);
        setImagensAtuais(salvo.imagens || []);
        setNovas([]);
        setProgresso(++feitas / total);
      }
      const salvo = await api.atualizarInformacoesLocal(local.id, descricao); setProgresso(1); onSalvo(salvo);
    } catch (e2) { setErro(e2.message || 'Não foi possível salvar.'); setSalvando(false); }
  }
  return <Modal titulo="Editar informações" descricao={local.nome || local.codigo} onFechar={() => !salvando && onFechar()} tamanho="lg">
    <form className="local-editor" onSubmit={salvar}>
      <label><span>Descrição</span><textarea value={descricao} maxLength={10000} rows={6} disabled={salvando} onChange={e => setDescricao(e.target.value)} /></label>
      <label className="local-add"><span>Adicionar imagens</span><input type="file" accept="image/png,image/jpeg,image/webp" multiple disabled={salvando} onChange={e => adicionarNovas(e.target.files)} /></label>
      <div className="local-edit-images">
        {imagensAtuais.filter(i => !removidas.has(i.id)).map(imagem => <article key={imagem.id}>
          <img src={substituicoes[imagem.id] ? URL.createObjectURL(substituicoes[imagem.id]) : imagem.url} alt="Prévia" />
          <label>Substituir<input type="file" accept="image/png,image/jpeg,image/webp" disabled={salvando} onChange={e => { const [a] = validar(e.target.files); if (a) setSubstituicoes(s => ({ ...s, [imagem.id]: a })); }} /></label>
          <button type="button" disabled={salvando} onClick={() => { setRemovidas(s => new Set([...s, imagem.id])); setSubstituicoes(s => { const proximo = { ...s }; delete proximo[imagem.id]; return proximo; }); }}>Remover</button>
        </article>)}
        {novas.map((arquivo, i) => <article key={`${arquivo.name}-${i}`}><img src={URL.createObjectURL(arquivo)} alt="Prévia da nova imagem" /><span>{arquivo.name}</span><button type="button" onClick={() => setNovas(a => a.filter((_, n) => n !== i))}>Remover</button></article>)}
      </div>
      {salvando && <><progress value={progresso} max="1" /><p>Enviando e salvando…</p></>}
      {erro && <p className="form-error" role="alert">{erro}</p>}
      <div className="local-editor-actions"><button type="button" onClick={onFechar} disabled={salvando}>Cancelar</button><button className="primary-button" disabled={salvando} type="submit">Salvar informações</button></div>
    </form>
  </Modal>;
}

export default function CampusMapPage({ coordenador = false }) {
  const { ehCoordenador } = useAuth();
  const podeEditar = coordenador && ehCoordenador;
  const container = useRef(null); const mapRef = useRef(null);
  const [predios, setPredios] = useState([]); const [local, setLocal] = useState(null);
  const [carregando, setCarregando] = useState(false); const [erro, setErro] = useState('');
  const [editando, setEditando] = useState(false); const [imagem, setImagem] = useState(null);

  async function abrir(id) { setCarregando(true); setErro(''); try { setLocal(await api.predio(id)); } catch (e) { setErro(e.message); } finally { setCarregando(false); } }
  useEffect(() => { api.predios().then(setPredios).catch(e => setErro(e.message)); }, []);
  useEffect(() => {
    // Aguarda os prédios antes de criar a source. Se o mapa nascer com a lista
    // vazia, o efeito seguinte encontra `mapRef.current` e os pontos nunca
    // aparecem — especialmente em conexões mais lentas.
    if (!predios.length || !container.current || mapRef.current || !TOKEN.startsWith('pk.')) return undefined;
    let mapa;
    import('mapbox-gl').then(modulo => {
      const mapboxgl = modulo.default || modulo; mapboxgl.accessToken = TOKEN;
      mapa = new mapboxgl.Map({ container: container.current, style: STYLE, center: [-43.9933884, -19.92298695], zoom: 16.5, pitch: 48, bearing: -12, antialias: true }); mapRef.current = mapa;
      mapa.addControl(new mapboxgl.NavigationControl(), 'top-right');
      mapa.on('load', () => {
        mapa.addSource('locais', { type: 'geojson', data: geoJson(predios) });
        mapa.addLayer({ id: 'locais-3d', type: 'fill-extrusion', source: 'locais', filter: ['==', ['geometry-type'], 'Polygon'], paint: { 'fill-extrusion-color': ['interpolate', ['linear'], ['get', 'altura'], 3, '#a78bfa', 12, '#5b21b6'], 'fill-extrusion-height': ['get', 'altura'], 'fill-extrusion-base': 0, 'fill-extrusion-opacity': .82 } });
        mapa.addLayer({ id: 'locais-pontos', type: 'circle', source: 'locais', filter: ['==', ['geometry-type'], 'Point'], paint: { 'circle-radius': 7, 'circle-color': '#420594', 'circle-stroke-color': '#fff', 'circle-stroke-width': 2 } });
        mapa.addLayer({ id: 'locais-nomes', type: 'symbol', source: 'locais', minzoom: 16, layout: { 'text-field': ['get', 'nome'], 'text-size': 11, 'text-offset': [0, 1.3], 'text-anchor': 'top' }, paint: { 'text-color': '#24103f', 'text-halo-color': '#fff', 'text-halo-width': 1.5 } });
        for (const camada of ['locais-3d', 'locais-pontos', 'locais-nomes']) {
          mapa.on('click', camada, e => abrir(e.features?.[0]?.properties?.id));
          mapa.on('mouseenter', camada, () => { mapa.getCanvas().style.cursor = 'pointer'; });
          mapa.on('mouseleave', camada, () => { mapa.getCanvas().style.cursor = ''; });
        }
      });
    }).catch(() => setErro('Não foi possível carregar o mapa.'));
    return () => { mapa?.remove(); mapRef.current = null; };
  }, [predios]);

  async function irAte() {
    if (!local) return;
    navigator.geolocation.getCurrentPosition(async p => {
      try {
        const rota = await api.rotaMapa({ origem: { latitude: p.coords.latitude, longitude: p.coords.longitude }, destino: { id: local.id }, acessivel: false });
        const mapa = mapRef.current; if (!mapa) return;
        const data = { type: 'Feature', geometry: rota.geometria, properties: {} };
        if (mapa.getSource('rota-local')) mapa.getSource('rota-local').setData(data); else { mapa.addSource('rota-local', { type: 'geojson', data }); mapa.addLayer({ id: 'rota-local', type: 'line', source: 'rota-local', paint: { 'line-color': '#7c3aed', 'line-width': 5 } }); }
      } catch (e) { setErro(e.message); }
    }, () => setErro('Permita o acesso à localização para calcular a rota.'));
  }

  return <section className="campus-map-page"><header><h1>Mapa do campus</h1><p>Selecione um prédio para ver informações, imagens e rota.</p></header>
    {erro && <p className="dash-inline-error" role="alert">{erro}</p>}
    {!TOKEN.startsWith('pk.') && <p role="alert">Configure VITE_MAPBOX_ACCESS_TOKEN para carregar o mapa.</p>}
    <div className="campus-map-shell"><div ref={container} className="campus-map-canvas" aria-label="Mapa de locais da PUC Minas" />
      {(local || carregando) && <aside className="campus-place-panel" aria-live="polite">{carregando ? <p>Carregando local…</p> : <>
        <button className="campus-place-close" type="button" onClick={() => setLocal(null)} aria-label="Fechar"><Icon name="close" /></button>
        <h2>{local.nome || local.codigo}</h2>{local.codigo && <p className="detail-muted">Código {local.codigo}</p>}
        {local.descricao && <p className="campus-place-description">{local.descricao}</p>}
        {!!local.imagens?.length && <div className="campus-place-images">{local.imagens.map(i => <button type="button" key={i.id} onClick={() => setImagem(i)}><img src={i.url} alt={`Imagem de ${local.nome || 'local'}`} /></button>)}</div>}
        <button type="button" className="primary-button" onClick={irAte}><Icon name="map" /> Ir até o local</button>
        {podeEditar && <button type="button" className="outline-button" onClick={() => setEditando(true)}><Icon name="edit" /> Editar informações</button>}
      </>}</aside>}
    </div>
    {imagem && <VisualizadorImagem imagem={imagem} onFechar={() => setImagem(null)} />}
    {editando && <EditorLocal local={local} onFechar={() => setEditando(false)} onSalvo={salvo => { setLocal(atual => ({ ...atual, ...salvo })); setEditando(false); }} />}
  </section>;
}
