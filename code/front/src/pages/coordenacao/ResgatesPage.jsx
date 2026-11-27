import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { api } from '../../api/client';
import Icon from '../../components/Icon';
import Modal from '../../components/Modal';
import { useToast } from '../../components/Toast';
import { dataCurta } from './comum';

/** Iguais aos do servidor (que continua sendo a autoridade). */
export const MOTIVO_CANCELAMENTO = { min: 3, max: 300 };
/** Itens por página da fila (o servidor aceita até 200). */
export const PAGINA_RESGATES = 50;
/** Valor do seletor de programa para resgates sem programa identificado. */
export const SEM_PROGRAMA = '__sem_programa__';

export const ROTULO_SITUACAO = {
  aguardando_entrega: 'Aguardando entrega',
  entregue: 'Entregue',
  cancelado: 'Cancelado',
};
const TOM_SITUACAO = { aguardando_entrega: 'amber', entregue: 'green', cancelado: 'muted' };

const FILTROS = [
  { valor: '', rotulo: 'Todos', contagem: 'todos' },
  { valor: 'aguardando_entrega', rotulo: 'Aguardando entrega', contagem: 'aguardando_entrega' },
  { valor: 'entregue', rotulo: 'Entregues', contagem: 'entregue' },
  { valor: 'cancelado', rotulo: 'Cancelados', contagem: 'cancelado' },
];

/** Caracteres como o banco conta (`char_length`): pontos de código, sem as pontas. */
const comprimento = (texto) => [...String(texto ?? '').trim()].length;

/** Mensagem de validação do motivo, ou '' quando pode enviar. */
export function validarMotivo(motivo) {
  const n = comprimento(motivo);
  if (n < MOTIVO_CANCELAMENTO.min) return `Escreva o motivo (mínimo ${MOTIVO_CANCELAMENTO.min} caracteres). Ele fica no histórico e o aluno vê.`;
  if (n > MOTIVO_CANCELAMENTO.max) return `Motivo com no máximo ${MOTIVO_CANCELAMENTO.max} caracteres.`;
  return '';
}

/**
 * Parâmetros de `GET /coordenacao/resgates`. Situação, programa e busca vão
 * para o servidor, que filtra ANTES de paginar: nenhum resgate pendente some
 * por estar atrás de outros mais recentes.
 */
export function consultaResgates({ situacao = '', programa = '', busca = '', cursor } = {}) {
  return {
    situacao: situacao || undefined,
    programa: programa && programa !== SEM_PROGRAMA ? programa : undefined,
    semPrograma: programa === SEM_PROGRAMA ? 'true' : undefined,
    busca: busca.trim() || undefined,
    limite: PAGINA_RESGATES,
    cursor: cursor || undefined,
  };
}

/** Contagem depois de um desfecho local (aguardando → entregue/cancelado). */
export function contagemAposDesfecho(contagem, de, para) {
  // Sem a situação anterior (item fora da lista) não dá para ajustar: mantém.
  if (!contagem || !de || !para || de === para) return contagem;
  return { ...contagem, [de]: Math.max(0, (contagem[de] ?? 0) - 1), [para]: (contagem[para] ?? 0) + 1 };
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

/** Programa da troca, gravado no resgate. */
export function textoPrograma(r) {
  if (!r.programa?.codigo) return 'sem programa identificado';
  return r.programa.inferido ? `${r.programa.codigo} (inferido)` : r.programa.codigo;
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
                  <small className="recompensa-sub" title={r.programa?.inferido ? 'Resgate anterior ao registro do programa na troca; programa deduzido dos dados da época.' : undefined}>
                    Código {r.codigo} · v{r.recompensa.versao} · {textoPrograma(r)}
                  </small>
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
          <textarea id={`${id}-motivo`} rows={3} maxLength={MOTIVO_CANCELAMENTO.max * 2} data-autofocus placeholder="Ex.: aluno não retirou no prazo; recompensa danificada" value={motivo} onChange={(e) => setMotivo(e.target.value)} onBlur={() => setTocado(true)} />
        </label>
        {tocado && erroValidacao && <p className="detail-muted small" role="status">{erroValidacao}</p>}
        {erro && <p className="form-error" role="alert"><Icon name="alert" size={15} /> {erro}</p>}
      </form>
    </Modal>
  );
}

export default function ResgatesPage() {
  const mostrarToast = useToast();
  /** `{ itens, proximoCursor, contagem }` da consulta atual; `null` carregando. */
  const [pagina, setPagina] = useState(null);
  const [programas, setProgramas] = useState([]);
  const [programa, setPrograma] = useState('');
  const [situacao, setSituacao] = useState('aguardando_entrega');
  const [busca, setBusca] = useState('');
  const [buscaAplicada, setBuscaAplicada] = useState('');
  const [erro, setErro] = useState('');
  const [carregandoMais, setCarregandoMais] = useState(false);
  const [entregando, setEntregando] = useState(null);
  const [cancelando, setCancelando] = useState(null);
  const [erroAcao, setErroAcao] = useState('');
  const [ocupadoId, setOcupadoId] = useState(null);
  const trava = useRef(false);
  // Só a resposta da consulta mais recente é aplicada: digitar rápido ou
  // trocar de filtro não deixa uma resposta antiga sobrescrever a nova.
  const geracao = useRef(0);

  // Busca no servidor com um pequeno atraso enquanto digita.
  useEffect(() => {
    const timer = setTimeout(() => setBuscaAplicada(busca.trim()), 300);
    return () => clearTimeout(timer);
  }, [busca]);

  const filtros = { situacao, programa, busca: buscaAplicada };

  const carregar = useCallback(async () => {
    const minha = ++geracao.current;
    setErro('');
    setPagina(null);
    try {
      const resposta = await api.resgatesCoordenacao(consultaResgates({ situacao, programa, busca: buscaAplicada }));
      if (minha === geracao.current) setPagina(resposta);
    } catch (error) {
      if (minha === geracao.current) setErro(error.message || 'Não foi possível carregar os resgates.');
    }
  }, [situacao, programa, buscaAplicada]);

  useEffect(() => { carregar(); }, [carregar]);
  useEffect(() => {
    api.programas().then((lista) => setProgramas(Array.isArray(lista) ? lista : [])).catch(() => setProgramas([]));
  }, []);

  async function carregarMais() {
    if (!pagina?.proximoCursor || carregandoMais) return;
    const minha = geracao.current;
    setCarregandoMais(true);
    try {
      const resposta = await api.resgatesCoordenacao(consultaResgates({ ...filtros, cursor: pagina.proximoCursor }));
      if (minha !== geracao.current) return;
      setPagina((atual) => {
        const vistos = new Set(atual.itens.map((r) => r.id));
        return {
          itens: [...atual.itens, ...resposta.itens.filter((r) => !vistos.has(r.id))],
          proximoCursor: resposta.proximoCursor,
          contagem: resposta.contagem,
        };
      });
    } catch (error) {
      if (minha === geracao.current) setErro(error.message || 'Não foi possível carregar mais resgates.');
    } finally {
      setCarregandoMais(false);
    }
  }

  /** Aplica um resgate atualizado; sai da lista se não cabe mais no filtro. */
  function substituir(item) {
    setPagina((atual) => {
      if (!atual) return atual;
      const anterior = atual.itens.find((r) => r.id === item.id);
      const itens = atual.itens
        .map((r) => (r.id === item.id ? item : r))
        .filter((r) => !situacao || r.situacao === situacao);
      return { ...atual, itens, contagem: contagemAposDesfecho(atual.contagem, anterior?.situacao, item.situacao) };
    });
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

  const lista = pagina?.itens ?? [];
  const contagem = pagina?.contagem;
  const filtrando = Boolean(situacao || programa || buscaAplicada);

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
            {f.rotulo}{contagem ? ` (${contagem[f.contagem] ?? 0})` : ''}
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
          <span className="sr-only">Filtrar por programa da troca</span>
          <select value={programa} onChange={(e) => setPrograma(e.target.value)}>
            <option value="">Todos os programas</option>
            {programas.map((p) => <option key={p.codigo} value={p.codigo}>Trocas em {p.codigo}</option>)}
            <option value={SEM_PROGRAMA}>Sem programa identificado</option>
          </select>
        </label>
        <button type="button" className="ghost-button" onClick={carregar}><Icon name="refresh" size={16} /> Atualizar</button>
      </div>

      {erro && <div className="dash-inline-error" role="alert">{erro}<button type="button" onClick={carregar}>Tentar novamente</button></div>}
      {!pagina && !erro && <div className="coord-state" role="status"><div className="coord-spinner" aria-hidden="true" /><p>Carregando resgates…</p></div>}
      {pagina && lista.length === 0 && (
        <p className="empty-copy">{filtrando ? 'Nenhum resgate com estes filtros.' : 'Nenhum resgate ainda.'}</p>
      )}
      {lista.length > 0 && (
        <ListaResgates
          resgates={lista}
          ocupadoId={ocupadoId}
          onEntregar={(r) => { setErroAcao(''); setEntregando(r); }}
          onCancelar={(r) => { setErroAcao(''); setCancelando(r); }}
        />
      )}
      {pagina?.proximoCursor && (
        <button type="button" className="ghost-button" onClick={carregarMais} disabled={carregandoMais}>
          {carregandoMais ? 'Carregando…' : 'Carregar mais'}
        </button>
      )}

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
