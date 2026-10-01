import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';

const courses = [
  'Engenharia de Software',
  'Ciência da Computação',
  'Sistemas de Informação',
  'Engenharia de Computação',
];
const interests = [
  'Tecnologia',
  'Inovação',
  'Projetos',
  'Estágio',
  'Pesquisa',
  'Empreendedorismo',
  'Esportes',
  'Eventos',
];
const supportAreas = [
  'Rotina universitária',
  'Disciplinas e provas',
  'Projetos',
  'Tecnologia',
  'Carreira e estágio',
  'Vida no campus',
];

const iconPaths = {
  person: <><circle cx="12" cy="8" r="3.5" /><path d="M5 20c.5-3.3 3.1-5 7-5s6.5 1.7 7 5" /></>,
  mail: <><rect x="3" y="5" width="18" height="14" rx="2" /><path d="m4 7 8 6 8-6" /></>,
  school: <><path d="m2.5 9 9.5-5 9.5 5-9.5 5-9.5-5Z" /><path d="M6 11v5c3.5 2.5 8.5 2.5 12 0v-5M21.5 9v6" /></>,
  chart: <><path d="M4 20V12h4v8M10 20V7h4v13M16 20V3h4v17" /></>,
  moon: <path d="M20.4 15.4A8.5 8.5 0 0 1 8.6 3.6 8.5 8.5 0 1 0 20.4 15.4Z" />,
  tag: <><path d="M20 13 13 20l-9-9V4h7l9 9Z" /><circle cx="8" cy="8" r="1" /></>,
  clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
  pin: <><path d="M20 10c0 5-8 12-8 12S4 15 4 10a8 8 0 1 1 16 0Z" /><circle cx="12" cy="10" r="2.5" /></>,
  chat: <><path d="M20 11.5a7.5 7.5 0 0 1-8 7.5 8.5 8.5 0 0 1-3.5-.8L4 20l1.5-3.8A7 7 0 0 1 4 11.5 7.5 7.5 0 0 1 12 4a7.5 7.5 0 0 1 8 7.5Z" /><path d="M8 11h8M8 14h5" /></>,
  file: <><path d="M6 3h8l4 4v14H6z" /><path d="M14 3v5h5M9 12h6M9 16h6" /></>,
  bell: <><path d="M18 9a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4" /></>,
  edit: <><path d="m15 5 4 4M4 20l4-.8L19 8a2.8 2.8 0 0 0-4-4L4 15v5Z" /></>,
  camera: <><path d="M4 8h3l2-3h6l2 3h3v11H4z" /><circle cx="12" cy="13" r="3.5" /></>,
  check: <path d="m5 12 4 4L19 6" />,
  arrow: <><path d="M5 12h14M13 6l6 6-6 6" /></>,
  info: <><circle cx="12" cy="12" r="9" /><path d="M12 11v5M12 8h.01" /></>,
  spark: <><path d="m12 3 1.5 6.5L20 12l-6.5 1.5L12 20l-1.5-6.5L4 12l6.5-2.5L12 3Z" /><path d="m19 3 .5 2.5L22 6l-2.5.5L19 9l-.5-2.5L16 6l2.5-.5L19 3Z" /></>,
};

function Icon({ name, size = 18, className = '' }) {
  return (
    <svg
      aria-hidden="true"
      className={`icon ${className}`}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {iconPaths[name]}
    </svg>
  );
}

function CadastroPage() {
  const [step, setStep] = useState(1);
  const [profile, setProfile] = useState({
    name: 'Fernanda Soares',
    email: 'fernanda.soares@pucminas.edu.br',
    course: courses[0],
    period: '6º período',
    shift: 'Noite',
    interests: ['Tecnologia', 'Inovação', 'Projetos'],
    gender: '',
    prouni: '',
    otherCity: '',
    availability: '',
    supportAreas: [],
    expectation: '',
    additionalInfo: '',
  });
  const [photo, setPhoto] = useState('');
  const [errors, setErrors] = useState({});
  const [toast, setToast] = useState('');

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [step]);

  const initials = useMemo(
    () => profile.name.split(' ').filter(Boolean).slice(0, 2).map((part) => part[0]).join('').toUpperCase(),
    [profile.name],
  );

  function update(key, value) {
    setProfile((current) => ({ ...current, [key]: value }));
    setErrors((current) => ({ ...current, [key]: false }));
  }

  function toggleList(key, value) {
    const current = profile[key];
    update(key, current.includes(value) ? current.filter((item) => item !== value) : [...current, value]);
  }

  function showToast(message) {
    setToast(message);
    window.setTimeout(() => setToast(''), 2600);
  }

  function nextFromProfile(event) {
    event.preventDefault();
    if (!profile.name.trim()) {
      setErrors({ name: true });
      return;
    }
    setErrors({});
    setStep(2);
  }

  function nextFromDetails(event) {
    event.preventDefault();
    const nextErrors = {
      gender: !profile.gender,
      prouni: !profile.prouni,
      otherCity: !profile.otherCity,
      availability: !profile.availability,
      supportAreas: profile.supportAreas.length === 0,
      expectation: !profile.expectation.trim(),
    };
    setErrors(nextErrors);
    if (Object.values(nextErrors).some(Boolean)) return;
    setStep(3);
  }

  function submitRegistration() {
    // O endpoint de cadastro ainda não existe no backend; os dados permanecem
    // nesta sessão até a integração do fluxo de inscrição.
    setStep(4);
  }

  function backToDetails() {
    setStep(2);
  }

  return (
    <div className="app-shell">
      <Header name={profile.name} onNotifications={() => showToast('As notificações aparecerão por aqui.')} />

      {step < 3 ? (
        <div className="signup-layout">
          <SidePanel variant={step === 1 ? 'profile' : 'connections'} />
          <main className="form-stage">
            <section className={`form-card ${step === 2 ? 'details-card' : ''}`}>
              {step === 1 ? (
                <ProfileStep
                  profile={profile}
                  photo={photo}
                  errors={errors}
                  onUpdate={update}
                  onToggle={toggleList}
                  onPhoto={setPhoto}
                  onContinue={nextFromProfile}
                />
              ) : (
                <DetailsStep
                  profile={profile}
                  errors={errors}
                  onUpdate={update}
                  onToggle={toggleList}
                  onBack={() => setStep(1)}
                  onContinue={nextFromDetails}
                />
              )}
            </section>
          </main>
        </div>
      ) : step === 3 ? (
        <ReviewStep profile={profile} initials={initials} onBack={backToDetails} onEditProfile={() => setStep(1)} onSubmit={submitRegistration} />
      ) : (
        <SuccessStep name={profile.name} onProfile={() => showToast('Seu cadastro está pronto para acompanhar pelo perfil.')} />
      )}

      {toast && <div className="toast" role="status">{toast}</div>}
    </div>
  );
}

function Header({ name, onNotifications }) {
  return (
    <header className="topbar">
      <div className="brand-lockup">
        <img src="/images/logo.png" alt="Ajuda-aí" className="brand-logo" />
        <span className="brand-divider" />
        <img src="/images/puclogo.png" alt="PUC Minas" className="puc-logo" />
      </div>
      <div className="account-actions">
        <Link to="/login" className="coord-entry-link">
          Área da coordenação
        </Link>
        <button className="icon-button notification-button" aria-label="Notificações" onClick={onNotifications}>
          <Icon name="bell" size={19} />
        </button>
        <div className="account-avatar"><Icon name="person" size={16} /></div>
        <span className="account-name">{name}</span>
        <span className="account-chevron">⌄</span>
      </div>
    </header>
  );
}

function SidePanel({ variant }) {
  const profile = variant === 'profile';
  return (
    <aside className={`side-panel ${profile ? 'side-profile' : 'side-connections'}`}>
      <span className="side-dash" />
      <h1>{profile ? <>Falta só<br />mais um passo!</> : <>Conexões<br />que impulsionam<br />seu futuro</>}</h1>
      <p>{profile ? 'Complete seu perfil para personalizar sua experiência no Ajuda-aí.' : 'Novos caminhos com o apoio certo ao seu lado.'}</p>
      <div className="side-note">{profile ? 'Conexões que impulsionam seu futuro' : 'Conhecimento, pessoas e oportunidades sempre'}</div>
      <img className="side-illustration" src="/images/imghero.png" alt="Símbolo de formação acadêmica" />
      <span className="side-footer">CONHECIMENTO<br />PESSOAS<br />OPORTUNIDADES<br />SEMPRE</span>
      <span className="side-footer-line" />
    </aside>
  );
}

function StepHeading({ step, title, subtitle, onBack, progressTotal = 3 }) {
  return (
    <div className="step-heading">
      {onBack && <button className="back-link" onClick={onBack}><span>‹</span> Voltar</button>}
      <div className="heading-row">
        <div>
          <h2>{title}</h2>
          <p>{subtitle}</p>
        </div>
        <Progress step={step} total={progressTotal} />
      </div>
    </div>
  );
}

function Progress({ step, total }) {
  return (
    <div className="progress-wrap" aria-label={`Passo ${step} de ${total}`}>
      <div className="progress-bars">
        {Array.from({ length: total }, (_, index) => <span key={index} className={index < step ? 'active' : ''} />)}
      </div>
      <span>Passo {step} de {total}</span>
    </div>
  );
}

function Field({ label, icon, children, error, className = '' }) {
  return (
    <label className={`field-wrap ${className}`}>
      <span className="field-label">{label}</span>
      <span className={`field ${error ? 'field-error' : ''}`}>
        {icon && <Icon name={icon} size={17} />}
        {children}
      </span>
      {error && <span className="error-message">Preencha este campo para continuar.</span>}
    </label>
  );
}

function ProfileStep({ profile, photo, errors, onUpdate, onToggle, onPhoto, onContinue }) {
  const [interestToAdd, setInterestToAdd] = useState('');
  const availableInterests = interests.filter((item) => !profile.interests.includes(item));
  function addInterest(event) {
    const value = event.target.value;
    setInterestToAdd('');
    if (value) onToggle('interests', value);
  }

  return (
    <form onSubmit={onContinue}>
      <StepHeading step={1} progressTotal={2} title="Complete seu perfil" subtitle="Essas informações serão usadas para personalizar sua experiência no Ajuda-aí e conectar você a oportunidades, pessoas e conteúdos relevantes." />

      <div className="profile-intro-row">
        <label className="photo-picker">
          <input type="file" accept="image/*" onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) onPhoto(URL.createObjectURL(file));
          }} />
          <span className="photo-circle">
            {photo ? <img src={photo} alt="Foto de perfil" /> : <Icon name="person" size={37} />}
            <span className="camera-badge"><Icon name="camera" size={14} /></span>
          </span>
          <span className="photo-link">Adicionar foto</span>
        </label>
        <div className="photo-tip"><Icon name="info" size={18} /><span>Uma boa foto ajuda outras pessoas a te reconhecerem no Ajuda-aí.</span></div>
      </div>

      <div className="field-grid">
        <Field label="Nome completo" icon="person" error={errors.name}>
          <input value={profile.name} onChange={(event) => onUpdate('name', event.target.value)} placeholder="Seu nome completo" />
        </Field>
        <Field label="E-mail institucional" icon="mail">
          <input value={profile.email} disabled />
        </Field>
        <Field label="Curso" icon="school">
          <select value={profile.course} onChange={(event) => onUpdate('course', event.target.value)}>
            {courses.map((course) => <option key={course}>{course}</option>)}
          </select>
        </Field>
        <Field label="Período atual" icon="chart">
          <select value={profile.period} onChange={(event) => onUpdate('period', event.target.value)}>
            {Array.from({ length: 10 }, (_, index) => `${index + 1}º período`).map((period) => <option key={period}>{period}</option>)}
          </select>
        </Field>
        <Field label="Turno" icon="moon">
          <select value={profile.shift} onChange={(event) => onUpdate('shift', event.target.value)}>
            {['Manhã', 'Tarde', 'Noite'].map((shift) => <option key={shift}>{shift}</option>)}
          </select>
        </Field>
        <div className="field-wrap interest-field">
          <span className="field-label">Interesses (opcional)</span>
          <div className="field interest-control">
            <Icon name="tag" size={17} />
            <div className="chips">
              {profile.interests.map((item) => <button type="button" key={item} className="chip" onClick={() => onToggle('interests', item)}>{item}<span>×</span></button>)}
              <select aria-label="Adicionar interesse" value={interestToAdd} onChange={addInterest}>
                <option value="">Adicionar assunto</option>
                {availableInterests.map((item) => <option key={item}>{item}</option>)}
              </select>
            </div>
            <span className="select-chevron">⌄</span>
          </div>
          <span className="field-hint">Selecione assuntos que você gosta ou tem interesse.</span>
        </div>
      </div>

      <button className="primary-button" type="submit">Continuar <Icon name="arrow" size={18} /></button>
    </form>
  );
}

function DetailsStep({ profile, errors, onUpdate, onToggle, onBack, onContinue }) {
  return (
    <form onSubmit={onContinue}>
      <StepHeading step={2} title="Conte sobre você" subtitle="Suas respostas ajudam a encontrar um padrinho compatível." onBack={onBack} />
      <div className="match-notice"><Icon name="info" size={19} /><div><strong>Como encontramos seu padrinho</strong><p>Comparamos suas respostas e interesses com os dos padrinhos. A coordenação confirma o match para você.</p></div></div>
      <div className="field-grid detail-grid">
        <Field label="Gênero" icon="person" error={errors.gender}>
          <select value={profile.gender} onChange={(event) => onUpdate('gender', event.target.value)}>
            <option value="">Selecione</option><option>Feminino</option><option>Masculino</option><option>Não binário</option><option>Prefiro não informar</option>
          </select>
        </Field>
        <Field label="É bolsista ProUni?" icon="school" error={errors.prouni}>
          <select value={profile.prouni} onChange={(event) => onUpdate('prouni', event.target.value)}><option value="">Selecione</option><option>Sim</option><option>Não</option></select>
        </Field>
        <Field label="É de outra cidade?" icon="pin" error={errors.otherCity}>
          <select value={profile.otherCity} onChange={(event) => onUpdate('otherCity', event.target.value)}><option value="">Selecione</option><option>Sim</option><option>Não</option></select>
        </Field>
        <Field label="Disponibilidade de horários" icon="clock" error={errors.availability}>
          <select value={profile.availability} onChange={(event) => onUpdate('availability', event.target.value)}><option value="">Selecione</option><option>Manhã</option><option>Tarde</option><option>Noite</option><option>Fins de semana</option></select>
        </Field>
        <div className="field-wrap span-two">
          <span className="field-label">Áreas em que gostaria de receber apoio</span>
          <div className={`area-options ${errors.supportAreas ? 'field-error' : ''}`}>
            {supportAreas.map((area) => <button type="button" key={area} className={`area-chip ${profile.supportAreas.includes(area) ? 'selected' : ''}`} onClick={() => onToggle('supportAreas', area)}>{profile.supportAreas.includes(area) && <Icon name="check" size={13} />}{area}</button>)}
          </div>
          {errors.supportAreas && <span className="error-message">Selecione pelo menos uma área.</span>}
        </div>
        <Field label="O que você espera do seu padrinho?" icon="chat" error={errors.expectation} className="span-two">
          <input value={profile.expectation} onChange={(event) => onUpdate('expectation', event.target.value)} placeholder="Ex.: ajuda na adaptação à universidade" />
        </Field>
        <Field label="Outras informações (opcional)" icon="file" className="span-two">
          <input value={profile.additionalInfo} onChange={(event) => onUpdate('additionalInfo', event.target.value)} placeholder="Algo mais que seu padrinho deveria saber?" />
        </Field>
      </div>
      <button className="primary-button" type="submit">Continuar <Icon name="arrow" size={18} /></button>
    </form>
  );
}

function ReviewStep({ profile, initials, onBack, onEditProfile, onSubmit }) {
  const items = [
    { icon: 'person', title: 'Gênero', value: profile.gender, edit: onBack },
    { icon: 'school', title: 'É bolsista ProUni?', value: profile.prouni, edit: onBack },
    { icon: 'pin', title: 'É de outra cidade?', value: profile.otherCity, edit: onBack },
    { icon: 'clock', title: 'Disponibilidade de horários', value: profile.availability, edit: onBack },
    { icon: 'tag', title: 'Áreas em que gostaria de receber apoio', value: profile.supportAreas.join(', '), edit: onBack },
    { icon: 'chat', title: 'O que você espera do seu padrinho?', value: profile.expectation, edit: onBack },
    { icon: 'file', title: 'Outras informações', value: profile.additionalInfo || 'Não informado', edit: onBack },
  ];

  return (
    <main className="review-page">
      <div className="review-card">
        <SidePanel variant="connections" />
        <section className="review-content">
          <div className="review-topline"><button className="back-link" onClick={onBack}><span>‹</span> Voltar</button><Progress step={3} total={3} /></div>
          <h1>Revise suas informações</h1>
          <p className="review-subtitle">Confira os dados do seu cadastro antes de enviar para encontrar um padrinho compatível.</p>
          <div className="review-grid">
            <div className="review-person">
              <div className="review-avatar">{initials}</div>
              <div><strong>{profile.name}</strong><span>{profile.course} • {profile.period}</span><span>{profile.email}</span></div>
              <button className="edit-icon" onClick={onEditProfile} aria-label="Editar perfil"><Icon name="edit" size={16} /></button>
            </div>
            {items.map((item) => <ReviewItem key={item.title} {...item} />)}
          </div>
          <div className="review-notice"><Icon name="info" size={20} /><span>Após o envio, suas informações serão usadas para encontrar um padrinho compatível. Você poderá ver seu padrinho assim que a coordenação confirmar o match.</span></div>
          <button className="primary-button" onClick={onSubmit}>Enviar cadastro <Icon name="arrow" size={19} /></button>
        </section>
      </div>
    </main>
  );
}

function ReviewItem({ icon, title, value, edit }) {
  return (
    <article className="review-item">
      <span className="review-item-icon"><Icon name={icon} size={19} /></span>
      <span className="review-item-copy"><strong>{title}</strong><span title={value}>{value || 'Não informado'}</span></span>
      <button className="edit-icon" onClick={edit} aria-label={`Editar ${title}`}><Icon name="edit" size={16} /></button>
    </article>
  );
}

function SuccessStep({ name, onProfile }) {
  return (
    <main className="success-page">
      <section className="success-card">
        <div className="success-hero">
          <div className="success-copy"><span className="success-eyebrow"><Icon name="check" size={15} /> INSCRIÇÃO ENVIADA</span><h1>Cadastro concluído!</h1><h2>Agora é só aguardar o seu match.</h2><p>{name.split(' ')[0]}, suas informações foram enviadas com sucesso. A coordenação do programa vai usar seus dados para encontrar um padrinho compatível com você.</p></div>
          <img src="/images/perfilcheck.png" alt="Cadastro confirmado" />
        </div>
        <div className="success-info-grid">
          <InfoCard icon="clock" tone="blue" title="O que acontece agora?" text="Em breve você será notificado(a) assim que um padrinho for definido." />
          <InfoCard icon="person" tone="purple" title="Acompanhe pelo perfil" text="Você poderá consultar o andamento do seu cadastro na área de perfil." />
          <InfoCard icon="spark" tone="orange" title="Fique de olho nas notificações!" text="Avisaremos por aqui quando seu padrinho estiver disponível." />
        </div>
        <button className="primary-button success-cta" onClick={onProfile}>Ir para meu perfil <Icon name="arrow" size={19} /></button>
      </section>
      <div className="success-footer-art"><span>CONHECIMENTO<br />PESSOAS<br />OPORTUNIDADES<br />SEMPRE</span><div className="campus-shape"><i /><i /><i /><b>PUC MINAS</b></div><span className="footer-note">Mais conexões<br />para o seu amanhã.</span></div>
    </main>
  );
}

function InfoCard({ icon, tone, title, text }) {
  return <article className={`info-card ${tone}`}><span className="info-icon"><Icon name={icon} size={22} /></span><div><strong>{title}</strong><p>{text}</p></div></article>;
}

export default CadastroPage;
