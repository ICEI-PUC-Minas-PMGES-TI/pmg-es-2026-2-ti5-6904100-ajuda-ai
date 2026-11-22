import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { Link, NavLink, Navigate, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { api, getAlunoSession, clearAlunoSession, programaAluno, selecionarProgramaAluno } from '../../api/client';
import {escolherCiclo, resolverAluno} from '../../auth/resolverAluno';
import {
  aplicarAparencia,
  iniciaisDe,
  lerPreferencias,
} from '../../auth/sessaoAluno';
import Icon from '../../components/Icon';
import { formatarData } from './util';
import {
  ICONE_NOTIFICACAO,
  juntarPagina,
  marcarLidaLocal,
  marcarTodasLocal,
  NOTIFICACOES_VAZIAS,
  rotaDaNotificacao,
  tempoRelativo,
} from './notificacoes';

const VISTOS_KEY = 'ajudaai.aluno.avisosVistos';

function lerVistos() {
  try {
    const raw = localStorage.getItem(VISTOS_KEY);
    const lista = raw ? JSON.parse(raw) : [];
    return Array.isArray(lista) ? lista : [];
  } catch {
    return [];
  }
}

function gravarVistos(ids) {
  try {
    localStorage.setItem(VISTOS_KEY, JSON.stringify(ids));
  } catch {
    /* ignore */
  }
}

export default function AlunoLayout() {
  const location = useLocation();
  const [sessao, setSessao] = useState(() => getAlunoSession());
  const [perfil, setPerfil] = useState({nome: '', interesses: []});
  const [situacao, setSituacao] = useState(null);
  const [programas, setProgramas] = useState([]);
  const [codigo, setCodigo] = useState(programaAluno);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState('');
  const [menuAberto, setMenuAberto] = useState(false);
  const consultaAtual = useRef(0);
  const email = sessao?.email || '';
  const recarregar = useCallback(async () => {
    if (!email) return;
    const consulta = ++consultaAtual.current;
    setCarregando(true); setErro(''); setSituacao(null);
    try {
      const [p, ciclos] = await Promise.all([api.perfilAluno(), api.programasAluno()]);
      if (consulta !== consultaAtual.current) return;
      setPerfil(p); setProgramas(ciclos);
      const alvo = codigo || escolherCiclo(ciclos);
      selecionarProgramaAluno(alvo); setCodigo(alvo);
      if (alvo || ciclos.length === 0) {
        const retorno = await api.situacao(email, alvo);
        if (consulta === consultaAtual.current) setSituacao(retorno);
      }
    } catch (e) {
      if (consulta !== consultaAtual.current) return;
      setErro(e.message);
      if (e.status === 401) {clearAlunoSession(); setSessao(null);}
    } finally {if (consulta === consultaAtual.current) setCarregando(false);}
  }, [email, codigo]);
  useEffect(() => { aplicarAparencia(); recarregar(); return () => {consultaAtual.current++;}; }, [recarregar, location.pathname]);
  useEffect(() => {setMenuAberto(false);}, [location.pathname]);
  const resolucao = resolverAluno(perfil, situacao, programas.find(p => p.codigo === codigo));
  if (!sessao) return <Navigate to="/login" replace />;
  if (sessao.onboardingToken) return <Navigate to="/" replace />;
  if (!carregando && !erro && !resolucao.completo) return <Navigate to="/" replace />;
  const papel = resolucao.candidatura || resolucao.estado === 'padrinho_ativo' ? 'padrinho' : resolucao.estado?.startsWith('apadrinhado') ? 'apadrinhado' : null;
  const nav = [
    ...(resolucao.participante ? [{to: '/aluno/feed', label: 'Feed', icon: 'megaphone'}] : []),
    {to: '/aluno/perfil', label: 'Meu perfil', icon: 'home'},
    {to: '/aluno/mapa', label: 'Mapa do campus', icon: 'map'},
    ...(resolucao.candidatura ? [{to: '/aluno/candidatura', label: 'Status da candidatura', icon: 'clipboard'}] : []),
    ...(resolucao.ativo ? [{to: '/aluno/padrinho', label: papel === 'padrinho' ? 'Meus apadrinhados' : 'Meu padrinho', icon: 'users'}] : []),
    {to: '/aluno/chat', label: 'Conversas', icon: 'chat'},
    {to: '/aluno/historico', label: 'Histórico', icon: 'history'},
    {to: '/aluno/configuracoes', label: 'Configurações', icon: 'settings'},
  ];
  const contexto = {email, sessao, perfil, situacao, carregando, erro, recarregar, papel, resolucao, programa: codigo,
    atualizarSessao: parcial => setSessao(atual => ({...atual, ...parcial}))};
  function trocarCiclo(novo) {
    if (novo === codigo) return;
    consultaAtual.current++;
    setCarregando(true);
    setSituacao(null);
    selecionarProgramaAluno(novo);
    setCodigo(novo);
  }
  return <div className="aluno-shell">
    <AlunoTopbar
      nome={perfil.nome}
      email={email}
      pronto={!carregando}
      publico={resolucao.ativo ? `${papel}s` : undefined}
      menuAberto={menuAberto}
      onMenu={() => setMenuAberto(v => !v)}
      ciclo={codigo}
      programas={programas}
      onCiclo={trocarCiclo}
      cicloDesabilitado={carregando}
    />
    <div className="aluno-body"><aside className="aluno-sidebar"><AlunoNav itens={nav}/><SidebarArt/></aside>
    {menuAberto && <AlunoDrawer itens={nav} onFechar={() => setMenuAberto(false)}/>}
    <main className="aluno-content" id="conteudo">
      {erro ? <div className="aluno-state error" role="alert"><p>{erro}</p><button type="button" className="outline-button" onClick={recarregar}>Tentar novamente</button></div>
        : carregando ? <p className="aluno-loading" role="status">Carregando perfil e situação…</p> : <Outlet context={contexto}/>}
    </main></div></div>;
}

const ROTULO_TIPO = { padrinho: 'padrinho', apadrinhado: 'apadrinhado' };

/** Faixa com o estado do cadastro enquanto ele não está aprovado. */
function AvisoCadastro({ cadastro }) {
  if (!cadastro || cadastro.status === 'aprovado') return null;
  const tipo = ROTULO_TIPO[cadastro.tipoParticipacao] || 'participante';
  if (cadastro.status === 'rejeitado') {
    return (
      <div className="existing-notice cadastro-notice rejeitado" role="status">
        <Icon name="alert" size={18} />
        <span>
          <strong>Seu cadastro como {tipo} não foi aprovado pela coordenação.</strong>
          {cadastro.motivoRejeicao ? ` Motivo: ${cadastro.motivoRejeicao}` : ''} Em caso de dúvida, procure a coordenação do programa.
        </span>
      </div>
    );
  }
  return (
    <div className="existing-notice cadastro-notice" role="status">
      <Icon name="clock" size={18} />
      <span>
        <strong>Seu cadastro como {tipo} está aguardando a análise da coordenação.</strong> Os recursos de {tipo} são liberados após a aprovação.
      </span>
    </div>
  );
}

function AlunoNav({ itens, onNavegar }) {
  return (
    <nav className="aluno-nav" aria-label="Navegação do aluno">
      {itens.map((item) => (
        <NavLink key={item.to} to={item.to} className={({ isActive }) => `aluno-nav-link${isActive ? ' active' : ''}`} onClick={onNavegar}>
          <Icon name={item.icon} size={19} />
          <span>{item.label}</span>
        </NavLink>
      ))}
    </nav>
  );
}

function SidebarArt() {
  return (
    <div className="aluno-sidebar-art" aria-hidden="true">
      <span>CONHECIMENTO<br />PESSOAS<br />OPORTUNIDADES<br />SEMPRE</span>
      <i />
    </div>
  );
}

function AlunoDrawer({ itens, onFechar }) {
  const painelRef = useRef(null);
  useEffect(() => {
    function onKey(event) {
      if (event.key === 'Escape') onFechar();
    }
    document.addEventListener('keydown', onKey);
    painelRef.current?.querySelector('a')?.focus();
    return () => document.removeEventListener('keydown', onKey);
  }, [onFechar]);
  return (
    <div className="aluno-drawer-backdrop" onClick={onFechar}>
      <div ref={painelRef} id="aluno-drawer" className="aluno-drawer" role="dialog" aria-modal="true" aria-label="Menu do aluno" onClick={(e) => e.stopPropagation()}>
        <AlunoNav itens={itens} onNavegar={onFechar} />
        <Link to="/login" className="aluno-drawer-link">Área da coordenação</Link>
      </div>
    </div>
  );
}

function AlunoTopbar({ nome, email, publico, pronto, menuAberto, onMenu, ciclo, programas = [], onCiclo, cicloDesabilitado }) {
  const [avisos, setAvisos] = useState([]);
  const [erroAvisos, setErroAvisos] = useState(false);
  const [aberto, setAberto] = useState(false);
  const [contaAberta, setContaAberta] = useState(false);
  const [cicloAberto, setCicloAberto] = useState(false);
  const [vistos, setVistos] = useState(() => lerVistos());
  const [notificacoes, setNotificacoes] = useState(NOTIFICACOES_VAZIAS);
  const [erroNotificacoes, setErroNotificacoes] = useState(false);
  const navigate = useNavigate();
  const prefs = lerPreferencias();
  const painelId = useId();
  const contaId = useId();
  const cicloId = useId();
  const wrapRef = useRef(null);
  const contaRef = useRef(null);
  const cicloRef = useRef(null);
  const cicloBtnRef = useRef(null);
  const cicloAtual = programas.find((p) => p.codigo === ciclo);

  useEffect(() => {
    if (!pronto) return undefined;
    let ativo = true;
    api.avisos(publico)
      .then((lista) => { if (ativo) { setAvisos(Array.isArray(lista) ? lista : []); setErroAvisos(false); } })
      .catch(() => { if (ativo) setErroAvisos(true); });
    return () => { ativo = false; };
  }, [publico, pronto]);

  const carregarNotificacoes = useCallback(async () => {
    try {
      const dados = await api.notificacoes(20);
      setNotificacoes({ naoLidas: dados?.naoLidas ?? 0, itens: Array.isArray(dados?.itens) ? dados.itens : [], temMais: Boolean(dados?.temMais) });
      setErroNotificacoes(false);
    } catch (error) {
      if (error.status === 401 || error.status === 403) setNotificacoes(NOTIFICACOES_VAZIAS);
      else setErroNotificacoes(true);
    }
  }, []);

  useEffect(() => {
    if (!pronto) return undefined;
    carregarNotificacoes();
    function aoFocar() { if (document.visibilityState !== 'hidden') carregarNotificacoes(); }
    window.addEventListener('focus', aoFocar);
    document.addEventListener('visibilitychange', aoFocar);
    return () => {
      window.removeEventListener('focus', aoFocar);
      document.removeEventListener('visibilitychange', aoFocar);
    };
  }, [pronto, email, carregarNotificacoes]);

  async function abrirNotificacao(n) {
    if (!n.lida) {
      setNotificacoes((atual) => marcarLidaLocal(atual, n.id));
      try {
        const resposta = await api.marcarNotificacaoLida(n.id);
        setNotificacoes((atual) => marcarLidaLocal(atual, n.id, resposta));
      } catch {
        carregarNotificacoes();
      }
    }
    const rota = rotaDaNotificacao(n.link);
    if (rota) {
      setAberto(false);
      navigate(rota);
    }
  }

  const [carregandoMais, setCarregandoMais] = useState(false);
  async function carregarMaisNotificacoes() {
    const ultimo = notificacoes.itens.at(-1)?.id;
    if (!ultimo || carregandoMais) return;
    setCarregandoMais(true);
    try {
      const pagina = await api.notificacoes(20, ultimo);
      setNotificacoes((atual) => juntarPagina(atual, pagina));
    } catch {
      setErroNotificacoes(true);
    } finally {
      setCarregandoMais(false);
    }
  }

  async function marcarTodas() {
    // Só até a mais recente que está na tela: um aviso que chegou depois
    // da última leitura continua não lido.
    const ateId = notificacoes.itens[0]?.id;
    setNotificacoes((atual) => marcarTodasLocal(atual));
    if (avisos.length) {
      const ids = Array.from(new Set([...vistos, ...avisos.map((a) => a.id)]));
      setVistos(ids);
      gravarVistos(ids);
    }
    if (!ateId) return;
    try {
      const resposta = await api.marcarNotificacoesLidas(ateId);
      if (resposta?.naoLidas > 0) carregarNotificacoes();
    } catch {
      carregarNotificacoes();
    }
  }

  useEffect(() => {
    if (!aberto && !contaAberta && !cicloAberto) return undefined;
    function onClick(event) {
      if (aberto && !wrapRef.current?.contains(event.target)) setAberto(false);
      if (contaAberta && !contaRef.current?.contains(event.target)) setContaAberta(false);
      if (cicloAberto && !cicloRef.current?.contains(event.target)) setCicloAberto(false);
    }
    function onKey(event) {
      if (event.key === 'Escape') {
        setAberto(false);
        setContaAberta(false);
        setCicloAberto(false);
      }
    }
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [aberto, contaAberta, cicloAberto]);

  const avisosNovos = avisos.filter((a) => !vistos.includes(a.id)).length;
  const naoLidos = notificacoes.naoLidas + avisosNovos;

  function abrirAvisos() {
    const novo = !aberto;
    setAberto(novo);
    setCicloAberto(false);
    setContaAberta(false);
    if (novo) carregarNotificacoes();
    if (novo && avisos.length) {
      const ids = Array.from(new Set([...vistos, ...avisos.map((a) => a.id)]));
      setVistos(ids);
      gravarVistos(ids);
    }
  }

  return (
    <header className="topbar aluno-topbar">
      <div className="aluno-topbar-left">
        <button
          type="button"
          className="icon-button aluno-menu-btn"
          aria-label={menuAberto ? 'Fechar menu' : 'Abrir menu'}
          aria-expanded={menuAberto}
          aria-controls="aluno-drawer"
          onClick={onMenu}
        >
          <Icon name={menuAberto ? 'close' : 'menu'} size={21} />
        </button>
        <Link to="/aluno/perfil" className="brand-lockup" aria-label="Ajuda-aí — início">
          <img src="/images/logo.png" alt="Ajuda-aí" className="brand-logo" />
          <span className="brand-divider" />
          <img src="/images/puclogo.png" alt="PUC Minas" className="puc-logo" />
        </Link>
      </div>
      <div className="aluno-cycle-picker program-select" ref={cicloRef}>
        <button
          ref={cicloBtnRef}
          type="button"
          id={cicloId}
          className="program-select-btn aluno-cycle-btn"
          aria-haspopup="listbox"
          aria-expanded={cicloAberto}
          aria-controls={`${cicloId}-lista`}
          aria-label="Ciclo do programa"
          disabled={cicloDesabilitado || !programas.length}
          onClick={() => { setCicloAberto((v) => !v); setAberto(false); setContaAberta(false); }}
        >
          <Icon name="calendar" size={16} />
          <span className="program-select-label aluno-cycle-copy">
            <span className="aluno-cycle-label">Ciclo</span>
            <strong>
              {cicloAtual
                ? `${cicloAtual.titulo || `Programa ${cicloAtual.codigo}`}${cicloAtual.atual ? ' · atual' : ''}`
                : (ciclo ? `Programa ${ciclo}` : 'Selecione')}
            </strong>
          </span>
          <Icon name="chevronDown" size={16} className={`select-chevron${cicloAberto ? ' open' : ''}`} />
        </button>
        {cicloAberto && (
          <ul
            id={`${cicloId}-lista`}
            className="program-select-list aluno-cycle-list"
            role="listbox"
            aria-label="Selecionar ciclo"
          >
            {programas.map((p) => (
              <li key={p.codigo} role="presentation">
                <button
                  type="button"
                  role="option"
                  aria-selected={p.codigo === ciclo}
                  className={p.codigo === ciclo ? 'selected' : ''}
                  onClick={() => {
                    setCicloAberto(false);
                    onCiclo?.(p.codigo);
                    cicloBtnRef.current?.focus();
                  }}
                >
                  <span className="program-option-main">
                    <strong>{p.titulo || `Programa ${p.codigo}`}</strong>
                    <span>{p.atual ? 'Ciclo atual' : 'Histórico'}</span>
                  </span>
                  {p.codigo === ciclo && <Icon name="check" size={16} />}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="account-actions">
        <div className="notif-wrap" ref={wrapRef}>
          <button
            type="button"
            className="icon-button notification-button"
            aria-label={naoLidos && prefs.notificacoesApp ? `Notificações (${naoLidos} novas)` : 'Notificações'}
            aria-expanded={aberto}
            aria-controls={painelId}
            onClick={abrirAvisos}
          >
            <Icon name="bell" size={20} />
            {naoLidos > 0 && prefs.notificacoesApp && <span className="notif-badge" aria-hidden="true">{naoLidos > 9 ? '9+' : naoLidos}</span>}
          </button>
          {aberto && (
            <div id={painelId} className="notif-panel" role="region" aria-label="Notificações">
              <div className="notif-head">
                <strong>Notificações</strong>
                {notificacoes.naoLidas > 0
                  ? <button type="button" className="notif-marcar" onClick={marcarTodas}>Marcar todas como lidas</button>
                  : <span>{notificacoes.itens.length + avisos.length} no total</span>}
              </div>
              {erroNotificacoes && notificacoes.itens.length === 0 && (
                <p className="notif-empty">Não foi possível carregar as notificações agora.</p>
              )}
              {notificacoes.itens.length > 0 && (
                <ul className="notif-list">
                  {notificacoes.itens.map((n) => (
                    <li key={n.id} className={n.lida ? 'lida' : 'nao-lida'}>
                      <button type="button" className="notif-item" onClick={() => abrirNotificacao(n)} aria-label={`${n.titulo}${n.lida ? '' : ' (não lida)'}`}>
                        <span className="notif-icon" aria-hidden="true"><Icon name={ICONE_NOTIFICACAO[n.tipo] ?? 'bell'} size={16} /></span>
                        <span className="notif-copy">
                          <strong>{n.titulo}</strong>
                          <span>{n.mensagem}</span>
                          <small>{tempoRelativo(n.criadoEm)}</small>
                        </span>
                        {!n.lida && <span className="notif-dot" aria-hidden="true" />}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              {notificacoes.temMais && (
                <button type="button" className="notif-marcar notif-mais" onClick={carregarMaisNotificacoes} disabled={carregandoMais}>
                  {carregandoMais ? 'Carregando…' : 'Ver notificações anteriores'}
                </button>
              )}
              {erroAvisos ? (
                <p className="notif-empty">Não foi possível carregar os comunicados agora.</p>
              ) : avisos.length > 0 ? (
                <ul className="notif-list">
                  {avisos.map((aviso) => (
                    <li key={aviso.id}>
                      <span className="notif-icon" aria-hidden="true"><Icon name="megaphone" size={16} /></span>
                      <span className="notif-copy">
                        <strong>{aviso.titulo}</strong>
                        <span>{aviso.descricao}</span>
                        <small>{formatarData(aviso.data)}{aviso.publico && aviso.publico !== 'todos' ? ` · para ${aviso.publico}` : ''}</small>
                      </span>
                    </li>
                  ))}
                </ul>
              ) : null}
              {!erroNotificacoes && notificacoes.itens.length === 0 && !erroAvisos && avisos.length === 0 && (
                <p className="notif-empty">Nenhuma notificação por enquanto.</p>
              )}
              {!prefs.notificacoesApp && <p className="notif-foot">Os alertas de novidades estão desativados nas Configurações.</p>}
            </div>
          )}
        </div>
        <div className="account-menu" ref={contaRef}>
          <button type="button" className="account-trigger" aria-haspopup="true" aria-expanded={contaAberta} aria-controls={contaId} onClick={() => { setContaAberta((v) => !v); setCicloAberto(false); setAberto(false); }}>
            <span className="account-avatar" aria-hidden="true">{iniciaisDe(nome)}</span>
            <span className="account-name">{nome}</span>
            <Icon name="chevronDown" size={16} />
          </button>
          {contaAberta && (
            <div id={contaId} className="account-dropdown">
              <span className="account-email">{email}</span>
              <Link to="/aluno/perfil" onClick={() => setContaAberta(false)}><Icon name="person" size={16} /> Meu perfil</Link>
              <Link to="/aluno/configuracoes" onClick={() => setContaAberta(false)}><Icon name="settings" size={16} /> Configurações</Link>
              <Link to="/login" onClick={() => {clearAlunoSession(); setContaAberta(false);}}><Icon name="logout" size={16} /> Sair da conta</Link>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
