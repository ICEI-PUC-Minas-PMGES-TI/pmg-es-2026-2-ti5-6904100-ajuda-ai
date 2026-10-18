import { useCallback, useEffect, useId, useMemo, useState } from 'react';
import { api } from '../../api/client';
import Icon from '../../components/Icon';
import SeletorPontoMapa from './SeletorPontoMapa';

/** Formas de informar o local de um evento/restaurante ("Sem local" só para eventos). */
export const MODOS_LOCAL = [
  { valor: 'predio', rotulo: 'Prédio do mapa' },
  { valor: 'area', rotulo: 'Área' },
  { valor: 'ponto', rotulo: 'Ponto no mapa' },
  { valor: 'nenhum', rotulo: 'Sem local' },
];

const temCoordenadas = (form) => Number.isFinite(form?.latitude) && Number.isFinite(form?.longitude);

/** Estado do seletor a partir do LocalDto lido da API (ou null). */
export function formDoLocal(local, { permitirSemLocal = false } = {}) {
  const base = { modo: permitirSemLocal ? 'nenhum' : 'predio', predioId: '', areaId: '', latitude: null, longitude: null, nome: '' };
  if (!local) return base;
  const nome = local.nome ?? '';
  if (local.tipo === 'predio') return { ...base, modo: 'predio', predioId: local.id ?? '', nome };
  if (local.tipo === 'area') return { ...base, modo: 'area', areaId: local.id ?? '', nome };
  if (local.tipo === 'ponto') return { ...base, modo: 'ponto', latitude: local.latitude ?? null, longitude: local.longitude ?? null, nome };
  return base;
}

/** LocalEntrada para a API (exatamente uma forma), ou null se não há local completo. */
export function localParaEntrada(form) {
  if (!form) return null;
  if (form.modo === 'predio') return form.predioId ? { predioId: form.predioId } : null;
  if (form.modo === 'area') return form.areaId ? { areaId: form.areaId } : null;
  if (form.modo === 'ponto') return temCoordenadas(form) ? { latitude: form.latitude, longitude: form.longitude } : null;
  return null;
}

/** LocalEntrada equivalente a um LocalDto lido da API (para comparar no PATCH). */
export function entradaDoLocal(local) {
  if (!local) return null;
  if (local.tipo === 'predio' && local.id) return { predioId: local.id };
  if (local.tipo === 'area' && local.id) return { areaId: local.id };
  if (local.tipo === 'ponto' && temCoordenadas(local)) return { latitude: local.latitude, longitude: local.longitude };
  return null;
}

/** Duas LocalEntrada (ou null) apontam para o mesmo lugar? */
export function mesmaEntrada(a, b) {
  if (!a || !b) return !a && !b;
  if ('predioId' in a || 'predioId' in b) return a.predioId === b.predioId;
  if ('areaId' in a || 'areaId' in b) return a.areaId === b.areaId;
  return a.latitude === b.latitude && a.longitude === b.longitude;
}

/** Primeira pendência do local, ou '' se pode ser enviado. */
export function validarLocal(form, { obrigatorio = false } = {}) {
  const modo = form?.modo || 'nenhum';
  if (modo === 'nenhum') return obrigatorio ? 'Escolha o local: um prédio do mapa, uma área ou um ponto.' : '';
  if (modo === 'predio' && !form.predioId) return 'Escolha o prédio do mapa.';
  if (modo === 'area' && !form.areaId) return 'Escolha a área do mapa.';
  if (modo === 'ponto' && !temCoordenadas(form)) return 'Clique no mapa para escolher o ponto.';
  return '';
}

/** Texto em minúsculas e sem acentos, para busca. */
export function normalizarBusca(texto) {
  return String(texto ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
}

/** Prédios cujo nome, código ou id contém o termo (sem diferenciar acentos/maiúsculas). */
export function filtrarPredios(lista, termo) {
  const alvo = normalizarBusca(termo);
  if (!alvo) return [...(lista || [])];
  return (lista || []).filter((p) => [p.nome, p.codigo, p.id].some((v) => normalizarBusca(v).includes(alvo)));
}

export function rotuloPredio(predio) {
  if (!predio) return '';
  const { nome, codigo, id } = predio;
  if (nome && codigo && codigo !== nome) return `${nome} (${codigo})`;
  if (nome) return nome;
  if (codigo) return `Prédio ${codigo}`;
  return `Prédio ${id}`;
}

export function rotuloArea(area) {
  if (!area) return '';
  return area.nome || (area.categoria ? `Área sem nome (${area.categoria})` : 'Área sem nome');
}

/** Nome do local para listas. */
export function rotuloLocal(local) {
  if (!local) return 'Sem local';
  if (local.tipo === 'predio') return local.nome || `Prédio ${local.id}`;
  if (local.tipo === 'area') return local.nome || 'Área do mapa';
  return local.nome || 'Ponto no mapa';
}

/** Mensagem para recusas do servidor relacionadas ao local (422/503). */
export function mensagemErroLocal(error, padrao = 'Não foi possível salvar.') {
  if (error?.motivo === 'fora-do-campus') return 'O servidor recusou: o ponto está fora do campus. Escolha um ponto dentro da área permitida.';
  if (error?.motivo === 'local-inexistente') return 'O servidor recusou: o prédio ou a área escolhidos não existem no mapa ativo. Escolha outro local.';
  if (error?.status === 503) return 'O mapa do campus não tem uma versão ativa no momento. Tente novamente mais tarde.';
  return error?.message || padrao;
}

const porRotulo = (rotulo) => (a, b) => rotulo(a).localeCompare(rotulo(b), 'pt-BR');

/** Carrega área do campus, prédios e áreas do mapa ativo (uma vez por página). */
export function useDadosMapa() {
  const [campus, setCampus] = useState(null);
  const [erroCampus, setErroCampus] = useState('');
  const [predios, setPredios] = useState(null);
  const [areas, setAreas] = useState(null);
  const [erroMapa, setErroMapa] = useState('');

  const recarregar = useCallback(async () => {
    setErroCampus('');
    setErroMapa('');
    const [c, p, a] = await Promise.allSettled([api.campus(), api.predios(), api.areas()]);
    if (c.status === 'fulfilled') setCampus(c.value);
    else {
      setCampus(null);
      setErroCampus(c.reason?.status === 503
        ? 'o mapa do campus ainda não tem uma versão ativa.'
        : c.reason?.message || 'não foi possível carregar a área do campus.');
    }
    setPredios(p.status === 'fulfilled' ? [...(p.value || [])].sort(porRotulo(rotuloPredio)) : []);
    setAreas(a.status === 'fulfilled' ? [...(a.value || [])].sort(porRotulo(rotuloArea)) : []);
    const falha = [p, a].find((r) => r.status === 'rejected');
    if (falha) setErroMapa(`Não foi possível carregar os prédios e áreas do mapa: ${falha.reason?.message || 'erro desconhecido.'}`);
  }, []);

  useEffect(() => { recarregar(); }, [recarregar]);

  return { campus, erroCampus, predios, areas, erroMapa, recarregar };
}

/**
 * Seletor do local de um evento/restaurante: prédio do mapa (busca por nome,
 * código ou id), área, ponto no mapa (clique/arraste) e, se permitido, sem
 * local. O prédio/área escolhidos aparecem destacados no mapa.
 */
export default function SeletorLocal({
  valor,
  onChange,
  campus,
  erroCampus = '',
  predios = null,
  areas = null,
  erroMapa = '',
  permitirSemLocal = false,
  token,
  estilo,
}) {
  const base = useId();
  const [busca, setBusca] = useState('');
  const modos = MODOS_LOCAL.filter((m) => permitirSemLocal || m.valor !== 'nenhum');
  const modo = valor?.modo || (permitirSemLocal ? 'nenhum' : 'predio');

  const filtrados = useMemo(() => filtrarPredios(predios, busca), [predios, busca]);
  const predioEscolhido = useMemo(() => (predios || []).find((p) => p.id === valor?.predioId) || null, [predios, valor?.predioId]);
  const areaEscolhida = useMemo(() => (areas || []).find((a) => a.id === valor?.areaId) || null, [areas, valor?.areaId]);

  const destaque = useMemo(() => {
    if (modo === 'predio' && predioEscolhido && Number.isFinite(predioEscolhido.latitude) && Number.isFinite(predioEscolhido.longitude)) {
      return { type: 'Point', coordinates: [predioEscolhido.longitude, predioEscolhido.latitude] };
    }
    if (modo === 'area' && areaEscolhida) {
      if (areaEscolhida.geometria?.type) return areaEscolhida.geometria;
      if (Number.isFinite(areaEscolhida.latitude) && Number.isFinite(areaEscolhida.longitude)) return { type: 'Point', coordinates: [areaEscolhida.longitude, areaEscolhida.latitude] };
    }
    return null;
  }, [modo, predioEscolhido, areaEscolhida]);

  function alterar(campos) {
    onChange?.({ ...valor, ...campos });
  }

  // Opção do valor atual, mesmo se filtrada pela busca ou fora do mapa carregado.
  const opcoesPredio = predioEscolhido && !filtrados.some((p) => p.id === predioEscolhido.id) ? [predioEscolhido, ...filtrados] : filtrados;
  const predioAusente = valor?.predioId && !predioEscolhido;
  const areaAusente = valor?.areaId && !areaEscolhida;

  return (
    <div className="local-picker">
      <div className="filter-chips" role="radiogroup" aria-label="Como informar o local">
        {modos.map((m) => (
          <button
            key={m.valor}
            type="button"
            role="radio"
            aria-checked={modo === m.valor}
            className={`filter-chip${modo === m.valor ? ' active' : ''}`}
            onClick={() => alterar({ modo: m.valor })}
          >
            {m.rotulo}
          </button>
        ))}
      </div>

      {erroMapa && modo !== 'nenhum' && modo !== 'ponto' && <p className="detail-warn" role="alert"><Icon name="alert" size={16} /> {erroMapa}</p>}

      {modo === 'predio' && (
        <div className="editor-grid local-grid">
          <label className="editor-field" htmlFor={`${base}-busca`}>
            <span>Buscar prédio</span>
            <input id={`${base}-busca`} type="search" value={busca} placeholder="Nome, código ou id (ex.: P16)" onChange={(e) => setBusca(e.target.value)} />
          </label>
          <label className="editor-field" htmlFor={`${base}-predio`}>
            <span>Prédio</span>
            <select id={`${base}-predio`} value={valor?.predioId || ''} disabled={!predios} onChange={(e) => alterar({ predioId: e.target.value })}>
              <option value="">{!predios ? 'Carregando prédios…' : filtrados.length ? `Selecione um prédio (${filtrados.length})` : 'Nenhum prédio encontrado'}</option>
              {predioAusente && <option value={valor.predioId}>{valor.nome || `Prédio ${valor.predioId}`}</option>}
              {opcoesPredio.map((p) => <option key={p.id} value={p.id}>{rotuloPredio(p)}</option>)}
            </select>
          </label>
        </div>
      )}

      {modo === 'area' && (
        <label className="editor-field" htmlFor={`${base}-area`}>
          <span>Área</span>
          <select id={`${base}-area`} value={valor?.areaId || ''} disabled={!areas} onChange={(e) => alterar({ areaId: e.target.value })}>
            <option value="">{!areas ? 'Carregando áreas…' : areas.length ? `Selecione uma área (${areas.length})` : 'Nenhuma área no mapa'}</option>
            {areaAusente && <option value={valor.areaId}>{valor.nome || 'Área atual'}</option>}
            {(areas || []).map((a) => <option key={a.id} value={a.id}>{rotuloArea(a)}</option>)}
          </select>
        </label>
      )}

      {predioAusente && modo === 'predio' && predios && <p className="detail-warn" role="alert"><Icon name="alert" size={16} /> O prédio atual não está no mapa ativo. Escolha outro prédio.</p>}
      {areaAusente && modo === 'area' && areas && <p className="detail-warn" role="alert"><Icon name="alert" size={16} /> A área atual não está no mapa ativo. Escolha outra área.</p>}

      {modo === 'nenhum' ? (
        <p className="field-hint">O evento fica sem lugar fixo no mapa.</p>
      ) : (
        <>
          {modo === 'ponto' && <p className="field-hint">Clique no mapa ou arraste o marcador.</p>}
          <SeletorPontoMapa
            campus={campus}
            erroCampus={erroCampus}
            ponto={modo === 'ponto' ? { latitude: valor?.latitude, longitude: valor?.longitude } : null}
            destaque={destaque}
            rotuloDestaque={modo === 'area' ? 'Área escolhida' : 'Prédio escolhido'}
            mostrarCoordenadas={modo === 'ponto'}
            rotuloMapa={modo === 'ponto'
              ? 'Mapa do campus: clique para escolher o ponto ou arraste o marcador'
              : 'Mapa do campus com o local escolhido destacado'}
            onChange={modo === 'ponto' ? ({ latitude, longitude }) => alterar({ latitude, longitude }) : undefined}
            {...(token !== undefined ? { token } : {})}
            {...(estilo !== undefined ? { estilo } : {})}
          />
        </>
      )}
    </div>
  );
}
