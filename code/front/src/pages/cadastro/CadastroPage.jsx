import { useEffect, useMemo, useRef, useState } from 'react';
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { api, getAlunoSession, programaAluno, selecionarProgramaAluno } from '../../api/client';
import { escolherCiclo, resolverAluno } from '../../auth/resolverAluno';
import {
  iniciaisDe,
  periodoNumero,
  salvarSessaoAluno,
} from '../../auth/sessaoAluno';
import Icon from '../../components/Icon';
import { limparExtras, useFormularioPublico, validarExtras } from '../../components/PerguntasAdicionais';
import { useToast } from '../../components/Toast';
import ApadrinhadoStep from './ApadrinhadoStep';
import CandidaturaPadrinhoForm from './CandidaturaPadrinhoForm';
import EscolhaStep, { bloqueioDaOpcao } from './EscolhaStep';
import { CURSOS, Header, paraBool, SidePanel } from './partes';
import PerfilStep from './PerfilStep';
import RevisaoStep from './RevisaoStep';
import SucessoStep from './SucessoStep';

const ROTULOS_SITUACAO = {
  candidatura_pendente: 'candidatura a padrinho enviada',
  candidatura_em_analise: 'candidatura a padrinho em análise',
  candidatura_rejeitada: 'candidatura a padrinho não aprovada',
  candidatura_aprovada_aguardando_matching: 'candidatura aprovada aguardando matching',
  padrinho_ativo: 'padrinho ativo',
  apadrinhado_pendente: 'cadastro de apadrinhado aguardando aprovação',
  apadrinhado_rejeitado: 'cadastro de apadrinhado não aprovado',
  apadrinhado_aguardando: 'apadrinhado aguardando padrinho',
  apadrinhado_ativo: 'apadrinhado com padrinho definido',
  concluido: 'participação concluída',
};

function perfilInicial(email, sessao) {
  const salvo = sessao?.email === email ? sessao.perfil : null;
  return {
    name: sessao?.nome || '',
    email,
    course: salvo?.curso || CURSOS[0],
    period: salvo?.periodo ? `${salvo.periodo}º período` : '1º período',
    shift: salvo?.turno || 'Noite',
    interests: salvo?.interesses || ['Tecnologia', 'Inovação', 'Projetos'],
    gender: '',
    prouni: '',
    otherCity: '',
    availability: [],
    supportAreas: [],
    expectation: '',
    additionalInfo: '',
    extras: {},
  };
}

function opcaoPadrao(periodo) {
  return ['padrinho', 'apadrinhado'].find((op) => !bloqueioDaOpcao(op, periodo));
}

function perfilParaSessao(profile) {
  return {
    nome: profile.name.trim(),
    curso: profile.course,
    periodo: periodoNumero(profile.period),
    turno: profile.shift,
    interesses: profile.interests,
  };
}

/**
 * Fluxo do aluno: Complete seu perfil → Como você quer participar? →
 * (apadrinhado) Conte sobre você → Revise → Concluído
 * (padrinho) Candidatura → Status da candidatura
 * (explorar) Área do aluno sem participação.
 */
export default function CadastroPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const mostrarToast = useToast();
  const [sessao] = useState(() => getAlunoSession());
  const email = sessao?.email || '';
  const passoUrl = params.get('passo');

  const [step, setStep] = useState(() => (passoUrl === 'escolha' && sessao?.perfil && sessao.email === email ? 'escolha' : 'perfil'));
  const [profile, setProfile] = useState(() => perfilInicial(email, sessao));
  const [escolha, setEscolha] = useState(() => opcaoPadrao(periodoNumero(perfilInicial(email, sessao).period) || 1));
  const [photo, setPhoto] = useState('');
  const [arquivoFoto, setArquivoFoto] = useState(null);
  const [carregando, setCarregando] = useState(true);
  const [programas, setProgramas] = useState([]);
  const [programa, setPrograma] = useState(programaAluno);
  const [errors, setErrors] = useState({});
  const envioEmCurso = useRef(false);
  const [enviando, setEnviando] = useState(false);
  const [erroEnvio, setErroEnvio] = useState('');
  const [existente, setExistente] = useState(null);
  const { perguntas: perguntasApadrinhado, erro: erroFormulario, carregando: carregandoFormulario } = useFormularioPublico('apadrinhado', programa);

  useEffect(() => () => {if (photo.startsWith('blob:')) URL.revokeObjectURL(photo);}, [photo]);
  const periodo = periodoNumero(profile.period) || 1;

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [step]);

  useEffect(() => {
    let ativo = true;
    async function carregar() {
      try {
        if (!sessao) return;
        if (sessao.onboardingToken) {setProfile(p => ({...p, name: sessao.nome || '', email})); return;}
        const perfil = await api.perfilAluno();
        if (!ativo) return;
        setProfile(p => ({...p, name: perfil.nome, email, course: perfil.curso || CURSOS[0],
          period: `${perfil.periodo || 1}º período`, shift: perfil.turno || 'Noite', interests: perfil.interesses || []}));
        const ciclos = await api.programasAluno(); if (!ativo) return;
        setProgramas(ciclos);
        const codigo = programa || escolherCiclo(ciclos); setPrograma(codigo); selecionarProgramaAluno(codigo);
        const dados = codigo || ciclos.length === 0 ? await api.situacao(email, codigo) : null;
        if (!ativo) return;
        setExistente(dados);
        if (!passoUrl && resolverAluno(perfil, dados, ciclos.find(p => p.codigo === codigo)).completo) navigate('/aluno/perfil', {replace: true});
        else if (passoUrl === 'escolha') setStep('escolha');
      } catch(e) {if(ativo) setErroEnvio(e.message);}
      finally {if(ativo) setCarregando(false);}
    }
    carregar(); return () => {ativo = false;};
  }, [email]);

  const initials = useMemo(() => iniciaisDe(profile.name), [profile.name]);

  if (!sessao) return <Navigate to="/login" replace />;
  if (carregando) return <p role="status">Carregando perfil…</p>;

  function update(key, value) {
    setProfile((current) => ({ ...current, [key]: value }));
    setErrors((current) => ({ ...current, [key]: false }));
  }

  function toggleList(key, value) {
    const current = profile[key];
    update(key, current.includes(value) ? current.filter((item) => item !== value) : [...current, value]);
  }

  function updateExtra(id, valor) {
    setProfile((current) => ({ ...current, extras: { ...current.extras, [id]: valor } }));
    setErrors((current) => ({ ...current, extras: { ...(current.extras || {}), [id]: false } }));
  }

  function salvarSessao(escolhaFinal, respostas) {
    return salvarSessaoAluno({ email, perfil: perfilParaSessao(profile), escolha: escolhaFinal, respostas: respostas || null });
  }

  function irParaArea() {
    const papel = existente?.registro?.papel;
    salvarSessao(papel === 'apadrinhado' ? 'apadrinhado' : papel ? 'padrinho' : 'explorar', existente?.registro?.respostas);
    navigate('/aluno/perfil');
  }

  async function nextFromProfile(event) {
    if (enviando) return;
    event.preventDefault();
    if (!profile.name.trim()) {
      setErrors({ name: true });
      return;
    }
    setEnviando(true); setErroEnvio('');
    try {
      await api.completarPerfil(perfilParaSessao(profile));
      if (arquivoFoto) {try {await api.salvarFoto(arquivoFoto);} catch(e) {mostrarToast(`Perfil salvo. Foto não enviada: ${e.message}`);}}
      const ciclos = await api.programasAluno(); setProgramas(ciclos);
      const codigo = programa || escolherCiclo(ciclos); setPrograma(codigo); selecionarProgramaAluno(codigo);
      setExistente(codigo || ciclos.length === 0 ? await api.situacao(email, codigo) : null);
    } catch(e) {setErroEnvio(e.message); return;} finally {setEnviando(false);}
    setErrors({});
    if (!escolha || bloqueioDaOpcao(escolha, periodo)) setEscolha(opcaoPadrao(periodo));
    setStep('escolha');
  }

  function continuarEscolha() {
    if (escolha === 'explorar') {
      salvarSessao('explorar');
      mostrarToast('Tudo pronto! Você pode participar do programa quando quiser.');
      navigate('/aluno/perfil');
      return;
    }
    const r = resolverAluno(perfilParaSessao(profile), existente, programas.find(p => p.codigo === programa));
    if (!(escolha === 'padrinho' ? r.podePadrinho : r.podeApadrinhado)) {setErroEnvio('Inscrição indisponível neste ciclo. Consulte sua situação e o calendário.'); return;}
    setErrors({});
    setStep(escolha === 'padrinho' ? 'padrinho' : 'apadrinhado');
  }

  function nextFromDetails(event) {
    event.preventDefault();
    if (carregandoFormulario) {setErroEnvio('Aguarde o carregamento do formulário.'); return;}
    if (erroFormulario) { setErroEnvio(erroFormulario); return; }
    const errosExtras = validarExtras(perguntasApadrinhado, profile.extras);
    const nextErrors = {
      gender: !profile.gender,
      prouni: !profile.prouni,
      otherCity: !profile.otherCity,
      availability: profile.availability.length === 0,
      supportAreas: profile.supportAreas.length === 0,
      expectation: !profile.expectation.trim(),
      extras: errosExtras,
    };
    setErrors(nextErrors);
    const temErro = Object.entries(nextErrors).some(([k, v]) => (k === 'extras' ? Object.keys(v).length > 0 : v));
    if (temErro) {
      window.setTimeout(() => document.querySelector('.field-error, .extra-field.has-error')?.scrollIntoView({ block: 'center', behavior: 'smooth' }), 0);
      return;
    }
    setErroEnvio('');
    setStep('revisao');
  }

  async function submitRegistration() {
    if (envioEmCurso.current) return;
    if (erroFormulario) { setErroEnvio(erroFormulario); return; }
    const perfil = perfilParaSessao(profile);
    const respostas = {
      ...perfil,
      genero: profile.gender,
      bolsistaProuni: paraBool(profile.prouni),
      deOutraCidade: paraBool(profile.otherCity),
      disponibilidade: profile.availability,
      areas: profile.supportAreas,
      expectativa: profile.expectation.trim(),
      outrasInformacoes: profile.additionalInfo.trim(),
      extras: limparExtras(perguntasApadrinhado, profile.extras),
    };
    envioEmCurso.current = true;
    setEnviando(true);
    setErroEnvio('');
    try {
      // Cria a solicitação de cadastro (PENDENTE) e a sessão do aluno.
      await api.cadastrar({ ...perfil, email, programa, tipoParticipacao: 'apadrinhado', respostas });
      salvarSessao('apadrinhado', respostas);
      setStep('sucesso');
    } catch (error) {
      setErroEnvio(error.message || 'Não foi possível enviar seu cadastro. Tente novamente.');
    } finally {
      envioEmCurso.current = false;
      setEnviando(false);
    }
  }

  function candidaturaEnviada(_registro, respostas) {
    salvarSessao('padrinho', respostas);
    mostrarToast('Cadastro enviado! Ele aguarda a aprovação da coordenação.', 'sucesso');
    navigate('/aluno/candidatura');
  }

  const avisoExistente = existente && (
    <div className="existing-notice" role="status">
      <Icon name="info" size={18} />
      <span>
        Encontramos uma participação sua no {existente.programa?.titulo || 'programa atual'}: <strong>{ROTULOS_SITUACAO[existente.situacao] || existente.situacao}</strong>.
      </span>
      <button type="button" className="ghost-button small" onClick={irParaArea}>Ir para minha área</button>
    </div>
  );

  const header = <Header name={profile.name || 'Aluno'} onNotifications={() => mostrarToast('As notificações aparecem na sua área do aluno, após o cadastro.')} />;

  if (step === 'escolha') {
    return (
      <div className="app-shell">
        {header}
        <label>Ciclo <select value={programa} onChange={async e => {
          const codigo = e.target.value; setPrograma(codigo); selecionarProgramaAluno(codigo); setExistente(null); setErroEnvio('');
          try {setExistente(await api.situacao(email, codigo));} catch(e) {setErroEnvio(e.message);}
        }}><option value="">Selecione o ciclo</option>{programas.map(p => <option key={p.codigo} value={p.codigo}>{p.titulo}</option>)}</select></label>
        {erroEnvio && <p role="alert">{erroEnvio}</p>}
        <EscolhaStep periodo={periodo} escolha={escolha} onEscolher={setEscolha} onContinuar={continuarEscolha} onVoltar={() => setStep('perfil')} />
      </div>
    );
  }

  if (step === 'revisao') {
    return (
      <div className="app-shell">
        {header}
        <RevisaoStep
          profile={profile}
          initials={initials}
          perguntas={perguntasApadrinhado}
          onBack={() => setStep('apadrinhado')}
          onEditProfile={() => setStep('perfil')}
          onSubmit={submitRegistration}
          enviando={enviando}
          erro={erroEnvio}
        />
      </div>
    );
  }

  if (step === 'sucesso') {
    return (
      <div className="app-shell">
        {header}
        <SucessoStep name={profile.name} onProfile={() => navigate('/aluno/perfil')} />
      </div>
    );
  }

  return (
    <div className="app-shell">
      {header}
      <div className="signup-layout">
        <SidePanel variant={step === 'perfil' ? 'profile' : 'connections'} />
        <main className="form-stage">
          {erroEnvio && <p role="alert">{erroEnvio}</p>}
          <section className={`form-card ${step !== 'perfil' ? 'details-card' : ''}`}>
            {step === 'perfil' && (
              <PerfilStep
                profile={profile}
                photo={photo}
                errors={errors}
                onUpdate={update}
                onToggle={toggleList}
                onPhoto={(url, file) => {setPhoto(url); setArquivoFoto(file);}}
                onContinue={nextFromProfile}
                aviso={avisoExistente}
              />
            )}
            {step === 'apadrinhado' && erroFormulario && <p className="form-error" role="alert">{erroFormulario}</p>}
            {step === 'apadrinhado' && (
              <ApadrinhadoStep
                profile={profile}
                errors={errors}
                onUpdate={update}
                onToggle={toggleList}
                onBack={() => setStep('escolha')}
                onContinue={nextFromDetails}
                perguntas={perguntasApadrinhado}
                onExtra={updateExtra}
              />
            )}
            {step === 'padrinho' && (
              <CandidaturaPadrinhoForm
                email={email}
                programa={programa}
                perfil={perfilParaSessao(profile)}
                onVoltar={() => setStep('escolha')}
                onEnviado={candidaturaEnviada}
              />
            )}
          </section>
        </main>
      </div>
    </div>
  );
}
