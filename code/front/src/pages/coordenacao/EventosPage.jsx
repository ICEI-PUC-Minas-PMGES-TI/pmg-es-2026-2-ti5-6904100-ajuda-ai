import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { api } from '../../api/client';
import Icon from '../../components/Icon';
import Modal from '../../components/Modal';
import Toggle from '../../components/Toggle';
import { useToast } from '../../components/Toast';
import SeletorLocal, {
  entradaDoLocal,
  formDoLocal,
  localParaEntrada,
  mensagemErroLocal,
  mesmaEntrada,
  rotuloLocal,
  useDadosMapa,
  validarLocal,
} from './SeletorLocal';

/** Limites iguais aos do servidor (que continua sendo a autoridade). */
export const LIMITES_EVENTO = { tituloMin: 3, tituloMax: 255, descricaoMax: 2000, duracaoMaxDias: 31 };

const DIA_MS = 24 * 60 * 60 * 1000;

export const SITUACOES_EVENTO = {
  'em-breve': { rotulo: 'Em breve', tom: 'purple' },
  acontecendo: { rotulo: 'Acontecendo', tom: 'green' },
  encerrado: { rotulo: 'Encerrado', tom: 'muted' },
};

const FILTROS = [
  { valor: 'proximos', rotulo: 'Próximos' },
  { valor: 'encerrados', rotulo: 'Encerrados' },
  { valor: 'inativos', rotulo: 'Inativos' },
  { valor: 'todos', rotulo: 'Todos' },
];

const doisDigitos = (n) => String(n).padStart(2, '0');

/** ISO (com fuso) → valor de `<input type="datetime-local">` no fuso do navegador. */
export function paraDatetimeLocal(iso) {
  if (!iso) return '';
  const data = new Date(iso);
  if (Number.isNaN(data.getTime())) return '';
  return `${data.getFullYear()}-${doisDigitos(data.getMonth() + 1)}-${doisDigitos(data.getDate())}T${doisDigitos(data.getHours())}:${doisDigitos(data.getMinutes())}`;
}

/** Valor de `datetime-local` (hora local, sem fuso) → ISO 8601 em UTC (`...Z`), ou null. */
export function paraIso(valor) {
  if (!valor || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(valor)) return null;
  const data = new Date(valor);
  return Number.isNaN(data.getTime()) ? null : data.toISOString();
}

/** Estado do formulário (datas como nos inputs `datetime-local`). */
export function formDoEvento(evento) {
  return {
    titulo: evento?.titulo ?? '',
    descricao: evento?.descricao ?? '',
    inicio: paraDatetimeLocal(evento?.inicio),
    fim: paraDatetimeLocal(evento?.fim),
    local: formDoLocal(evento?.local ?? null, { permitirSemLocal: true }),
    ativo: evento?.ativo ?? true,
  };
}

/** Primeira inconsistência do formulário, ou '' se pode ser enviado. */
export function validarEvento(form) {
  const { tituloMin, tituloMax, descricaoMax, duracaoMaxDias } = LIMITES_EVENTO;
  const titulo = String(form.titulo ?? '').trim();
  if (!titulo) return 'Informe o título do evento.';
  if (titulo.length < tituloMin) return `O título deve ter pelo menos ${tituloMin} caracteres.`;
  if (titulo.length > tituloMax) return `O título deve ter no máximo ${tituloMax} caracteres.`;
  if (String(form.descricao ?? '').trim().length > descricaoMax) return `A descrição deve ter no máximo ${descricaoMax} caracteres.`;
  const inicio = paraIso(form.inicio);
  if (!inicio) return 'Informe a data e a hora de início.';
  const fim = paraIso(form.fim);
  if (!fim) return 'Informe a data e a hora de término.';
  const duracao = new Date(fim).getTime() - new Date(inicio).getTime();
  if (duracao <= 0) return 'O término deve ser depois do início.';
  if (duracao > duracaoMaxDias * DIA_MS) return `O evento pode durar no máximo ${duracaoMaxDias} dias.`;
  return validarLocal(form.local, { obrigatorio: false });
}

/** Corpo do POST de criação (datas em ISO com fuso; local só se escolhido). */
export function corpoCriacaoEvento(form) {
  const corpo = { titulo: String(form.titulo).trim() };
  const descricao = String(form.descricao ?? '').trim();
  if (descricao) corpo.descricao = descricao;
  corpo.inicio = paraIso(form.inicio);
  corpo.fim = paraIso(form.fim);
  const local = localParaEntrada(form.local);
  if (local) corpo.local = local;
  corpo.ativo = Boolean(form.ativo);
  return corpo;
}

/** Só os campos alterados para o PATCH; `local: null` quando o local foi removido. */
export function camposAlteradosEvento(original, form) {
  const alterados = {};
  const titulo = String(form.titulo ?? '').trim();
  if (titulo !== original.titulo) alterados.titulo = titulo;
  const descricao = String(form.descricao ?? '').trim();
  if (descricao !== (original.descricao ?? '')) alterados.descricao = descricao;
  // Comparação na precisão do input (minutos), para não "alterar" segundos não editados.
  if (form.inicio !== paraDatetimeLocal(original.inicio)) alterados.inicio = paraIso(form.inicio);
  if (form.fim !== paraDatetimeLocal(original.fim)) alterados.fim = paraIso(form.fim);
  const local = localParaEntrada(form.local);
  if (!mesmaEntrada(local, entradaDoLocal(original.local))) alterados.local = local;
  return alterados;
}

const DATA_BR = { day: '2-digit', month: '2-digit', year: 'numeric' };
const HORA_BR = { hour: '2-digit', minute: '2-digit' };

/** Período em pt-BR: "20/10/2026, 19:00–21:00" ou "20/10/2026 19:00 – 22/10/2026 18:00". */
export function formatarPeriodo(inicio, fim) {
  const a = new Date(inicio);
  const b = new Date(fim);
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return '—';
  const diaA = a.toLocaleDateString('pt-BR', DATA_BR);
  const diaB = b.toLocaleDateString('pt-BR', DATA_BR);
  const horaA = a.toLocaleTimeString('pt-BR', HORA_BR);
  const horaB = b.toLocaleTimeString('pt-BR', HORA_BR);
  return diaA === diaB ? `${diaA}, ${horaA}–${horaB}` : `${diaA} ${horaA} – ${diaB} ${horaB}`;
}

/** Eventos do filtro: próximos (ativos não encerrados), encerrados (ativos), inativos ou todos. */
export function filtrarEventos(eventos, filtro) {
  return (eventos || []).filter((e) => {
    if (filtro === 'proximos') return e.ativo && e.situacao !== 'encerrado';
    if (filtro === 'encerrados') return e.ativo && e.situacao === 'encerrado';
    if (filtro === 'inativos') return !e.ativo;
    return true;
  });
}

function ordenarPorInicio(lista) {
  return [...lista].sort((a, b) => new Date(b.inicio).getTime() - new Date(a.inicio).getTime());
}

/** Tabela de eventos (apresentação pura: sem efeitos, renderizável no servidor). */
export function ListaEventos({ eventos, ocupadoId = null, onEditar, onExcluir, onReativar }) {
  return (
    <div className="users-table-wrap">
      <table className="users-table pucstops-table campus-table">
        <caption className="sr-only">Eventos do campus</caption>
        <thead>
          <tr>
            <th scope="col">Evento</th>
            <th scope="col">Período</th>
            <th scope="col">Situação</th>
            <th scope="col">Local</th>
            <th scope="col">Status</th>
            <th scope="col"><span className="sr-only">Ações</span></th>
          </tr>
        </thead>
        <tbody>
          {eventos.map((e) => {
            const ocupado = ocupadoId === e.id;
            const situacao = SITUACOES_EVENTO[e.situacao] || { rotulo: e.situacao || '—', tom: 'muted' };
            return (
              <tr key={e.id} className={e.ativo ? undefined : 'inativo'}>
                <td data-label="Evento">
                  <span className="user-cell">
                    <span className="pucstop-icon" aria-hidden="true"><Icon name="calendarEvent" size={16} /></span>
                    <strong>{e.titulo}</strong>
                  </span>
                </td>
                <td data-label="Período">{formatarPeriodo(e.inicio, e.fim)}</td>
                <td data-label="Situação"><span className={`flag ${situacao.tom}`}>{situacao.rotulo}</span></td>
                <td data-label="Local">{rotuloLocal(e.local)}</td>
                <td data-label="Status"><span className={`flag ${e.ativo ? 'green' : 'muted'}`}>{e.ativo ? 'Ativo' : 'Inativo'}</span></td>
                <td className="user-actions">
                  <button type="button" className="mini-btn" disabled={ocupado} onClick={() => onEditar?.(e)} aria-label={`Editar evento ${e.titulo}`}>
                    <Icon name="edit" size={14} /> Editar
                  </button>
                  {e.ativo ? (
                    <button type="button" className="mini-btn danger" disabled={ocupado} onClick={() => onExcluir?.(e)} aria-label={`Excluir (desativar) evento ${e.titulo}`}>
                      <Icon name="trash" size={14} /> Excluir
                    </button>
                  ) : (
                    <button type="button" className="mini-btn success" disabled={ocupado} onClick={() => onReativar?.(e)} aria-label={`Reativar evento ${e.titulo}`}>
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

/** Confirmação do "Excluir": desativação lógica, reversível. */
export function ConfirmarDesativacaoEvento({ evento, ocupado, erro, onConfirmar, onFechar }) {
  const fechar = () => { if (!ocupado) onFechar(); };
  return (
    <Modal
      titulo={`Excluir o evento "${evento.titulo}"?`}
      descricao="O evento é desativado: some do mapa dos alunos, mas continua salvo aqui e você pode reativá-lo depois."
      onFechar={fechar}
      acoes={(
        <>
          <button type="button" className="ghost-button" disabled={ocupado} onClick={fechar} data-autofocus>Cancelar</button>
          <button type="button" className="danger-button" disabled={ocupado} onClick={() => { if (!ocupado) onConfirmar(); }}>
            <Icon name="trash" size={16} /> {ocupado ? 'Desativando…' : 'Desativar evento'}
          </button>
        </>
      )}
    >
      {erro && <p className="form-error" role="alert"><Icon name="alert" size={15} /> {erro}</p>}
    </Modal>
  );
}

/** Formulário de criação/edição em modal, com o seletor de local. */
export function FormularioEvento({ original, mapa = {}, onCancelar, onSalvo }) {
  const criando = !original;
  const [form, setForm] = useState(() => formDoEvento(original));
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');
  const trava = useRef(false);
  const base = useId();
  const formId = `${base}-form`;

  const erroValidacao = validarEvento(form);
  const alterados = criando ? null : camposAlteradosEvento(original, form);
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
        ? await api.criarEvento(corpoCriacaoEvento(form))
        : await api.atualizarEvento(original.id, alterados);
      onSalvo(salvo, criando);
    } catch (error) {
      setErro(mensagemErroLocal(error, 'Não foi possível salvar o evento.'));
    } finally {
      trava.current = false;
      setSalvando(false);
    }
  }

  const fechar = () => { if (!salvando) onCancelar(); };
  const { tituloMax, descricaoMax, duracaoMaxDias } = LIMITES_EVENTO;

  return (
    <Modal
      titulo={criando ? 'Adicionar evento' : `Editar evento "${original.titulo}"`}
      descricao={criando ? 'Defina título, período e, se houver, o local no mapa do campus.' : undefined}
      onFechar={fechar}
      tamanho="lg"
      className="pucstop-modal"
      acoes={(
        <>
          <button type="button" className="ghost-button" onClick={fechar} disabled={salvando}>Cancelar</button>
          <button type="submit" form={formId} className="primary-button inline" disabled={!podeSalvar}>
            <Icon name="save" size={16} /> {salvando ? 'Salvando…' : criando ? 'Criar evento' : 'Salvar alterações'}
          </button>
        </>
      )}
    >
      <form id={formId} className="pucstop-form campus-form" onSubmit={salvar} noValidate>
        <label className="editor-field" htmlFor={`${base}-titulo`}>
          <span>Título</span>
          <input id={`${base}-titulo`} value={form.titulo} maxLength={tituloMax} required data-autofocus placeholder="Ex.: Feira de profissões" onChange={(e) => campo('titulo', e.target.value)} />
        </label>
        <label className="editor-field" htmlFor={`${base}-descricao`}>
          <span>Descrição (opcional)</span>
          <textarea id={`${base}-descricao`} className="detail-textarea" rows={3} maxLength={descricaoMax} value={form.descricao} onChange={(e) => campo('descricao', e.target.value)} />
        </label>
        <p className="field-hint">{form.descricao.length}/{descricaoMax} caracteres.</p>
        <div className="editor-grid pucstop-grid">
          <label className="editor-field" htmlFor={`${base}-inicio`}>
            <span>Início</span>
            <input id={`${base}-inicio`} type="datetime-local" value={form.inicio} required onChange={(e) => campo('inicio', e.target.value)} />
          </label>
          <label className="editor-field" htmlFor={`${base}-fim`}>
            <span>Término</span>
            <input id={`${base}-fim`} type="datetime-local" value={form.fim} min={form.inicio || undefined} required onChange={(e) => campo('fim', e.target.value)} />
          </label>
        </div>
        <p className="field-hint">Horário do seu navegador. O evento pode durar até {duracaoMaxDias} dias.</p>

        <fieldset className="pucstop-position">
          <legend>Local</legend>
          <SeletorLocal
            valor={form.local}
            onChange={(local) => campo('local', local)}
            campus={mapa.campus}
            erroCampus={mapa.erroCampus}
            predios={mapa.predios}
            areas={mapa.areas}
            erroMapa={mapa.erroMapa}
            permitirSemLocal
          />
        </fieldset>

        {criando && (
          <div className="editor-toggles">
            <Toggle label="Ativo" descricao="Inativo, o evento fica fora do mapa dos alunos até ser reativado." checked={form.ativo} onChange={(v) => campo('ativo', v)} />
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

export default function EventosPage() {
  const mostrarToast = useToast();
  const mapa = useDadosMapa();
  const [eventos, setEventos] = useState(null);
  const [erro, setErro] = useState('');
  const [erroAcao, setErroAcao] = useState('');
  const [filtro, setFiltro] = useState('todos');
  const [editando, setEditando] = useState(null); // null | 'novo' | EventoAdmin
  const [excluindo, setExcluindo] = useState(null);
  const [erroExclusao, setErroExclusao] = useState('');
  const [ocupadoId, setOcupadoId] = useState(null);
  const trava = useRef(false);

  const carregar = useCallback(async () => {
    setErro('');
    try {
      setEventos(await api.eventos());
    } catch (error) {
      setErro(error.message || 'Não foi possível carregar os eventos.');
    }
  }, []);

  useEffect(() => { carregar(); }, [carregar]);

  function substituir(item) {
    setEventos((lista) => ordenarPorInicio([...(lista || []).filter((e) => e.id !== item.id), item]));
  }

  const contagem = useMemo(() => Object.fromEntries(FILTROS.map((f) => [f.valor, filtrarEventos(eventos, f.valor).length])), [eventos]);
  const lista = useMemo(() => filtrarEventos(eventos, filtro), [eventos, filtro]);

  async function desativar() {
    if (trava.current || !excluindo) return;
    trava.current = true;
    setOcupadoId(excluindo.id);
    setErroExclusao('');
    try {
      const atualizado = await api.desativarEvento(excluindo.id);
      substituir(atualizado);
      setExcluindo(null);
      mostrarToast(`Evento "${atualizado.titulo}" desativado. Ele não aparece mais no mapa dos alunos.`, 'sucesso');
    } catch (error) {
      setErroExclusao(error.message || 'Não foi possível desativar o evento.');
    } finally {
      trava.current = false;
      setOcupadoId(null);
    }
  }

  async function reativar(evento) {
    if (trava.current) return;
    trava.current = true;
    setOcupadoId(evento.id);
    setErroAcao('');
    try {
      const atualizado = await api.ativarEvento(evento.id);
      substituir(atualizado);
      mostrarToast(`Evento "${atualizado.titulo}" reativado.`, 'sucesso');
    } catch (error) {
      setErroAcao(`Não foi possível reativar "${evento.titulo}": ${mensagemErroLocal(error, 'erro desconhecido.')}`);
    } finally {
      trava.current = false;
      setOcupadoId(null);
    }
  }

  return (
    <section className="users-page pucstops-page">
      <header className="dash-header">
        <div>
          <h1>Eventos</h1>
          <p>Eventos do campus mostrados no mapa dos alunos. Valem para todos os programas.</p>
        </div>
        <button type="button" className="primary-button inline" onClick={() => setEditando('novo')}>
          <Icon name="plus" size={17} /> Adicionar evento
        </button>
      </header>

      {eventos && eventos.length > 0 && (
        <div className="filter-chips" role="group" aria-label="Filtrar eventos">
          {FILTROS.map((f) => (
            <button key={f.valor} type="button" aria-pressed={filtro === f.valor} className={`filter-chip${filtro === f.valor ? ' active' : ''}`} onClick={() => setFiltro(f.valor)}>
              {f.rotulo} ({contagem[f.valor]})
            </button>
          ))}
        </div>
      )}

      {erro && <div className="dash-inline-error" role="alert">{erro}<button type="button" onClick={carregar}>Tentar novamente</button></div>}
      {erroAcao && <div className="dash-inline-error" role="alert">{erroAcao}<button type="button" onClick={() => setErroAcao('')}>Fechar</button></div>}
      {!eventos && !erro && <div className="coord-state" role="status"><div className="coord-spinner" aria-hidden="true" /><p>Carregando eventos…</p></div>}
      {eventos?.length === 0 && <p className="empty-copy">Nenhum evento cadastrado. Adicione o primeiro com título, período e local.</p>}
      {eventos && eventos.length > 0 && lista.length === 0 && <p className="empty-copy">Nenhum evento com este filtro.</p>}

      {lista.length > 0 && (
        <ListaEventos
          eventos={lista}
          ocupadoId={ocupadoId}
          onEditar={(e) => setEditando(e)}
          onExcluir={(e) => { setErroExclusao(''); setExcluindo(e); }}
          onReativar={reativar}
        />
      )}

      {eventos?.length > 0 && (
        <p className="detail-muted small">
          Excluir um evento o desativa: ele some do mapa dos alunos e pode ser reativado depois.
        </p>
      )}

      {editando && (
        <FormularioEvento
          original={editando === 'novo' ? null : editando}
          mapa={mapa}
          onCancelar={() => setEditando(null)}
          onSalvo={(salvo, criado) => {
            substituir(salvo);
            setEditando(null);
            mostrarToast(criado ? `Evento "${salvo.titulo}" criado.` : `Evento "${salvo.titulo}" atualizado.`, 'sucesso');
          }}
        />
      )}

      {excluindo && (
        <ConfirmarDesativacaoEvento
          evento={excluindo}
          ocupado={ocupadoId === excluindo.id}
          erro={erroExclusao}
          onConfirmar={desativar}
          onFechar={() => setExcluindo(null)}
        />
      )}
    </section>
  );
}
