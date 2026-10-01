import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { Link, NavLink, Navigate, Outlet, useLocation, useSearchParams } from 'react-router-dom';
import { api } from '../../api/client';
import {
  aplicarAparencia,
  emailDaUrl,
  iniciaisDe,
  lerPreferencias,
  lerSessaoAluno,
  nomeDoEmail,
  salvarSessaoAluno,
} from '../../auth/sessaoAluno';
import Icon from '../../components/Icon';
import { formatarData, papelDaSituacao } from './util';

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

/** Sessão do aluno, trocando de identidade quando chega `?email=` diferente. */
function resolverSessao(searchParams) {
  const atual = lerSessaoAluno();
  const emailUrl = emailDaUrl(searchParams);
  if (emailUrl && emailUrl !== atual?.email) {
    return salvarSessaoAluno({ email: emailUrl, perfil: null, escolha: null, respostas: null });
  }
  return atual;
}

export default function AlunoLayout() {
  const [params] = useSearchParams();
  const location = useLocation();
  const [sessao, setSessao] = useState(() => resolverSessao(params));
  const [situacao, setSituacao] = useState(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState('');
  const [menuAberto, setMenuAberto] = useState(false);
  const email = sessao?.email || '';

  useEffect(() => {
    aplicarAparencia();
    const anterior = document.title;
    document.title = 'Área do aluno | Ajuda-aí';
    return () => {
      document.title = anterior;
    };
  }, []);

  useEffect(() => {
    const nova = emailDaUrl(params);
    if (nova && nova !== sessao?.email) setSessao(resolverSessao(params));
  }, [params, sessao?.email]);

  const recarregar = useCallback(async () => {
    if (!email) return;
    setCarregando(true);
    setErro('');
    try {
      setSituacao(await api.situacao(email));
    } catch (error) {
      setErro(error.message || 'Não foi possível carregar sua situação no programa.');
    } finally {
      setCarregando(false);
    }
  }, [email]);

  useEffect(() => {
    recarregar();
  }, [recarregar]);

  useEffect(() => {
    setMenuAberto(false);
  }, [location.pathname]);

  const atualizarSessao = useCallback((parcial) => {
    setSessao((atual) => salvarSessaoAluno({ ...atual, ...parcial }));
  }, []);

  const perfil = useMemo(() => {
    const respostas = situacao?.registro?.respostas || sessao?.respostas || {};
    const salvo = sessao?.perfil || {};
    const doServidor = situacao?.perfil || {};
    const cursoServidor = doServidor.curso === 'Curso não informado' ? '' : doServidor.curso;
    return {
      nome: salvo.nome || respostas.nome || doServidor.nome || nomeDoEmail(email),
      curso: salvo.curso || respostas.curso || cursoServidor || '',
      periodo: salvo.periodo ?? respostas.periodo ?? doServidor.periodo ?? null,
      turno: salvo.turno || respostas.turno || '',
      interesses: (salvo.interesses?.length ? salvo.interesses : respostas.interesses) || doServidor.interesses || [],
    };
  }, [sessao, situacao, email]);

  if (!sessao) return <Navigate to="/" replace />;

  const papel = papelDaSituacao(situacao?.situacao) || (situacao?.registro?.papel === 'apadrinhado' ? 'apadrinhado' : situacao?.registro ? 'padrinho' : null);
  const ehPadrinho = situacao?.situacao === 'padrinho_ativo';

  const nav = [
    { to: '/aluno/perfil', label: 'Meu perfil', icon: 'home' },
    { to: '/aluno/candidatura', label: 'Status da candidatura', icon: 'clipboard' },
    { to: '/aluno/padrinho', label: ehPadrinho ? 'Meus apadrinhados' : 'Meu padrinho', icon: 'users' },
    { to: '/aluno/historico', label: 'Histórico', icon: 'history' },
    { to: '/aluno/configuracoes', label: 'Configurações', icon: 'settings' },
  ];

  const contexto = { email, sessao, perfil, situacao, carregando, erro, recarregar, atualizarSessao, papel };

  return (
    <div className="aluno-shell">
      <AlunoTopbar
        nome={perfil.nome}
        email={email}
        pronto={Boolean(situacao) || !carregando}
        publico={papel === 'apadrinhado' ? 'apadrinhados' : papel === 'padrinho' ? 'padrinhos' : undefined}
        menuAberto={menuAberto}
        onMenu={() => setMenuAberto((v) => !v)}
      />
      <div className="aluno-body">
        <aside className="aluno-sidebar" aria-label="Menu do aluno">
          <AlunoNav itens={nav} />
          <SidebarArt />
        </aside>
        {menuAberto && <AlunoDrawer itens={nav} onFechar={() => setMenuAberto(false)} />}
        <main className="aluno-content" id="conteudo">
          <Outlet context={contexto} />
        </main>
      </div>
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

function AlunoTopbar({ nome, email, publico, pronto, menuAberto, onMenu }) {
  const [avisos, setAvisos] = useState([]);
  const [erroAvisos, setErroAvisos] = useState(false);
  const [aberto, setAberto] = useState(false);
  const [contaAberta, setContaAberta] = useState(false);
  const [vistos, setVistos] = useState(() => lerVistos());
  const prefs = lerPreferencias();
  const painelId = useId();
  const contaId = useId();
  const wrapRef = useRef(null);
  const contaRef = useRef(null);

  useEffect(() => {
    if (!pronto) return undefined;
    let ativo = true;
    api.avisos(publico)
      .then((lista) => { if (ativo) { setAvisos(Array.isArray(lista) ? lista : []); setErroAvisos(false); } })
      .catch(() => { if (ativo) setErroAvisos(true); });
    return () => { ativo = false; };
  }, [publico, pronto]);

  useEffect(() => {
    if (!aberto && !contaAberta) return undefined;
    function onClick(event) {
      if (aberto && !wrapRef.current?.contains(event.target)) setAberto(false);
      if (contaAberta && !contaRef.current?.contains(event.target)) setContaAberta(false);
    }
    function onKey(event) {
      if (event.key === 'Escape') {
        setAberto(false);
        setContaAberta(false);
      }
    }
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [aberto, contaAberta]);

  const naoLidos = avisos.filter((a) => !vistos.includes(a.id)).length;

  function abrirAvisos() {
    const novo = !aberto;
    setAberto(novo);
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
                <span>{avisos.length} comunicado(s)</span>
              </div>
              {erroAvisos ? (
                <p className="notif-empty">Não foi possível carregar as notificações agora.</p>
              ) : avisos.length === 0 ? (
                <p className="notif-empty">Nenhum comunicado por enquanto.</p>
              ) : (
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
              )}
              {!prefs.notificacoesApp && <p className="notif-foot">Os alertas de novidades estão desativados nas Configurações.</p>}
            </div>
          )}
        </div>
        <div className="account-menu" ref={contaRef}>
          <button type="button" className="account-trigger" aria-haspopup="true" aria-expanded={contaAberta} aria-controls={contaId} onClick={() => setContaAberta((v) => !v)}>
            <span className="account-avatar" aria-hidden="true">{iniciaisDe(nome)}</span>
            <span className="account-name">{nome}</span>
            <Icon name="chevronDown" size={16} />
          </button>
          {contaAberta && (
            <div id={contaId} className="account-dropdown">
              <span className="account-email">{email}</span>
              <Link to="/aluno/perfil" onClick={() => setContaAberta(false)}><Icon name="person" size={16} /> Meu perfil</Link>
              <Link to="/aluno/configuracoes" onClick={() => setContaAberta(false)}><Icon name="settings" size={16} /> Configurações</Link>
              <Link to="/login" onClick={() => setContaAberta(false)}><Icon name="lock" size={16} /> Área da coordenação</Link>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
