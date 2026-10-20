import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { NavLink, Navigate, Outlet, useNavigate, useSearchParams, useLocation } from 'react-router-dom';
import { useAuth } from '../../auth/AuthContext';
import {api} from '../../api/client';
import Icon from '../../components/Icon';

const NAV = [
  { to: '/coordenacao', end: true, label: 'Dashboard', icon: 'home' },
  { to: '/coordenacao/cadastros', label: 'Cadastros', icon: 'userSearch' },
  { to: '/coordenacao/candidaturas', label: 'Candidaturas', icon: 'clipboard' },
  { to: '/coordenacao/usuarios', label: 'Usuários', icon: 'users' },
  { to: '/coordenacao/programas', label: 'Programas', icon: 'calendar' },
  { to: '/coordenacao/formularios', label: 'Formulários', icon: 'form' },
  { to: '/coordenacao/configuracoes', label: 'Configurações', icon: 'settings' },
];

export default function CoordLayout() {
  const { autenticado, ehCoordenador, usuario, logout } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const location = useLocation();
  const [programas, setProgramas] = useState(null);
  const [erroProgramas, setErroProgramas] = useState('');
  const [exigirSelecao, setExigirSelecao] = useState(false);
  const programa = searchParams.get('programa');
  const [menuAberto, setMenuAberto] = useState(false);
  const menuId = useId();
  const botaoMenuRef = useRef(null);
  const painelMenuRef = useRef(null);
  const navigate = useNavigate();

  const carregarProgramas = useCallback(async () => {
    setErroProgramas('');
    try {const lista = await api.programas(); setProgramas(lista);}
    catch(e) {setErroProgramas('Não foi possível carregar os programas da coordenação. Tente novamente.');}
  }, []);
  useEffect(() => {if (autenticado && ehCoordenador) carregarProgramas();}, [autenticado, ehCoordenador, carregarProgramas]);
  useEffect(() => {
    if (!programas) return;
    if (programa && !programas.some(p => p.codigo === programa)) {
      const novos = new URLSearchParams(searchParams); novos.delete('programa'); setExigirSelecao(true); setSearchParams(novos, {replace: true});
    } else if (!programa && programas.length === 1 && !exigirSelecao) {
      const novos = new URLSearchParams(searchParams); novos.set('programa', programas[0].codigo); setSearchParams(novos, {replace: true});
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
          <label>Programa/ciclo <select aria-label="Programa/ciclo" value={programas?.some(p => p.codigo === programa) ? programa : ''} onChange={e => {
            setExigirSelecao(false); const novos = new URLSearchParams(searchParams);
            if(e.target.value) novos.set('programa', e.target.value); else novos.delete('programa');
            setSearchParams(novos);
          }}><option value="">Selecione o programa/ciclo</option>{programas?.map(p => <option key={p.codigo} value={p.codigo}>{p.titulo || p.nome}</option>)}</select></label>
          {location.pathname === '/coordenacao/programas' ? <Outlet context={{programaQ: programa, programaExcluido, carregarProgramas}}/>
            : erroProgramas ? <p role="alert">{erroProgramas}<button onClick={carregarProgramas}>Tentar novamente</button></p>
            : programas === null ? <p role="status">Carregando programas…</p>
            : !programa || !programas.some(p => p.codigo === programa) ? <p>{programas.length ? 'Selecione um programa/ciclo para administrar.' : 'Nenhum programa cadastrado. Abra um ciclo em Programas.'}</p>
            : <Outlet key={programa} context={{ programaQ: programa }} /> }
        </div>
      </div>
    </div>
  );
}
