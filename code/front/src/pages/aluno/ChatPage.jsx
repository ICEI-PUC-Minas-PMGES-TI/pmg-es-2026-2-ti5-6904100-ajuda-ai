import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { api, getAlunoSession, streamChatMessages } from "../../api/client";
import Icon from "../../components/Icon";
import { PageHeader } from "./partes";
import "./chat.css";

const TAMANHO_MAXIMO_IMAGEM = 5 * 1024 * 1024;
const TIPOS_IMAGEM = ["image/png", "image/jpeg", "image/webp"];

function hora(data) {
  if (!data) return "";
  return new Intl.DateTimeFormat("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(data));
}

function EstadoMensagem({ estado }) {
  if (!estado) return null;
  const descricao = {
    enviada: "Enviada",
    entregue: "Recebida",
    lida: "Visualizada",
  }[estado];
  return (
    <span
      className={`chat-message-state ${estado === "lida" ? "read" : estado}`}
      aria-label={descricao}
      title={descricao}
    >
      {estado === "entregue" || estado === "lida" ? "✓✓" : "✓"}
    </span>
  );
}

function participanteDoOutroLado(chat) {
  return (
    chat.participantes.find(
      (participante) =>
        participante.participacaoId !== chat.minhaParticipacaoId,
    ) ?? chat.participantes[0]
  );
}

function resumirChat(chat) {
  const participante = participanteDoOutroLado(chat);
  const nome = participante?.nome || "Participante";
  return {
    ...chat,
    participante: {
      ...participante,
      nome,
      iniciais: nome
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 2)
        .map((parte) => parte[0])
        .join("")
        .toUpperCase(),
    },
  };
}

function Avatar({ participante, pequeno = false }) {
  return (
    <span
      className={`chat-avatar${pequeno ? " small" : ""}`}
      aria-hidden="true"
    >
      {participante?.iniciais || "?"}
    </span>
  );
}

export default function ChatPage() {
  const [params, setParams] = useSearchParams();
  const sessao = getAlunoSession();
  const email = sessao?.email;
  const [conversas, setConversas] = useState([]);
  const [mensagens, setMensagens] = useState([]);
  const [busca, setBusca] = useState("");
  const [texto, setTexto] = useState("");
  const [erro, setErro] = useState("");
  const [carregandoConversas, setCarregandoConversas] = useState(true);
  const [carregandoMensagens, setCarregandoMensagens] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [conectado, setConectado] = useState(false);
  const listaRef = useRef(null);
  const campoRef = useRef(null);
  const arquivoRef = useRef(null);
  const conversaId = params.get("conversa");
  const conversaAtiva = conversas.find(
    (conversa) => String(conversa.id) === conversaId,
  );

  const carregarConversas = useCallback(async () => {
    if (!email) {
      setErro("Entre na sua conta de aluno para acessar as conversas.");
      setCarregandoConversas(false);
      return;
    }
    try {
      const resultado = await api.chats(email);
      setConversas(resultado.map(resumirChat));
      setErro("");
    } catch (falha) {
      setErro(falha.message || "Não foi possível carregar as conversas.");
    } finally {
      setCarregandoConversas(false);
    }
  }, [email]);

  const carregarMensagens = useCallback(
    async (id, mostrarCarregamento = false) => {
      if (!email || !id) return;
      if (mostrarCarregamento) setCarregandoMensagens(true);
      try {
        const resultado = await api.mensagensChat(id, email);
        setMensagens(resultado.mensagens);
        setConversas((atuais) =>
          atuais.map((chat) =>
            chat.id === Number(id)
              ? {
                  ...chat,
                  ultimaMensagem:
                    resultado.mensagens.at(-1) ?? chat.ultimaMensagem,
                  naoLidas: 0,
                }
              : chat,
          ),
        );
        setErro("");
      } catch (falha) {
        setErro(falha.message || "Não foi possível carregar as mensagens.");
      } finally {
        if (mostrarCarregamento) setCarregandoMensagens(false);
      }
    },
    [email],
  );

  useEffect(() => {
    void carregarConversas();
  }, [carregarConversas]);

  useEffect(() => {
    if (
      !carregandoConversas &&
      conversaId &&
      !conversas.some((conversa) => String(conversa.id) === conversaId)
    ) {
      setParams({}, { replace: true });
    }
  }, [carregandoConversas, conversaId, conversas, setParams]);

  useEffect(() => {
    if (!conversaAtiva || !email) {
      setMensagens([]);
      setConectado(false);
      return undefined;
    }
    const id = conversaAtiva.id;
    const controller = new AbortController();
    let aguardando = false;
    void carregarMensagens(id, true);

    async function conectar() {
      while (!controller.signal.aborted) {
        try {
          await streamChatMessages(
            id,
            email,
            () => {
              if (!aguardando) void carregarMensagens(id);
            },
            controller.signal,
            setConectado,
          );
        } catch (falha) {
          setConectado(false);
          if (falha.status === 401 && !controller.signal.aborted)
            setErro(falha.message);
        }
        if (!controller.signal.aborted)
          await new Promise((resolve) => {
            aguardando = true;
            window.setTimeout(() => {
              aguardando = false;
              resolve();
            }, 2500);
          });
      }
    }

    void conectar();
    const sincronizar = window.setInterval(() => {
      void carregarMensagens(id);
      void carregarConversas();
    }, 30_000);
    return () => {
      controller.abort();
      window.clearInterval(sincronizar);
    };
  }, [conversaAtiva?.id, email, carregarConversas, carregarMensagens]);

  useEffect(() => {
    listaRef.current?.scrollTo({ top: listaRef.current.scrollHeight });
  }, [mensagens.length, conversaAtiva?.id]);

  const filtradas = useMemo(() => {
    const consulta = busca.trim().toLocaleLowerCase("pt-BR");
    return conversas.filter((conversa) => {
      const resumo = conversa.ultimaMensagem?.imagemUrl
        ? "imagem"
        : conversa.ultimaMensagem?.texto || "";
      return (
        !consulta ||
        conversa.participante.nome
          .toLocaleLowerCase("pt-BR")
          .includes(consulta) ||
        resumo.toLocaleLowerCase("pt-BR").includes(consulta)
      );
    });
  }, [busca, conversas]);

  async function enviar(event) {
    event.preventDefault();
    const conteudo = texto.trim();
    if (!conteudo || !conversaAtiva || enviando) return;
    setEnviando(true);
    setErro("");
    try {
      await api.enviarMensagemChat(conversaAtiva.id, conteudo, email);
      setTexto("");
      await carregarMensagens(conversaAtiva.id);
      campoRef.current?.focus();
    } catch (falha) {
      setErro(falha.message || "Não foi possível enviar a mensagem.");
    } finally {
      setEnviando(false);
    }
  }

  async function enviarImagem(event) {
    const arquivo = event.target.files?.[0];
    event.target.value = "";
    if (!arquivo || !conversaAtiva || enviando) return;
    if (!TIPOS_IMAGEM.includes(arquivo.type)) {
      setErro("Escolha uma imagem PNG, JPEG ou WebP.");
      return;
    }
    if (!arquivo.size || arquivo.size > TAMANHO_MAXIMO_IMAGEM) {
      setErro("A imagem deve ter até 5 MB.");
      return;
    }
    setEnviando(true);
    setErro("");
    try {
      await api.enviarImagemChat(conversaAtiva.id, arquivo, email);
      await carregarMensagens(conversaAtiva.id);
    } catch (falha) {
      setErro(falha.message || "Não foi possível enviar a imagem.");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="aluno-page chat-page">
      <PageHeader
        titulo="Conversas"
        subtitulo="Converse com seu padrinho ou apadrinhado pelo Ajuda-aí."
      >
        {conversaAtiva && (
          <span className={`chat-connection${conectado ? " online" : ""}`}>
            <span className="chat-connection-dot" />
            {conectado ? "Mensagens em tempo real" : "Reconectando mensagens"}
          </span>
        )}
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
          {erro && !conversaAtiva && (
            <p className="chat-compose-error" role="alert">
              {erro}
            </p>
          )}
          <div className="chat-list" aria-label="Lista de conversas">
            {filtradas.map((conversa) => {
              const ultima = conversa.ultimaMensagem;
              const selecionada = String(conversa.id) === conversaId;
              return (
                <button
                  type="button"
                  key={conversa.id}
                  className={`chat-list-item${selecionada ? " active" : ""}`}
                  onClick={() => {
                    setErro("");
                    setParams({ conversa: String(conversa.id) });
                  }}
                  aria-current={selecionada ? "true" : undefined}
                >
                  <Avatar participante={conversa.participante} />
                  <span className="chat-list-copy">
                    <span className="chat-list-title">
                      <strong>{conversa.participante.nome}</strong>
                      <time>{hora(ultima?.criadaEm)}</time>
                    </span>
                    <span className="chat-list-preview">
                      {ultima?.imagemUrl
                        ? "Imagem"
                        : ultima?.texto || "Sem mensagens"}
                    </span>
                    <span className="chat-list-meta">
                      {conversa.participante.papel} · {conversa.programa}
                    </span>
                  </span>
                </button>
              );
            })}
            {!carregandoConversas && filtradas.length === 0 && (
              <p className="chat-empty-search">
                {conversas.length
                  ? "Nenhuma conversa encontrada."
                  : "Suas conversas aparecerão aqui após a confirmação do matching."}
              </p>
            )}
            {carregandoConversas && (
              <p className="chat-empty-search">Carregando conversas…</p>
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

            <div className="chat-messages" ref={listaRef} aria-live="polite">
              {carregandoMensagens && mensagens.length === 0 && (
                <p className="chat-empty-search">Carregando mensagens…</p>
              )}
              {!carregandoMensagens && mensagens.length === 0 && (
                <p className="chat-empty-search">
                  Ainda não há mensagens. Dê o primeiro oi!
                </p>
              )}
              {mensagens.map((mensagem) => {
                const minha =
                  mensagem.remetenteParticipacaoId ===
                  conversaAtiva.minhaParticipacaoId;
                return (
                  <article
                    key={mensagem.id}
                    className={`chat-bubble-row ${minha ? "outgoing" : "incoming"}`}
                  >
                    <div className="chat-bubble">
                      {mensagem.imagemUrl && (
                        <a
                          href={mensagem.imagemUrl}
                          target="_blank"
                          rel="noreferrer"
                          aria-label="Abrir imagem enviada"
                        >
                          <img
                            className="chat-message-image"
                            src={mensagem.imagemUrl}
                            alt="Imagem enviada na conversa"
                            loading="lazy"
                          />
                        </a>
                      )}
                      {!mensagem.imagemUrl && <p>{mensagem.texto}</p>}
                      <span className="chat-bubble-meta">
                        <time>{hora(mensagem.criadaEm)}</time>
                        {minha && <EstadoMensagem estado={mensagem.estado} />}
                      </span>
                    </div>
                  </article>
                );
              })}
            </div>

            <div className="chat-composer-wrap">
              {erro && (
                <p className="chat-compose-error" role="alert">
                  {erro}
                </p>
              )}
              <form className="chat-composer" onSubmit={enviar}>
                <label className="sr-only" htmlFor="chat-image">
                  Enviar imagem
                </label>
                <input
                  id="chat-image"
                  ref={arquivoRef}
                  className="chat-image-input"
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  onChange={enviarImagem}
                  disabled={enviando}
                />
                <button
                  type="button"
                  className="chat-image-button"
                  onClick={() => arquivoRef.current?.click()}
                  disabled={enviando}
                  aria-label="Anexar imagem"
                  title="Enviar imagem (até 5 MB)"
                >
                  <span aria-hidden="true">＋</span>
                </button>
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
                  disabled={enviando}
                />
                <button
                  type="submit"
                  disabled={!texto.trim() || enviando}
                  aria-label={enviando ? "Enviando" : "Enviar mensagem"}
                >
                  <Icon name="send" size={18} />
                </button>
              </form>
              <p className="chat-compose-hint">
                Enter para enviar · Shift + Enter para nova linha · Imagens PNG,
                JPEG ou WebP até 5 MB
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
