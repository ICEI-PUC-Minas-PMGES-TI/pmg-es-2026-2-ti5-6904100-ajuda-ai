import { useNavigate, useOutletContext } from "react-router-dom";
import Icon from "../../components/Icon";
import { EstadoCarregando, EstadoErro, EstadoVazio } from "./partes";
import { ESTADOS_ALUNO } from "../../auth/resolverAluno";

function PessoaCard({ pessoa, destaque = false, onConversar, onGrupo }) {
  return (
    <article className={`person-card${destaque ? " featured" : ""}`}>
      <span className="person-avatar" aria-hidden="true">
        {pessoa.fotoUrl ? <img src={pessoa.fotoUrl} alt="" /> : pessoa.iniciais}
      </span>
      <div className="person-copy">
        <h2>{pessoa.nome}</h2>
        <p>
          {pessoa.curso}
          {pessoa.periodo ? ` · ${pessoa.periodo}º período` : ""}
        </p>
        {pessoa.grupo && (
          <span className="group-pill">
            <Icon name="groups" size={14} /> {pessoa.grupo}
          </span>
        )}
        {pessoa.interesses?.length > 0 && (
          <ul className="interest-chips" aria-label="Interesses">
            {pessoa.interesses.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        )}
      </div>
      <a className="person-mail" href={`mailto:${pessoa.email}`}>
        <Icon name="mail" size={15} /> {pessoa.email}
      </a>
      {onConversar && (
        <button
          type="button"
          className="primary-button inline"
          onClick={onConversar}
        >
          <Icon name="chat" size={16} /> Conversar
        </button>
      )}
      {onGrupo && (
        <button type="button" className="outline-button" onClick={onGrupo}>
          <Icon name="groups" size={16} /> Conversa do grupo
        </button>
      )}
    </article>
  );
}

export default function PadrinhoPage() {
  const { situacao: dados, carregando, erro, recarregar } = useOutletContext();
  const navigate = useNavigate();
  return (
    <VinculosAlunoView {...{ dados, carregando, erro, recarregar, navigate }} />
  );
}

export function VinculosAlunoView({
  dados,
  carregando = false,
  erro,
  recarregar,
  navigate = () => {},
}) {
  const podeConversar =
    dados?.podeConversar !== false &&
    dados?.programa?.etapaAtual !== "encerramento";
  const padrinhos = Array.isArray(dados?.padrinhos)
    ? dados.padrinhos
    : dados?.padrinho
      ? [dados.padrinho]
      : [];
  const conversar = (pessoa) =>
    navigate(
      `/aluno/chat?${pessoa.vinculoId ? `vinculo=${pessoa.vinculoId}` : `pessoa=${encodeURIComponent(pessoa.email)}`}`,
    );
  const grupo = (pessoa) =>
    navigate(`/aluno/chat${pessoa?.grupoId ? `?grupo=${pessoa.grupoId}` : ""}`);

  if (carregando && !dados)
    return <EstadoCarregando texto="Carregando seu vínculo…" />;
  if (erro && !dados)
    return <EstadoErro mensagem={erro} onTentar={recarregar} />;

  const tipo = dados?.situacao;
  const formacao = dados?.programa?.etapas?.find((e) => e.id === "formacao");
  if (!tipo || !Object.hasOwn(ESTADOS_ALUNO, tipo))
    return (
      <EstadoErro
        mensagem="Não foi possível confirmar sua participação. Atualize a consulta."
        onTentar={recarregar}
      />
    );
  if (tipo === "concluido")
    return (
      <div className="aluno-page match-page">
        <h1>Participação encerrada</h1>
        <EstadoVazio
          icon="history"
          titulo="Este ciclo foi encerrado"
          texto="Consulte as conversas e o histórico dos seus períodos de participação."
        >
          <button
            type="button"
            className="outline-button"
            onClick={() => navigate("/aluno/chat")}
          >
            Ver conversas e histórico
          </button>
        </EstadoVazio>
      </div>
    );
  if (tipo === "candidatura_aprovada_aguardando_matching")
    return (
      <div className="aluno-page match-page">
        <h1>Meus apadrinhados</h1>
        <EstadoVazio
          icon="clock"
          titulo="Candidatura aprovada — aguardando vínculos"
          texto="Você continua participando do feed. Seus apadrinhados aparecem aqui quando a coordenação confirmar os vínculos."
        >
          <button type="button" className="outline-button" onClick={recarregar}>
            Atualizar vínculos
          </button>
        </EstadoVazio>
      </div>
    );

  if (tipo === "padrinho_ativo") {
    const lista = dados.apadrinhados || [];
    return (
      <div className="aluno-page match-page">
        <header className="status-intro">
          <span className="history-intro-icon" aria-hidden="true">
            <Icon name="groups" size={36} />
          </span>
          <div className="status-intro-copy">
            <h1>Meus apadrinhados</h1>
            <p>
              {dados.grupo
                ? `Você é padrinho(a) do ${dados.grupo} no ${dados.programa?.titulo || "programa"}.`
                : `Você é padrinho(a) no ${dados.programa?.titulo || "programa"}.`}
            </p>
          </div>
        </header>
        {lista.length === 0 ? (
          <EstadoVazio
            icon="groups"
            titulo="A coordenação está formando os grupos"
            texto={`Assim que seus apadrinhados forem definidos, eles aparecem aqui. Formação dos grupos: ${formacao?.periodoTexto || "conforme o calendário do programa"}.`}
          />
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
                {lista.map((pessoa) => (
                  <PessoaCard
                    key={pessoa.email}
                    pessoa={pessoa}
                    onConversar={
                      podeConversar ? () => conversar(pessoa) : undefined
                    }
                    onGrupo={
                      podeConversar && pessoa.grupoId
                        ? () => grupo(pessoa)
                        : undefined
                    }
                  />
                ))}
              </div>
            </section>
            <div className="status-foot">
              <div className="status-next">
                <span className="status-next-icon" aria-hidden="true">
                  <Icon name="groups" size={22} />
                </span>
                <div>
                  <strong>Seu grupo está ativo!</strong>
                  <p>
                    Apresente-se, combine o primeiro encontro e acompanhe seus
                    apadrinhados ao longo do semestre.
                  </p>
                </div>
                <button
                  type="button"
                  className="primary-button inline"
                  disabled={!podeConversar}
                  onClick={() => grupo(lista[0])}
                >
                  <Icon name="chat" size={17} /> Enviar mensagem
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    );
  }

  if (tipo === "apadrinhado_ativo" && padrinhos.length > 1)
    return (
      <div className="aluno-page match-page">
        <header className="status-intro">
          <div>
            <h1>Meus padrinhos</h1>
            <p>
              {padrinhos.length} vínculos confirmados no{" "}
              {dados.programa?.titulo || "programa"}. Cada vínculo tem sua
              conversa privada e seu grupo.
            </p>
          </div>
        </header>
        {!podeConversar && (
          <p role="status">
            As conversas estão disponíveis somente para consulta neste momento.
          </p>
        )}
        <section className="people-grid" aria-label="Padrinhos vinculados">
          {padrinhos.map((pessoa) => (
            <PessoaCard
              key={pessoa.vinculoId || pessoa.email}
              pessoa={pessoa}
              onConversar={podeConversar ? () => conversar(pessoa) : undefined}
              onGrupo={
                podeConversar && pessoa.grupoId
                  ? () => grupo(pessoa)
                  : undefined
              }
            />
          ))}
        </section>
      </div>
    );
  if (tipo === "apadrinhado_ativo" && padrinhos.length) {
    const padrinho = padrinhos[0];
    return (
      <div className="aluno-page match-page">
        <header className="status-intro">
          <span className="match-intro-art" aria-hidden="true">
            <Icon name="heart" size={34} />
          </span>
          <div className="status-intro-copy">
            <h1>Seu padrinho foi definido!</h1>
            <p>
              Sua conexão no Ajuda-aí foi criada com sucesso. Agora você já pode
              iniciar essa jornada com seu padrinho.
            </p>
          </div>
        </header>

        <section
          className="timeline-card match-board"
          aria-label="Seu padrinho"
        >
          <div className="timeline-card-head">
            <div>
              <h2>Seu padrinho</h2>
              <p>Perfil e contatos para começar a conversa.</p>
            </div>
          </div>
          <PessoaCard
            pessoa={padrinho}
            destaque
            onGrupo={
              podeConversar && padrinho.grupoId
                ? () => grupo(padrinho)
                : undefined
            }
          />

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
                <span>
                  <strong>Envie sua primeira mensagem</strong>
                  <small>Apresente-se e conte um pouco sobre você.</small>
                </span>
              </li>
              <li>
                <span className="step-num">2</span>
                <Icon name="person" size={18} />
                <span>
                  <strong>Conheça o perfil</strong>
                  <small>Veja interesses, curso e o grupo de vocês.</small>
                </span>
              </li>
              <li>
                <span className="step-num">3</span>
                <Icon name="calendar" size={18} />
                <span>
                  <strong>Combine um encontro</strong>
                  <small>No campus ou em um ambiente online.</small>
                </span>
              </li>
            </ol>
            <div className="next-steps-actions">
              <button
                type="button"
                className="primary-button"
                disabled={!podeConversar}
                onClick={() =>
                  navigate(
                    `/aluno/chat?${padrinho.vinculoId ? `vinculo=${padrinho.vinculoId}` : `pessoa=${encodeURIComponent(padrinho.email)}`}`,
                  )
                }
              >
                <Icon name="chat" size={18} /> Enviar mensagem
              </button>
            </div>
          </div>
        </section>

        <div className="status-foot">
          <div className="status-next">
            <span className="status-next-icon" aria-hidden="true">
              <Icon name="groups" size={22} />
            </span>
            <div>
              <strong>Seu vínculo está ativo!</strong>
              <p>
                Você já pode conversar, participar de encontros e acompanhar as
                atividades do {padrinho.grupo || "seu grupo"} no Ajuda-aí.
              </p>
            </div>
          </div>
          <div className="deadline-box">
            <Icon name="mail" size={22} />
            <div>
              <strong>Contato do padrinho</strong>
              <p>
                <a href={`mailto:${padrinho.email}`}>{padrinho.email}</a>
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (tipo === "apadrinhado_pendente" || tipo === "apadrinhado_rejeitado") {
    const rejeitado = tipo === "apadrinhado_rejeitado";
    return (
      <div className="aluno-page match-page">
        <header className="status-intro">
          <span className="history-intro-icon" aria-hidden="true">
            <Icon name={rejeitado ? "alert" : "clock"} size={36} />
          </span>
          <div className="status-intro-copy">
            <h1>Meu padrinho</h1>
            <p>
              {dados.programa?.titulo ||
                "Acompanhe o andamento do seu cadastro."}
            </p>
          </div>
        </header>
        <EstadoVazio
          icon={rejeitado ? "alert" : "clock"}
          titulo={
            rejeitado
              ? "Seu cadastro não foi aprovado"
              : "Seu cadastro aguarda aprovação"
          }
          texto={
            rejeitado
              ? "A coordenação não aprovou seu cadastro neste ciclo, por isso não haverá definição de padrinho."
              : "Depois que a coordenação aprovar seu cadastro, você entra na formação dos grupos e seu padrinho aparece aqui."
          }
        >
          <button
            type="button"
            className="ghost-button"
            onClick={() => navigate("/aluno/candidatura")}
          >
            Acompanhar meu cadastro
          </button>
        </EstadoVazio>
      </div>
    );
  }

  if (tipo === "apadrinhado_aguardando" || tipo === "apadrinhado_ativo") {
    return (
      <div className="aluno-page match-page">
        <header className="status-intro">
          <span className="history-intro-icon" aria-hidden="true">
            <Icon name="userSearch" size={36} />
          </span>
          <div className="status-intro-copy">
            <h1>Meu padrinho</h1>
            <p>{dados.programa?.titulo || "Aguarde a formação dos grupos."}</p>
          </div>
        </header>
        <EstadoVazio
          icon="userSearch"
          titulo="Seu padrinho ainda não foi definido"
          texto={`A coordenação está formando os grupos (${formacao?.periodoTexto || "conforme o calendário do programa"}). Você será avisado(a) por aqui assim que o match for confirmado.`}
        >
          <button
            type="button"
            className="ghost-button"
            onClick={() => navigate("/aluno/candidatura")}
          >
            Acompanhar meu cadastro
          </button>
        </EstadoVazio>
      </div>
    );
  }

  return (
    <div className="aluno-page match-page">
      <header className="status-intro">
        <span className="history-intro-icon" aria-hidden="true">
          <Icon name="users" size={36} />
        </span>
        <div className="status-intro-copy">
          <h1>Meu padrinho</h1>
          <p>
            {dados?.programa?.titulo ||
              "Participe do programa para formar um vínculo."}
          </p>
        </div>
      </header>
      <EstadoVazio
        icon="users"
        titulo="Você ainda não tem vínculo no programa"
        texto={
          tipo?.startsWith("candidatura")
            ? ESTADOS_ALUNO[tipo]?.[1]
            : "Participe do programa para ser conectado(a) a um padrinho ou a apadrinhados."
        }
      >
        {tipo?.startsWith("candidatura") ? (
          <button
            type="button"
            className="ghost-button"
            onClick={() => navigate("/aluno/candidatura")}
          >
            Ver status da candidatura
          </button>
        ) : (
          <button
            type="button"
            className="primary-button inline"
            onClick={() => navigate("/?passo=escolha")}
          >
            Quero participar <Icon name="arrow" size={17} />
          </button>
        )}
      </EstadoVazio>
    </div>
  );
}
