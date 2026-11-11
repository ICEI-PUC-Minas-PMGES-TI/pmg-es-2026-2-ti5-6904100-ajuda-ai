import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { NavLink, Navigate, Outlet, useNavigate, useSearchParams, useLocation } from 'react-router-dom';
import { useAuth } from '../../auth/AuthContext';
import {api} from '../../api/client';
import Icon from '../../components/Icon';

const NAV = [
  { to: '/coordenacao/feed', label: 'Feed', icon: 'megaphone' },
  { to: '/coordenacao', end: true, label: 'Dashboard', icon: 'home' },
  { to: '/coordenacao/candidaturas', label: 'Candidaturas', icon: 'clipboard' },
  { to: '/coordenacao/matching', label: 'Matching', icon: 'spark' },
  { to: '/coordenacao/usuarios', label: 'Usuários', icon: 'users' },
  { to: '/coordenacao/programas', label: 'Programas', icon: 'calendar' },
  { to: '/coordenacao/formularios', label: 'Formulários', icon: 'form' },
  { to: '/coordenacao/pucstops', label: 'Gerenciar totens', icon: 'pin' },
  { to: '/coordenacao/mapa', label: 'Mapa do campus', icon: 'map' },
  { to: '/coordenacao/lojinha', label: 'Lojinha', icon: 'star' },
  { to: '/coordenacao/eventos', label: 'Eventos', icon: 'calendarEvent' },
  { to: '/coordenacao/restaurantes', label: 'Restaurantes', icon: 'restaurant' },
  { to: '/coordenacao/configuracoes', label: 'Configurações', icon: 'settings' },
];

/** Páginas que não dependem do programa/ciclo selecionado. */
const SEM_PROGRAMA = ['/coordenacao/feed', '/coordenacao/comunicados', '/coordenacao/configuracoes', '/coordenacao/programas', '/coordenacao/pucstops', '/coordenacao/mapa', '/coordenacao/lojinha', '/coordenacao/eventos', '/coordenacao/restaurantes'];
/** Dentre elas, as que nem usam o seletor de programa (valem para todos os ciclos). */
const SEM_SELETOR = ['/coordenacao/feed', '/coordenacao/comunicados', '/coordenacao/configuracoes', '/coordenacao/pucstops', '/coordenacao/mapa', '/coordenacao/lojinha', '/coordenacao/eventos', '/coordenacao/restaurantes'];

export default function CoordLayout() {
  const { autenticado, ehCoordenador, usuario, logout } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const location = useLocation();
  const rota = location.pathname.replace(/\/+$/, '');
  const [programas, setProgramas] = useState(null);
  const [erroProgramas, setErroProgramas] = useState('');
  const [exigirSelecao, setExigirSelecao] = useState(false);
  const programa = searchParams.get('programa');
  const [menuAberto, setMenuAberto] = useState(false);
  const [seletorAberto, setSeletorAberto] = useState(false);
  const menuId = useId();
  const seletorId = useId();
  const botaoMenuRef = useRef(null);
  const painelMenuRef = useRef(null);
  const seletorBtnRef = useRef(null);
  const seletorListaRef = useRef(null);
  const seletorWrapRef = useRef(null);
  const navigate = useNavigate();

  const carregarProgramas = useCallback(async () => {
    setErroProgramas('');
    try {const lista = await api.programas(); setProgramas(lista);}
    catch(e) {setErroProgramas('Não foi possível carregar os programas da coordenação. Tente novamente.');}
  }, []);
  useEffect(() => {if (autenticado && ehCoordenador) carregarProgramas();}, [autenticado, ehCoordenador, carregarProgramas]);
  useEffect(() => {
    if (!programas?.length) return;
    if (programa && !programas.some((p) => p.codigo === programa)) {
      const novos = new URLSearchParams(searchParams);
      novos.delete('programa');
      setExigirSelecao(true);
      setSearchParams(novos, { replace: true });
      return;
    }
    // Sem ciclo na URL: entra no vigente pela data (ou o mais recente).
    if (!programa && !exigirSelecao) {
      const padrao =
        programas.find((p) => p.vigente)
        || programas.find((p) => p.atual)
        || programas[0];
      if (!padrao?.codigo) return;
      const novos = new URLSearchParams(searchParams);
      novos.set('programa', padrao.codigo);
      setSearchParams(novos, { replace: true });
    }
  }, [programas, programa, exigirSelecao, searchParams, setSearchParams]);
  function programaExcluido(codigo) {
    setProgramas(lista => lista?.filter(p => p.codigo !== codigo));
    if (codigo === programa) {setExigirSelecao(true); navigate('/coordenacao/programas', {replace: true});}
  }

  useEffect(() => {
    if (!menuAberto) return undefined;
    function onKey(event) {
      if (event.key === 'Escape') {
        setMenuAberto(false);
        botaoMenuRef.current?.focus();
      }
    }
    document.addEventListener('keydown', onKey);
    painelMenuRef.current?.querySelector('a,button')?.focus();
    return () => document.removeEventListener('keydown', onKey);
  }, [menuAberto]);

  useEffect(() => {
    if (!seletorAberto) return undefined;
    function onKey(event) {
      if (event.key === 'Escape') {
        setSeletorAberto(false);
        seletorBtnRef.current?.focus();
      }
    }
    function onClickFora(event) {
      if (!seletorWrapRef.current?.contains(event.target)) setSeletorAberto(false);
    }
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onClickFora);
    seletorListaRef.current?.querySelector('[role="option"]')?.focus();
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onClickFora);
    };
  }, [seletorAberto]);

  if (!autenticado) return <Navigate to="/login" replace />;
  if (!ehCoordenador) {
    return <Navigate to="/" replace />;
  }

  const iniciais = (usuario?.nome || 'C')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join('');
  const cicloAtual = programas?.find((p) => p.codigo === programa);

  function withPrograma(path) {
    if (!programa) return path;
    const sep = path.includes('?') ? '&' : '?';
    return `${path}${sep}programa=${encodeURIComponent(programa)}`;
  }

  function sair() {
    logout();
    navigate('/login', { replace: true });
  }

  const navLinks = (
    <nav className="coord-nav" aria-label="Navegação da coordenação">
      {NAV.map((item) => (
        <NavLink
          key={item.to}
          to={withPrograma(item.to)}
          end={item.end}
          className={({ isActive }) => `coord-nav-link${isActive ? ' active' : ''}`}
          onClick={() => setMenuAberto(false)}
        >
          <Icon name={item.icon} size={18} />
          <span>{item.label}</span>
        </NavLink>
      ))}
    </nav>
  );

  return (
    <div className="coord-shell">
      <aside className="coord-sidebar" aria-label="Menu lateral">
        <div className="coord-brand">
          <div className="brand-lockup">
            <img src="/images/logo.png" alt="Ajuda-aí" className="brand-logo" />
            <span className="brand-divider" />
            <img src="/images/puclogo.png" alt="PUC Minas" className="puc-logo" />
          </div>
          <strong>Ajuda-aí</strong>
          <span>Mentoria que transforma</span>
        </div>
        {navLinks}
        <div className="coord-sidebar-foot">
          <div className="coord-user-card">
            <span className="coord-avatar" aria-hidden="true">{iniciais}</span>
            <div>
              <strong>{usuario?.nome || 'Coordenação'}</strong>
              <span>Coordenação</span>
            </div>
          </div>
          <button type="button" className="coord-logout" onClick={sair}>
            <Icon name="logout" size={17} />
            Sair
          </button>
        </div>
      </aside>

      <div className="coord-main">
        <header className="coord-mobile-bar">
          <div className="brand-lockup">
            <img src="/images/logo.png" alt="Ajuda-aí" className="brand-logo" />
            <span className="brand-divider" />
            <img src="/images/puclogo.png" alt="PUC Minas" className="puc-logo" />
          </div>
          <div className="coord-mobile-actions">
            <button
              ref={botaoMenuRef}
              type="button"
              className="icon-button"
              aria-label={menuAberto ? 'Fechar menu' : 'Abrir menu'}
              aria-expanded={menuAberto}
              aria-controls={menuId}
              onClick={() => setMenuAberto((v) => !v)}
            >
              <Icon name={menuAberto ? 'close' : 'menu'} size={20} />
            </button>
            <span className="coord-avatar sm" aria-hidden="true">{iniciais}</span>
          </div>
        </header>

        {menuAberto && (
          <div className="coord-drawer-backdrop" onClick={() => setMenuAberto(false)}>
            <div
              id={menuId}
              ref={painelMenuRef}
              className="coord-drawer"
              role="dialog"
              aria-modal="true"
              aria-label="Menu da coordenação"
              onClick={(e) => e.stopPropagation()}
            >
              {navLinks}
              <button type="button" className="coord-logout" onClick={sair}>
                <Icon name="logout" size={17} />
                Sair
              </button>
            </div>
          </div>
        )}

        <div className="coord-content">
          {!SEM_SELETOR.includes(rota) && (
            <div className="coord-cycle-picker">
              <span>Programa/ciclo</span>
              <div className="program-select" ref={seletorWrapRef}>
                <button
                  ref={seletorBtnRef}
                  type="button"
                  className="program-select-btn"
                  aria-haspopup="listbox"
                  aria-expanded={seletorAberto}
                  aria-controls={seletorId}
                  aria-label="Programa/ciclo"
                  disabled={!programas?.length}
                  onClick={() => setSeletorAberto((v) => !v)}
                >
                  <Icon name="calendar" size={17} />
                  <span className="program-select-label">
                    <strong>
                      {cicloAtual?.titulo
                        || cicloAtual?.nome
                        || (programa ? `Programa ${programa}` : 'Selecione o programa/ciclo')}
                    </strong>
                    <small>
                      {cicloAtual
                        ? [cicloAtual.statusRotulo, cicloAtual.vigente ? 'vigente' : null]
                            .filter(Boolean)
                            .join(' · ') || 'Ciclo selecionado'
                        : 'Nenhum ciclo selecionado'}
                    </small>
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
                    {(programas || []).map((p) => (
                      <li key={p.codigo} role="presentation">
                        <button
                          type="button"
                          role="option"
                          aria-selected={p.codigo === programa}
                          className={p.codigo === programa ? 'selected' : ''}
                          onClick={() => {
                            setSeletorAberto(false);
                            setExigirSelecao(false);
                            const novos = new URLSearchParams(searchParams);
                            novos.set('programa', p.codigo);
                            setSearchParams(novos);
                            seletorBtnRef.current?.focus();
                          }}
                        >
                          <span className="program-option-main">
                            <strong>{p.titulo || p.nome || `Programa ${p.codigo}`}</strong>
                            <span>
                              {p.statusRotulo}
                              {p.vigente ? ' · vigente' : p.encerrado ? ' · encerrado' : ''}
                            </span>
                          </span>
                          {p.codigo === programa && <Icon name="check" size={16} />}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          )}
          {SEM_PROGRAMA.includes(rota) ? <Outlet context={{programaQ: programa, programaExcluido, carregarProgramas}}/>
            : erroProgramas ? <p role="alert">{erroProgramas}<button onClick={carregarProgramas}>Tentar novamente</button></p>
            : programas === null ? <p role="status">Carregando programas…</p>
            : !programa || !programas.some(p => p.codigo === programa) ? <p>{programas.length ? 'Selecione um programa/ciclo para administrar.' : 'Nenhum programa cadastrado. Abra um ciclo em Programas.'}</p>
            : <Outlet key={programa} context={{ programaQ: programa }} /> }
        </div>
      </div>
    </div>
  );
}
