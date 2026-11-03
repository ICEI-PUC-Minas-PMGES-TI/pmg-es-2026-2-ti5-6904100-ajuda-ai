import { Navigate } from 'react-router-dom';

/** Redireciona o endereço anterior dos comunicados para o feed. */
export default function ComunicadosPage() {
  return <Navigate to="/coordenacao/feed" replace />;
}
