import { Link, Navigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../auth/AuthContext';
import Icon from '../../components/Icon';

/** Conta da coordenação — preferências e dados básicos da sessão. */
export default function ConfiguracoesPage() {
  const [params] = useSearchParams();
  const { usuario, logout } = useAuth();

  // Link antigo do dashboard: /configuracoes?secao=comunicados
  if (params.get('secao') === 'comunicados') {
    return <Navigate to="/coordenacao/comunicados" replace />;
  }

  return (
    <section className="coord-settings">
      <header className="dash-header">
        <div>
          <span className="eyebrow"><Icon name="settings" size={15} /> CONTA</span>
          <h1>Configurações</h1>
          <p>Dados da sua conta de coordenação e atalhos úteis.</p>
        </div>
      </header>

      <div className="coord-settings-grid coord-settings-account">
        <section className="dash-card" aria-labelledby="conta-titulo">
          <h2 id="conta-titulo"><Icon name="person" size={18} /> Conta da coordenação</h2>
          <dl className="detail-facts">
            <div><dt>Nome</dt><dd>{usuario?.nome || 'Coordenação'}</dd></div>
            <div><dt>E-mail</dt><dd>{usuario?.email || '—'}</dd></div>
            <div><dt>Perfil</dt><dd>Coordenação</dd></div>
          </dl>
          <p className="private-note">
            <Icon name="info" size={15} />
            Sessão da coordenação neste navegador. Em produção, o acesso usa a conta institucional @pucminas.edu.br.
          </p>
          <div className="settings-actions">
            <button type="button" className="outline-button" onClick={logout}>
              <Icon name="logout" size={17} /> Sair da coordenação
            </button>
          </div>
        </section>

        <section className="dash-card" aria-labelledby="atalhos-titulo">
          <h2 id="atalhos-titulo"><Icon name="compass" size={18} /> Atalhos</h2>
          <ul className="settings-links">
            <li>
              <Link to="/coordenacao/comunicados">
                <Icon name="megaphone" size={18} />
                <span>
                  <strong>Comunicados</strong>
                  <small>Enviar notificações aos participantes</small>
                </span>
                <Icon name="chevron" size={16} />
              </Link>
            </li>
            <li>
              <Link to="/coordenacao/programas">
                <Icon name="calendar" size={18} />
                <span>
                  <strong>Programas</strong>
                  <small>Ciclos, etapas e inscrições</small>
                </span>
                <Icon name="chevron" size={16} />
              </Link>
            </li>
            <li>
              <Link to="/coordenacao/formularios">
                <Icon name="form" size={18} />
                <span>
                  <strong>Formulários</strong>
                  <small>Perguntas do cadastro</small>
                </span>
                <Icon name="chevron" size={16} />
              </Link>
            </li>
          </ul>
        </section>
      </div>
    </section>
  );
}
