import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { api } from '../../api/client';
import Icon from '../../components/Icon';
import Modal from '../../components/Modal';
import { useToast } from '../../components/Toast';
import { dataCurta } from './comum';

/** Iguais aos do servidor (que continua sendo a autoridade). */
export const MOTIVO_CANCELAMENTO = { min: 3, max: 300 };

export const ROTULO_SITUACAO = {
  aguardando_entrega: 'Aguardando entrega',
  entregue: 'Entregue',
  cancelado: 'Cancelado',
};
const TOM_SITUACAO = { aguardando_entrega: 'amber', entregue: 'green', cancelado: 'muted' };

const FILTROS = [
  { valor: '', rotulo: 'Todos' },
  { valor: 'aguardando_entrega', rotulo: 'Aguardando entrega' },
  { valor: 'entregue', rotulo: 'Entregues' },
  { valor: 'cancelado', rotulo: 'Cancelados' },
];

/** Mensagem de validação do motivo, ou '' quando pode enviar. */
export function validarMotivo(motivo) {
  const t = String(motivo ?? '').trim();
  if (t.length < MOTIVO_CANCELAMENTO.min) return `Escreva o motivo (mínimo ${MOTIVO_CANCELAMENTO.min} caracteres). Ele fica no histórico e o aluno vê.`;
  if (t.length > MOTIVO_CANCELAMENTO.max) return `Motivo com no máximo ${MOTIVO_CANCELAMENTO.max} caracteres.`;
  return '';
}

const normalizar = (texto) => String(texto ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** Filtra por situação e por nome, e-mail, código ou recompensa. */
export function filtrarResgates(lista, { situacao = '', busca = '' } = {}) {
  const termo = normalizar(busca.trim());
  return (lista || []).filter((r) => {
    if (situacao && r.situacao !== situacao) return false;
    if (!termo) return true;
    return [r.participante?.nome, r.participante?.email, r.codigo, r.recompensa?.nome]
      .some((campo) => normalizar(campo).includes(termo));
  });
}

function dataHora(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return `${dataCurta(iso)}, ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/** Linha do desfecho: quem entregou/cancelou e quando. */
export function textoDesfecho(r) {
  const quem = r.responsavel?.email || 'coordenação';
  if (r.situacao === 'entregue') return `Entregue em ${dataHora(r.entregueEm)} por ${quem}`;
  if (r.situacao === 'cancelado') return `Cancelado em ${dataHora(r.canceladoEm)} por ${quem}: ${r.motivoCancelamento}`;
  return '';
}

export function ListaResgates({ resgates, ocupadoId = null, onEntregar, onCancelar }) {
  return (
    <div className="users-table-wrap">
      <table className="users-table resgates-table">
        <caption className="sr-only">Resgates da lojinha</caption>
        <thead>
          <tr>
            <th scope="col">Participante</th>
            <th scope="col">Recompensa</th>
            <th scope="col">Custo</th>
            <th scope="col">Resgatado em</th>
            <th scope="col">Situação</th>
            <th scope="col"><span className="sr-only">Ações</span></th>
          </tr>
        </thead>
        <tbody>
          {resgates.map((r) => {
            const ocupado = ocupadoId === r.id;
            const aberto = r.situacao === 'aguardando_entrega';
            return (
              <tr key={r.id} className={r.situacao === 'cancelado' ? 'inativo' : undefined}>
                <td data-label="Participante">
                  <strong>{r.participante.nome}</strong>
                  <small className="recompensa-sub">{r.participante.email}</small>
                </td>
                <td data-label="Recompensa">
                  <strong>{r.recompensa.nome}</strong>
                  <small className="recompensa-sub">Código {r.codigo} · v{r.recompensa.versao}{r.recompensa.programaCodigo ? ` · ${r.recompensa.programaCodigo}` : ''}</small>
                </td>
                <td data-label="Custo">{Number(r.custoXp).toLocaleString('pt-BR')} moedas</td>
                <td data-label="Resgatado em">{dataHora(r.resgatadoEm)}</td>
                <td data-label="Situação">
                  <span className={`flag ${TOM_SITUACAO[r.situacao] || 'muted'}`}>{ROTULO_SITUACAO[r.situacao] || r.situacao}</span>
                  {!aberto && <small className="recompensa-sub">{textoDesfecho(r)}</small>}
                </td>
                <td className="user-actions">
                  {aberto && (
                    <div>
                      <button type="button" className="mini-btn success" disabled={ocupado} onClick={() => onEntregar?.(r)} aria-label={`Registrar entrega de ${r.recompensa.nome} para ${r.participante.nome}`}>
                        <Icon name="check" size={14} /> Entregar
                      </button>
                      <button type="button" className="mini-btn danger" disabled={ocupado} onClick={() => onCancelar?.(r)} aria-label={`Cancelar resgate de ${r.recompensa.nome} de ${r.participante.nome}`}>
                        <Icon name="close" size={14} /> Cancelar
                      </button>
                    </div>
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

/** Confirmação da entrega (não dá para desfazer). */
export function ConfirmarEntrega({ resgate, ocupado, erro, onConfirmar, onFechar }) {
  const fechar = () => { if (!ocupado) onFechar(); };
  return (
    <Modal
      titulo="Registrar entrega?"
      descricao={`${resgate.recompensa.nome} para ${resgate.participante.nome} (código ${resgate.codigo}). Confira o código no comprovante do aluno. Depois de entregue, o resgate não pode mais ser cancelado.`}
      onFechar={fechar}
      acoes={(
        <>
          <button type="button" className="ghost-button" disabled={ocupado} onClick={fechar} data-autofocus>Voltar</button>
          <button type="button" className="primary-button inline" disabled={ocupado} onClick={() => { if (!ocupado) onConfirmar(); }}>
            <Icon name="check" size={16} /> {ocupado ? 'Registrando…' : 'Confirmar entrega'}
          </button>
        </>
      )}
    >
      {erro && <p className="form-error" role="alert"><Icon name="alert" size={15} /> {erro}</p>}
    </Modal>
  );
}

/** Cancelamento administrativo com motivo: devolve moedas e unidade. */
export function CancelarResgate({ resgate, ocupado, erro, onConfirmar, onFechar }) {
  const [motivo, setMotivo] = useState('');
  const [tocado, setTocado] = useState(false);
  const id = useId();
  const erroValidacao = validarMotivo(motivo);
  const fechar = () => { if (!ocupado) onFechar(); };
  function enviar(event) {
    event.preventDefault();
    setTocado(true);
    if (!ocupado && !erroValidacao) onConfirmar(motivo.trim());
  }
  return (
    <Modal
      titulo="Cancelar resgate?"
      descricao={`${resgate.recompensa.nome} de ${resgate.participante.nome} (código ${resgate.codigo}). ${Number(resgate.custoXp).toLocaleString('pt-BR')} moedas voltam para o aluno e a unidade volta ao estoque. O XP e o nível dele não mudam.`}
      onFechar={fechar}
      acoes={(
        <>
          <button type="button" className="ghost-button" disabled={ocupado} onClick={fechar}>Voltar</button>
          <button type="submit" form={`${id}-form`} className="danger-button" disabled={ocupado || (tocado && !!erroValidacao)}>
            <Icon name="close" size={16} /> {ocupado ? 'Cancelando…' : 'Cancelar resgate'}
          </button>
        </>
      )}
    >
      <form id={`${id}-form`} onSubmit={enviar} noValidate>
        <label className="editor-field" htmlFor={`${id}-motivo`}>
          <span>Motivo do cancelamento</span>
          <textarea id={`${id}-motivo`} rows={3} maxLength={MOTIVO_CANCELAMENTO.max} data-autofocus placeholder="Ex.: aluno não retirou no prazo; recompensa danificada" value={motivo} onChange={(e) => setMotivo(e.target.value)} onBlur={() => setTocado(true)} />
        </label>
        {tocado && erroValidacao && <p className="detail-muted small" role="status">{erroValidacao}</p>}
        {erro && <p className="form-error" role="alert"><Icon name="alert" size={15} /> {erro}</p>}
      </form>
    </Modal>
  );
}

export default function ResgatesPage() {
  const mostrarToast = useToast();
  const [resgates, setResgates] = useState(null);
  const [programas, setProgramas] = useState([]);
  const [programa, setPrograma] = useState('');
  const [situacao, setSituacao] = useState('aguardando_entrega');
  const [busca, setBusca] = useState('');
  const [erro, setErro] = useState('');
  const [entregando, setEntregando] = useState(null);
  const [cancelando, setCancelando] = useState(null);
  const [erroAcao, setErroAcao] = useState('');
  const [ocupadoId, setOcupadoId] = useState(null);
  const trava = useRef(false);

  const carregar = useCallback(async () => {
    setErro('');
    try {
      setResgates(await api.resgatesCoordenacao({ programa: programa || undefined }));
    } catch (error) {
      setErro(error.message || 'Não foi possível carregar os resgates.');
    }
  }, [programa]);

  useEffect(() => { carregar(); }, [carregar]);
  useEffect(() => {
    api.programas().then((lista) => setProgramas(Array.isArray(lista) ? lista : [])).catch(() => setProgramas([]));
  }, []);

  const contagem = useMemo(() => {
    const lista = filtrarResgates(resgates, { busca });
    const por = (s) => lista.filter((r) => r.situacao === s).length;
    return { '': lista.length, aguardando_entrega: por('aguardando_entrega'), entregue: por('entregue'), cancelado: por('cancelado') };
  }, [resgates, busca]);
  const lista = useMemo(() => filtrarResgates(resgates, { situacao, busca }), [resgates, situacao, busca]);

  function substituir(item) {
    setResgates((atual) => (atual || []).map((r) => (r.id === item.id ? item : r)));
  }

  async function concluir(resgate, chamada, mensagem) {
    if (trava.current) return;
    trava.current = true;
    setOcupadoId(resgate.id);
    setErroAcao('');
    try {
      const atualizado = await chamada();
      substituir(atualizado);
      setEntregando(null);
      setCancelando(null);
      mostrarToast(mensagem(atualizado), 'sucesso');
    } catch (error) {
      setErroAcao(error.message || 'Não foi possível concluir.');
      // Outra pessoa já concluiu: mostra a situação atual.
      if (error.status === 409) api.resgateCoordenacao(resgate.id).then(substituir).catch(() => {});
    } finally {
      trava.current = false;
      setOcupadoId(null);
    }
  }

  return (
    <section className="users-page pucstops-page resgates-page">
      <header className="dash-header">
        <div>
          <h1>Resgates</h1>
          <p>Trocas feitas pelos alunos na lojinha. Registre a entrega quando o aluno retirar, ou cancele com um motivo antes disso (as moedas e a unidade voltam).</p>
        </div>
      </header>

      <div className="filter-chips" role="group" aria-label="Filtrar por situação">
        {FILTROS.map((f) => (
          <button key={f.valor || 'todos'} type="button" aria-pressed={situacao === f.valor} className={`filter-chip${situacao === f.valor ? ' active' : ''}`} onClick={() => setSituacao(f.valor)}>
            {f.rotulo}{resgates ? ` (${contagem[f.valor]})` : ''}
          </button>
        ))}
      </div>

      <div className="cand-tools users-tools">
        <label className="search-field">
          <Icon name="search" size={17} />
          <span className="sr-only">Buscar resgate</span>
          <input type="search" value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar por aluno, e-mail, código ou recompensa…" />
        </label>
        <label className="filter-select">
          <Icon name="calendar" size={16} />
          <span className="sr-only">Filtrar por programa</span>
          <select value={programa} onChange={(e) => setPrograma(e.target.value)}>
            <option value="">Todos os programas</option>
            {programas.map((p) => <option key={p.codigo} value={p.codigo}>Recompensas de {p.codigo}</option>)}
          </select>
        </label>
        <button type="button" className="ghost-button" onClick={carregar}><Icon name="refresh" size={16} /> Atualizar</button>
      </div>

      {erro && <div className="dash-inline-error" role="alert">{erro}<button type="button" onClick={carregar}>Tentar novamente</button></div>}
      {!resgates && !erro && <div className="coord-state" role="status"><div className="coord-spinner" aria-hidden="true" /><p>Carregando resgates…</p></div>}
      {resgates?.length === 0 && <p className="empty-copy">Nenhum resgate ainda{programa ? ' em recompensas deste programa' : ''}.</p>}
      {resgates?.length > 0 && lista.length === 0 && <p className="empty-copy">Nenhum resgate com estes filtros.</p>}
      {lista.length > 0 && (
        <ListaResgates
          resgates={lista}
          ocupadoId={ocupadoId}
          onEntregar={(r) => { setErroAcao(''); setEntregando(r); }}
          onCancelar={(r) => { setErroAcao(''); setCancelando(r); }}
        />
      )}
      {resgates?.length >= 200 && <p className="detail-muted small">Mostrando os 200 resgates mais recentes. Use o filtro de programa para ver outros.</p>}

      {entregando && (
        <ConfirmarEntrega
          resgate={entregando}
          ocupado={ocupadoId === entregando.id}
          erro={erroAcao}
          onFechar={() => setEntregando(null)}
          onConfirmar={() => concluir(entregando, () => api.entregarResgate(entregando.id), (a) => `Entrega de "${a.recompensa.nome}" para ${a.participante.nome} registrada.`)}
        />
      )}
      {cancelando && (
        <CancelarResgate
          resgate={cancelando}
          ocupado={ocupadoId === cancelando.id}
          erro={erroAcao}
          onFechar={() => setCancelando(null)}
          onConfirmar={(motivo) => concluir(cancelando, () => api.cancelarResgate(cancelando.id, motivo), (a) => `Resgate cancelado. ${Number(a.custoXp).toLocaleString('pt-BR')} moedas devolvidas para ${a.participante.nome}.`)}
        />
      )}
    </section>
  );
}
