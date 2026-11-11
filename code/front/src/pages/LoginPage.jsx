import {useEffect, useRef, useState} from 'react';
import {useNavigate} from 'react-router-dom';
import {api, clearAlunoSession, persistAlunoSession, selecionarProgramaAluno} from '../api/client';
import {useAuth} from '../auth/AuthContext';
import {iniciarMicrosoft, concluirMicrosoft} from '../auth/microsoft';
import {escolherCiclo, resolverAluno} from '../auth/resolverAluno';
export default function LoginPage() {
  const navigate = useNavigate(); const {aceitarSessao, logout} = useAuth();
  const [erro, setErro] = useState(''); const [ocupado, setOcupado] = useState(false);
  const [email, setEmail] = useState('ana.beatriz@pucminas.edu.br');
  const callback = useRef(false);
  async function aceitar(resultado) {
    logout(); clearAlunoSession();
    if (resultado.usuario?.perfil === 'coordenador') { aceitarSessao(resultado); navigate('/coordenacao', {replace: true}); return; }
    persistAlunoSession(resultado);
    if (resultado.onboardingToken) { navigate('/', {replace: true}); return; }
    const perfil = await api.perfilAluno(); const ciclos = await api.programasAluno();
    const codigo = escolherCiclo(ciclos); selecionarProgramaAluno(codigo);
    const situacao = codigo || ciclos.length === 0 ? await api.situacao(perfil.email, codigo) : null;
    navigate(resolverAluno(perfil, situacao, ciclos.find(p => p.codigo === codigo)).destino, {replace: true});
  }
  async function entrar(acao) { if (ocupado) return; setOcupado(true); setErro(''); try { await aceitar(await acao()); } catch(e) {setErro(e.message);} finally {setOcupado(false);} }
  useEffect(() => {
    if (location.pathname === '/auth/callback' && !callback.current) {
      callback.current = true; entrar(async () => api.loginMicrosoft(await concluirMicrosoft()));
    }
  }, []);
  return <main className="login-page"><section className="login-card" aria-labelledby="login-title">
    <div className="brand-lockup login-brand">
      <img src="/images/logo.png" alt="Ajuda-aí" className="brand-logo" />
      <span className="brand-divider" />
      <img src="/images/puclogo.png" alt="PUC Minas" className="puc-logo" />
    </div>
    <h1 id="login-title">Entre no Ajuda-aí</h1>
    <p>Use sua conta institucional da PUC Minas.</p>
    <button className="primary-button" disabled={ocupado} onClick={() => iniciarMicrosoft().catch(e => setErro(e.message))}>
      <img src="/images/microsoft.png" alt="" className="login-ms-icon" />Entrar com Microsoft
    </button>
    {import.meta.env.DEV && <div className="login-demo">
      <span className="login-demo-sep">ou, em desenvolvimento</span>
      <label className="login-demo-label" htmlFor="login-demo-email">Usuário de teste</label>
      <select id="login-demo-email" className="login-demo-select" value={email} onChange={e => setEmail(e.target.value)}>
        {['camila', 'lucas.almeida', 'thiago', 'ana.beatriz', 'pedro.lima', 'julia.fernandes', 'renata'].map(nome => <option key={nome} value={`${nome}@pucminas.edu.br`}>{nome === 'renata' ? 'renata (coordenação)' : nome}</option>)}
      </select>
      <button type="button" className="outline-button" disabled={ocupado} onClick={() => entrar(() => api.loginDemo(email))}>Entrar como usuário de teste</button>
    </div>}
    {ocupado && <p className="login-hint" role="status">Consultando sua conta…</p>}
    {erro && <p className="error-message login-erro" role="alert">{erro}</p>}
  </section></main>;
}
