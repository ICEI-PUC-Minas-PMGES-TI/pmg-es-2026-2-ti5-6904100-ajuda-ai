import { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';

export default function LoginPage() {
  const { loginDemo, autenticado, ehCoordenador, carregando } = useAuth();
  const [erro, setErro] = useState('');
  const [tentou, setTentou] = useState(false);

  useEffect(() => {
    if (autenticado || tentou) return undefined;
    let cancelado = false;
    setTentou(true);
    loginDemo('renata@pucminas.edu.br')
      .then((usuario) => {
        if (cancelado) return;
        if (usuario.perfil !== 'coordenador') {
          setErro('Este acesso é restrito à coordenação do programa.');
        }
      })
      .catch((error) => {
        if (!cancelado) setErro(error.message || 'Não foi possível entrar.');
      });
    return () => {
      cancelado = true;
    };
  }, [autenticado, tentou, loginDemo]);

  if (autenticado && ehCoordenador) {
    return <Navigate to="/coordenacao" replace />;
  }

  return (
    <main className="login-page">
      <section className="login-card" aria-labelledby="login-title">
        <div className="brand-lockup login-brand">
          <img src="/images/logo.png" alt="Ajuda-aí" className="brand-logo" />
          <span className="brand-divider" />
          <img src="/images/puclogo.png" alt="PUC Minas" className="puc-logo" />
        </div>
        <h1 id="login-title">Painel da coordenação</h1>
        <p>
          {carregando || !erro
            ? 'Abrindo o painel sem precisar informar credenciais…'
            : 'Não foi possível abrir o painel automaticamente.'}
        </p>
        {erro && <p className="error-message" role="alert">{erro}</p>}
      </section>
    </main>
  );
}
