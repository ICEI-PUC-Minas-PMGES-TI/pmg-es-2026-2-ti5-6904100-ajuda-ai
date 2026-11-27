import {useEffect, useRef, useState} from 'react';
import {useNavigate} from 'react-router-dom';
import {api, clearAlunoSession, persistAlunoSession, selecionarProgramaAluno} from '../api/client';
import {useAuth} from '../auth/AuthContext';
import {iniciarMicrosoft, concluirMicrosoft} from '../auth/microsoft';
import {escolherCiclo, resolverAluno} from '../auth/resolverAluno';
/**
 * Contas do login demo (só em desenvolvimento; o backend recusa outras e só
 * aceita com AUTH_DEMO_ENABLED fora de produção). O rótulo descreve o
 * estado-alvo do seed:demo-gamificacao; nível e XP reais vêm de GET /me/xp.
 */
const CONTAS_DEMO = [
  ['Níveis 1 a 10', [
    ['lucas.almeida', 'Lucas Almeida — Apadrinhado ativo — Nível 1 — 0 XP'],
    ['demo.sofia.martins', 'Sofia Martins — Apadrinhada ativa — Nível 2 — 80 XP'],
    ['demo.pedro.costa', 'Pedro Costa — Padrinho aguardando vínculo — Nível 3 — 220 XP'],
    ['demo.ana.ribeiro', 'Ana Ribeiro — Apadrinhada aguardando padrinho — Nível 4 — 380 XP'],
    ['camila', 'Camila Duarte — Apadrinhada ativa — Nível 5 — 580 XP'],
    ['demo.mariana.lopes', 'Mariana Lopes — Madrinha ativa — Nível 6 — 900 XP'],
    ['thiago', 'Thiago Moreira — Padrinho ativo — Nível 7 — 1.310 XP'],
    ['demo.rafael.souza', 'Rafael Souza — Padrinho ativo — Nível 8 — 1.650 XP'],
    ['demo.beatriz.santos', 'Beatriz Santos — Apadrinhada ativa — Nível 9 — 2.200 XP'],
    ['demo.matheus.oliveira', 'Matheus Oliveira — Padrinho ativo — Nível 10 — 2.850 XP'],
  ]],
  ['Cenários', [
    ['demo.gabriel.nunes', 'A · Gabriel Nunes — faltam 10 XP para o nível 2'],
    ['demo.helena.prado', 'B · Helena Prado — perto do teto de totens (fixture local)'],
    ['demo.igor.fonseca', 'C · Igor Fonseca — teto de totens atingido (fixture local)'],
    ['demo.daniel.rocha', 'D · Daniel Rocha — XP alto, 0 moedas'],
    ['demo.larissa.pinto', 'F · Larissa Pinto — candidatura pendente'],
    ['demo.otavio.mendes', 'G · Otávio Mendes — candidatura rejeitada'],
    ['demo.bruno.teixeira', 'H · Bruno Teixeira — ex-participante (2026/1)'],
  ]],
  ['Fluxo de candidatura', [
    ['ana.beatriz', 'Ana Beatriz Costa — candidata a padrinho'],
    ['pedro.lima', 'Pedro Henrique Lima — candidato a padrinho'],
    ['julia.fernandes', 'Julia Fernandes — candidata não aprovada'],
  ]],
  ['Coordenação', [['renata', 'I · Renata Martins — coordenação']]],
];

// Homologação publicada: o painel de contas demo aparece, mas a API só aceita
// com a chave de demonstração. Em produção esta variável fica ausente.
const DEMO_HOMOLOGACAO = import.meta.env.VITE_DEMO_LOGIN === 'true';
const DEMO_VISIVEL = import.meta.env.DEV || DEMO_HOMOLOGACAO;
const CHAVE_DEMO_SESSAO = 'ajudaai.demo.chave';

export default function LoginPage() {
  const navigate = useNavigate(); const {aceitarSessao, logout} = useAuth();
  const [erro, setErro] = useState(''); const [ocupado, setOcupado] = useState(false);
  const [email, setEmail] = useState('ana.beatriz@pucminas.edu.br');
  const [chaveDemo, setChaveDemo] = useState(() => { try { return sessionStorage.getItem(CHAVE_DEMO_SESSAO) || ''; } catch { return ''; } });
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
    {DEMO_VISIVEL && <div className="login-demo">
      <span className="login-demo-sep">{DEMO_HOMOLOGACAO ? 'ou, na homologação' : 'ou, em desenvolvimento'}</span>
      {DEMO_HOMOLOGACAO && <>
        <label className="login-demo-label" htmlFor="login-demo-chave">Chave de demonstração</label>
        <input id="login-demo-chave" className="login-demo-select" type="password" autoComplete="off" value={chaveDemo}
          onChange={e => { setChaveDemo(e.target.value); try { sessionStorage.setItem(CHAVE_DEMO_SESSAO, e.target.value); } catch { /* armazenamento indisponível */ } }} />
      </>}
      <label className="login-demo-label" htmlFor="login-demo-email">Usuário de teste</label>
      <select id="login-demo-email" className="login-demo-select" value={email} onChange={e => setEmail(e.target.value)}>
        {CONTAS_DEMO.map(([grupo, contas]) => <optgroup key={grupo} label={grupo}>
          {contas.map(([local, rotulo]) => <option key={local} value={`${local}@pucminas.edu.br`}>{rotulo}</option>)}
        </optgroup>)}
      </select>
      <button type="button" className="outline-button" disabled={ocupado} onClick={() => entrar(() => api.loginDemo(email, DEMO_HOMOLOGACAO ? chaveDemo : undefined))}>Entrar como usuário de teste</button>
    </div>}
    {ocupado && <p className="login-hint" role="status">Consultando sua conta…</p>}
    {erro && <p className="error-message login-erro" role="alert">{erro}</p>}
  </section></main>;
}
