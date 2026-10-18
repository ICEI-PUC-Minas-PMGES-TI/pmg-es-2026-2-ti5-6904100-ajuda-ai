import Icon from '../../components/Icon';
import { textoResposta, formularioSuportado, ERRO_FORMULARIO_NAO_SUPORTADO } from '../../components/PerguntasAdicionais';
import { Progress, SidePanel } from './partes';

export default function RevisaoStep({ profile, initials, perguntas, onBack, onEditProfile, onSubmit, enviando, erro }) {
  if (!formularioSuportado(perguntas)) return <p role="alert" className="form-error">{ERRO_FORMULARIO_NAO_SUPORTADO}</p>;
  const items = [
    { icon: 'person', title: 'Gênero', value: profile.gender },
    { icon: 'school', title: 'É bolsista ProUni?', value: profile.prouni },
    { icon: 'pin', title: 'É de outra cidade?', value: profile.otherCity },
    { icon: 'clock', title: 'Disponibilidade de horários', value: profile.availability.join(', ') },
    { icon: 'tag', title: 'Áreas em que gostaria de receber apoio', value: profile.supportAreas.join(', ') },
    { icon: 'chat', title: 'O que você espera do seu padrinho?', value: profile.expectation },
    { icon: 'file', title: 'Outras informações', value: profile.additionalInfo || 'Não informado' },
    ...perguntas
      .map((p) => ({ icon: 'form', title: p.enunciado, value: textoResposta(profile.extras[p.id]) || 'Não respondido' })),
  ];

  return (
    <main className="review-page">
      <div className="review-card">
        <SidePanel variant="connections" />
        <section className="review-content" aria-labelledby="review-title">
          <div className="review-topline"><button type="button" className="back-link" onClick={onBack}><span aria-hidden="true">‹</span> Voltar</button><Progress step={3} total={3} /></div>
          <h1 id="review-title">Revise suas informações</h1>
          <p className="review-subtitle">Confira os dados do seu cadastro antes de enviar para encontrar um padrinho compatível.</p>
          <div className="review-grid">
            <div className="review-person">
              <div className="review-avatar" aria-hidden="true">{initials}</div>
              <div><strong>{profile.name}</strong><span>{profile.course} • {profile.period}</span><span>{profile.email}</span></div>
              <button type="button" className="edit-icon" onClick={onEditProfile} aria-label="Editar perfil"><Icon name="edit" size={16} /></button>
            </div>
            {items.map((item) => <ReviewItem key={item.title} {...item} edit={onBack} />)}
          </div>
          <div className="review-notice"><Icon name="info" size={20} /><span>Após o envio, suas informações serão usadas para encontrar um padrinho compatível. Você poderá ver seu padrinho assim que a coordenação confirmar o match.</span></div>
          {erro && <p className="form-error" role="alert"><Icon name="alert" size={16} /> {erro}</p>}
          <button type="button" className="primary-button" onClick={onSubmit} disabled={enviando} aria-busy={enviando}>
            {enviando ? 'Enviando cadastro…' : 'Enviar cadastro'} <Icon name="arrow" size={19} />
          </button>
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
      <button type="button" className="edit-icon" onClick={edit} aria-label={`Editar ${title}`}><Icon name="edit" size={16} /></button>
    </article>
  );
}
