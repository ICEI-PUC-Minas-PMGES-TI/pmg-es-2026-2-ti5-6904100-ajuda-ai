import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useSearchParams } from "react-router-dom";
import { api, getAlunoSession, streamChatMessages } from "../../api/client";
import Icon from "../../components/Icon";
import { aplicarRespostaSeAtual } from "./chat-requests";
import { PageHeader } from "./partes";
import "./chat.css";

const TAMANHO_MAXIMO_IMAGEM = 5 * 1024 * 1024;
const TIPOS_IMAGEM = ["image/png", "image/jpeg", "image/webp"];

function mesclarMensagens(atuais, recebidas) {
  const porId = new Map(atuais.map((mensagem) => [mensagem.id, mensagem]));
  recebidas.forEach((mensagem) => porId.set(mensagem.id, mensagem));
  return [...porId.values()].sort((a, b) => a.id - b.id);
}

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
  const [estadoConversas, setEstadoConversas] = useState({
    email: null,
    conversas: [],
  });
  const [estadoMensagens, setEstadoMensagens] = useState({
    chave: null,
    mensagens: [],
    temMais: false,
  });
  const [rascunhos, setRascunhos] = useState({});
  const [busca, setBusca] = useState("");
  const [erro, setErro] = useState("");
  const [carregandoConversas, setCarregandoConversas] = useState(true);
  const [carregandoMensagens, setCarregandoMensagens] = useState(false);
  const [carregandoAnteriores, setCarregandoAnteriores] = useState(false);
  const [chaveEnviando, setChaveEnviando] = useState(null);
  const [conectado, setConectado] = useState(false);
  const listaRef = useRef(null);
  const restaurarScrollRef = useRef(null);
  const emailAtivoRef = useRef(email);
  const requisicaoConversasRef = useRef(0);
  const chaveAtivaRef = useRef(null);
  const chaveAnteriorRef = useRef(null);
  const chaveEnviandoRef = useRef(null);
  const enviosAtivosRef = useRef(new Set());
  const requisicaoMensagensRef = useRef(0);
  const requisicaoAnterioresRef = useRef(0);
  const campoRef = useRef(null);
  const arquivoRef = useRef(null);
  const conversaId = params.get("conversa");
  const conversas =
    estadoConversas.email === email ? estadoConversas.conversas : [];
  const conversaAtiva = conversas.find(
    (conversa) => String(conversa.id) === conversaId,
  );
  const chaveAtiva =
    conversaAtiva && email ? `${email}:${conversaAtiva.id}` : null;
  emailAtivoRef.current = email;
  chaveAtivaRef.current = chaveAtiva;
  const texto = chaveAtiva ? rascunhos[chaveAtiva] || "" : "";
  const mensagens =
    estadoMensagens.chave === chaveAtiva ? estadoMensagens.mensagens : [];
  const temMaisMensagens =
    estadoMensagens.chave === chaveAtiva ? estadoMensagens.temMais : false;
  const enviando = chaveEnviando === chaveAtiva;

  const carregarConversas = useCallback(async () => {
    const requisicao = ++requisicaoConversasRef.current;
    if (!email) {
      setEstadoConversas({ email: null, conversas: [] });
      setErro("Entre na sua conta de aluno para acessar as conversas.");
      setCarregandoConversas(false);
      return;
    }
    setCarregandoConversas(true);
    try {
      const resultado = await api.chats(email);
      if (
        emailAtivoRef.current !== email ||
        requisicaoConversasRef.current !== requisicao
      ) return;
      setEstadoConversas({
        email,
        conversas: resultado.map(resumirChat),
      });
      setErro("");
    } catch (falha) {
      if (
        emailAtivoRef.current === email &&
        requisicaoConversasRef.current === requisicao
      ) {
        setErro(falha.message || "Não foi possível carregar as conversas.");
      }
    } finally {
      if (
        emailAtivoRef.current === email &&
        requisicaoConversasRef.current === requisicao
      ) setCarregandoConversas(false);
    }
  }, [email]);

  const carregarMensagens = useCallback(
    async (id, mostrarCarregamento = false) => {
      if (!email || !id) return;
      const chave = `${email}:${id}`;
      const requisicao = ++requisicaoMensagensRef.current;
      if (mostrarCarregamento) setCarregandoMensagens(true);
      try {
        await aplicarRespostaSeAtual({
          chave,
          chaveAtual: chaveAtivaRef,
          requisicao,
          requisicaoAtual: requisicaoMensagensRef,
          carregar: () => api.mensagensChat(id, email),
          aplicar: (resultado) => {
            setEstadoMensagens((atual) => ({
              chave,
              mensagens: mesclarMensagens(
                atual.chave === chave ? atual.mensagens : [],
                resultado.mensagens,
              ),
              temMais:
                atual.chave === chave &&
                atual.mensagens[0]?.id < resultado.mensagens[0]?.id
                  ? atual.temMais
                  : resultado.temMais,
            }));
            setEstadoConversas((atual) =>
              atual.email !== email
                ? atual
                : {
                    ...atual,
                    conversas: atual.conversas.map((chat) =>
                      chat.id === Number(id)
                        ? {
                            ...chat,
                            ultimaMensagem:
                              resultado.mensagens.at(-1) ??
                              chat.ultimaMensagem,
                            naoLidas: 0,
                          }
                        : chat,
                    ),
                  },
            );
            setErro("");
          },
        });
      } catch (falha) {
        if (
          chaveAtivaRef.current === chave &&
          requisicaoMensagensRef.current === requisicao
        ) {
          setErro(falha.message || "Não foi possível carregar as mensagens.");
        }
      } finally {
        if (
          chaveAtivaRef.current === chave &&
          requisicaoMensagensRef.current === requisicao
        )
          setCarregandoMensagens(false);
      }
    },
    [email],
  );

  const carregarAnteriores = useCallback(async () => {
    if (
      !conversaAtiva ||
      !email ||
      !temMaisMensagens ||
      carregandoAnteriores ||
      !mensagens.length
    )
      return;
    const chave = `${email}:${conversaAtiva.id}`;
    const antesDe = mensagens[0].id;
    const requisicao = ++requisicaoAnterioresRef.current;
    const lista = listaRef.current;
    restaurarScrollRef.current = lista
      ? {
          chave,
          requisicao,
          altura: lista.scrollHeight,
          topo: lista.scrollTop,
        }
      : null;
    setCarregandoAnteriores(true);
    try {
      const resultado = await api.mensagensChat(
        conversaAtiva.id,
        email,
        antesDe,
      );
      if (
        chaveAtivaRef.current !== chave ||
        requisicaoAnterioresRef.current !== requisicao
      ) {
        if (restaurarScrollRef.current?.requisicao === requisicao)
          restaurarScrollRef.current = null;
        return;
      }
      setEstadoMensagens((atual) => ({
        chave,
        mensagens: mesclarMensagens(
          atual.chave === chave ? atual.mensagens : [],
          resultado.mensagens,
        ),
        temMais: resultado.temMais,
      }));
    } catch (falha) {
      if (
        chaveAtivaRef.current === chave &&
        requisicaoAnterioresRef.current === requisicao
      ) {
        if (restaurarScrollRef.current?.requisicao === requisicao)
          restaurarScrollRef.current = null;
        setErro(falha.message || "Não foi possível carregar o histórico.");
      }
    } finally {
      if (
        chaveAtivaRef.current === chave &&
        requisicaoAnterioresRef.current === requisicao
      )
        setCarregandoAnteriores(false);
    }
  }, [carregandoAnteriores, conversaAtiva, email, mensagens, temMaisMensagens]);

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
    if (chaveAnteriorRef.current !== chaveAtiva) {
      chaveAnteriorRef.current = chaveAtiva;
      setErro("");
    }
  }, [chaveAtiva]);

  useEffect(() => {
    if (!conversaAtiva || !email) {
      setConectado(false);
      setCarregandoMensagens(false);
      setCarregandoAnteriores(false);
      return undefined;
    }
    const id = conversaAtiva.id;
    const chave = `${email}:${id}`;
    const controller = new AbortController();
    let aguardando = false;
    let acessoRevogado = false;
    setCarregandoAnteriores(false);
    void carregarMensagens(id, true);

    async function conectar() {
      while (!controller.signal.aborted && !acessoRevogado) {
        try {
          await streamChatMessages(
            id,
            email,
            (evento) => {
              if (chaveAtivaRef.current !== chave) return;
              if (evento.tipo === "chat.access") {
                acessoRevogado = true;
                setConectado(false);
                setEstadoMensagens({
                  chave: null,
                  mensagens: [],
                  temMais: false,
                });
                setParams({}, { replace: true });
                void carregarConversas().then(() => {
                  setErro(
                    "Seu acesso a esta conversa foi revogado. Atualize a lista de conversas.",
                  );
                });
                return;
              }
              if (!aguardando) void carregarMensagens(id);
            },
            controller.signal,
            (status) => {
              if (chaveAtivaRef.current === chave) setConectado(status);
            },
          );
        } catch (falha) {
          if (chaveAtivaRef.current === chave) setConectado(false);
          if (
            [401, 403, 404].includes(falha.status) &&
            !controller.signal.aborted
          ) {
            acessoRevogado = true;
            setEstadoMensagens({
              chave: null,
              mensagens: [],
              temMais: false,
            });
            setParams({}, { replace: true });
            void carregarConversas().then(() => {
              setErro(falha.message || "Seu acesso à conversa foi encerrado.");
            });
          }
        }
        if (!controller.signal.aborted && !acessoRevogado)
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
  }, [
    conversaAtiva?.id,
    email,
    carregarConversas,
    carregarMensagens,
    setParams,
  ]);

  useLayoutEffect(() => {
    const lista = listaRef.current;
    if (!lista) return;
    const restauracao = restaurarScrollRef.current;
    if (restauracao?.chave === chaveAtiva) {
      lista.scrollTop =
        restauracao.topo + (lista.scrollHeight - restauracao.altura);
      restaurarScrollRef.current = null;
      return;
    }
    if (restauracao) restaurarScrollRef.current = null;
    lista.scrollTo({ top: lista.scrollHeight });
  }, [chaveAtiva, estadoMensagens, mensagens.length, mensagens.at(-1)?.id]);

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
    if (!conteudo || !conversaAtiva || !email) return;
    const id = conversaAtiva.id;
    const chave = `${email}:${id}`;
    if (enviosAtivosRef.current.has(chave)) return;
    enviosAtivosRef.current.add(chave);
    chaveEnviandoRef.current = chave;
    setChaveEnviando(chave);
    setErro("");
    try {
      await api.enviarMensagemChat(id, conteudo, email);
      if (chaveAtivaRef.current !== chave) return;
      setRascunhos((atuais) =>
        atuais[chave] === conteudo
          ? { ...atuais, [chave]: "" }
          : atuais,
      );
      await carregarMensagens(id);
      campoRef.current?.focus();
    } catch (falha) {
      if (chaveAtivaRef.current === chave) {
        setErro(falha.message || "Não foi possível enviar a mensagem.");
      }
    } finally {
      enviosAtivosRef.current.delete(chave);
      if (chaveEnviandoRef.current === chave) {
        chaveEnviandoRef.current = null;
        setChaveEnviando(null);
      }
    }
  }

  async function enviarImagem(event) {
    const arquivo = event.target.files?.[0];
    event.target.value = "";
    if (!arquivo || !conversaAtiva || !email) return;
    const id = conversaAtiva.id;
    const chave = `${email}:${id}`;
    if (enviosAtivosRef.current.has(chave)) return;
    if (!TIPOS_IMAGEM.includes(arquivo.type)) {
      setErro("Escolha uma imagem PNG, JPEG ou WebP.");
      return;
    }
    if (!arquivo.size || arquivo.size > TAMANHO_MAXIMO_IMAGEM) {
      setErro("A imagem deve ter até 5 MB.");
      return;
    }
    enviosAtivosRef.current.add(chave);
    chaveEnviandoRef.current = chave;
    setChaveEnviando(chave);
    setErro("");
    try {
      await api.enviarImagemChat(id, arquivo, email);
      if (chaveAtivaRef.current !== chave) return;
      await carregarMensagens(id);
    } catch (falha) {
      if (chaveAtivaRef.current === chave) {
        setErro(falha.message || "Não foi possível enviar a imagem.");
      }
    } finally {
      enviosAtivosRef.current.delete(chave);
      if (chaveEnviandoRef.current === chave) {
        chaveEnviandoRef.current = null;
        setChaveEnviando(null);
      }
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
              {temMaisMensagens && (
                <button
                  type="button"
                  className="chat-load-older"
                  onClick={carregarAnteriores}
                  disabled={carregandoAnteriores}
                >
                  {carregandoAnteriores
                    ? "Carregando mensagens…"
                    : "Mensagens anteriores"}
                </button>
              )}
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
                    if (chaveAtiva) {
                      setRascunhos((atuais) => ({
                        ...atuais,
                        [chaveAtiva]: event.target.value,
                      }));
                    }
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
