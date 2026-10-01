import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../../api/client';
import Icon from '../../components/Icon';

function badgeClass(status) {
  if (status === 'pendente') return 'nova';
  if (status === 'em_analise') return 'analise';
  if (status === 'nao_aprovado') return 'rejeitada';
  return 'aprovada';
}

export default function CandidaturasPage() {
  const [params] = useSearchParams();
  const programa = params.get('programa') || '';
  const status = params.get('status') || '';
  const [itens, setItens] = useState([]);
  const [erro, setErro] = useState('');
  const [carregando, setCarregando] = useState(true);
  const [selecionada, setSelecionada] = useState(null);

  const filtroRotulo = {
    aguardando: 'aguardando decisão (novas + em análise)',
    pendente: 'novas',
    em_analise: 'em análise',
    aprovadas: 'aprovadas',
    nao_aprovado: 'rejeitadas',
    sem_vinculo: 'apadrinhados sem vínculo',
  }[status] || (status ? status : '');

  useEffect(() => {
    let ativo = true;
    (async () => {
      setCarregando(true);
      setErro('');
      try {
        const lista = await api.candidaturas(programa || undefined, status || undefined);
        if (ativo) setItens(lista);
      } catch (error) {
        if (ativo) setErro(error.message || 'Falha ao carregar candidaturas.');
      } finally {
        if (ativo) setCarregando(false);
      }
    })();
    return () => { ativo = false; };
  }, [programa, status]);

  return (
    <section className="cand-page">
      <header className="dash-header compact">
        <div>
          <h1>{status === 'sem_vinculo' ? 'Apadrinhados sem vínculo' : 'Candidaturas'}</h1>
          <p>
            {status === 'sem_vinculo' ? 'Apadrinhados aguardando padrinho/grupo' : 'Candidaturas a padrinho'}
            {programa ? ` · Programa ${programa}` : ''}
            {filtroRotulo ? ` · ${filtroRotulo}` : ''}.
          </p>
        </div>
        <Link className="text-link" to={programa ? `/coordenacao?programa=${encodeURIComponent(programa)}` : '/coordenacao'}>
          Voltar ao dashboard
        </Link>
      </header>

      {carregando && <p className="empty-copy">Carregando…</p>}
      {erro && (
        <div className="coord-state" role="alert">
          <p>{erro}</p>
        </div>
      )}
      {!carregando && !erro && itens.length === 0 && (
        <p className="empty-copy">Nenhuma candidatura encontrada para este filtro.</p>
      )}

      <ul className="recent-list cand-full-list">
        {itens.map((item) => (
          <li key={item.id}>
            <button type="button" className="recent-item" onClick={() => setSelecionada(item)}>
              <span className="coord-avatar sm" aria-hidden="true">{item.iniciais}</span>
              <span className="recent-copy">
                <strong>{item.nome}</strong>
                <span>{item.curso}{item.periodo ? ` · ${item.periodo}º período` : ''}</span>
              </span>
              <span className={`status-pill ${badgeClass(item.status)}`}>{item.statusRotulo}</span>
              <Icon name="chevron" size={16} />
            </button>
          </li>
        ))}
      </ul>

      {selecionada && (
        <div className="modal-backdrop" onClick={() => setSelecionada(null)}>
          <div className="modal-card" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
            <h2>Detalhe da candidatura</h2>
            <p><strong>{selecionada.nome}</strong></p>
            <p>{selecionada.curso}</p>
            <p>E-mail: {selecionada.usuarioId}</p>
            <p>Status: {selecionada.statusRotulo}</p>
            <p>Programa: {selecionada.programa}</p>
            <button type="button" className="ghost-button" onClick={() => setSelecionada(null)}>Fechar</button>
          </div>
        </div>
      )}
    </section>
  );
}
