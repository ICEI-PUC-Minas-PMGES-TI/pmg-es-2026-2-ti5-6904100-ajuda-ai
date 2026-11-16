import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { api } from '../../api/client';
import Icon from '../../components/Icon';
import Modal from '../../components/Modal';
import Toggle from '../../components/Toggle';
import { useToast } from '../../components/Toast';
import { dataCurta } from './comum';
import SeletorPucStopMapa, { pontoDentroDoPoligono } from './SeletorPucStopMapa';

/** Limites iguais aos do servidor (que continua sendo a autoridade). */
export const LIMITES_PUCSTOP = { nomeMax: 120, raioMin: 10, raioMax: 200 };
/** Recompensas aceitas pelo servidor (BL-50); as moedas acompanham 1:1. */
export const RECOMPENSAS_PUCSTOP = [10, 20, 30, 40, 50];
export const RECOMPENSA_PUCSTOP_PADRAO = 30;

/**
 * XP potencial dos totens ativos depois de salvar: tira o valor antigo do
 * próprio totem (se ativo) e soma o novo (se continua ativo). Inativos não
 * entram no orçamento.
 */
export function potencialAposSalvar({ potencialAtual, original = null, novoXp }) {
  const ativo = !original || original.ativo === true;
  const antigo = original && original.ativo === true ? Number(original.xp) : 0;
  return potencialAtual - antigo + (ativo ? novoXp : 0);
}

/** Aviso informativo (nunca bloqueia) quando o mapa passa do teto individual. */
export function avisoTetoTotens(potencial, limite) {
  return `Os totens ativos oferecem ${potencial} XP. Cada participante poderá receber até ${limite} XP neste ciclo. Após atingir o limite, novas visitas serão registradas sem recompensas adicionais.`;
}

const FILTROS = [
  { valor: 'todos', rotulo: 'Todos' },
  { valor: 'ativos', rotulo: 'Ativos' },
  { valor: 'inativos', rotulo: 'Inativos' },
];

/** Estado do formulário (campos numéricos como texto, como nos inputs). */
export function formDoPucStop(pucstop) {
  return {
    nome: pucstop?.nome ?? '',
    xp: pucstop ? String(pucstop.xp) : String(RECOMPENSA_PUCSTOP_PADRAO),
    raioMetros: pucstop ? String(pucstop.raioMetros) : '30',
    latitude: pucstop?.latitude ?? null,
    longitude: pucstop?.longitude ?? null,
    ativo: pucstop?.ativo ?? true,
  };
}

/** Primeira inconsistência do formulário, ou '' se pode ser enviado. */
export function validarPucStop(form, { criando = false } = {}) {
  const { nomeMax, raioMin, raioMax } = LIMITES_PUCSTOP;
  const nome = String(form.nome ?? '').trim();
  if (!nome) return 'Informe o nome do PucStop.';
  if (nome.length > nomeMax) return `O nome deve ter no máximo ${nomeMax} caracteres.`;
  const xpTexto = String(form.xp ?? '').trim();
  const xp = Number(xpTexto);
  if (!xpTexto || !RECOMPENSAS_PUCSTOP.includes(xp)) return 'Escolha a recompensa: 10, 20, 30, 40 ou 50 XP.';
  const raioTexto = String(form.raioMetros ?? '').trim();
  const raio = Number(raioTexto);
  if (!raioTexto || !Number.isFinite(raio) || raio < raioMin || raio > raioMax) return `O raio da geofence deve estar entre ${raioMin} e ${raioMax} metros.`;
  const temPonto = Number.isFinite(form.latitude) && Number.isFinite(form.longitude);
  if (criando && !temPonto) return 'Escolha a posição do PucStop no mapa.';
  if (!criando && (form.latitude != null || form.longitude != null) && !temPonto) return 'Posição inválida: escolha novamente no mapa.';
  return '';
}

/** Corpo do POST de criação. */
export function corpoCriacao(form) {
  return {
    nome: String(form.nome).trim(),
    latitude: form.latitude,
    longitude: form.longitude,
    xp: Number(form.xp),
    raioMetros: Number(form.raioMetros),
    ativo: Boolean(form.ativo),
  };
}

/** Só os campos alterados para o PATCH; latitude e longitude vão sempre juntas. */
export function camposAlterados(original, form) {
  const alterados = {};
  const nome = String(form.nome ?? '').trim();
  if (nome !== original.nome) alterados.nome = nome;
  const xp = Number(form.xp);
  if (xp !== Number(original.xp)) alterados.xp = xp;
  const raio = Number(form.raioMetros);
  if (raio !== Number(original.raioMetros)) alterados.raioMetros = raio;
  const temPonto = Number.isFinite(form.latitude) && Number.isFinite(form.longitude);
  if (temPonto && (form.latitude !== original.latitude || form.longitude !== original.longitude)) {
    alterados.latitude = form.latitude;
    alterados.longitude = form.longitude;
  }
  return alterados;
}

function ordenarPorNome(lista) {
  return [...lista].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
}

function formatarNumero(valor) {
  return Number(valor).toLocaleString('pt-BR', { maximumFractionDigits: 1 });
}

/** Tabela de PucStops (apresentação pura: sem efeitos, renderizável no servidor). */
export function ListaPucStops({ pucstops, ocupadoId = null, onEditar, onExcluir, onReativar }) {
  return (
    <div className="users-table-wrap">
      <table className="users-table pucstops-table">
        <caption className="sr-only">PucStops do campus</caption>
        <thead>
          <tr>
            <th scope="col">PucStop</th>
            <th scope="col">Status</th>
            <th scope="col">Recompensa</th>
            <th scope="col">Raio</th>
            <th scope="col">Coletas</th>
            <th scope="col">Atualizado em</th>
            <th scope="col"><span className="sr-only">Ações</span></th>
          </tr>
        </thead>
        <tbody>
          {pucstops.map((p) => {
            const ocupado = ocupadoId === p.id;
            return (
              <tr key={p.id} className={p.ativo ? undefined : 'inativo'}>
                <td data-label="PucStop">
                  <span className="user-cell">
                    <span className="pucstop-icon" aria-hidden="true"><Icon name="pin" size={16} /></span>
                    <strong>{p.nome}</strong>
                  </span>
                </td>
                <td data-label="Status"><span className={`flag ${p.ativo ? 'green' : 'muted'}`}>{p.ativo ? 'Ativo' : 'Inativo'}</span></td>
                <td data-label="Recompensa">{p.xp} XP + {p.xp} moedas</td>
                <td data-label="Raio">{formatarNumero(p.raioMetros)} m</td>
                <td data-label="Coletas">{p.coletas ?? 0}</td>
                <td data-label="Atualizado em">{dataCurta(p.atualizadoEm) || '—'}</td>
                <td className="user-actions">
                  <button type="button" className="mini-btn" disabled={ocupado} onClick={() => onEditar?.(p)} aria-label={`Editar PucStop ${p.nome}`}>
                    <Icon name="edit" size={14} /> Editar
                  </button>
                  {p.ativo ? (
                    <button type="button" className="mini-btn danger" disabled={ocupado} onClick={() => onExcluir?.(p)} aria-label={`Excluir (desativar) PucStop ${p.nome}`}>
                      <Icon name="trash" size={14} /> Excluir
                    </button>
                  ) : (
                    <button type="button" className="mini-btn success" disabled={ocupado} onClick={() => onReativar?.(p)} aria-label={`Reativar PucStop ${p.nome}`}>
                      <Icon name="refresh" size={14} /> {ocupado ? 'Reativando…' : 'Reativar'}
                    </button>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/** Confirmação do "Excluir": desativação lógica, sem apagar histórico. */
export function ConfirmarDesativacao({ pucstop, ocupado, erro, onConfirmar, onFechar }) {
  const fechar = () => { if (!ocupado) onFechar(); };
  return (
    <Modal
      titulo={`Excluir o PucStop "${pucstop.nome}"?`}
      descricao="O PucStop é desativado: some do mapa dos alunos e não pode mais ser coletado. Coletas e XP já concedidos continuam no histórico, e você pode reativá-lo depois."
      onFechar={fechar}
      acoes={(
        <>
          <button type="button" className="ghost-button" disabled={ocupado} onClick={fechar} data-autofocus>Cancelar</button>
          <button type="button" className="danger-button" disabled={ocupado} onClick={() => { if (!ocupado) onConfirmar(); }}>
            <Icon name="trash" size={16} /> {ocupado ? 'Desativando…' : 'Desativar PucStop'}
          </button>
        </>
      )}
    >
      {pucstop.coletas > 0 && <p className="detail-muted">Este PucStop já tem {pucstop.coletas} coleta(s) registrada(s); elas serão preservadas.</p>}
      {erro && <p className="form-error" role="alert"><Icon name="alert" size={15} /> {erro}</p>}
    </Modal>
  );
}

export function SeletorPosicaoPucStop({ campus, erroCampus, inicial, raioMetros, outros, onCancelar, onConfirmar }) {
  const centro = campus?.centro;
  const [ponto, setPonto] = useState(() => (
    Number.isFinite(inicial?.latitude) && Number.isFinite(inicial?.longitude)
      ? inicial
      : Number.isFinite(centro?.latitude) && Number.isFinite(centro?.longitude)
        ? { latitude: centro.latitude, longitude: centro.longitude }
        : { latitude: null, longitude: null }
  ));
  const [predios, setPredios] = useState([]);

  useEffect(() => {
    let ativo = true;
    api.predios().then((lista) => { if (ativo) setPredios(lista); }).catch(() => {});
    return () => { ativo = false; };
  }, []);

  useEffect(() => {
    function tecla(event) { if (event.key === 'Escape') onCancelar(); }
    document.addEventListener('keydown', tecla);
    return () => document.removeEventListener('keydown', tecla);
  }, [onCancelar]);

  const temPonto = Number.isFinite(ponto.latitude) && Number.isFinite(ponto.longitude);
  const dentro = temPonto && (!campus?.limite || pontoDentroDoPoligono(ponto.longitude, ponto.latitude, campus.limite));

  return (
    <div className="pucstop-fullscreen" role="dialog" aria-modal="true" aria-label="Posicionar PucStop no mapa 3D">
      <header className="pucstop-fullscreen-header">
        <button type="button" onClick={onCancelar} aria-label="Cancelar seleção"><Icon name="close" /></button>
        <div><h2>Posicionar totem</h2><p>Mova, gire e incline o mapa 3D sob o pin.</p></div>
      </header>
      <main>
        <SeletorPucStopMapa
          campus={campus}
          erroCampus={erroCampus}
          ponto={ponto}
          raioMetros={raioMetros}
          outros={outros}
          predios={predios}
          pinCentral
          mostrarCoordenadas={false}
          onChange={setPonto}
          rotuloMapa="Mapa 3D do campus: mova o mapa sob o pin para posicionar o PucStop"
        />
        <p className="pucstop-fullscreen-tip">A ponta do pin indica a posição exata. Use a visão 3D para evitar colocar o totem dentro de um prédio.</p>
      </main>
      <footer className="pucstop-fullscreen-footer">
        <div><strong>{dentro ? 'Posição pronta' : 'Escolha um ponto dentro do campus'}</strong>{temPonto && <span>{ponto.latitude.toFixed(6)}, {ponto.longitude.toFixed(6)}</span>}</div>
        <button type="button" className="primary-button inline" disabled={!dentro} onClick={() => onConfirmar(ponto)}><Icon name="pin" /> Usar esta posição</button>
      </footer>
    </div>
  );
}

/** Formulário de criação/edição; o mapa 3D abre separado, em tela cheia. */
export function FormularioPucStop({ original, campus, erroCampus, outros, orcamento = null, onCancelar, onSalvo }) {
  const criando = !original;
  const [form, setForm] = useState(() => formDoPucStop(original));
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');
  const [selecionando, setSelecionando] = useState(false);
  const trava = useRef(false);
  const base = useId();
  const formId = `${base}-form`;

  const erroValidacao = validarPucStop(form, { criando });
  const alterados = criando ? null : camposAlterados(original, form);
  const semAlteracoes = !criando && Object.keys(alterados).length === 0;
  const podeSalvar = !salvando && !erroValidacao && !semAlteracoes;

  function campo(chave, valor) {
    setForm((atual) => ({ ...atual, [chave]: valor }));
    setErro('');
  }

  async function salvar(event) {
    event.preventDefault();
    if (!podeSalvar || trava.current) return;
    trava.current = true;
    setSalvando(true);
    setErro('');
    try {
      const salvo = criando
        ? await api.criarPucStop(corpoCriacao(form))
        : await api.atualizarPucStop(original.id, alterados);
      onSalvo(salvo, criando);
    } catch (error) {
      const mensagem = error.message || 'Não foi possível salvar o PucStop.';
      setErro(error.motivo === 'fora-do-campus' ? 'O servidor recusou: o ponto está fora do campus. Escolha um ponto dentro da área permitida.' : mensagem);
    } finally {
      trava.current = false;
      setSalvando(false);
    }
  }

  const fechar = () => { if (!salvando) onCancelar(); };
  const { nomeMax, raioMin, raioMax } = LIMITES_PUCSTOP;

  return (
    <Modal
      titulo={criando ? 'Novo totem' : `Editar totem "${original.nome}"`}
      descricao={criando ? 'Defina nome, XP e geofence e escolha a posição no mapa do campus.' : undefined}
      onFechar={fechar}
      tamanho="lg"
      className="pucstop-modal"
      acoes={(
        <>
          <button type="button" className="ghost-button" onClick={fechar} disabled={salvando}>Cancelar</button>
          <button type="submit" form={formId} className="primary-button inline" disabled={!podeSalvar}>
            <Icon name="save" size={16} /> {salvando ? 'Salvando…' : criando ? 'Criar totem' : 'Salvar alterações'}
          </button>
        </>
      )}
    >
      <form id={formId} className="pucstop-form" onSubmit={salvar} noValidate>
        <label className="editor-field" htmlFor={`${base}-nome`}>
          <span>Nome</span>
          <input id={`${base}-nome`} value={form.nome} maxLength={nomeMax} required data-autofocus placeholder="Ex.: Totem da biblioteca" onChange={(e) => campo('nome', e.target.value)} />
        </label>
        <div className="editor-grid pucstop-grid">
          <label className="editor-field" htmlFor={`${base}-xp`}>
            <span>Recompensa pela coleta</span>
            <select id={`${base}-xp`} value={form.xp} required onChange={(e) => campo('xp', e.target.value)}>
              {RECOMPENSAS_PUCSTOP.map((v) => (
                <option key={v} value={String(v)}>{v} XP + {v} moedas</option>
              ))}
            </select>
          </label>
          <label className="editor-field" htmlFor={`${base}-raio`}>
            <span>Raio da geofence (m)</span>
            <input id={`${base}-raio`} type="number" inputMode="decimal" min={raioMin} max={raioMax} step="1" value={form.raioMetros} required onChange={(e) => campo('raioMetros', e.target.value)} />
          </label>
        </div>
        {orcamento && <ImpactoOrcamento orcamento={orcamento} original={original} novoXp={Number(form.xp)} />}
        <p className="field-hint">
          Cada aluno recebe a recompensa uma vez por semestre; raio de {raioMin} a {raioMax} m (distância em que o aluno consegue coletar).
          {!criando && ' Alterar a recompensa vale só para novas coletas: as anteriores mantêm o que foi concedido.'}
        </p>

        <fieldset className="pucstop-position">
          <legend>Posição no campus</legend>
          <p className="field-hint">
            Abra o mapa 3D, mova o campus sob o pin e confirme.{!criando && ' Mover o PucStop não apaga coletas anteriores.'}
          </p>
          <div className="pucstop-position-summary">
            <Icon name="pin" size={22} />
            <div>
              <strong>{Number.isFinite(form.latitude) ? 'Posição escolhida' : 'Nenhuma posição escolhida'}</strong>
              {Number.isFinite(form.latitude) && <span>{form.latitude.toFixed(6)}, {form.longitude.toFixed(6)}</span>}
            </div>
            <button type="button" className="outline-button" disabled={!campus} onClick={() => setSelecionando(true)}>
              <Icon name="map" size={16} /> {Number.isFinite(form.latitude) ? 'Alterar no mapa 3D' : 'Escolher no mapa 3D'}
            </button>
          </div>
          {erroCampus && <p className="detail-warn" role="alert"><Icon name="alert" size={16} /> {erroCampus}</p>}
        </fieldset>

        {criando && (
          <div className="editor-toggles">
            <Toggle label="Ativo" descricao="Inativo, o PucStop fica fora do mapa dos alunos até ser reativado." checked={form.ativo} onChange={(v) => campo('ativo', v)} />
          </div>
        )}

        {erro && <p className="form-error" role="alert"><Icon name="alert" size={15} /> {erro}</p>}
        {!erro && (erroValidacao || semAlteracoes) && (
          <p className="detail-muted small" role="status">{erroValidacao || 'Nenhuma alteração para salvar.'}</p>
        )}
      </form>
      {selecionando && (
        <SeletorPosicaoPucStop
          campus={campus}
          erroCampus={erroCampus}
          inicial={{ latitude: form.latitude, longitude: form.longitude }}
          raioMetros={form.raioMetros}
          outros={outros}
          onCancelar={() => setSelecionando(false)}
          onConfirmar={({ latitude, longitude }) => {
            setErro('');
            setForm((atual) => ({ ...atual, latitude, longitude }));
            setSelecionando(false);
          }}
        />
      )}
    </Modal>
  );
}

/** Economia dos totens: o que o mapa oferece frente ao teto por participante. Só informa. */
export function OrcamentoPucStops({ orcamento }) {
  const faixas = (orcamento.distribuicao ?? []).filter((d) => d.totens > 0);
  const porAluno = Math.min(orcamento.xpPotencial, orcamento.limitePorCiclo);
  return (
    <div className={`dash-card pucstop-orcamento${orcamento.excedeLimite ? ' alerta' : ''}`} role="status">
      <strong>
        {orcamento.ativos} totens ativos{orcamento.inativos > 0 ? ` · ${orcamento.inativos} inativos` : ''}
      </strong>
      <p className="small">
        XP potencial: {orcamento.xpPotencial} XP ({orcamento.moedasPotenciais ?? orcamento.xpPotencial} moedas) · recompensa média: {orcamento.recompensaMedia ?? 0} XP por totem.
      </p>
      {faixas.length > 0 && (
        <p className="detail-muted small">Por faixa: {faixas.map((d) => `${d.totens}× ${d.xp} XP`).join(' · ')}.</p>
      )}
      <p className="detail-muted small">
        Limite individual: {orcamento.limitePorCiclo} XP de totens por participante e semestre.
      </p>
      {orcamento.participantesElegiveis != null && orcamento.emissaoMaximaEstimada != null && (
        <p className="detail-muted small">
          Estimativa teórica de emissão no ciclo: até {orcamento.emissaoMaximaEstimada} moedas ({orcamento.participantesElegiveis} participantes elegíveis × {porAluno} XP). Não é o saldo real dos participantes.
        </p>
      )}
      {orcamento.excedeLimite && <p className="small">{avisoTetoTotens(orcamento.xpPotencial, orcamento.limitePorCiclo)}</p>}
    </div>
  );
}

/** No formulário: recompensa escolhida e o potencial do mapa antes e depois. */
export function ImpactoOrcamento({ orcamento, original, novoXp }) {
  if (!Number.isInteger(novoXp)) return null;
  const atual = orcamento.xpPotencial;
  const depois = potencialAposSalvar({ potencialAtual: atual, original, novoXp });
  const inativo = original && original.ativo !== true;
  return (
    <div className={`pucstop-impacto${depois > orcamento.limitePorCiclo ? ' alerta' : ''}`} role="status">
      <p className="small">Recompensa selecionada: {novoXp} XP + {novoXp} moedas.</p>
      <p className="small">XP potencial atual do mapa: {atual} XP.</p>
      <p className="small">XP potencial {original ? 'após a alteração' : 'após o cadastro'}: {depois} XP.</p>
      {inativo && <p className="detail-muted small">Este totem está inativo: ele não entra no orçamento até ser reativado.</p>}
      {depois > orcamento.limitePorCiclo && <p className="small">{avisoTetoTotens(depois, orcamento.limitePorCiclo)}</p>}
    </div>
  );
}

export default function PucStopsPage() {
  const mostrarToast = useToast();
  const [pucstops, setPucstops] = useState(null);
  const [erro, setErro] = useState('');
  const [erroAcao, setErroAcao] = useState('');
  const [filtro, setFiltro] = useState('todos');
  const [campus, setCampus] = useState(null);
  const [erroCampus, setErroCampus] = useState('');
  const [editando, setEditando] = useState(null); // null | 'novo' | PucStopAdmin
  const [excluindo, setExcluindo] = useState(null);
  const [erroExclusao, setErroExclusao] = useState('');
  const [ocupadoId, setOcupadoId] = useState(null);
  const [orcamento, setOrcamento] = useState(null);
  const trava = useRef(false);

  // Orçamento é informativo: sem ele a página segue funcionando.
  const carregarOrcamento = useCallback(async () => {
    try {
      setOrcamento(await api.orcamentoPucStops());
    } catch {
      setOrcamento(null);
    }
  }, []);
  useEffect(() => {
    carregarOrcamento();
  }, [carregarOrcamento, pucstops]);

  const carregar = useCallback(async () => {
    setErro('');
    try {
      setPucstops(await api.pucstops());
    } catch (error) {
      setErro(error.message || 'Não foi possível carregar os PucStops.');
    }
  }, []);

  const carregarCampus = useCallback(async () => {
    setErroCampus('');
    try {
      setCampus(await api.campusPucStops());
    } catch (error) {
      setErroCampus(error.status === 503
        ? 'o mapa do campus ainda não tem uma versão ativa.'
        : error.message || 'não foi possível carregar a área do campus.');
    }
  }, []);

  useEffect(() => {
    carregar();
    carregarCampus();
  }, [carregar, carregarCampus]);

  function substituir(item) {
    setPucstops((lista) => ordenarPorNome([...(lista || []).filter((p) => p.id !== item.id), item]));
  }

  const contagem = useMemo(() => ({
    todos: pucstops?.length ?? 0,
    ativos: (pucstops || []).filter((p) => p.ativo).length,
    inativos: (pucstops || []).filter((p) => !p.ativo).length,
  }), [pucstops]);

  const lista = useMemo(() => (pucstops || []).filter((p) => filtro === 'todos' || (filtro === 'ativos' ? p.ativo : !p.ativo)), [pucstops, filtro]);
  const outros = useMemo(() => (pucstops || []).filter((p) => p.id !== editando?.id), [pucstops, editando]);

  async function desativar() {
    if (trava.current || !excluindo) return;
    trava.current = true;
    setOcupadoId(excluindo.id);
    setErroExclusao('');
    try {
      const atualizado = await api.desativarPucStop(excluindo.id);
      substituir(atualizado);
      setExcluindo(null);
      mostrarToast(`PucStop "${atualizado.nome}" desativado. O histórico de coletas foi preservado.`, 'sucesso');
    } catch (error) {
      setErroExclusao(error.message || 'Não foi possível desativar o PucStop.');
    } finally {
      trava.current = false;
      setOcupadoId(null);
    }
  }

  async function reativar(pucstop) {
    if (trava.current) return;
    trava.current = true;
    setOcupadoId(pucstop.id);
    setErroAcao('');
    try {
      const atualizado = await api.ativarPucStop(pucstop.id);
      substituir(atualizado);
      mostrarToast(`PucStop "${atualizado.nome}" reativado.`, 'sucesso');
    } catch (error) {
      setErroAcao(`Não foi possível reativar "${pucstop.nome}": ${error.message || 'erro desconhecido.'}`);
    } finally {
      trava.current = false;
      setOcupadoId(null);
    }
  }

  return (
    <section className="users-page pucstops-page">
      <header className="dash-header">
        <div>
          <h1>Gerenciar totens</h1>
          <p>Totens do mapa do campus. Cada aluno coleta cada totem uma vez por semestre e recebe XP + moedas.</p>
        </div>
        <button type="button" className="primary-button inline" onClick={() => setEditando('novo')}>
          <Icon name="plus" size={17} /> Novo totem
        </button>
      </header>

      {pucstops && pucstops.length > 0 && (
        <div className="filter-chips" role="group" aria-label="Filtrar por status">
          {FILTROS.map((f) => (
            <button key={f.valor} type="button" aria-pressed={filtro === f.valor} className={`filter-chip${filtro === f.valor ? ' active' : ''}`} onClick={() => setFiltro(f.valor)}>
              {f.rotulo} ({contagem[f.valor]})
            </button>
          ))}
        </div>
      )}

      {orcamento && <OrcamentoPucStops orcamento={orcamento} />}

      {erro && <div className="dash-inline-error" role="alert">{erro}<button type="button" onClick={carregar}>Tentar novamente</button></div>}
      {erroAcao && <div className="dash-inline-error" role="alert">{erroAcao}<button type="button" onClick={() => setErroAcao('')}>Fechar</button></div>}
      {!pucstops && !erro && <div className="coord-state" role="status"><div className="coord-spinner" aria-hidden="true" /><p>Carregando PucStops…</p></div>}
      {pucstops?.length === 0 && <p className="empty-copy">Nenhum PucStop cadastrado. Adicione o primeiro escolhendo um ponto no mapa do campus.</p>}
      {pucstops && pucstops.length > 0 && lista.length === 0 && <p className="empty-copy">Nenhum PucStop com este filtro.</p>}

      {lista.length > 0 && (
        <ListaPucStops
          pucstops={lista}
          ocupadoId={ocupadoId}
          onEditar={(p) => setEditando(p)}
          onExcluir={(p) => { setErroExclusao(''); setExcluindo(p); }}
          onReativar={reativar}
        />
      )}

      {pucstops?.length > 0 && (
        <p className="detail-muted small">
          Excluir um PucStop o desativa: ele some do mapa dos alunos, mas coletas e XP já concedidos continuam no histórico.
        </p>
      )}

      {editando && (
        <FormularioPucStop
          original={editando === 'novo' ? null : editando}
          campus={campus}
          erroCampus={erroCampus}
          outros={outros}
          orcamento={orcamento}
          onCancelar={() => setEditando(null)}
          onSalvo={(salvo, criado) => {
            substituir(salvo);
            setEditando(null);
            carregarOrcamento();
            mostrarToast(criado ? `PucStop "${salvo.nome}" criado.` : `PucStop "${salvo.nome}" atualizado.`, 'sucesso');
          }}
        />
      )}

      {excluindo && (
        <ConfirmarDesativacao
          pucstop={excluindo}
          ocupado={ocupadoId === excluindo.id}
          erro={erroExclusao}
          onConfirmar={desativar}
          onFechar={() => setExcluindo(null)}
        />
      )}
    </section>
  );
}
