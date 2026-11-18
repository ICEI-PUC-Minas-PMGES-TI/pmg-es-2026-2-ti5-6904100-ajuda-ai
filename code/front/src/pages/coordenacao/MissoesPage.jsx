import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { api } from '../../api/client';
import Icon from '../../components/Icon';
import Modal from '../../components/Modal';
import Toggle from '../../components/Toggle';
import { useToast } from '../../components/Toast';

export const LIMITES_MISSAO = { tituloMax: 120, descricaoMax: 1000, xpMax: 100, xpSemanalMax: 60 };

export const ROTULO_TIPO = { UNICA: 'Única', SEMANAL: 'Semanal' };

function doisDigitos(n) {
  return String(n).padStart(2, '0');
}

export function paraInputData(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getFullYear()}-${doisDigitos(d.getMonth() + 1)}-${doisDigitos(d.getDate())}T${doisDigitos(d.getHours())}:${doisDigitos(d.getMinutes())}`;
}

export function paraIso(valor) {
  if (!valor) return null;
  const d = new Date(valor);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function diaMes(iso) {
  const d = new Date(iso);
  return `${doisDigitos(d.getDate())}/${doisDigitos(d.getMonth() + 1)}`;
}

export function periodoMissao(m) {
  if (!m.inicio && !m.fim) return m.tipo === 'SEMANAL' ? 'Contínua' : `Ciclo ${m.ciclo}`;
  if (m.inicio && m.fim) return `${diaMes(m.inicio)} – ${diaMes(m.fim)}`;
  if (m.inicio) return `A partir de ${diaMes(m.inicio)}`;
  return `Até ${diaMes(m.fim)}`;
}

export function formDaMissao(missao) {
  return {
    titulo: missao?.titulo ?? '',
    descricao: missao?.descricao ?? '',
    tipo: missao?.tipo ?? 'UNICA',
    xp: missao ? String(missao.xp) : '50',
    inicio: paraInputData(missao?.inicio),
    fim: paraInputData(missao?.fim),
    ativar: false,
  };
}

export function validarMissao(form, { agora = new Date(), fimNovo = true } = {}) {
  const { tituloMax, descricaoMax, xpMax, xpSemanalMax } = LIMITES_MISSAO;
  const titulo = form.titulo.trim();
  const descricao = form.descricao.trim();
  if (!titulo) return 'Informe o título da missão.';
  if (titulo.length > tituloMax) return `O título deve ter no máximo ${tituloMax} caracteres.`;
  if (!descricao) return 'Descreva como o aluno conclui a missão.';
  if (descricao.length > descricaoMax) return `A descrição deve ter no máximo ${descricaoMax} caracteres.`;
  const xp = Number(form.xp);
  if (!Number.isInteger(xp) || xp < 1 || xp > xpMax) return `A recompensa deve ser de 1 a ${xpMax} XP.`;
  if (form.tipo === 'SEMANAL' && xp > xpSemanalMax) return `Missão semanal limitada a ${xpSemanalMax} XP.`;
  const inicio = paraIso(form.inicio);
  const fim = paraIso(form.fim);
  if (inicio && fim && new Date(fim) <= new Date(inicio)) return 'O fim precisa ser depois do início.';
  if (fimNovo && fim && new Date(fim) <= agora) return 'O fim precisa estar no futuro.';
  return '';
}

export function corpoCriacaoMissao(form) {
  const corpo = {
    titulo: form.titulo.trim(),
    descricao: form.descricao.trim(),
    tipo: form.tipo,
    xp: Number(form.xp),
    ativar: Boolean(form.ativar),
  };
  const inicio = paraIso(form.inicio);
  const fim = paraIso(form.fim);
  if (inicio) corpo.inicio = inicio;
  if (fim) corpo.fim = fim;
  return corpo;
}

export function camposAlteradosMissao(original, form) {
  const alterados = {};
  const titulo = form.titulo.trim();
  const descricao = form.descricao.trim();
  if (titulo !== original.titulo) alterados.titulo = titulo;
  if (descricao !== original.descricao) alterados.descricao = descricao;
  if (form.tipo !== original.tipo) alterados.tipo = form.tipo;
  if (Number(form.xp) !== original.xp) alterados.xp = Number(form.xp);
  const inicio = paraIso(form.inicio);
  const fim = paraIso(form.fim);
  if (inicio !== (original.inicio ? new Date(original.inicio).toISOString() : null)) alterados.inicio = inicio;
  if (fim !== (original.fim ? new Date(original.fim).toISOString() : null)) alterados.fim = fim;
  return alterados;
}

export function resumoMissoes(missoes) {
  return {
    ativas: missoes.filter((m) => m.ativa).length,
    conclusoes: missoes.reduce((t, m) => t + (m.conclusoes ?? 0), 0),
    xp: missoes.reduce((t, m) => t + (m.xpCreditadoTotal ?? 0), 0),
  };
}

export function filtrarMissoes(missoes, { busca = '', tipo = '', status = '' }) {
  const termo = busca.trim().toLocaleLowerCase('pt-BR');
  return missoes.filter((m) => (
    (!termo || m.titulo.toLocaleLowerCase('pt-BR').includes(termo) || m.descricao.toLocaleLowerCase('pt-BR').includes(termo))
    && (!tipo || m.tipo === tipo)
    && (!status || (status === 'ativa' ? m.ativa : !m.ativa))
  ));
}

const numero = (v) => Number(v ?? 0).toLocaleString('pt-BR');

export function ListaMissoes({ missoes, ocupadoId = null, onEditar, onAtivar, onDesativar }) {
  return (
    <div className="users-table-wrap">
      <table className="users-table missoes-table">
        <caption className="sr-only">Missões do ciclo</caption>
        <thead>
          <tr>
            <th scope="col">Missão</th>
            <th scope="col">Tipo</th>
            <th scope="col">Recompensa</th>
            <th scope="col">Período</th>
            <th scope="col">Conclusões</th>
            <th scope="col">Status</th>
            <th scope="col"><span className="sr-only">Ações</span></th>
          </tr>
        </thead>
        <tbody>
          {missoes.map((m) => {
            const ocupado = ocupadoId === m.id;
            return (
              <tr key={m.id} className={m.ativa ? undefined : 'inativo'}>
                <td data-label="Missão"><strong>{m.titulo}</strong></td>
                <td data-label="Tipo">{ROTULO_TIPO[m.tipo] ?? m.tipo}</td>
                <td data-label="Recompensa">{m.xp} XP + {m.xp} moedas</td>
                <td data-label="Período">{periodoMissao(m)}</td>
                <td data-label="Conclusões">{numero(m.conclusoes)}</td>
                <td data-label="Status">
                  <span className={`flag ${m.ativa ? 'green' : 'muted'}`}>{m.ativa ? (m.vigenteAgora ? 'Ativa' : 'Ativa · fora do período') : 'Inativa'}</span>
                </td>
                <td className="user-actions">
                  <button type="button" className="mini-btn" disabled={ocupado} onClick={() => onEditar?.(m)} aria-label={`Editar missão ${m.titulo}`}>
                    <Icon name="edit" size={14} /> Editar
                  </button>
                  {m.ativa ? (
                    <button type="button" className="mini-btn danger" disabled={ocupado} onClick={() => onDesativar?.(m)} aria-label={`Desativar missão ${m.titulo}`}>
                      <Icon name="trash" size={14} /> Desativar
                    </button>
                  ) : (
                    <button type="button" className="mini-btn success" disabled={ocupado} onClick={() => onAtivar?.(m)} aria-label={`Ativar missão ${m.titulo}`}>
                      <Icon name="refresh" size={14} /> {ocupado ? 'Ativando…' : 'Ativar'}
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

export function ConfirmarDesativacaoMissao({ missao, ocupado, erro, onConfirmar, onFechar }) {
  const fechar = () => { if (!ocupado) onFechar(); };
  return (
    <Modal
      titulo={`Desativar a missão "${missao.titulo}"?`}
      descricao="A missão some da lista dos alunos e não pode mais ser concluída. Conclusões, XP e moedas já concedidos continuam no histórico, e você pode reativá-la depois."
      onFechar={fechar}
      acoes={(
        <>
          <button type="button" className="ghost-button" disabled={ocupado} onClick={fechar} data-autofocus>Cancelar</button>
          <button type="button" className="danger-button" disabled={ocupado} onClick={() => { if (!ocupado) onConfirmar(); }}>
            <Icon name="trash" size={16} /> {ocupado ? 'Desativando…' : 'Desativar missão'}
          </button>
        </>
      )}
    >
      {missao.conclusoes > 0 && <p className="detail-muted">Esta missão já tem {missao.conclusoes} conclusão(ões); elas serão preservadas.</p>}
      {erro && <p className="form-error" role="alert"><Icon name="alert" size={15} /> {erro}</p>}
    </Modal>
  );
}

export function FormularioMissao({ original, onCancelar, onSalvo }) {
  const criando = !original;
  const [form, setForm] = useState(() => formDaMissao(original));
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');
  const trava = useRef(false);
  const base = useId();
  const formId = `${base}-form`;

  const alterados = criando ? null : camposAlteradosMissao(original, form);
  const erroValidacao = validarMissao(form, { fimNovo: criando || (alterados && 'fim' in alterados) });
  const semAlteracoes = !criando && Object.keys(alterados).length === 0;
  const podeSalvar = !salvando && !erroValidacao && !semAlteracoes;
  const { tituloMax, descricaoMax, xpMax, xpSemanalMax } = LIMITES_MISSAO;
  const tipoBloqueado = !criando && original.conclusoes > 0;

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
        ? await api.criarMissao(corpoCriacaoMissao(form))
        : await api.atualizarMissao(original.id, { ...alterados, atualizadoEm: original.atualizadoEm });
      onSalvo(salvo, criando);
    } catch (error) {
      setErro(error.message || 'Não foi possível salvar a missão.');
    } finally {
      trava.current = false;
      setSalvando(false);
    }
  }

  const fechar = () => { if (!salvando) onCancelar(); };

  return (
    <Modal
      titulo={criando ? 'Nova missão' : `Editar missão "${original.titulo}"`}
      onFechar={fechar}
      tamanho="lg"
      acoes={(
        <>
          <button type="button" className="ghost-button" onClick={fechar} disabled={salvando}>Cancelar</button>
          <button type="submit" form={formId} className="primary-button inline" disabled={!podeSalvar}>
            <Icon name="save" size={16} /> {salvando ? 'Salvando…' : 'Salvar missão'}
          </button>
        </>
      )}
    >
      <form id={formId} className="missao-form" onSubmit={salvar} noValidate>
        <label className="editor-field" htmlFor={`${base}-titulo`}>
          <span>Título</span>
          <input id={`${base}-titulo`} value={form.titulo} maxLength={tituloMax} required data-autofocus placeholder="Ex.: Participe da Semana do Calouro" onChange={(e) => campo('titulo', e.target.value)} />
        </label>
        <label className="editor-field" htmlFor={`${base}-descricao`}>
          <span>Descrição</span>
          <textarea id={`${base}-descricao`} rows={3} value={form.descricao} maxLength={descricaoMax} required placeholder="Como o aluno conclui a missão" onChange={(e) => campo('descricao', e.target.value)} />
        </label>
        <div className="editor-grid">
          <label className="editor-field" htmlFor={`${base}-tipo`}>
            <span>Tipo</span>
            <select id={`${base}-tipo`} value={form.tipo} disabled={tipoBloqueado} onChange={(e) => campo('tipo', e.target.value)}>
              <option value="UNICA">Única no ciclo</option>
              <option value="SEMANAL">Semanal (renova toda segunda)</option>
            </select>
            {tipoBloqueado && <small className="field-hint">Já há conclusões: o tipo não pode mudar.</small>}
          </label>
          <label className="editor-field" htmlFor={`${base}-xp`}>
            <span>Recompensa (XP)</span>
            <input id={`${base}-xp`} type="number" inputMode="numeric" min={1} max={form.tipo === 'SEMANAL' ? xpSemanalMax : xpMax} step={1} value={form.xp} required onChange={(e) => campo('xp', e.target.value)} />
            <small className="field-hint">Máximo de {form.tipo === 'SEMANAL' ? `${xpSemanalMax} XP por missão semanal` : `${xpMax} XP por missão`}. Moedas = XP.</small>
          </label>
          <label className="editor-field" htmlFor={`${base}-inicio`}>
            <span>Início (opcional)</span>
            <input id={`${base}-inicio`} type="datetime-local" value={form.inicio} onChange={(e) => campo('inicio', e.target.value)} />
          </label>
          <label className="editor-field" htmlFor={`${base}-fim`}>
            <span>Fim (opcional)</span>
            <input id={`${base}-fim`} type="datetime-local" value={form.fim} onChange={(e) => campo('fim', e.target.value)} />
          </label>
        </div>
        {!criando && <p className="field-hint">Alterar a recompensa vale só para novas conclusões.</p>}
        {criando && (
          <div className="editor-toggles">
            <Toggle label="Publicar e notificar os alunos" descricao="Desligado, a missão fica como rascunho até ser ativada." checked={form.ativar} onChange={(v) => campo('ativar', v)} />
          </div>
        )}
        {erro && <p className="form-error" role="alert"><Icon name="alert" size={15} /> {erro}</p>}
        {!erro && (erroValidacao || semAlteracoes) && (
          <p className="detail-muted small" role="status">{erroValidacao || 'Nenhuma alteração para salvar.'}</p>
        )}
      </form>
    </Modal>
  );
}

export default function MissoesPage() {
  const mostrarToast = useToast();
  const [missoes, setMissoes] = useState(null);
  const [erro, setErro] = useState('');
  const [erroAcao, setErroAcao] = useState('');
  const [busca, setBusca] = useState('');
  const [tipo, setTipo] = useState('');
  const [status, setStatus] = useState('');
  const [editando, setEditando] = useState(null);
  const [desativando, setDesativando] = useState(null);
  const [erroDesativacao, setErroDesativacao] = useState('');
  const [ocupadoId, setOcupadoId] = useState(null);
  const trava = useRef(false);

  const carregar = useCallback(async () => {
    setErro('');
    try {
      setMissoes(await api.missoesCoordenacao());
    } catch (error) {
      setErro(error.message || 'Não foi possível carregar as missões.');
    }
  }, []);

  useEffect(() => { carregar(); }, [carregar]);

  function substituir(item) {
    setMissoes((lista) => {
      const resto = (lista || []).filter((m) => m.id !== item.id);
      return [item, ...resto].sort((a, b) => b.criadoEm.localeCompare(a.criadoEm));
    });
  }

  const resumo = useMemo(() => resumoMissoes(missoes || []), [missoes]);
  const lista = useMemo(() => filtrarMissoes(missoes || [], { busca, tipo, status }), [missoes, busca, tipo, status]);

  async function ativar(missao) {
    if (trava.current) return;
    trava.current = true;
    setOcupadoId(missao.id);
    setErroAcao('');
    try {
      const atualizada = await api.ativarMissao(missao.id);
      substituir(atualizada);
      mostrarToast(`Missão "${atualizada.titulo}" ativada.`, 'sucesso');
    } catch (error) {
      setErroAcao(`Não foi possível ativar "${missao.titulo}": ${error.message || 'erro desconhecido.'}`);
    } finally {
      trava.current = false;
      setOcupadoId(null);
    }
  }

  async function desativar() {
    if (trava.current || !desativando) return;
    trava.current = true;
    setOcupadoId(desativando.id);
    setErroDesativacao('');
    try {
      const atualizada = await api.desativarMissao(desativando.id);
      substituir(atualizada);
      setDesativando(null);
      mostrarToast(`Missão "${atualizada.titulo}" desativada.`, 'sucesso');
    } catch (error) {
      setErroDesativacao(error.message || 'Não foi possível desativar a missão.');
    } finally {
      trava.current = false;
      setOcupadoId(null);
    }
  }

  return (
    <section className="users-page missoes-page">
      <header className="dash-header">
        <div>
          <h1>Missões</h1>
          <p>Crie desafios que rendem XP e moedas aos alunos.</p>
        </div>
        <button type="button" className="primary-button inline" onClick={() => setEditando('novo')}>
          <Icon name="plus" size={17} /> Nova missão
        </button>
      </header>

      {missoes && (
        <div className="users-summary">
          <div className="summary-tile"><strong>{numero(resumo.ativas)}</strong><span>Missões ativas</span></div>
          <div className="summary-tile"><strong>{numero(resumo.conclusoes)}</strong><span>Conclusões no ciclo</span></div>
          <div className="summary-tile"><strong>{numero(resumo.xp)}</strong><span>XP distribuído</span></div>
        </div>
      )}

      {missoes && missoes.length > 0 && (
        <div className="cand-tools users-tools">
          <label className="search-field">
            <Icon name="search" size={17} />
            <span className="sr-only">Buscar missão</span>
            <input type="search" value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar missão" />
          </label>
          <label className="filter-select">
            <Icon name="filter" size={16} />
            <span className="sr-only">Filtrar por tipo</span>
            <select value={tipo} onChange={(e) => setTipo(e.target.value)}>
              <option value="">Tipo: todas</option>
              <option value="UNICA">Única</option>
              <option value="SEMANAL">Semanal</option>
            </select>
          </label>
          <label className="filter-select">
            <Icon name="filter" size={16} />
            <span className="sr-only">Filtrar por status</span>
            <select value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="">Status: todas</option>
              <option value="ativa">Ativas</option>
              <option value="inativa">Inativas</option>
            </select>
          </label>
        </div>
      )}

      {erro && <div className="dash-inline-error" role="alert">{erro}<button type="button" onClick={carregar}>Tentar novamente</button></div>}
      {erroAcao && <div className="dash-inline-error" role="alert">{erroAcao}<button type="button" onClick={() => setErroAcao('')}>Fechar</button></div>}
      {!missoes && !erro && <div className="coord-state" role="status"><div className="coord-spinner" aria-hidden="true" /><p>Carregando missões…</p></div>}
      {missoes?.length === 0 && <p className="empty-copy">Nenhuma missão neste ciclo. Crie a primeira com "Nova missão".</p>}
      {missoes && missoes.length > 0 && lista.length === 0 && <p className="empty-copy">Nenhuma missão com estes filtros.</p>}

      {lista.length > 0 && (
        <ListaMissoes
          missoes={lista}
          ocupadoId={ocupadoId}
          onEditar={(m) => setEditando(m)}
          onAtivar={ativar}
          onDesativar={(m) => { setErroDesativacao(''); setDesativando(m); }}
        />
      )}

      {missoes?.length > 0 && (
        <p className="detail-muted small">
          Os participantes do ciclo recebem o aviso no sino quando a missão fica disponível para eles. Desativar não apaga conclusões nem XP já concedidos.
        </p>
      )}

      {editando && (
        <FormularioMissao
          original={editando === 'novo' ? null : editando}
          onCancelar={() => setEditando(null)}
          onSalvo={(salva, criada) => {
            substituir(salva);
            setEditando(null);
            mostrarToast(criada ? `Missão "${salva.titulo}" criada.` : `Missão "${salva.titulo}" atualizada.`, 'sucesso');
          }}
        />
      )}

      {desativando && (
        <ConfirmarDesativacaoMissao
          missao={desativando}
          ocupado={ocupadoId === desativando.id}
          erro={erroDesativacao}
          onConfirmar={desativar}
          onFechar={() => setDesativando(null)}
        />
      )}
    </section>
  );
}
