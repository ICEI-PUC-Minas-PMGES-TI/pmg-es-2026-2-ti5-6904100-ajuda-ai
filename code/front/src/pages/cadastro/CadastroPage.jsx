import { useEffect, useMemo, useState } from 'react';
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../../api/client';
import {
  EMAIL_PADRAO,
  emailDaUrl,
  iniciaisDe,
  lerSessaoAluno,
  nomeDoEmail,
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
  padrinho_ativo: 'padrinho ativo',
  apadrinhado_aguardando: 'apadrinhado aguardando padrinho',
  apadrinhado_ativo: 'apadrinhado com padrinho definido',
  concluido: 'participação concluída',
};

function perfilInicial(email, sessao) {
  const salvo = sessao?.email === email ? sessao.perfil : null;
  const padrao = email === EMAIL_PADRAO;
  return {
    name: salvo?.nome || (padrao ? 'Fernanda Soares' : nomeDoEmail(email)),
    email,
    course: salvo?.curso || CURSOS[0],
    period: salvo?.periodo ? `${salvo.periodo}º período` : padrao ? '6º período' : '1º período',
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
  const [sessao] = useState(() => lerSessaoAluno());
  const emailUrl = emailDaUrl(params);
  const email = emailUrl || sessao?.email || EMAIL_PADRAO;
  const refazer = params.has('refazer');
  const passoUrl = params.get('passo');
  const deveRedirecionar = Boolean(sessao) && !refazer && !passoUrl && (!emailUrl || emailUrl === sessao.email);

  const [step, setStep] = useState(() => (passoUrl === 'escolha' && sessao?.perfil && sessao.email === email ? 'escolha' : 'perfil'));
  const [profile, setProfile] = useState(() => perfilInicial(email, sessao));
  const [escolha, setEscolha] = useState(() => opcaoPadrao(periodoNumero(perfilInicial(email, sessao).period) || 1));
  const [photo, setPhoto] = useState('');
  const [errors, setErrors] = useState({});
  const [enviando, setEnviando] = useState(false);
  const [erroEnvio, setErroEnvio] = useState('');
  const [existente, setExistente] = useState(null);
  const perguntasApadrinhado = useFormularioPublico('apadrinhado');

  const periodo = periodoNumero(profile.period) || 1;

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [step]);

  useEffect(() => {
    if (deveRedirecionar) return undefined;
    let ativo = true;
    api.situacao(email)
      .then((dados) => {
        if (ativo && dados?.situacao && dados.situacao !== 'nenhuma') setExistente(dados);
      })
      .catch(() => {});
    return () => {
      ativo = false;
    };
  }, [email, deveRedirecionar]);

  const initials = useMemo(() => iniciaisDe(profile.name), [profile.name]);

  if (deveRedirecionar) {
    return <Navigate to="/aluno/perfil" replace />;
  }

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

  function nextFromProfile(event) {
    event.preventDefault();
    if (!profile.name.trim()) {
      setErrors({ name: true });
      return;
    }
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
    setErrors({});
    setStep(escolha === 'padrinho' ? 'padrinho' : 'apadrinhado');
  }

  function nextFromDetails(event) {
    event.preventDefault();
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
    const respostas = {
      ...perfilParaSessao(profile),
      genero: profile.gender,
      bolsistaProuni: paraBool(profile.prouni),
      deOutraCidade: paraBool(profile.otherCity),
      disponibilidade: profile.availability,
      areas: profile.supportAreas,
      expectativa: profile.expectation.trim(),
      outrasInformacoes: profile.additionalInfo.trim(),
      extras: limparExtras(perguntasApadrinhado, profile.extras),
    };
    setEnviando(true);
    setErroEnvio('');
    try {
      await api.cadastrarApadrinhado(email, respostas);
      salvarSessao('apadrinhado', respostas);
      setStep('sucesso');
    } catch (error) {
      setErroEnvio(error.message || 'Não foi possível enviar seu cadastro. Tente novamente.');
    } finally {
      setEnviando(false);
    }
  }

  function candidaturaEnviada(_registro, respostas) {
    salvarSessao('padrinho', respostas);
    mostrarToast('Candidatura enviada! Acompanhe o andamento por aqui.', 'sucesso');
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
          <section className={`form-card ${step !== 'perfil' ? 'details-card' : ''}`}>
            {step === 'perfil' && (
              <PerfilStep
                profile={profile}
                photo={photo}
                errors={errors}
                onUpdate={update}
                onToggle={toggleList}
                onPhoto={setPhoto}
                onContinue={nextFromProfile}
                aviso={avisoExistente}
              />
            )}
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
