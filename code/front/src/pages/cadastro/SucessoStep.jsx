import Icon from '../../components/Icon';
import { InfoCard } from './partes';

export default function SucessoStep({ name, onProfile }) {
  return (
    <main className="success-page">
      <section className="success-card" aria-labelledby="success-title">
        <div className="success-hero">
          <div className="success-copy">
            <span className="success-eyebrow"><Icon name="check" size={15} /> CADASTRO ENVIADO</span>
            <h1 id="success-title">Cadastro enviado!</h1>
            <h2>Agora ele aguarda a aprovação da coordenação.</h2>
            <p>{name.split(' ')[0]}, suas informações foram enviadas com sucesso. Depois que a coordenação aprovar seu cadastro, ela vai usar seus dados para encontrar um padrinho compatível com você.</p>
          </div>
          <img src="/images/perfilcheck.png" alt="" />
        </div>
        <div className="success-info-grid">
          <InfoCard icon="clock" tone="blue" title="O que acontece agora?" text="A coordenação analisa seu cadastro. Após a aprovação, você entra na formação dos grupos." />
          <InfoCard icon="person" tone="purple" title="Acompanhe pelo perfil" text="Você poderá consultar o andamento do seu cadastro na área de perfil." />
          <InfoCard icon="spark" tone="orange" title="Fique de olho nas notificações!" text="Avisaremos por aqui quando seu padrinho estiver disponível." />
        </div>
        <button type="button" className="primary-button success-cta" onClick={onProfile}>Ir para meu perfil <Icon name="arrow" size={19} /></button>
      </section>
      <div className="success-footer-art" aria-hidden="true"><span>CONHECIMENTO<br />PESSOAS<br />OPORTUNIDADES<br />SEMPRE</span><div className="campus-shape"><i /><i /><i /><b>PUC MINAS</b></div><span className="footer-note">Mais conexões<br />para o seu amanhã.</span></div>
    </main>
  );
}
