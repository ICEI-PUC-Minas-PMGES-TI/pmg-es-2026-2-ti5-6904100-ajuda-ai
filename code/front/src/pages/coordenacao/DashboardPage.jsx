import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../../api/client';
import Icon from '../../components/Icon';

function formatarAtualizacao(iso) {
  if (!iso) return '—';
  const data = new Date(iso);
  const agora = new Date();
  const diff = agora.getTime() - data.getTime();
  if (diff < 60000) return 'Atualizado agora';
  const min = Math.floor(diff / 60000);
  if (min < 60) return `Atualizado há ${min} min`;
  return `Atualizado às ${data.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
}

function badgeClass(status) {
  if (status === 'pendente') return 'nova';
  if (status === 'em_analise') return 'analise';
  if (status === 'nao_aprovado') return 'rejeitada';
  if (status === 'em_andamento' || status === 'concluido') return 'aprovada';
  return 'analise';
}

export default function DashboardPage() {
  const [params, setParams] = useSearchParams();
  const programaParam = params.get('programa') || '';
  const [dados, setDados] = useState(null);
  const [erro, setErro] = useState('');
  const [carregando, setCarregando] = useState(true);
  const [seletorAberto, setSeletorAberto] = useState(false);
  const [detalhe, setDetalhe] = useState(null);
  const navigate = useNavigate();
  const seletorId = useId();
  const seletorBtnRef = useRef(null);
  const seletorListaRef = useRef(null);

  const carregar = useCallback(async (codigo) => {
    setCarregando(true);
    setErro('');
    try {
      const resposta = await api.dashboard(codigo || undefined);
      setDados(resposta);
      if (resposta.programa?.codigo && resposta.programa.codigo !== codigo) {
        setParams({ programa: resposta.programa.codigo }, { replace: true });
      }
    } catch (error) {
      setErro(error.message || 'Não foi possível carregar o dashboard.');
      setDados(null);
    } finally {
      setCarregando(false);
    }
  }, [setParams]);

  useEffect(() => {
    carregar(programaParam);
  }, [programaParam, carregar]);

  useEffect(() => {
    if (!seletorAberto) return undefined;
    function onKey(event) {
      if (event.key === 'Escape') {
        setSeletorAberto(false);
        seletorBtnRef.current?.focus();
      }
    }
    document.addEventListener('keydown', onKey);
    seletorListaRef.current?.querySelector('[role="option"]')?.focus();
    return () => document.removeEventListener('keydown', onKey);
  }, [seletorAberto]);

  function ir(destino, extras = {}) {
    const codigo = dados?.programa?.codigo || programaParam;
    const query = new URLSearchParams({ ...(codigo ? { programa: codigo } : {}), ...extras });
    navigate(`/coordenacao/${destino}?${query.toString()}`);
  }

  async function abrirNovoCiclo() {
    try {
      const criado = await api.criarPrograma();
      setParams({ programa: criado.codigo });
    } catch (error) {
      setErro(error.message || 'Não foi possível abrir o novo ciclo.');
    }
  }

  if (carregando && !dados) {
    return (
      <div className="coord-state" role="status">
        <div className="coord-spinner" aria-hidden="true" />
        <p>Carregando dashboard…</p>
      </div>
    );
  }

  if (erro && !dados) {
    return (
      <div className="coord-state" role="alert">
        <Icon name="alert" size={28} />
        <p>{erro}</p>
        <button type="button" className="primary-button" onClick={() => carregar(programaParam)}>
          Tentar novamente
        </button>
      </div>
    );
  }

  if (dados?.vazio || !dados?.programa) {
    return (
      <div className="coord-state">
        <h1>Dashboard da coordenação</h1>
        <p>Nenhum programa cadastrado no momento.</p>
        <button type="button" className="primary-button" onClick={abrirNovoCiclo}>
          Abrir novo ciclo <Icon name="plus" size={18} />
        </button>
      </div>
    );
  }

  const { indicadores, candidaturasVisaoGeral: chart, etapas, candidaturasRecentes, pontosAtencao, resumo, programas } = dados;
  const maxBar = Math.max(chart.pendentes, chart.emAnalise, chart.aprovadas, chart.rejeitadas, 1);
  const barras = [
    { key: 'pendentes', label: 'Pendentes', valor: chart.pendentes, tom: 'purple' },
    { key: 'em_analise', label: 'Em análise', valor: chart.emAnalise, tom: 'lilac' },
    { key: 'aprovadas', label: 'Aprovadas', valor: chart.aprovadas, tom: 'green' },
    { key: 'rejeitadas', label: 'Rejeitadas', valor: chart.rejeitadas, tom: 'pink' },
  ];

  return (
    <div className="dash">
      <header className="dash-header">
        <div>
          <h1>Dashboard da coordenação</h1>
          <p>Acompanhe o programa atual, candidaturas e principais indicadores do semestre.</p>
        </div>
        <div className="dash-header-tools">
          <div className="program-select">
            <button
              ref={seletorBtnRef}
              type="button"
              className="program-select-btn"
              aria-haspopup="listbox"
              aria-expanded={seletorAberto}
              aria-controls={seletorId}
              onClick={() => setSeletorAberto((v) => !v)}
            >
              <Icon name="calendar" size={17} />
              <span>Programa {dados.programa.codigo}</span>
              <Icon name="chevron" size={16} className="rotate-90" />
            </button>
            {seletorAberto && (
              <ul
                id={seletorId}
                ref={seletorListaRef}
                className="program-select-list"
                role="listbox"
                aria-label="Selecionar programa"
              >
                {programas.map((p) => (
                  <li key={p.codigo} role="presentation">
                    <button
                      type="button"
                      role="option"
                      aria-selected={p.codigo === dados.programa.codigo}
                      className={p.codigo === dados.programa.codigo ? 'selected' : ''}
                      onClick={() => {
                        setSeletorAberto(false);
                        setParams({ programa: p.codigo });
                        seletorBtnRef.current?.focus();
                      }}
                    >
                      Programa {p.codigo}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <span className="dash-updated">
            <Icon name="clock" size={15} />
            {formatarAtualizacao(dados.atualizadoEm)}
          </span>
        </div>
      </header>

      {erro && (
        <div className="dash-inline-error" role="alert">
          {erro}
          <button type="button" onClick={() => carregar(programaParam)}>Recarregar</button>
        </div>
      )}

      <section className="dash-kpis" aria-label="Indicadores">
        <KpiCard
          titulo="Candidaturas pendentes"
          valor={indicadores.candidaturasPendentes.valor}
          contexto={`${indicadores.candidaturasPendentes.valor} de ${indicadores.candidaturasPendentes.total} inscritas`}
          icon="clipboard"
          tom="purple"
          onClick={() => ir('candidaturas', { status: 'pendente' })}
        />
        <KpiCard
          titulo="Padrinhos aprovados"
          valor={indicadores.padrinhosAprovados.valor}
          contexto={`${indicadores.padrinhosAprovados.valor} de ${indicadores.padrinhosAprovados.total} candidaturas`}
          icon="checkCircle"
          tom="green"
          onClick={() => ir('candidaturas', { status: 'aprovadas' })}
        />
        <KpiCard
          titulo="Apadrinhados ativos"
          valor={indicadores.apadrinhadosAtivos.valor}
          contexto={`${indicadores.apadrinhadosAtivos.valor} de ${indicadores.apadrinhadosAtivos.total} vagas`}
          icon="person"
          tom="purple"
          onClick={() => ir('usuarios')}
        />
        <KpiCard
          titulo="Grupos formados"
          valor={indicadores.gruposFormados.valor}
          contexto={`${indicadores.gruposFormados.valor} de ${indicadores.gruposFormados.total} previstos`}
          icon="groups"
          tom="blue"
          onClick={() => ir('programas')}
        />
      </section>

      <section className="dash-mid">
        <article className="dash-card chart-card">
          <div className="dash-card-head">
            <h2>Visão geral das candidaturas</h2>
            <Link className="text-link" to={`/coordenacao/candidaturas?programa=${encodeURIComponent(dados.programa.codigo)}`}>
              Ver todas
            </Link>
          </div>
          <p className="sr-only">
            Candidaturas a padrinho: {barras.map((b) => `${b.label} ${b.valor}`).join(', ')}.
          </p>
          <div className="bar-chart" role="img" aria-label="Gráfico de candidaturas a padrinho">
            {barras.map((barra) => (
              <div key={barra.key} className="bar-col">
                <span className="bar-value">{barra.valor}</span>
                <div className="bar-track">
                  <div
                    className={`bar-fill ${barra.tom}`}
                    style={{ height: `${Math.max(8, (barra.valor / maxBar) * 100)}%` }}
                  />
                </div>
                <span className="bar-label">{barra.label}</span>
              </div>
            ))}
          </div>
          <ul className="chart-legend">
            {barras.map((b) => (
              <li key={b.key}><span className={`dot ${b.tom}`} />{b.label}: {b.valor}</li>
            ))}
          </ul>
        </article>

        <article className="dash-card stages-card">
          <h2>Etapas do semestre</h2>
          <ol className="stages-list">
            {etapas.map((etapa) => (
              <li key={etapa.id} className={`stage-item ${etapa.estado}`}>
                <span className="stage-marker" aria-hidden="true">
                  {etapa.estado === 'concluida' ? <Icon name="check" size={14} /> : null}
                </span>
                <div className="stage-copy">
                  <strong>
                    {etapa.titulo}
                    {etapa.estado === 'atual' && <span className="stage-pill">Etapa atual</span>}
                  </strong>
                  <span>{etapa.periodoTexto}</span>
                </div>
              </li>
            ))}
          </ol>
        </article>
      </section>

      <section className="dash-bottom">
        <article className="dash-card actions-card">
          <h2>Ações rápidas</h2>
          <div className="quick-actions">
            <button type="button" onClick={() => ir('candidaturas')}>
              <Icon name="eye" size={20} /><span>Ver candidaturas</span>
            </button>
            <button type="button" onClick={() => ir('formularios')}>
              <Icon name="form" size={20} /><span>Gerenciar formulários</span>
            </button>
            <button type="button" onClick={() => ir('configuracoes')}>
              <Icon name="megaphone" size={20} /><span>Criar comunicado</span>
            </button>
            <button type="button" onClick={abrirNovoCiclo}>
              <Icon name="plus" size={20} /><span>Abrir novo ciclo</span>
            </button>
          </div>
        </article>

        <article className="dash-card">
          <h2>Candidaturas recentes</h2>
          {candidaturasRecentes.length === 0 ? (
            <p className="empty-copy">Nenhuma candidatura a padrinho neste ciclo.</p>
          ) : (
            <ul className="recent-list">
              {candidaturasRecentes.map((item) => (
                <li key={item.id}>
                  <button type="button" className="recent-item" onClick={() => setDetalhe(item)}>
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
          )}
        </article>

        <article className="dash-card">
          <h2>Próximos pontos de atenção</h2>
          {pontosAtencao.length === 0 ? (
            <p className="empty-copy">Nenhum ponto de atenção no momento.</p>
          ) : (
            <ul className="attention-list">
              {pontosAtencao.map((item) => (
                <li key={item.id}>
                  <button type="button" onClick={() => ir(item.destino)}>
                    <span className={`attention-icon ${item.severidade}`} aria-hidden="true">
                      <Icon name="alert" size={16} />
                    </span>
                    <span>{item.texto}</span>
                    <Icon name="chevron" size={16} />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </article>
      </section>

      <footer className="dash-summary" aria-label="Resumo do programa">
        <strong>Resumo do programa {dados.programa.codigo}</strong>
        <div className="summary-flags">
          {resumo.mentoriaAtiva && <span className="flag green">Mentoria ativa</span>}
          {resumo.formularioPublicado && <span className="flag purple">Formulário publicado</span>}
          {resumo.matchingEmBreve && <span className="flag amber">Matching em breve</span>}
          {resumo.inscricoesAbertas && <span className="flag purple">Inscrições abertas</span>}
          {resumo.programaEmAndamento && <span className="flag green">Programa em andamento</span>}
          {!resumo.mentoriaAtiva && !resumo.formularioPublicado && !resumo.matchingEmBreve && !resumo.inscricoesAbertas && (
            <span className="flag muted">Sem status ativo</span>
          )}
        </div>
      </footer>

      {detalhe && (
        <div className="modal-backdrop" onClick={() => setDetalhe(null)}>
          <div
            className="modal-card"
            role="dialog"
            aria-modal="true"
            aria-labelledby="cand-detail-title"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="cand-detail-title">Candidatura</h2>
            <p><strong>{detalhe.nome}</strong></p>
            <p>{detalhe.curso}{detalhe.periodo ? ` · ${detalhe.periodo}º período` : ''}</p>
            <p>Status: {detalhe.statusRotulo}</p>
            <p>Programa: {detalhe.programa}</p>
            <div className="modal-actions">
              <button type="button" className="primary-button" onClick={() => {
                setDetalhe(null);
                ir('candidaturas');
              }}>
                Ver na lista
              </button>
              <button type="button" className="ghost-button" onClick={() => setDetalhe(null)}>Fechar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function KpiCard({ titulo, valor, contexto, icon, tom, onClick }) {
  return (
    <button type="button" className={`kpi-card ${tom}`} onClick={onClick}>
      <span className="kpi-icon" aria-hidden="true"><Icon name={icon} size={18} /></span>
      <span className="kpi-copy">
        <span className="kpi-title">{titulo}</span>
        <strong>{valor}</strong>
        <span className="kpi-context">{contexto}</span>
      </span>
      <Icon name="chevron" size={16} className="kpi-chevron" />
    </button>
  );
}
