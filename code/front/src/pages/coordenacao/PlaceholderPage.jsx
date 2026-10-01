import { Link, useLocation, useSearchParams } from 'react-router-dom';

const TITULOS = {
  candidaturas: 'Candidaturas',
  usuarios: 'Usuários',
  programas: 'Programas',
  formularios: 'Formulários',
  configuracoes: 'Configurações',
};

export default function PlaceholderPage({ secao }) {
  const [params] = useSearchParams();
  const location = useLocation();
  const programa = params.get('programa');
  const titulo = TITULOS[secao] || 'Seção';

  return (
    <section className="coord-placeholder">
      <h1>{titulo}</h1>
      <p>
        Esta área estará disponível na próxima entrega do painel.
        {programa ? ` Programa selecionado: ${programa}.` : ''}
      </p>
      <Link
        className="text-link"
        to={programa ? `/coordenacao?programa=${encodeURIComponent(programa)}` : '/coordenacao'}
        state={location.state}
      >
        Voltar ao dashboard
      </Link>
    </section>
  );
}
