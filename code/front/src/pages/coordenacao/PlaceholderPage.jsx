import { Link, useLocation, useSearchParams } from 'react-router-dom';

const TITULOS = {
  candidaturas: 'Candidaturas',
  usuarios: 'Usuários',
  programas: 'Programas',
  formularios: 'Formulários',
  configuracoes: 'Configurações',
};

const PENDENCIAS = {
  grupos: 'Foque nos grupos com formação incompleta deste ciclo.',
  prazo: 'Revise o prazo de inscrições e o calendário do programa.',
  sem_vinculo: 'Priorize apadrinhados sem vínculo confirmado.',
};

export default function PlaceholderPage({ secao }) {
  const [params] = useSearchParams();
  const location = useLocation();
  const programa = params.get('programa');
  const pendencia = params.get('pendencia');
  const titulo = TITULOS[secao] || 'Seção';
  const contexto = PENDENCIAS[pendencia];

  return (
    <section className="coord-placeholder">
      <h1>{titulo}</h1>
      <p>
        Esta área estará disponível na próxima entrega do painel.
        {programa ? ` Programa selecionado: ${programa}.` : ''}
      </p>
      {contexto && <p className="placeholder-focus">{contexto}</p>}
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
