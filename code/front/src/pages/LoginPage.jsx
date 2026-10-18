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
  return <main className="login-page"><section className="login-card">
    <img src="/images/logo.png" alt="Ajuda-aí" className="brand-logo" />
    <h1>Entre no Ajuda-aí</h1>
    <button className="primary-button" disabled={ocupado} onClick={() => iniciarMicrosoft().catch(e => setErro(e.message))}>Entrar com Microsoft</button>
    {import.meta.env.DEV && <><label>Usuário de teste<select value={email} onChange={e => setEmail(e.target.value)}>
      {['camila', 'lucas.almeida', 'thiago', 'ana.beatriz', 'pedro.lima', 'julia.fernandes', 'renata'].map(nome => <option key={nome} value={`${nome}@pucminas.edu.br`}>{nome}</option>)}
    </select></label><button disabled={ocupado} onClick={() => entrar(() => api.loginDemo(email))}>Entrar como usuário de teste</button></>}
    {ocupado && <p role="status">Consultando sua conta…</p>}
    {erro && <p role="alert">{erro}</p>}
  </section></main>;
}
