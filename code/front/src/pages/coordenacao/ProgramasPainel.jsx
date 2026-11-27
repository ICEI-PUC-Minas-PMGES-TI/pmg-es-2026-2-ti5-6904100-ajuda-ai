import { useState } from 'react';
import { Link } from 'react-router-dom';
import Icon from '../../components/Icon';
import './programas.css';

function encerrado(programa) {
  return programa.encerrado || programa.etapaAtual === 'encerramento';
}

export default function ProgramasPainel({ programas, programaFoco, onSelecionar, onAdministrar, onConfigurar, onAcao, onExcluir }) {
  const [busca, setBusca] = useState('');
  const [filtro, setFiltro] = useState('todos');
  const selecionado = programas.find(p => p.codigo === programaFoco) || programas.find(p => p.vigente) || programas[0];
  const lista = [...programas].sort((a, b) => b.codigo.localeCompare(a.codigo)).filter(p => (
    (filtro === 'todos' || (filtro === 'encerrados' ? encerrado(p) : !encerrado(p)))
    && `${p.codigo} ${p.nome || p.titulo || ''}`.toLocaleLowerCase('pt-BR').includes(busca.trim().toLocaleLowerCase('pt-BR'))
  ));

  return <div className="programs-workspace">
    <aside className="programs-cycle-browser" aria-label="Selecionar ciclo">
      <div className="programs-browser-heading"><h2>Ciclos do programa</h2><span>{programas.length}</span></div>
      <label className="programs-search"><Icon name="search" size={16} /><input aria-label="Buscar ciclo" placeholder="Buscar por semestre…" value={busca} onChange={e => setBusca(e.target.value)} /></label>
      <div className="programs-filters" aria-label="Filtrar ciclos">
        {[['todos', 'Todos'], ['ativos', 'Ativos'], ['encerrados', 'Encerrados']].map(([valor, rotulo]) => <button type="button" key={valor} aria-pressed={filtro === valor} onClick={() => setFiltro(valor)}>{rotulo}</button>)}
      </div>
      <div className="programs-cycle-list">
        {lista.map(p => <button key={p.codigo} type="button" className={`programs-cycle-option${selecionado?.codigo === p.codigo ? ' selected' : ''}`} aria-pressed={selecionado?.codigo === p.codigo} onClick={() => onSelecionar(p.codigo)}>
          <span className="programs-cycle-icon"><Icon name={encerrado(p) ? 'history' : 'calendar'} size={19} /></span>
          <span className="programs-cycle-text"><span className="programs-cycle-code">{p.codigo}{p.vigente && <span className="programs-current-badge">Vigente</span>}</span><span className="programs-cycle-status">{p.statusRotulo || (encerrado(p) ? 'Encerrado' : 'Em planejamento')}</span></span>
          <Icon name="chevron" size={15} />
        </button>)}
        {!lista.length && <div className="programs-no-results"><Icon name="search" size={23} /><strong>Nenhum ciclo encontrado</strong><p>Tente outro semestre ou filtro.</p><button type="button" onClick={() => {setBusca(''); setFiltro('todos');}}>Limpar filtros</button></div>}
      </div>
      <p className="programs-browser-help"><Icon name="info" size={15} /> Selecione um ciclo para consultar os detalhes e gerenciar o programa.</p>
    </aside>
    {selecionado && <ProgramaDetalhe key={selecionado.codigo} programa={selecionado} onAdministrar={onAdministrar} onConfigurar={onConfigurar} onAcao={onAcao} onExcluir={onExcluir} />}
  </div>;
}

function ProgramaDetalhe({ programa: p, onAdministrar, onConfigurar, onAcao, onExcluir }) {
  const etapas = p.etapas || [];
  const etapaAtual = etapas.findIndex(e => e.estado === 'atual');
  const metricas = [
    { titulo: 'Candidaturas', valor: p.totais?.candidaturas ?? 0, icon: 'clipboard', detalhe: 'Recebidas neste ciclo' },
    { titulo: 'Padrinhos', valor: p.totais?.padrinhos ?? 0, icon: 'person', detalhe: 'Participantes do programa' },
    { titulo: 'Apadrinhados', valor: p.totais?.apadrinhados ?? 0, icon: 'users', detalhe: `${p.vagasApadrinhados ?? 0} vagas no ciclo` },
    { titulo: 'Grupos formados', valor: p.totais?.grupos ?? 0, icon: 'link', detalhe: `${p.gruposPrevistos ?? 0} grupos previstos` },
  ];
  return <article className="programs-detail" aria-label={`Detalhes do programa ${p.codigo}`}>
    <header className="programs-detail-header">
      <div className="programs-detail-title"><span className="programs-detail-icon"><Icon name="calendar" size={23} /></span><div><h2>{p.nome || p.titulo || `Programa ${p.codigo}`}</h2><div className="programs-title-badges"><span className={`programs-stage-badge${encerrado(p) ? ' ended' : ''}`}>{p.statusRotulo || 'Em planejamento'}</span>{p.vigente && <span className="programs-current-badge">Ciclo vigente</span>}</div></div></div>
      <div className="programs-detail-actions">
        <button type="button" className="mini-btn" onClick={() => onConfigurar(p)}><Icon name="settings" size={16} /> Configurar</button>
        <button type="button" className="mini-btn primary" onClick={() => onAdministrar(p)}>Administrar <Icon name="arrow" size={15} /></button>
        <details className="programs-more-actions"><summary aria-label={`Mais ações do programa ${p.codigo}`}><Icon name="more" size={19} /></summary><div><button type="button" onClick={e => {e.currentTarget.closest('details').open = false; onExcluir(p);}}><Icon name="trash" size={15} /> Excluir programa</button></div></details>
      </div>
    </header>
    <dl className="programs-metrics">
      {metricas.map(m => <div key={m.titulo}><dt>{m.titulo}<Icon name={m.icon} size={18} /></dt><dd>{m.valor}<small>{m.detalhe}</small></dd></div>)}
    </dl>
    <section className="programs-calendar" aria-label={`Calendário do programa ${p.codigo}`}>
      <div className="programs-section-heading"><div><h3>Etapas do programa</h3><p>Do início das inscrições ao encerramento do ciclo.</p></div>{etapaAtual >= 0 && <span className="programs-step-label">Etapa {etapaAtual + 1} de {etapas.length}</span>}</div>
      <ol className="programs-timeline" aria-label="Etapas">
        {etapas.map((e, i) => <li key={e.id || i} className={e.estado} aria-current={e.estado === 'atual' ? 'step' : undefined}><span className="programs-timeline-node" aria-hidden="true">{e.estado === 'concluida' ? <Icon name="check" size={13} /> : i + 1}</span><div><strong>{e.titulo}</strong><small>{e.periodoTexto}</small><span className="programs-timeline-state">{e.estado === 'atual' ? 'Etapa atual' : e.estado === 'concluida' ? 'Concluída' : 'Prevista'}</span></div></li>)}
      </ol>
      {!etapas.length && <p className="programs-calendar-empty">O calendário deste ciclo ainda não foi definido.</p>}
    </section>
    <section className="programs-enrollment" aria-label="Situação das inscrições e do matching">
      <div><span className={`programs-enrollment-icon${p.inscricoesAbertas ? ' open' : ''}`}><Icon name={p.inscricoesAbertas ? 'clipboard' : 'checkCircle'} size={19} /></span><div><strong>{p.inscricoesAbertas ? 'Inscrições abertas' : 'Inscrições encerradas'}</strong><p>{p.inscricoesAbertas ? 'O ciclo está recebendo novas candidaturas.' : p.matchingLiberado ? 'Matching liberado para a formação dos pares.' : 'Consulte as candidaturas e acompanhe as próximas etapas.'}</p></div></div>
      <div className="programs-operation-actions">
        {p.podeEncerrarInscricoes && <button type="button" className="mini-btn" onClick={() => onAcao({tipo:'encerrar', programa:p})}>Encerrar inscrições <Icon name="chevron" size={14} /></button>}
        {p.podeLiberarMatching && <button type="button" className="mini-btn primary" onClick={() => onAcao({tipo:'liberar', programa:p})}><Icon name="spark" size={15} /> Liberar matching</button>}
        {p.matchingLiberado && <Link className="mini-btn" to={`/coordenacao/matching?${new URLSearchParams({programa:p.codigo})}`}><Icon name="spark" size={15} /> Abrir matching</Link>}
      </div>
    </section>
    <section className="programs-requirements" aria-label={`Requisitos para padrinho — ${p.codigo}`}>
      <div className="programs-section-heading"><div><h3><Icon name="checkCircle" size={17} /> Requisitos para padrinho</h3><p>Condições de participação neste ciclo.</p></div>{p.formularioPublicado && <span className="programs-form-badge"><Icon name="form" size={14} /> Formulário publicado</span>}</div>
      {p.requisitosPadrinho?.length ? <ul>{p.requisitosPadrinho.map((r, i) => <li key={r.id || i}><Icon name="check" size={15} /><span>{r.descricao}</span><small>{r.obrigatorio === false ? 'Desejável' : 'Obrigatório'}</small></li>)}</ul> : <p className="programs-requirements-empty">Nenhuma disciplina exigida. Basta estar a partir do 2º período.</p>}
    </section>
  </article>;
}
