import { useNavigate, useOutletContext } from 'react-router-dom';
import { api } from '../../api/client';
import Icon from '../../components/Icon';
import { useToast } from '../../components/Toast';
import { EstadoCarregando, EstadoErro, EstadoVazio } from './partes';

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
  const { situacao: dados, carregando, erro, recarregar, email } = useOutletContext();
  const navigate = useNavigate();
  const mostrarToast = useToast();

  if (carregando && !dados) return <EstadoCarregando texto="Carregando seu vínculo…" />;
  if (erro && !dados) return <EstadoErro mensagem={erro} onTentar={recarregar} />;

  async function abrirConversa(emailPessoa) {
    const alvo = String(emailPessoa || '').trim().toLowerCase();
    if (!alvo) {
      mostrarToast('O e-mail do vínculo ainda não está disponível.');
      return;
    }
    try {
      const conversas = await api.chats(email);
      const conversa = conversas.find((item) =>
        item.participantes?.some(
          (participante) => String(participante.email || '').trim().toLowerCase() === alvo,
        ),
      );
      if (!conversa) {
        navigate('/aluno/chat');
        mostrarToast('Não há uma conversa ativa com essa pessoa neste programa.');
        return;
      }
      navigate(`/aluno/chat?conversa=${encodeURIComponent(conversa.id)}`);
    } catch (falha) {
      mostrarToast(falha.message || 'Não foi possível abrir a conversa.');
    }
  }

  const tipo = dados?.situacao;
  const formacao = dados?.programa?.etapas?.find((e) => e.id === 'formacao');

  if (tipo === 'padrinho_ativo') {
    const lista = dados.apadrinhados || [];
    return (
      <div className="aluno-page match-page">
        <header className="status-intro">
          <span className="history-intro-icon" aria-hidden="true"><Icon name="groups" size={36} /></span>
          <div className="status-intro-copy">
            <h1>Meus apadrinhados</h1>
            <p>
              {dados.grupo
                ? `Você é padrinho(a) do ${dados.grupo} no ${dados.programa?.titulo || 'programa'}.`
                : `Você é padrinho(a) no ${dados.programa?.titulo || 'programa'}.`}
            </p>
          </div>
        </header>
        {lista.length === 0 ? (
          <EstadoVazio icon="groups" titulo="A coordenação está formando os grupos" texto={`Assim que seus apadrinhados forem definidos, eles aparecem aqui. Formação dos grupos: ${formacao?.periodoTexto || 'conforme o calendário do programa'}.`} />
        ) : (
          <>
            <section className="timeline-card" aria-label="Apadrinhados">
              <div className="timeline-card-head">
                <div>
                  <h2>Seu grupo</h2>
                  <p>{lista.length} apadrinhado(s) vinculado(s) a você.</p>
                </div>
              </div>
              <div className="people-grid">
                {lista.map((pessoa) => <PessoaCard key={pessoa.email} pessoa={pessoa} />)}
              </div>
            </section>
            <div className="status-foot">
              <div className="status-next">
                <span className="status-next-icon" aria-hidden="true"><Icon name="groups" size={22} /></span>
                <div>
                  <strong>Seu grupo está ativo!</strong>
                  <p>Apresente-se, combine o primeiro encontro e acompanhe seus apadrinhados ao longo do semestre.</p>
                </div>
                <button type="button" className="primary-button inline" onClick={() => navigate('/aluno/chat')}>
                  <Icon name="chat" size={17} /> Enviar mensagem
                </button>
              </div>
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
        <header className="status-intro">
          <span className="match-intro-art" aria-hidden="true"><Icon name="heart" size={34} /></span>
          <div className="status-intro-copy">
            <h1>Seu padrinho foi definido!</h1>
            <p>Sua conexão no Ajuda-aí foi criada com sucesso. Agora você já pode iniciar essa jornada com seu padrinho.</p>
          </div>
        </header>

        <section className="timeline-card match-board" aria-label="Seu padrinho">
          <div className="timeline-card-head">
            <div>
              <h2>Seu padrinho</h2>
              <p>Perfil e contatos para começar a conversa.</p>
            </div>
          </div>
          <PessoaCard pessoa={padrinho} destaque />

          <div className="match-steps-block">
            <div className="timeline-card-head">
              <div>
                <h2>Próximos passos</h2>
                <p>Aproveite para dar os primeiros passos na sua jornada.</p>
              </div>
            </div>
            <ol className="match-steps">
              <li>
                <span className="step-num">1</span>
                <Icon name="chat" size={18} />
                <span><strong>Envie sua primeira mensagem</strong><small>Apresente-se e conte um pouco sobre você.</small></span>
              </li>
              <li>
                <span className="step-num">2</span>
                <Icon name="person" size={18} />
                <span><strong>Conheça o perfil</strong><small>Veja interesses, curso e o grupo de vocês.</small></span>
              </li>
              <li>
                <span className="step-num">3</span>
                <Icon name="calendar" size={18} />
                <span><strong>Combine um encontro</strong><small>No campus ou em um ambiente online.</small></span>
              </li>
            </ol>
            <div className="next-steps-actions">
              <button type="button" className="primary-button" onClick={() => abrirConversa(padrinho.email)}>
                <Icon name="chat" size={18} /> Enviar mensagem
              </button>
            </div>
          </div>
        </section>

        <div className="status-foot">
          <div className="status-next">
            <span className="status-next-icon" aria-hidden="true"><Icon name="groups" size={22} /></span>
            <div>
              <strong>Seu vínculo está ativo!</strong>
              <p>Você já pode conversar, participar de encontros e acompanhar as atividades do {padrinho.grupo || 'seu grupo'} no Ajuda-aí.</p>
            </div>
          </div>
          <div className="deadline-box">
            <Icon name="mail" size={22} />
            <div>
              <strong>Contato do padrinho</strong>
              <p><a href={`mailto:${padrinho.email}`}>{padrinho.email}</a></p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (tipo === 'apadrinhado_pendente' || tipo === 'apadrinhado_rejeitado') {
    const rejeitado = tipo === 'apadrinhado_rejeitado';
    return (
      <div className="aluno-page match-page">
        <header className="status-intro">
          <span className="history-intro-icon" aria-hidden="true"><Icon name={rejeitado ? 'alert' : 'clock'} size={36} /></span>
          <div className="status-intro-copy">
            <h1>Meu padrinho</h1>
            <p>{dados.programa?.titulo || 'Acompanhe o andamento do seu cadastro.'}</p>
          </div>
        </header>
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
      <div className="aluno-page match-page">
        <header className="status-intro">
          <span className="history-intro-icon" aria-hidden="true"><Icon name="userSearch" size={36} /></span>
          <div className="status-intro-copy">
            <h1>Meu padrinho</h1>
            <p>{dados.programa?.titulo || 'Aguarde a formação dos grupos.'}</p>
          </div>
        </header>
        <EstadoVazio icon="userSearch" titulo="Seu padrinho ainda não foi definido" texto={`A coordenação está formando os grupos (${formacao?.periodoTexto || 'conforme o calendário do programa'}). Você será avisado(a) por aqui assim que o match for confirmado.`}>
          <button type="button" className="ghost-button" onClick={() => navigate('/aluno/candidatura')}>Acompanhar meu cadastro</button>
        </EstadoVazio>
      </div>
    );
  }

  return (
    <div className="aluno-page match-page">
      <header className="status-intro">
        <span className="history-intro-icon" aria-hidden="true"><Icon name="users" size={36} /></span>
        <div className="status-intro-copy">
          <h1>Meu padrinho</h1>
          <p>{dados?.programa?.titulo || 'Participe do programa para formar um vínculo.'}</p>
        </div>
      </header>
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
