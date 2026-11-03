import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../../api/client';
import Icon from '../../components/Icon';
import Modal from '../../components/Modal';
import { useToast } from '../../components/Toast';
import CadastroDetalhe from './CadastroDetalhe';
import CandidaturaDetalhe from './CandidaturaDetalhe';
import { Avatar, badgeClass, dataCurta, ROTULO_STATUS_CADASTRO, statusCadastroTom } from './comum';

const PUBLICOS = [
  { valor: 'padrinho', rotulo: 'Padrinhos' },
  { valor: 'apadrinhado', rotulo: 'Apadrinhados' },
];

const FILTROS_PADRINHO = [
  { valor: '', rotulo: 'Todas' },
  { valor: 'pendente', rotulo: 'Novas' },
  { valor: 'em_analise', rotulo: 'Em análise' },
  { valor: 'aguardando', rotulo: 'Aguardando decisão' },
  { valor: 'aprovadas', rotulo: 'Aprovadas' },
  { valor: 'nao_aprovado', rotulo: 'Rejeitadas' },
];

/** Filtros do público apadrinhado: aprovação de cadastro + matching. */
const FILTROS_APADRINHADO = [
  { valor: 'pendente', rotulo: 'Aguardando aprovação' },
  { valor: 'sem_vinculo', rotulo: 'Sem vínculo' },
  { valor: 'aprovado', rotulo: 'Aprovados' },
  { valor: 'rejeitado', rotulo: 'Rejeitados' },
];

const ACOES_MASSA = {
  aprovar: { rotulo: 'Aprovar', verbo: 'aprovada(s)' },
  rejeitar: { rotulo: 'Rejeitar', verbo: 'rejeitada(s)' },
};

function normalizar(texto) {
  return String(texto ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

/** Ainda sem decisão final (pode aprovar/rejeitar em massa). */
function aindaPendente(item) {
  if (item.statusCadastro) return item.statusCadastro === 'pendente';
  return item.status === 'pendente' || item.status === 'em_analise';
}

/** Pendentes / em análise primeiro; depois já decididas. Empate: mais recente. */
function prioridadeLista(item) {
  return aindaPendente(item) ? 0 : 1;
}

function ordenarLista(a, b) {
  const diff = prioridadeLista(a) - prioridadeLista(b);
  if (diff !== 0) return diff;
  return String(b.criadoEm || '').localeCompare(String(a.criadoEm || ''));
}

function deduplicarPorId(lista) {
  const mapa = new Map();
  for (const item of lista) {
    if (item?.id != null) mapa.set(item.id, item);
  }
  return [...mapa.values()];
}

function resolverPublico(params) {
  if (params.get('publico') === 'apadrinhado' || params.get('status') === 'sem_vinculo') {
    return 'apadrinhado';
  }
  return 'padrinho';
}

export default function CandidaturasPage() {
  const [params, setParams] = useSearchParams();
  const programa = params.get('programa') || '';
  const publico = resolverPublico(params);
  const statusParam = params.get('status') || '';
  const idSelecionado = Number(params.get('id')) || null;
  const mostrarToast = useToast();

  const modoApadrinhado = publico === 'apadrinhado';
  const modoSemVinculo = modoApadrinhado && statusParam === 'sem_vinculo';
  const modoCadastroApadrinhado = modoApadrinhado && !modoSemVinculo;
  const statusApadrinhado = FILTROS_APADRINHADO.some((f) => f.valor === statusParam)
    ? statusParam
    : 'sem_vinculo';
  const statusPadrinho = FILTROS_PADRINHO.some((f) => f.valor === statusParam) ? statusParam : '';

  const [itens, setItens] = useState([]);
  const [erro, setErro] = useState('');
  const [carregando, setCarregando] = useState(true);
  const [busca, setBusca] = useState('');
  const [marcados, setMarcados] = useState([]);
  const [confirmacao, setConfirmacao] = useState(null);
  const [justificativa, setJustificativa] = useState('');
  const [processando, setProcessando] = useState(false);
  const [resultado, setResultado] = useState(null);
  const [versao, setVersao] = useState(0);

  const carregar = useCallback(async () => {
    setCarregando(true);
    setErro('');
    try {
      if (publico === 'apadrinhado') {
        if (statusApadrinhado === 'sem_vinculo') {
          setItens(await api.candidaturas(programa || undefined, 'sem_vinculo'));
        } else {
          const lista = await api.cadastros(
            statusApadrinhado === 'pendente' || statusApadrinhado === 'aprovado' || statusApadrinhado === 'rejeitado'
              ? statusApadrinhado
              : undefined,
            programa || undefined,
          );
          setItens(lista.filter((item) => item.tipoParticipacao === 'apadrinhado'));
        }
      } else {
        const status = statusPadrinho;
        const lista = status
          ? await api.candidaturas(programa || undefined, status)
          : deduplicarPorId((await Promise.all([
              api.candidaturas(programa || undefined),
              api.candidaturas(programa || undefined, 'aprovadas'),
            ])).flat());
        setItens(lista.sort(ordenarLista));
      }
    } catch (error) {
      setErro(error.message || 'Falha ao carregar a lista.');
      setItens([]);
    } finally {
      setCarregando(false);
    }
  }, [programa, publico, statusApadrinhado, statusPadrinho]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  useEffect(() => {
    setMarcados([]);
    setResultado(null);
  }, [publico, statusParam, programa]);

  // Limpa ids marcados que sumiram da lista.
  useEffect(() => {
    setMarcados((atual) => atual.filter((id) => itens.some((item) => item.id === id)));
  }, [itens]);

  const filtrados = useMemo(() => {
    const termo = normalizar(busca.trim());
    const base = !termo
      ? itens
      : itens.filter((item) =>
        [item.nome, item.curso, item.email, item.periodo ? `${item.periodo}º período` : '', item.periodo]
          .some((campo) => normalizar(campo).includes(termo)),
      );
    return [...base].sort(ordenarLista);
  }, [itens, busca]);

  function atualizarParam(chave, valor, extras = {}) {
    const novos = new URLSearchParams(params);
    if (valor) novos.set(chave, valor);
    else novos.delete(chave);
    Object.entries(extras).forEach(([k, v]) => {
      if (v) novos.set(k, v);
      else novos.delete(k);
    });
    if (chave === 'status' || chave === 'publico') novos.delete('id');
    setParams(novos, { replace: chave === 'id' });
  }

  function trocarPublico(novo) {
    if (novo === publico) return;
    atualizarParam('publico', novo === 'padrinho' ? '' : novo, {
      // Apadrinhados: fila de matching primeiro (costuma ter trabalho); cadastros pendentes no chip.
      status: novo === 'apadrinhado' ? 'sem_vinculo' : '',
    });
  }

  function selecionar(id) {
    atualizarParam('id', id ? String(id) : '');
  }

  // Mantém o detalhe alinhado à lista atual (troca de aba/filtro não deixa perfil “fantasma”).
  useEffect(() => {
    if (carregando) return;
    const aindaVisivel = idSelecionado && filtrados.some((i) => i.id === idSelecionado);
    if (aindaVisivel) return;
    if (filtrados[0]?.id) selecionar(filtrados[0].id);
    else if (idSelecionado) selecionar(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- sincroniza só com lista/seleção
  }, [carregando, idSelecionado, filtrados]);

  const selecionaveis = useMemo(() => filtrados.filter(aindaPendente), [filtrados]);
  const todosMarcados = selecionaveis.length > 0 && selecionaveis.every((item) => marcados.includes(item.id));

  function alternarTodos() {
    if (todosMarcados) {
      setMarcados((atual) => atual.filter((id) => !selecionaveis.some((i) => i.id === id)));
      return;
    }
    setMarcados((atual) => Array.from(new Set([...atual, ...selecionaveis.map((i) => i.id)])));
  }

  function alternar(id) {
    const item = filtrados.find((i) => i.id === id);
    if (item && !aindaPendente(item)) return;
    setMarcados((atual) => (atual.includes(id) ? atual.filter((v) => v !== id) : [...atual, id]));
  }

  async function executarMassa(acao) {
    setProcessando(true);
    setResultado(null);
    try {
      const resposta = await api.acaoEmMassa(marcados, acao, justificativa.trim());
      await carregar();
      setMarcados([]);
      setConfirmacao(null);
      setResultado({ ...resposta, rotulo: ACOES_MASSA[acao].verbo });
      setVersao((v) => v + 1);
    } catch (error) {
      setResultado({ erro: error.message || 'Não foi possível executar a ação.' });
      setConfirmacao(null);
    } finally {
      setProcessando(false);
    }
  }

  function aoAtualizarDetalhe(detalheAtualizado, mensagem, opcoes = {}) {
    if (mensagem) mostrarToast(mensagem, 'sucesso');
    setVersao((v) => v + 1);

    // Depois de decidir, abre o próximo pendente (fluxo rápido da coordenação).
    if (opcoes.avancar) {
      const idx = filtrados.findIndex((i) => i.id === idSelecionado);
      const proximo = filtrados.slice(idx + 1).find(aindaPendente)
        || filtrados.slice(0, Math.max(idx, 0)).find(aindaPendente);
      if (proximo?.id) selecionar(proximo.id);
    }

    carregar();
  }

  const nomesPorId = useMemo(() => Object.fromEntries(itens.map((i) => [i.id, i.nome])), [itens]);
  const filtros = modoApadrinhado ? FILTROS_APADRINHADO : FILTROS_PADRINHO;
  const statusAtivo = modoApadrinhado ? statusApadrinhado : statusPadrinho;

  const detalheVisivel = idSelecionado && filtrados.some((i) => i.id === idSelecionado);

  return (
    <section className={`cand-page${detalheVisivel ? ' has-selection' : ''}`}>
      <header className="cand-top">
        <div className="cand-top-row">
          <div className="cand-top-copy">
            <h1>Candidaturas</h1>
            <p>
              {modoApadrinhado
                ? 'Aprove cadastros e defina vínculos.'
                : 'Revise, aprove ou rejeite com o mínimo de cliques.'}
              {programa ? ` · ${programa}` : ''}
            </p>
          </div>
          <div className="forms-tabs" role="tablist" aria-label="Público da análise">
            {PUBLICOS.map((p) => (
              <button
                key={p.valor}
                type="button"
                role="tab"
                aria-selected={p.valor === publico}
                className={`forms-tab${p.valor === publico ? ' active' : ''}`}
                onClick={() => trocarPublico(p.valor)}
              >
                {p.rotulo}
              </button>
            ))}
          </div>
        </div>

        <div className="cand-toolbar">
          <label className="search-field">
            <Icon name="search" size={17} />
            <span className="sr-only">Buscar</span>
            <input type="search" value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar por nome, curso ou período…" />
          </label>
          <label className="filter-select">
            <Icon name="filter" size={16} />
            <span className="sr-only">Filtrar por status</span>
            <select value={statusAtivo} onChange={(e) => atualizarParam('status', e.target.value)}>
              {filtros.map((f) => <option key={f.valor || 'todas'} value={f.valor}>{f.rotulo}</option>)}
            </select>
          </label>
          <div className="filter-chips" role="group" aria-label="Filtrar por status">
            {filtros.map((f) => (
              <button
                key={f.valor || 'todas'}
                type="button"
                aria-pressed={statusAtivo === f.valor}
                className={`filter-chip${statusAtivo === f.valor ? ' active' : ''}`}
                onClick={() => atualizarParam('status', f.valor)}
              >
                {f.rotulo}
              </button>
            ))}
          </div>
        </div>
      </header>

      <div className="cand-body">
        <div className="cand-list-pane">
          {!modoApadrinhado && selecionaveis.length > 0 && (
            <div className="bulk-bar">
              <label className="bulk-all">
                <input type="checkbox" checked={todosMarcados} onChange={alternarTodos} />
                Selecionar pendentes ({selecionaveis.length})
              </label>
              {marcados.length > 0 && (
                <div className="bulk-actions" role="group" aria-label={`Ações para ${marcados.length} selecionada(s)`}>
                  <span>{marcados.length} selecionada(s)</span>
                  <button type="button" className="mini-btn success" onClick={() => setConfirmacao('aprovar')}><Icon name="check" size={14} /> Aprovar</button>
                  <button type="button" className="mini-btn danger" onClick={() => setConfirmacao('rejeitar')}><Icon name="close" size={14} /> Rejeitar</button>
                </div>
              )}
            </div>
          )}

          {resultado && (
            <div className={`bulk-result${resultado.erro || resultado.falhas?.length ? ' warn' : ''}`} role="status">
              {resultado.erro ? (
                <p>{resultado.erro}</p>
              ) : (
                <>
                  <p><strong>{resultado.sucesso}</strong> candidatura(s) {resultado.rotulo}.</p>
                  {resultado.falhas?.length > 0 && (
                    <ul>
                      {resultado.falhas.map((f) => <li key={f.id}>{nomesPorId[f.id] || `#${f.id}`}: {f.erro}</li>)}
                    </ul>
                  )}
                </>
              )}
              <button type="button" className="link-btn" onClick={() => setResultado(null)}>Fechar</button>
            </div>
          )}

          {carregando && itens.length === 0 && <p className="empty-copy" role="status">Carregando…</p>}
          {erro && (
            <div className="dash-inline-error" role="alert">
              {erro}
              <button type="button" onClick={carregar}>Tentar novamente</button>
            </div>
          )}
          {!carregando && !erro && filtrados.length === 0 && (
            <div className="cand-empty">
              <p className="empty-copy">
                {busca
                  ? 'Nenhum resultado para a busca.'
                  : modoSemVinculo
                    ? 'Todos os apadrinhados já têm padrinho.'
                    : modoCadastroApadrinhado && statusApadrinhado === 'pendente'
                      ? 'Nenhum cadastro de apadrinhado aguardando aprovação.'
                      : 'Nenhum registro encontrado para este filtro.'}
              </p>
              {modoApadrinhado && !busca && statusApadrinhado === 'pendente' && (
                <div className="cand-empty-actions">
                  <button type="button" className="mini-btn" onClick={() => atualizarParam('status', 'sem_vinculo')}>
                    Ver sem vínculo
                  </button>
                  <button type="button" className="mini-btn" onClick={() => atualizarParam('status', 'aprovado')}>
                    Ver aprovados
                  </button>
                </div>
              )}
            </div>
          )}

          <ul className="cand-list">
            {filtrados.map((item) => (
              <li key={item.id} className={`cand-row${item.id === idSelecionado ? ' selected' : ''}${!modoApadrinhado && !aindaPendente(item) ? ' decided' : ''}`}>
                {!modoApadrinhado && aindaPendente(item) && (
                  <input
                    type="checkbox"
                    className="cand-check"
                    checked={marcados.includes(item.id)}
                    onChange={() => alternar(item.id)}
                    aria-label={`Selecionar ${item.nome}`}
                  />
                )}
                <button type="button" className="cand-item" onClick={() => selecionar(item.id)} aria-current={item.id === idSelecionado ? 'true' : undefined}>
                  <Avatar pessoa={item} tamanho="sm" />
                  <span className="cand-copy">
                    <strong>{item.nome}</strong>
                    <span>{item.curso}{item.periodo ? ` · ${item.periodo}º` : ''}</span>
                  </span>
                  <span className={`status-pill cand-status ${
                    modoSemVinculo
                      ? 'analise'
                      : modoCadastroApadrinhado
                        ? statusCadastroTom(item.statusCadastro)
                        : badgeClass(item.status, item.papel)
                  }`}
                  >
                    {modoSemVinculo
                      ? 'Sem vínculo'
                      : modoCadastroApadrinhado
                        ? ROTULO_STATUS_CADASTRO[item.statusCadastro] || item.statusCadastro
                        : item.statusRotulo}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>

        <div className="cand-detail-pane">
          {detalheVisivel && modoCadastroApadrinhado ? (
            <CadastroDetalhe
              key={`${idSelecionado}-${versao}`}
              id={idSelecionado}
              programa={programa || undefined}
              onFechar={() => selecionar(null)}
              onDecidido={(mensagem, opcoes) => aoAtualizarDetalhe(null, mensagem, opcoes)}
            />
          ) : detalheVisivel ? (
            <CandidaturaDetalhe
              key={`${idSelecionado}-${versao}`}
              id={idSelecionado}
              programa={programa}
              modoApadrinhado={modoSemVinculo}
              onFechar={() => selecionar(null)}
              onAtualizado={aoAtualizarDetalhe}
            />
          ) : null}
        </div>
      </div>

      {confirmacao && (
        <Modal
          titulo={`${ACOES_MASSA[confirmacao].rotulo} ${marcados.length} candidatura(s)?`}
          descricao={confirmacao === 'rejeitar' ? 'As candidaturas selecionadas serão marcadas como não aprovadas. Candidaturas já aprovadas não podem ser rejeitadas.' : 'A ação será aplicada a todas as candidaturas selecionadas.'}
          onFechar={() => !processando && setConfirmacao(null)}
          acoes={(
            <>
              <button type="button" className="ghost-button" onClick={() => setConfirmacao(null)} disabled={processando} data-autofocus>Cancelar</button>
              <button type="button" className={confirmacao === 'rejeitar' ? 'danger-button' : 'primary-button inline'} onClick={() => executarMassa(confirmacao)} disabled={processando || (confirmacao === 'rejeitar' && !justificativa.trim())}>
                {processando ? 'Processando…' : ACOES_MASSA[confirmacao].rotulo}
              </button>
            </>
          )}
        >
          {confirmacao === 'rejeitar' && <label>Justificativa visível ao candidato<textarea maxLength={1000} value={justificativa} onChange={(e) => setJustificativa(e.target.value)} /></label>}
          <ul className="modal-names">
            {marcados.slice(0, 8).map((id) => <li key={id}>{nomesPorId[id] || `#${id}`}</li>)}
            {marcados.length > 8 && <li>e mais {marcados.length - 8}…</li>}
          </ul>
        </Modal>
      )}
    </section>
  );
}
