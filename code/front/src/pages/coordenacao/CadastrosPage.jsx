import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../../api/client';
import Icon from '../../components/Icon';
import { useToast } from '../../components/Toast';
import CadastroDetalhe from './CadastroDetalhe';
import { Avatar, dataCurta, ROTULO_STATUS_CADASTRO, statusCadastroTom } from './comum';

const FILTROS = [
  { valor: 'pendente', rotulo: 'Pendentes' },
  { valor: 'aprovado', rotulo: 'Aprovados' },
  { valor: 'rejeitado', rotulo: 'Rejeitados' },
  { valor: 'todos', rotulo: 'Todos' },
];

const ROTULO_TIPO = { padrinho: 'Padrinho', apadrinhado: 'Apadrinhado' };

function normalizar(texto) {
  return String(texto ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

/**
 * Solicitações de cadastro de padrinhos e apadrinhados. Aprovar/rejeitar
 * aqui também decide a candidatura/inscrição do ciclo que veio junto.
 */
export default function CadastrosPage() {
  const [params, setParams] = useSearchParams();
  const status = params.get('status') || 'pendente';
  const idSelecionado = Number(params.get('id')) || null;
  const mostrarToast = useToast();

  const [itens, setItens] = useState([]);
  const [erro, setErro] = useState('');
  const [carregando, setCarregando] = useState(true);
  const [busca, setBusca] = useState('');
  const [versao, setVersao] = useState(0);

  const carregar = useCallback(async () => {
    setCarregando(true);
    setErro('');
    try {
      setItens(await api.cadastros(status === 'todos' ? undefined : status));
    } catch (error) {
      setErro(error.message || 'Falha ao carregar os cadastros.');
    } finally {
      setCarregando(false);
    }
  }, [status]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  const filtrados = useMemo(() => {
    const termo = normalizar(busca.trim());
    if (!termo) return itens;
    return itens.filter((item) =>
      [item.nome, item.email, item.curso, ROTULO_TIPO[item.tipoParticipacao], item.periodo ? `${item.periodo}º período` : '']
        .some((campo) => normalizar(campo).includes(termo)));
  }, [itens, busca]);

  function atualizarParam(chave, valor) {
    const novos = new URLSearchParams(params);
    if (valor) novos.set(chave, valor);
    else novos.delete(chave);
    if (chave === 'status') novos.delete('id');
    setParams(novos, { replace: chave === 'id' });
  }

  function aoDecidir(mensagem) {
    if (mensagem) mostrarToast(mensagem, 'sucesso');
    setVersao((v) => v + 1);
    carregar();
  }

  return (
    <section className={`cand-page cand-split${idSelecionado ? ' has-selection' : ''}`}>
      <div className="cand-list-pane">
        <header className="dash-header compact">
          <div>
            <h1>Solicitações de cadastro</h1>
            <p>Analise os cadastros de padrinhos e apadrinhados. Só cadastros aprovados acessam os recursos do programa.</p>
          </div>
        </header>

        <div className="cand-tools">
          <label className="search-field">
            <Icon name="search" size={17} />
            <span className="sr-only">Buscar</span>
            <input type="search" value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar por nome, e-mail, curso ou modalidade…" />
          </label>
        </div>
        <div className="filter-chips" role="group" aria-label="Filtrar por status do cadastro">
          {FILTROS.map((f) => (
            <button key={f.valor} type="button" aria-pressed={status === f.valor} className={`filter-chip${status === f.valor ? ' active' : ''}`} onClick={() => atualizarParam('status', f.valor)}>
              {f.rotulo}
            </button>
          ))}
        </div>

        {carregando && itens.length === 0 && <p className="empty-copy" role="status">Carregando…</p>}
        {erro && (
          <div className="dash-inline-error" role="alert">
            {erro}
            <button type="button" onClick={carregar}>Tentar novamente</button>
          </div>
        )}
        {!carregando && !erro && filtrados.length === 0 && (
          <p className="empty-copy">{busca ? 'Nenhum resultado para a busca.' : status === 'pendente' ? 'Nenhum cadastro aguardando análise.' : 'Nenhum cadastro encontrado para este filtro.'}</p>
        )}

        <ul className="cand-list">
          {filtrados.map((item) => (
            <li key={item.id} className={`cand-row${item.id === idSelecionado ? ' selected' : ''}`}>
              <button type="button" className="cand-item" onClick={() => atualizarParam('id', String(item.id))} aria-current={item.id === idSelecionado ? 'true' : undefined}>
                <Avatar pessoa={item} tamanho="md" />
                <span className="cand-copy">
                  <span className="cand-name-row">
                    <strong>{item.nome}</strong>
                    <span className={`status-pill ${statusCadastroTom(item.statusCadastro)}`}>{ROTULO_STATUS_CADASTRO[item.statusCadastro]}</span>
                  </span>
                  <span>{ROTULO_TIPO[item.tipoParticipacao]} · {item.curso} • {item.periodo}º período</span>
                  <small>Enviado em {dataCurta(item.criadoEm)}</small>
                </span>
                <Icon name="chevron" size={16} />
              </button>
            </li>
          ))}
        </ul>
      </div>

      <div className="cand-detail-pane">
        {idSelecionado ? (
          <CadastroDetalhe
            key={`${idSelecionado}-${versao}`}
            id={idSelecionado}
            onFechar={() => atualizarParam('id', '')}
            onDecidido={aoDecidir}
          />
        ) : (
          <div className="cand-detail-empty">
            <Icon name="clipboard" size={30} />
            <p>Selecione um cadastro para ver os dados enviados.</p>
          </div>
        )}
      </div>
    </section>
  );
}
