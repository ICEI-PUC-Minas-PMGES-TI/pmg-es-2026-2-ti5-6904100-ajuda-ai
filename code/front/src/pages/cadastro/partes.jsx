import { cloneElement, isValidElement, useId } from 'react';
import { Link } from 'react-router-dom';
import Icon from '../../components/Icon';

export const CURSOS = [
  'Engenharia de Software',
  'Ciência da Computação',
  'Sistemas de Informação',
  'Engenharia de Computação',
];
export const INTERESSES = [
  'Tecnologia',
  'Inovação',
  'Projetos',
  'Estágio',
  'Pesquisa',
  'Empreendedorismo',
  'Esportes',
  'Eventos',
];
export const AREAS_APOIO = [
  'Rotina universitária',
  'Disciplinas e provas',
  'Projetos',
  'Tecnologia',
  'Carreira e estágio',
  'Vida no campus',
];
export const DISPONIBILIDADES = ['Manhã', 'Tarde', 'Noite', 'Fins de semana', 'Online'];
export const GENEROS = ['Feminino', 'Masculino', 'Não binário', 'Prefiro não informar'];
export const TURNOS = ['Manhã', 'Tarde', 'Noite'];
export const PERIODOS = Array.from({ length: 10 }, (_, index) => `${index + 1}º período`);

export const simNao = (valor) => (valor === true ? 'Sim' : valor === false ? 'Não' : '');
export const paraBool = (valor) => (valor === 'Sim' ? true : valor === 'Não' ? false : undefined);

export function Header({ name, onNotifications }) {
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
        <button type="button" className="icon-button notification-button" aria-label="Notificações" onClick={onNotifications}>
          <Icon name="bell" size={19} />
        </button>
        <div className="account-avatar" aria-hidden="true"><Icon name="person" size={16} /></div>
        <span className="account-name">{name}</span>
      </div>
    </header>
  );
}

export function SidePanel({ variant }) {
  const profile = variant === 'profile';
  return (
    <aside className={`side-panel ${profile ? 'side-profile' : 'side-connections'}`}>
      <span className="side-dash" />
      <h1>{profile ? <>Falta só<br />mais um passo!</> : <>Conexões<br />que impulsionam<br />seu futuro</>}</h1>
      <p>{profile ? 'Complete seu perfil para personalizar sua experiência no Ajuda-aí.' : 'Novos caminhos com o apoio certo ao seu lado.'}</p>
      <div className="side-note">{profile ? 'Conexões que impulsionam seu futuro' : 'Mais que apoio, novas histórias'}</div>
      <img className="side-illustration" src="/images/imghero.png" alt="" />
      <span className="side-footer">CONHECIMENTO<br />PESSOAS<br />OPORTUNIDADES<br />SEMPRE</span>
      <span className="side-footer-line" />
    </aside>
  );
}

export function StepHeading({ step, title, subtitle, onBack, progressTotal = 3 }) {
  return (
    <div className="step-heading">
      {onBack && <button type="button" className="back-link" onClick={onBack}><span aria-hidden="true">‹</span> Voltar</button>}
      <div className="heading-row">
        <div>
          <h2>{title}</h2>
          {subtitle && <p>{subtitle}</p>}
        </div>
        {step ? <Progress step={step} total={progressTotal} /> : null}
      </div>
    </div>
  );
}

export function Progress({ step, total = 3, label }) {
  return (
    <div className="progress-wrap" role="img" aria-label={`Passo ${step} de ${total}`}>
      <div className="progress-bars" aria-hidden="true">
        {Array.from({ length: total }, (_, index) => <span key={index} className={index < step ? 'active' : ''} />)}
      </div>
      <span aria-hidden="true">{label || `Passo ${step} de ${total}`}</span>
    </div>
  );
}

/**
 * Campo com rótulo, ícone e erro. Para controles compostos (MultiSelect),
 * use `grupo` para renderizar sem <label> (o controle usa aria-labelledby).
 */
export function Field({ label, icon, children, error, className = '', grupo = false, labelId, contador }) {
  const textoErro = typeof error === 'string' ? error : 'Preencha este campo para continuar.';
  const idGerado = useId();
  if (!grupo && isValidElement(children)) {
    const id = children.props.id || idGerado;
    return (
      <div className={`field-wrap ${className}`}>
        <label className="field-label" htmlFor={id}>{label}</label>
        <span className={`field ${error ? 'field-error' : ''}`}>
          {icon && <Icon name={icon} size={17} />}
          {cloneElement(children, { id })}
        </span>
        {contador}
        {error && <span className="error-message" role="alert">{textoErro}</span>}
      </div>
    );
  }
  if (grupo) {
    return (
      <div className={`field-wrap ${className}`}>
        <span className="field-label" id={labelId}>{label}</span>
        {children}
        {error && <span className="error-message">{textoErro}</span>}
      </div>
    );
  }
  return (
    <label className={`field-wrap ${className}`}>
      <span className="field-label">{label}</span>
      <span className={`field ${error ? 'field-error' : ''}`}>
        {icon && <Icon name={icon} size={17} />}
        {children}
      </span>
      {contador}
      {error && <span className="error-message" role="alert">{textoErro}</span>}
    </label>
  );
}

export function TextArea({ label, value, onChange, max, placeholder, error, className = '', required = false }) {
  const id = useId();
  const textoErro = typeof error === 'string' ? error : 'Preencha este campo para continuar.';
  return (
    <div className={`field-wrap ${className}`}>
      <label className="field-label" htmlFor={id}>{label}</label>
      <span className={`field textarea-field ${error ? 'field-error' : ''}`}>
        <textarea
          id={id}
          value={value}
          maxLength={max}
          placeholder={placeholder}
          rows={4}
          aria-required={required || undefined}
          aria-invalid={error ? true : undefined}
          onChange={(event) => onChange(event.target.value)}
        />
        <span className="char-count" aria-live="polite">{value.length}/{max}</span>
      </span>
      {error && <span className="error-message" role="alert">{textoErro}</span>}
    </div>
  );
}

export function InfoCard({ icon, tone, title, text }) {
  return <article className={`info-card ${tone}`}><span className="info-icon"><Icon name={icon} size={22} /></span><div><strong>{title}</strong><p>{text}</p></div></article>;
}
