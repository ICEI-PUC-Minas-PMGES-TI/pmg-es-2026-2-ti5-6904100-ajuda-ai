import { useEffect, useId, useRef, useState } from 'react';
import { NavLink, Navigate, Outlet, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../auth/AuthContext';
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
  const { autenticado, ehCoordenador, usuario, logout, loginDemo, carregando } = useAuth();
  const [searchParams] = useSearchParams();
  const programa = searchParams.get('programa');
  const [menuAberto, setMenuAberto] = useState(false);
  const [falhaDemo, setFalhaDemo] = useState(false);
  const tentouDemoRef = useRef(false);
  const menuId = useId();
  const botaoMenuRef = useRef(null);
  const painelMenuRef = useRef(null);
  const navigate = useNavigate();

  useEffect(() => {
    if (autenticado || falhaDemo || tentouDemoRef.current) return undefined;
    tentouDemoRef.current = true;
    let cancelado = false;
    loginDemo('renata@pucminas.edu.br').catch(() => {
      if (!cancelado) setFalhaDemo(true);
    });
    return () => {
      cancelado = true;
    };
  }, [autenticado, falhaDemo, loginDemo]);

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

  if (!autenticado) {
    if (falhaDemo) return <Navigate to="/login" replace />;
    return (
      <main className="login-page">
        <p>{carregando ? 'Abrindo o painel…' : 'Preparando acesso…'}</p>
      </main>
    );
  }
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
          <Outlet context={{ programaQ: programa }} />
        </div>
      </div>
    </div>
  );
}
