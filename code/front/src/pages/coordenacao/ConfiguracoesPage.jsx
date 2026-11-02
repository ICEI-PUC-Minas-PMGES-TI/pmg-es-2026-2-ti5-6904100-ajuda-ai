import { Link, Navigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../../auth/AuthContext";
import Icon from "../../components/Icon";

export default function ConfiguracoesPage() {
  const [params] = useSearchParams();
  const { usuario } = useAuth();
  if (params.get("secao") === "comunicados") {
    return <Navigate to="/coordenacao/feed" replace />;
  }

  return (
    <section className="coord-settings">
      <header className="dash-header">
        <div>
          <h1>Configurações</h1>
          <p>Informações da sua conta de coordenação.</p>
        </div>
      </header>
      <div className="coord-settings-grid">
        <section className="dash-card" aria-labelledby="feed-comunicados">
          <h2 id="feed-comunicados">
            <Icon name="megaphone" size={18} /> Comunicados no Feed
          </h2>
          <p>
            Publique comunicados e dicas no Feed, escolhendo a categoria da
            publicação.
          </p>
          <Link to="/coordenacao/feed" className="primary-button inline">
            Abrir Feed
          </Link>
        </section>
        <section className="dash-card" aria-labelledby="conta-titulo">
          <h2 id="conta-titulo">
            <Icon name="person" size={18} /> Conta da coordenação
          </h2>
          <dl className="detail-facts">
            <div>
              <dt>Nome</dt>
              <dd>{usuario?.nome || "Coordenação"}</dd>
            </div>
            <div>
              <dt>E-mail</dt>
              <dd>{usuario?.email || "—"}</dd>
            </div>
            <div>
              <dt>Perfil</dt>
              <dd>Coordenação</dd>
            </div>
          </dl>
        </section>
      </div>
    </section>
  );
}
