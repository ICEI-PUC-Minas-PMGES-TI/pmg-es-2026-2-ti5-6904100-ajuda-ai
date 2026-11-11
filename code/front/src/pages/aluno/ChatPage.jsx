import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import Icon from "../../components/Icon";
import { PageHeader } from "./partes";
import { criarConversasMock } from "./chatMock";
import "./chat.css";

function horarioAgora() {
  return new Intl.DateTimeFormat("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date());
}

function EstadoMensagem({ estado }) {
  if (!estado) return null;
  if (estado === "pendente") {
    return (
      <span
        className="chat-message-state pending"
        aria-label="Aguardando internet para envio"
      >
        <Icon name="clock" size={14} />
      </span>
    );
  }
  const descricao = {
    enviada: "Enviada",
    entregue: "Recebida",
    lida: "Visualizada",
  }[estado];
  return (
    <span
      className={`chat-message-state ${estado === 'lida' ? 'read' : estado}`}
      aria-label={descricao}
      title={descricao}
    >
      {estado === "entregue" || estado === "lida" ? "✓✓" : "✓"}
    </span>
  );
}

function Avatar({ participante, pequeno = false }) {
  return (
    <span
      className={`chat-avatar${pequeno ? " small" : ""}`}
      aria-hidden="true"
    >
      {participante.iniciais}
    </span>
  );
}

export default function ChatPage() {
  const [params, setParams] = useSearchParams();
  const [conversas, setConversas] = useState(criarConversasMock);
  const [busca, setBusca] = useState("");
  const [texto, setTexto] = useState("");
  const [offline, setOffline] = useState(false);
  const [erro, setErro] = useState("");
  const listaRef = useRef(null);
  const campoRef = useRef(null);
  const conversaId = params.get("conversa");

  const filtradas = useMemo(() => {
    const consulta = busca.trim().toLocaleLowerCase("pt-BR");
    return conversas.filter(
      (conversa) =>
        !consulta ||
        conversa.participante.nome
          .toLocaleLowerCase("pt-BR")
          .includes(consulta) ||
        conversa.mensagens
          .at(-1)
          ?.texto.toLocaleLowerCase("pt-BR")
          .includes(consulta),
    );
  }, [busca, conversas]);
  const conversaAtiva =
    conversas.find((conversa) => conversa.id === conversaId) || null;

  useEffect(() => {
    if (
      conversaId &&
      !conversas.some((conversa) => conversa.id === conversaId)
    ) {
      setParams({}, { replace: true });
    }
  }, [conversaId, conversas, setParams]);

  useEffect(() => {
    listaRef.current?.scrollTo({ top: listaRef.current.scrollHeight });
  }, [conversaAtiva?.id, conversaAtiva?.mensagens.length]);

  function selecionarConversa(id) {
    setErro("");
    setParams({ conversa: id });
  }

  function enviar(event) {
    event.preventDefault();
    const conteudo = texto.trim();
    if (!conteudo) {
      setErro("Escreva uma mensagem antes de enviar.");
      campoRef.current?.focus();
      return;
    }
    if (!conversaAtiva) return;

    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    setConversas((atuais) =>
      atuais.map((conversa) =>
        conversa.id === conversaAtiva.id
          ? {
              ...conversa,
              mensagens: [
                ...conversa.mensagens,
                {
                  id,
                  remetente: "eu",
                  texto: conteudo,
                  hora: horarioAgora(),
                  estado: offline ? "pendente" : "enviada",
                },
              ],
            }
          : conversa,
      ),
    );
    setTexto("");
    setErro("");
    if (!offline) {
      window.setTimeout(() => {
        setConversas((atuais) =>
          atuais.map((conversa) => ({
            ...conversa,
            mensagens: conversa.mensagens.map((mensagem) =>
              mensagem.id === id && mensagem.estado === "enviada"
                ? { ...mensagem, estado: "entregue" }
                : mensagem,
            ),
          })),
        );
      }, 1800);
    }
  }

  function alternarConexao() {
    if (offline) {
      setConversas((atuais) =>
        atuais.map((conversa) => ({
          ...conversa,
          mensagens: conversa.mensagens.map((mensagem) =>
            mensagem.estado === "pendente"
              ? { ...mensagem, estado: "enviada" }
              : mensagem,
          ),
        })),
      );
    }
    setOffline(!offline);
  }

  return (
    <div className="aluno-page chat-page">
      <PageHeader
        titulo="Conversas"
        subtitulo="Converse com seu padrinho ou apadrinhado pelo Ajuda-aí."
      >
        <span className="chat-demo-badge">
          <Icon name="info" size={14} /> Demonstração com dados mockados
        </span>
      </PageHeader>

      <section className="chat-workspace" aria-label="Mensagens">
        <aside
          className={`chat-inbox${conversaAtiva ? " has-conversation" : ""}`}
        >
          <div className="chat-inbox-heading">
            <div>
              <h2>Mensagens</h2>
              <span>{conversas.length} conversas</span>
            </div>
            <Icon name="chat" size={21} />
          </div>
          <label className="chat-search">
            <Icon name="search" size={17} />
            <span className="sr-only">Buscar conversa</span>
            <input
              type="search"
              value={busca}
              onChange={(event) => setBusca(event.target.value)}
              placeholder="Buscar conversa"
            />
          </label>
          <div className="chat-list" aria-label="Lista de conversas">
            {filtradas.map((conversa) => {
              const ultima = conversa.mensagens.at(-1);
              return (
                <button
                  type="button"
                  key={conversa.id}
                  className={`chat-list-item${conversa.id === conversaId ? " active" : ""}`}
                  onClick={() => selecionarConversa(conversa.id)}
                  aria-current={conversa.id === conversaId ? "true" : undefined}
                >
                  <Avatar participante={conversa.participante} />
                  <span className="chat-list-copy">
                    <span className="chat-list-title">
                      <strong>{conversa.participante.nome}</strong>
                      <time>{ultima?.hora}</time>
                    </span>
                    <span className="chat-list-preview">
                      {ultima?.remetente === "eu" && (
                        <EstadoMensagem estado={ultima.estado} />
                      )}
                      {ultima?.texto}
                    </span>
                    <span className="chat-list-meta">
                      {conversa.participante.papel} · {conversa.programa}
                    </span>
                  </span>
                </button>
              );
            })}
            {filtradas.length === 0 && (
              <p className="chat-empty-search">Nenhuma conversa encontrada.</p>
            )}
          </div>
        </aside>

        {conversaAtiva ? (
          <section
            className="chat-thread"
            aria-label={`Conversa com ${conversaAtiva.participante.nome}`}
          >
            <header className="chat-thread-head">
              <button
                type="button"
                className="chat-back"
                onClick={() => setParams({}, { replace: true })}
                aria-label="Voltar para conversas"
              >
                <Icon name="arrowLeft" size={20} />
              </button>
              <Avatar participante={conversaAtiva.participante} pequeno />
              <div className="chat-thread-person">
                <strong>{conversaAtiva.participante.nome}</strong>
                <span>
                  {conversaAtiva.participante.papel} ·{" "}
                  {conversaAtiva.participante.curso}
                </span>
              </div>
              <span className="chat-thread-cycle">
                {conversaAtiva.programa}
              </span>
            </header>

            <div className="chat-demo-notice">
              <Icon name="info" size={15} />
              As mensagens desta tela são de demonstração e ainda não são salvas
              no servidor.
            </div>

            <div className="chat-messages" ref={listaRef} aria-live="polite">
              <div className="chat-day-divider">
                <span>Hoje</span>
              </div>
              {conversaAtiva.mensagens.map((mensagem) => (
                <article
                  key={mensagem.id}
                  className={`chat-bubble-row ${mensagem.remetente === "eu" ? "outgoing" : "incoming"}`}
                >
                  <div className="chat-bubble">
                    <p>{mensagem.texto}</p>
                    <span className="chat-bubble-meta">
                      <time>{mensagem.hora}</time>
                      {mensagem.remetente === "eu" && (
                        <EstadoMensagem estado={mensagem.estado} />
                      )}
                    </span>
                  </div>
                </article>
              ))}
            </div>

            <div className="chat-composer-wrap">
              <button
                type="button"
                className={`chat-connection${offline ? " offline" : ""}`}
                onClick={alternarConexao}
                aria-pressed={offline}
                title="Alternar conexão simulada"
              >
                <span className="chat-connection-dot" />
                {offline ? "Sem internet (demo)" : "Conectado (demo)"}
              </button>
              {erro && (
                <p className="chat-compose-error" role="alert">
                  {erro}
                </p>
              )}
              <form className="chat-composer" onSubmit={enviar}>
                <label className="sr-only" htmlFor="chat-message">
                  Digite uma mensagem
                </label>
                <textarea
                  id="chat-message"
                  ref={campoRef}
                  value={texto}
                  onChange={(event) => {
                    setTexto(event.target.value);
                    if (erro) setErro("");
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && !event.shiftKey) {
                      event.preventDefault();
                      event.currentTarget.form?.requestSubmit();
                    }
                  }}
                  placeholder="Digite uma mensagem…"
                  rows={1}
                  maxLength={4000}
                />
                <button
                  type="submit"
                  disabled={!texto.trim()}
                  aria-label="Enviar mensagem"
                >
                  <Icon name="send" size={18} />
                </button>
              </form>
              <p className="chat-compose-hint">
                Enter para enviar · Shift + Enter para nova linha
              </p>
            </div>
          </section>
        ) : (
          <section className="chat-thread chat-thread-empty">
            <span className="chat-empty-icon">
              <Icon name="chat" size={36} />
            </span>
            <h2>Suas conversas, em um só lugar</h2>
            <p>Selecione uma conversa para ver as mensagens.</p>
          </section>
        )}
      </section>
    </div>
  );
}
