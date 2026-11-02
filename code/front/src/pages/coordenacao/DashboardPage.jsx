import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../../api/client';
import Icon from '../../components/Icon';
import Modal from '../../components/Modal';

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
  const [erroAtencao, setErroAtencao] = useState('');
  const [carregando, setCarregando] = useState(true);
  const [seletorAberto, setSeletorAberto] = useState(false);
  const [detalhe, setDetalhe] = useState(null);
  const navigate = useNavigate();
  const seletorId = useId();
  const seletorBtnRef = useRef(null);
  const seletorListaRef = useRef(null);
  const seletorWrapRef = useRef(null);

  const carregar = useCallback(async (codigo) => {
    setCarregando(true);
    setErro('');
    setErroAtencao('');
    try {
      const resposta = await api.dashboard(codigo || undefined);
      setDados(resposta);
      if (resposta.programa?.codigo && resposta.programa.codigo !== codigo) {
        setParams({ programa: resposta.programa.codigo }, { replace: true });
      }
    } catch (error) {
      setErro(error.message || 'Não foi possível carregar o dashboard.');
      setErroAtencao(error.message || 'Não foi possível carregar os pontos de atenção.');
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
    function onClickFora(event) {
      if (!seletorWrapRef.current?.contains(event.target)) {
        setSeletorAberto(false);
      }
    }
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onClickFora);
    seletorListaRef.current?.querySelector('[role="option"]')?.focus();
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onClickFora);
    };
  }, [seletorAberto]);

  function ir(destino, extras = {}) {
    const codigo = dados?.programa?.codigo || programaParam;
    const query = new URLSearchParams({
      ...(codigo ? { programa: codigo } : {}),
      ...extras,
    });
    navigate(`/coordenacao/${destino}?${query.toString()}`);
  }

  function abrirNovoCiclo() {
    if (dados?.acoes && dados.acoes.podeAbrirNovoCiclo === false) return;
    const query = new URLSearchParams({ novo: '1' });
    if (programaParam) query.set('programa', programaParam);
    navigate(`/coordenacao/programas?${query.toString()}`);
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

  const {
    indicadores,
    candidaturasVisaoGeral: chart,
    etapas,
    candidaturasRecentes,
    pontosAtencao,
    resumo,
    programas,
    acoes,
  } = dados;
  const maxBar = Math.max(chart.pendentes, chart.emAnalise, chart.aprovadas, chart.rejeitadas, 1);
  const barras = [
    { key: 'pendentes', label: 'Novas', valor: chart.pendentes, tom: 'purple' },
    { key: 'em_analise', label: 'Em análise', valor: chart.emAnalise, tom: 'lilac' },
    { key: 'aprovadas', label: 'Aprovadas', valor: chart.aprovadas, tom: 'green' },
    { key: 'rejeitadas', label: 'Rejeitadas', valor: chart.rejeitadas, tom: 'pink' },
  ];
  const aguardando = indicadores.candidaturasPendentes;
  const somenteLeitura = Boolean(acoes?.somenteLeitura || resumo?.encerrado);

  return (
    <div className="dash">
      <header className="dash-header">
        <div>
          <h1>Dashboard da coordenação</h1>
          <p>Acompanhe o programa, candidaturas a padrinho e indicadores do semestre.</p>
        </div>
        <div className="dash-header-tools">
          <div className="program-select" ref={seletorWrapRef}>
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
              <span className="program-select-label">
                <strong>{dados.programa.nome || `Programa ${dados.programa.codigo}`}</strong>
                <small>{dados.programa.statusRotulo}{dados.programa.vigente ? ' · vigente' : ''}</small>
              </span>
              <Icon name="chevron" size={16} className={`select-chevron${seletorAberto ? ' open' : ''}`} />
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
                      <span className="program-option-main">
                        <strong>{p.nome || `Programa ${p.codigo}`}</strong>
                        <span>{p.statusRotulo}{p.vigente ? ' · vigente' : p.encerrado ? ' · encerrado' : ''}</span>
                      </span>
                      {p.codigo === dados.programa.codigo && <Icon name="check" size={16} />}
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
          valor={aguardando.valor}
          contexto={aguardando.detalhe || `${aguardando.valor} de ${aguardando.total} inscritas`}
          hint="Soma de novas + em análise (aguardando decisão)"
          icon="clipboard"
          tom="purple"
          onClick={() => ir('candidaturas', { status: 'aguardando' })}
        />
        <KpiCard
          titulo="Padrinhos aprovados"
          valor={indicadores.padrinhosAprovados.valor}
          contexto={indicadores.padrinhosAprovados.detalhe || `${indicadores.padrinhosAprovados.valor} de ${indicadores.padrinhosAprovados.total}`}
          icon="checkCircle"
          tom="green"
          onClick={() => ir('candidaturas', { status: 'aprovadas' })}
        />
        <KpiCard
          titulo="Apadrinhados ativos"
          valor={indicadores.apadrinhadosAtivos.valor}
          contexto={indicadores.apadrinhadosAtivos.detalhe || `${indicadores.apadrinhadosAtivos.valor} de ${indicadores.apadrinhadosAtivos.total} vagas`}
          icon="person"
          tom="purple"
          onClick={() => ir('usuarios')}
        />
        <KpiCard
          titulo="Grupos formados"
          valor={indicadores.gruposFormados.valor}
          contexto={indicadores.gruposFormados.detalhe || `${indicadores.gruposFormados.valor} de ${indicadores.gruposFormados.total} previstos`}
          icon="groups"
          tom="blue"
          onClick={() => ir('programas')}
        />
      </section>

      <section className="dash-mid">
        <article className="dash-card chart-card">
          <div className="dash-card-head">
            <div>
              <h2>{chart.titulo || 'Visão geral das candidaturas'}</h2>
              <p className="chart-caption">
                {chart.descricao || 'Candidaturas a padrinho por status'}
                {typeof chart.total === 'number' ? ` · total ${chart.total}` : ''}
              </p>
            </div>
            <Link
              className="text-link"
              to={`/coordenacao/candidaturas?programa=${encodeURIComponent(dados.programa.codigo)}`}
            >
              Ver todas
            </Link>
          </div>
          <p className="sr-only">
            Candidaturas a padrinho: {barras.map((b) => `${b.label} ${b.valor}`).join(', ')}.
            O card de pendentes soma novas ({chart.pendentes}) e em análise ({chart.emAnalise}).
          </p>
          <div className="bar-chart" role="img" aria-label="Gráfico de candidaturas a padrinho">
            {barras.map((barra) => (
              <div key={barra.key} className="bar-col">
                <span className="bar-value">{barra.valor}</span>
                <div className="bar-track">
                  <div
                    className={`bar-fill ${barra.tom}`}
                    style={{
                      height: barra.valor === 0 ? '0%' : `${Math.max(12, (barra.valor / maxBar) * 100)}%`,
                    }}
                  />
                </div>
                <span className="bar-label">{barra.label}</span>
              </div>
            ))}
          </div>
          <ul className="chart-legend">
            {barras.map((b) => (
              <li key={b.key}>
                <span className={`dot ${b.tom}`} />
                {b.label}: {b.valor}
              </li>
            ))}
            <li className="legend-note">
              Pendentes no card = novas + em análise ({chart.pendentes + chart.emAnalise})
            </li>
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
              <Icon name="eye" size={20} />
              <span>Ver candidaturas</span>
            </button>
            <button
              type="button"
              disabled={acoes?.podeGerenciarFormularios === false}
              onClick={() => ir('formularios')}
            >
              <Icon name="form" size={20} />
              <span>Gerenciar formulários</span>
            </button>
            <button
              type="button"
              disabled={acoes?.podeCriarComunicado === false}
              onClick={() => ir('feed')}
            >
              <Icon name="megaphone" size={20} />
              <span>Criar comunicado</span>
            </button>
            <button
              type="button"
              disabled={acoes?.podeAbrirNovoCiclo === false}
              onClick={abrirNovoCiclo}
            >
              <Icon name="plus" size={20} />
              <span>Abrir novo ciclo</span>
            </button>
          </div>
          {somenteLeitura && (
            <p className="actions-note">Ciclo encerrado — algumas ações ficam indisponíveis.</p>
          )}
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

        <article className="dash-card attention-card">
          <h2>Pontos de atenção</h2>
          {erroAtencao ? (
            <div className="attention-empty error" role="alert">
              <Icon name="alert" size={22} />
              <div>
                <strong>Não foi possível carregar os alertas</strong>
                <p>{erroAtencao}</p>
              </div>
              <button type="button" className="ghost-button" onClick={() => carregar(programaParam)}>
                Tentar novamente
              </button>
            </div>
          ) : pontosAtencao.length === 0 ? (
            <div className="attention-empty ok">
              <Icon name="checkCircle" size={22} />
              <div>
                <strong>Nenhuma pendência no momento</strong>
                <p>Os indicadores do programa {dados.programa.codigo} estão em dia.</p>
              </div>
            </div>
          ) : (
            <ul className="attention-list">
              {pontosAtencao.map((item) => (
                <li key={item.id}>
                  <button
                    type="button"
                    onClick={() => ir(item.destino, item.query || {})}
                  >
                    <span className={`attention-icon ${item.severidade}`} aria-hidden="true">
                      <Icon name={item.icon || 'alert'} size={16} />
                    </span>
                    <span className="attention-copy">
                      <strong>{item.titulo || item.texto}</strong>
                      <span>{item.descricao || item.texto}</span>
                    </span>
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
          {resumo.encerrado && <span className="flag muted">Ciclo encerrado</span>}
          {!resumo.mentoriaAtiva && !resumo.formularioPublicado && !resumo.matchingEmBreve && !resumo.inscricoesAbertas && !resumo.encerrado && (
            <span className="flag muted">Sem status ativo</span>
          )}
        </div>
      </footer>

      {detalhe && (
        <Modal
          titulo="Candidatura"
          onFechar={() => setDetalhe(null)}
          acoes={(
            <>
              <button
                type="button"
                className="primary-button inline"
                onClick={() => {
                  const id = detalhe.id;
                  setDetalhe(null);
                  ir('candidaturas', { id: String(id) });
                }}
              >
                Abrir candidatura <Icon name="arrow" size={16} />
              </button>
              <button type="button" className="ghost-button" onClick={() => setDetalhe(null)}>Fechar</button>
            </>
          )}
        >
          <p><strong>{detalhe.nome}</strong></p>
          <p>{detalhe.curso}{detalhe.periodo ? ` · ${detalhe.periodo}º período` : ''}</p>
          <p>Status: <span className={`status-pill ${badgeClass(detalhe.status)}`}>{detalhe.statusRotulo}</span></p>
          <p>Programa: {detalhe.programa}</p>
        </Modal>
      )}
    </div>
  );
}

function KpiCard({ titulo, valor, contexto, hint, icon, tom, onClick }) {
  return (
    <button type="button" className={`kpi-card compact ${tom}`} onClick={onClick} title={hint}>
      <span className="kpi-icon" aria-hidden="true"><Icon name={icon} size={17} /></span>
      <span className="kpi-copy">
        <span className="kpi-title">{titulo}</span>
        <strong>{valor}</strong>
        <span className="kpi-context">{contexto}</span>
      </span>
      <Icon name="chevron" size={15} className="kpi-chevron" />
    </button>
  );
}
