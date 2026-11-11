import { Navigate, useSearchParams } from 'react-router-dom';

/**
 * A tela de Cadastros foi unificada em Candidaturas (Padrinhos / Apadrinhados).
 * Mantém links antigos funcionando.
 */
export default function RedirectCadastros() {
  const [params] = useSearchParams();
  const novos = new URLSearchParams();
  const programa = params.get('programa');
  const status = params.get('status');
  const tipo = params.get('tipo');
  if (programa) novos.set('programa', programa);

  if (tipo === 'padrinho') {
    if (status === 'aprovado') novos.set('status', 'aprovadas');
    else if (status === 'rejeitado') novos.set('status', 'nao_aprovado');
    else if (status === 'pendente') novos.set('status', 'aguardando');
  } else {
    novos.set('publico', 'apadrinhado');
    if (status && status !== 'todos') novos.set('status', status);
    else novos.set('status', 'pendente');
  }

  const qs = novos.toString();
  return <Navigate to={`/coordenacao/candidaturas${qs ? `?${qs}` : ''}`} replace />;
}
