import { useNavigate, useOutletContext } from 'react-router-dom';
import Icon from '../../components/Icon';
import { useToast } from '../../components/Toast';
import { EstadoCarregando, EstadoErro, EstadoVazio, PageHeader } from './partes';

const CHAT_EM_BREVE = 'O chat do Ajuda-aí chega em breve. Por enquanto, combine pelo e-mail institucional.';

function PessoaCard({ pessoa, destaque = false }) {
  return (
    <article className={`person-card${destaque ? ' featured' : ''}`}>
      <span className="person-avatar" aria-hidden="true">
        {pessoa.fotoUrl ? <img src={pessoa.fotoUrl} alt="" /> : pessoa.iniciais}
      </span>
      <div className="person-copy">
        <h2>{pessoa.nome}</h2>
        <p>{pessoa.curso}{pessoa.periodo ? ` · ${pessoa.periodo}º período` : ''}</p>
        {pessoa.grupo && <span className="group-pill"><Icon name="groups" size={14} /> {pessoa.grupo}</span>}
        {pessoa.interesses?.length > 0 && (
          <ul className="interest-chips" aria-label="Interesses">
            {pessoa.interesses.map((item) => <li key={item}>{item}</li>)}
          </ul>
        )}
      </div>
      <a className="person-mail" href={`mailto:${pessoa.email}`}><Icon name="mail" size={15} /> {pessoa.email}</a>
    </article>
  );
}

export default function PadrinhoPage() {
  const { situacao: dados, carregando, erro, recarregar } = useOutletContext();
  const navigate = useNavigate();
  const mostrarToast = useToast();

  if (carregando && !dados) return <EstadoCarregando texto="Carregando seu vínculo…" />;
  if (erro && !dados) return <EstadoErro mensagem={erro} onTentar={recarregar} />;

  const tipo = dados?.situacao;
  const formacao = dados?.programa?.etapas?.find((e) => e.id === 'formacao');

  if (tipo === 'padrinho_ativo') {
    const lista = dados.apadrinhados || [];
    return (
      <div className="aluno-page">
        <PageHeader titulo="Meus apadrinhados" subtitulo={dados.grupo ? `Você é padrinho(a) do ${dados.grupo} no ${dados.programa.titulo}.` : `Você é padrinho(a) no ${dados.programa.titulo}.`} />
        {lista.length === 0 ? (
          <EstadoVazio icon="groups" titulo="A coordenação está formando os grupos" texto={`Assim que seus apadrinhados forem definidos, eles aparecem aqui. Formação dos grupos: ${formacao?.periodoTexto || 'conforme o calendário do programa'}.`} />
        ) : (
          <>
            <div className="people-grid">
              {lista.map((pessoa) => <PessoaCard key={pessoa.email} pessoa={pessoa} />)}
            </div>
            <div className="bond-banner">
              <span className="bond-icon" aria-hidden="true"><Icon name="groups" size={28} /></span>
              <div>
                <strong>Seu grupo está ativo!</strong>
                <p>Apresente-se, combine o primeiro encontro e acompanhe seus apadrinhados ao longo do semestre.</p>
              </div>
              <button type="button" className="primary-button inline" onClick={() => mostrarToast(CHAT_EM_BREVE)}><Icon name="chat" size={17} /> Enviar mensagem</button>
            </div>
          </>
        )}
      </div>
    );
  }

  if (tipo === 'apadrinhado_ativo' && dados.padrinho) {
    const padrinho = dados.padrinho;
    return (
      <div className="aluno-page match-page">
        <section className="match-panel" aria-label="Seu padrinho">
          <header className="match-hero">
            <div>
              <h1>Seu padrinho foi definido!</h1>
              <p>Sua conexão no Ajuda-aí foi criada com sucesso. Agora você já pode iniciar essa jornada com seu padrinho!</p>
            </div>
            <span className="match-hero-art" aria-hidden="true"><Icon name="heart" size={28} /></span>
          </header>
          <div className="match-layout">
            <PessoaCard pessoa={padrinho} destaque />
            <section className="next-steps" aria-labelledby="proximos-passos">
              <h2 id="proximos-passos">Próximos passos</h2>
              <p>Aproveite para dar os primeiros passos na sua jornada!</p>
              <ol>
                <li><span className="step-num">1</span><Icon name="chat" size={20} /><span><strong>Envie sua primeira mensagem</strong><small>Que tal se apresentar e contar um pouco sobre você?</small></span></li>
                <li><span className="step-num">2</span><Icon name="person" size={20} /><span><strong>Conheça o perfil do seu padrinho</strong><small>Veja interesses, curso e o grupo de vocês.</small></span></li>
                <li><span className="step-num">3</span><Icon name="calendar" size={20} /><span><strong>Combine um primeiro encontro</strong><small>Vocês podem conversar no campus ou em um ambiente online.</small></span></li>
              </ol>
              <div className="next-steps-actions">
                <button type="button" className="primary-button" onClick={() => mostrarToast(CHAT_EM_BREVE)}><Icon name="chat" size={18} /> Enviar mensagem</button>
              </div>
            </section>
          </div>
          <div className="bond-banner">
            <span className="bond-icon" aria-hidden="true"><Icon name="groups" size={24} /></span>
            <div>
              <strong>Seu vínculo está ativo!</strong>
              <p>Agora você já pode conversar, participar de encontros e acompanhar as atividades do {padrinho.grupo || 'seu grupo'} no Ajuda-aí.</p>
            </div>
          </div>
        </section>
      </div>
    );
  }

  if (tipo === 'apadrinhado_pendente' || tipo === 'apadrinhado_rejeitado') {
    const rejeitado = tipo === 'apadrinhado_rejeitado';
    return (
      <div className="aluno-page">
        <PageHeader titulo="Meu padrinho" subtitulo={dados.programa?.titulo} />
        <EstadoVazio
          icon={rejeitado ? 'alert' : 'clock'}
          titulo={rejeitado ? 'Seu cadastro não foi aprovado' : 'Seu cadastro aguarda aprovação'}
          texto={rejeitado
            ? 'A coordenação não aprovou seu cadastro neste ciclo, por isso não haverá definição de padrinho.'
            : 'Depois que a coordenação aprovar seu cadastro, você entra na formação dos grupos e seu padrinho aparece aqui.'}
        >
          <button type="button" className="ghost-button" onClick={() => navigate('/aluno/candidatura')}>Acompanhar meu cadastro</button>
        </EstadoVazio>
      </div>
    );
  }

  if (tipo === 'apadrinhado_aguardando' || tipo === 'apadrinhado_ativo') {
    return (
      <div className="aluno-page">
        <PageHeader titulo="Meu padrinho" subtitulo={dados.programa?.titulo} />
        <EstadoVazio icon="userSearch" titulo="Seu padrinho ainda não foi definido" texto={`A coordenação está formando os grupos (${formacao?.periodoTexto || 'conforme o calendário do programa'}). Você será avisado(a) por aqui assim que o match for confirmado.`}>
          <button type="button" className="ghost-button" onClick={() => navigate('/aluno/candidatura')}>Acompanhar meu cadastro</button>
        </EstadoVazio>
      </div>
    );
  }

  return (
    <div className="aluno-page">
      <PageHeader titulo="Meu padrinho" subtitulo={dados?.programa?.titulo} />
      <EstadoVazio
        icon="users"
        titulo="Você ainda não tem vínculo no programa"
        texto={tipo?.startsWith('candidatura') ? 'Quando sua candidatura a padrinho for aprovada e os grupos formados, seus apadrinhados aparecem aqui.' : 'Participe do programa para ser conectado(a) a um padrinho ou a apadrinhados.'}
      >
        {tipo?.startsWith('candidatura')
          ? <button type="button" className="ghost-button" onClick={() => navigate('/aluno/candidatura')}>Ver status da candidatura</button>
          : <button type="button" className="primary-button inline" onClick={() => navigate('/?passo=escolha')}>Quero participar <Icon name="arrow" size={17} /></button>}
      </EstadoVazio>
    </div>
  );
}
