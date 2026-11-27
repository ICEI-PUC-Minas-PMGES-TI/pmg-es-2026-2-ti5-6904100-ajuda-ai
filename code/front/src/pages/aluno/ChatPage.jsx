import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useOutletContext, useSearchParams } from "react-router-dom";
import { api, streamChatMessages } from "../../api/client";
import Icon from "../../components/Icon";
import { PageHeader } from "./partes";
import {
  alvoConversa,
  mesclarMensagens,
  buscarPaginasChat,
  tituloConversa,
  horarioMensagem,
} from "./chatDados";
import "./chat.css";

const TAMANHO_MAXIMO_IMAGEM = 5 * 1024 * 1024;
const TIPOS_IMAGEM = ["image/png", "image/jpeg", "image/webp"];

export function EstadoMensagem({ estado, recibos }) {
  const descricao =
    estado === "lida"
      ? "Lida por todos os destinatários"
      : estado === "entregue"
        ? "Entregue a todos os destinatários"
        : "Enviada ao servidor";
  return (
    <span
      className={`chat-message-state ${estado === "lida" ? "read" : estado}`}
      title={`${descricao}${recibos ? ` · ${recibos.lidas}/${recibos.total} leitura(s)` : ""}`}
      aria-label={descricao}
    >
      {estado === "entregue" || estado === "lida" ? "✓✓" : "✓"}
    </span>
  );
}

export function ListaConversas({ conversas, selecionada, onSelecionar }) {
  return (
    <div className="chat-list" aria-label="Lista de conversas">
      {conversas.map((chat) => (
        <button
          type="button"
          key={chat.id}
          className={`chat-list-item${String(chat.id) === selecionada ? " active" : ""}`}
          onClick={() => onSelecionar(chat.id)}
        >
          <span className="chat-avatar" aria-hidden="true">
            {chat.tipo === "coletivo"
              ? "GR"
              : tituloConversa(chat).slice(0, 2).toUpperCase()}
          </span>
          <span className="chat-list-copy">
            <span className="chat-list-title">
              <strong>{tituloConversa(chat)}</strong>
              <time>{horarioMensagem(chat.ultimaMensagem?.criadaEm)}</time>
            </span>
            <span className="chat-list-preview">
              {chat.ultimaMensagem?.texto ||
                "Nenhuma mensagem no seu período de participação."}
            </span>
            <span className="chat-list-meta">
              {chat.programa} · {chat.tipo === "coletivo" ? "Grupo" : "Privado"}
              {!chat.podeEnviar ? " · Histórico" : ""}
              {chat.naoLidas > 0 ? ` · ${chat.naoLidas} não lida(s)` : ""}
            </span>
          </span>
        </button>
      ))}
    </div>
  );
}

export function MensagensChat({ mensagens, meusIds }) {
  return mensagens.map((m) => {
    const minha = meusIds.includes(m.remetenteParticipacaoId);
    return (
      <article
        key={m.id}
        className={`chat-bubble-row ${minha ? "outgoing" : "incoming"}`}
      >
        <div className="chat-bubble">
          {!minha && m.remetenteNome && <strong>{m.remetenteNome}</strong>}
          {m.imagemUrl ? (
            <a
              href={m.imagemUrl}
              target="_blank"
              rel="noreferrer"
              aria-label="Abrir imagem enviada"
            >
              <img
                className="chat-message-image"
                src={m.imagemUrl}
                alt="Imagem enviada na conversa"
                loading="lazy"
              />
            </a>
          ) : (
            <p>{m.texto}</p>
          )}
          <span className="chat-bubble-meta">
            <time>{horarioMensagem(m.criadaEm)}</time>
            {minha && <EstadoMensagem estado={m.estado} recibos={m.recibos} />}
          </span>
        </div>
      </article>
    );
  });
}

function Thread({ chat, email, onVoltar, onAtualizarLista }) {
  const [mensagens, setMensagens] = useState([]),
    [texto, setTexto] = useState(""),
    [erro, setErro] = useState("");
  const [acesso, setAcesso] = useState(chat),
    [temMais, setTemMais] = useState(false),
    [carregando, setCarregando] = useState(false),
    [enviando, setEnviando] = useState(false),
    [incerta, setIncerta] = useState(false),
    [conectado, setConectado] = useState(false);
  const vivo = useRef(true),
    carregandoRef = useRef(false),
    repetir = useRef(false),
    mensagensRef = useRef([]),
    cursorMensagens = useRef(undefined),
    recibosRevisao = useRef(0),
    intencao = useRef(null),
    envioRef = useRef(false),
    listaRef = useRef(null),
    arquivoRef = useRef(null);
  const atualizarMensagens = useCallback((novas) => {
    mensagensRef.current = mesclarMensagens(mensagensRef.current, novas);
    setMensagens(mensagensRef.current);
  }, []);
  const bloquear = useCallback((error) => {
    if ([401, 403, 404].includes(error.status)) {
      mensagensRef.current = [];
      setMensagens([]);
      setAcesso((a) => ({ ...a, podeEnviar: false }));
    }
    setErro(error.message || "Não foi possível atualizar a conversa.");
  }, []);
  const carregar = useCallback(
    async (anteriores = false) => {
      if (!vivo.current) return;
      if (carregandoRef.current) {
        repetir.current = true;
        return;
      }
      carregandoRef.current = true;
      setCarregando(true);
      try {
        const resultado = await buscarPaginasChat({
          mensagens: mensagensRef.current, cursor: cursorMensagens.current, anteriores,
          buscar: cursores => api.mensagensChat(chat.id, email, cursores),
          ativo: () => vivo.current,
          avancarCursor: cursor => { cursorMensagens.current = cursor; },
          aplicar: pagina => {
            setAcesso(a => ({ ...a, ...pagina }));
            atualizarMensagens(pagina.mensagens);
          },
        });
        if (!resultado || !vivo.current) return;
        if (resultado.inicial || anteriores) setTemMais(resultado.temMais);
        const ultimaId = mensagensRef.current.at(-1)?.id;
        if (!anteriores && ultimaId != null) {
          const estados = await api.recibosChat(chat.id, email, recibosRevisao.current, ultimaId);
          if (!vivo.current) return;
          const conhecidas = new Set(mensagensRef.current.map(m => m.id));
          atualizarMensagens((estados.recibos || []).filter(r => conhecidas.has(r.id)));
          recibosRevisao.current = estados.recibosRevisao ?? recibosRevisao.current;
          setAcesso(a => ({ ...a, ...estados }));
        }
        setErro("");
      } catch (error) {
        if (vivo.current) bloquear(error);
      } finally {
        carregandoRef.current = false;
        if (vivo.current) {
          setCarregando(false);
          if (repetir.current) {
            repetir.current = false;
            queueMicrotask(() => carregar());
          }
        }
      }
    },
    [chat.id, email, atualizarMensagens, bloquear],
  );
  useEffect(() => {
    vivo.current = true;
    carregar();
    return () => {
      vivo.current = false;
    };
  }, [carregar]);
  useEffect(() => {
    carregar();
  }, [chat.revisao, carregar]);
  useEffect(() => {
    if (!acesso.podeEnviar) return undefined;
    let cancelado = false,
      parar = false,
      timer;
    const controller = new AbortController();
    async function conectar() {
      if (cancelado || parar) return;
      try {
        await streamChatMessages(
          chat.id,
          email,
          (event) => {
            if (cancelado || parar) return;
            if (event.tipo === "chat.access") {
              parar = true;
              setConectado(false);
              setAcesso((a) => ({
                ...a,
                podeEnviar: false,
                motivoBloqueio:
                  event.dados.motivoBloqueio ||
                  "Acesso alterado. Atualize suas conversas.",
              }));
              if (event.dados.revogado) {
                mensagensRef.current = [];
                setMensagens([]);
              } else carregar();
              onAtualizarLista();
            } else if (["chat.ready", "chat.changed"].includes(event.tipo)) {
              setConectado(true);
              carregar();
            }
          },
          controller.signal,
        );
      } catch (error) {
        if (!cancelado && [401, 403, 404].includes(error.status)) {
          parar = true;
          bloquear(error);
          onAtualizarLista();
        }
      } finally {
        if (!cancelado && !parar) {
          setConectado(false);
          timer = window.setTimeout(conectar, 3000);
        }
      }
    }
    conectar();
    return () => {
      cancelado = true;
      clearTimeout(timer);
      controller.abort();
    };
  }, [chat.id, email, acesso.podeEnviar, carregar, bloquear, onAtualizarLista]);
  useEffect(() => {
    listaRef.current?.scrollTo({ top: listaRef.current.scrollHeight });
  }, [mensagens.at(-1)?.id]);
  async function enviar(event) {
    event.preventDefault();
    if (envioRef.current || !acesso.podeEnviar || !texto.trim()) return;
    intencao.current ??= { texto: texto.trim(), clientId: crypto.randomUUID() };
    envioRef.current = true;
    setEnviando(true);
    setErro("");
    try {
      const m = await api.enviarMensagemChat(
        chat.id,
        intencao.current.texto,
        email,
        intencao.current.clientId,
      );
      if (!vivo.current) return;
      atualizarMensagens([m]);
      setTexto("");
      intencao.current = null;
      setIncerta(false);
      await carregar();
      onAtualizarLista();
    } catch (error) {
      if (vivo.current) {
        setIncerta(true);
        bloquear(error);
      }
    } finally {
      envioRef.current = false;
      if (vivo.current) setEnviando(false);
    }
  }
  async function enviarImagem(event) {
    const arquivo = event.target.files?.[0];
    event.target.value = "";
    if (!arquivo || !acesso.podeEnviar || envioRef.current) return;
    if (!TIPOS_IMAGEM.includes(arquivo.type)) {
      setErro("Escolha uma imagem PNG, JPEG ou WebP.");
      return;
    }
    if (!arquivo.size || arquivo.size > TAMANHO_MAXIMO_IMAGEM) {
      setErro("A imagem deve ter até 5 MB.");
      return;
    }
    envioRef.current = true;
    setEnviando(true);
    setErro("");
    try {
      const mensagem = await api.enviarImagemChat(chat.id, arquivo, email);
      if (!vivo.current) return;
      atualizarMensagens([mensagem]);
      await carregar();
      onAtualizarLista();
    } catch (error) {
      if (vivo.current) bloquear(error);
    } finally {
      envioRef.current = false;
      if (vivo.current) setEnviando(false);
    }
  }
  const ids = acesso.minhasParticipacoesIds || [acesso.minhaParticipacaoId];
  return (
    <section
      className="chat-thread"
      aria-label={`Conversa ${tituloConversa(chat)}`}
    >
      <header className="chat-thread-head">
        <button
          type="button"
          className="chat-back"
          onClick={onVoltar}
          aria-label="Voltar para conversas"
        >
          <Icon name="arrowLeft" size={20} />
        </button>
        <div className="chat-thread-person">
          <strong>{tituloConversa(chat)}</strong>
          <span>
            {chat.tipo === "coletivo"
              ? "Conversa do grupo"
              : "Conversa privada"}{" "}
            · {chat.programa}
          </span>
        </div>
        <button type="button" className="mini-btn" onClick={() => carregar()}>
          Atualizar conversa
        </button>
      </header>
      {!acesso.podeEnviar && (
        <p className="chat-demo-notice" role="status">
          {acesso.motivoBloqueio ||
            "Conversa disponível somente para consulta."}
        </p>
      )}
      <div className="chat-messages" ref={listaRef} aria-live="polite">
        {temMais && (
          <button
            type="button"
            className="mini-btn"
            disabled={carregando}
            onClick={() => carregar(true)}
          >
            Mensagens anteriores
          </button>
        )}
        {carregando && !mensagens.length && (
          <p role="status">Carregando mensagens.</p>
        )}
        {!carregando && !mensagens.length && (
          <p>Nenhuma mensagem no seu período de participação.</p>
        )}
        <MensagensChat mensagens={mensagens} meusIds={ids} />
      </div>
      <div className="chat-composer-wrap">
        <p role="status">
          {acesso.podeEnviar
            ? conectado
              ? "Atualização conectada"
              : "Reconectando à conversa…"
            : "Histórico"}
        </p>
        {erro && (
          <p className="chat-compose-error" role="alert">
            {erro}
          </p>
        )}
        {incerta && (
          <p>Uma nova tentativa envia a mesma mensagem, sem duplicá-la.</p>
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
            disabled={!acesso.podeEnviar || enviando || incerta}
          />
          <button
            type="button"
            className="chat-image-button"
            onClick={() => arquivoRef.current?.click()}
            disabled={!acesso.podeEnviar || enviando || incerta}
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
            value={texto}
            maxLength={4000}
            rows={2}
            disabled={!acesso.podeEnviar || enviando || incerta}
            onChange={(e) => setTexto(e.target.value)}
            placeholder="Digite uma mensagem."
          />
          <button
            type="submit"
            disabled={!acesso.podeEnviar || enviando || !texto.trim()}
            aria-label={incerta ? "Tentar enviar novamente" : "Enviar mensagem"}
          >
            <Icon name="send" size={18} />
          </button>
        </form>
        <p className="chat-compose-hint">
          Imagens PNG, JPEG ou WebP até 5 MB.
        </p>
      </div>
    </section>
  );
}

export default function ChatPage() {
  const { email, programa } = useOutletContext();
  return (
    <ConversasDaConta
      key={`${email}|${programa}`}
      email={email}
      programa={programa}
    />
  );
}
function ConversasDaConta({ email, programa }) {
  const [params, setParams] = useSearchParams();
  const [conversas, setConversas] = useState([]),
    [busca, setBusca] = useState(""),
    [erro, setErro] = useState(""),
    [carregando, setCarregando] = useState(true);
  const vivo = useRef(true),
    pedido = useRef(0),
    aplicada = useRef(false);
  const carregar = useCallback(async () => {
    const atual = ++pedido.current;
    try {
      const lista = await api.chats(email, programa);
      if (vivo.current && atual === pedido.current) {
        setConversas(lista);
        setErro("");
      }
    } catch (error) {
      if (vivo.current && atual === pedido.current) {
        setErro(error.message);
        if ([401, 403].includes(error.status)) setConversas([]);
      }
    } finally {
      if (vivo.current && atual === pedido.current) setCarregando(false);
    }
  }, [email, programa]);
  useEffect(() => {
    vivo.current = true;
    carregar();
    const timer = setInterval(() => {
      if (!document.hidden) carregar();
    }, 10000);
    return () => {
      vivo.current = false;
      clearInterval(timer);
      pedido.current++;
    };
  }, [carregar]);
  useEffect(() => {
    if (aplicada.current || !conversas.length) return;
    const alvo = alvoConversa(conversas, {
      vinculo: params.get("vinculo"),
      grupo: params.get("grupo"),
      pessoa: params.get("pessoa"),
    });
    if (alvo) {
      aplicada.current = true;
      setParams({ conversa: String(alvo.id) }, { replace: true });
    }
  }, [conversas, params, setParams]);
  const selecionada = params.get("conversa"),
    ativa = conversas.find((c) => String(c.id) === selecionada);
  const filtradas = useMemo(
    () =>
      conversas.filter((c) =>
        `${tituloConversa(c)} ${c.ultimaMensagem?.texto || ""}`
          .toLocaleLowerCase("pt-BR")
          .includes(busca.toLocaleLowerCase("pt-BR")),
      ),
    [conversas, busca],
  );
  return (
    <div className="aluno-page chat-page">
      <PageHeader
        titulo="Conversas"
        subtitulo="Converse em particular ou com o seu grupo."
      />
      {erro && (
        <p role="alert">
          {erro}
          <button type="button" onClick={carregar}>
            Tentar novamente
          </button>
        </p>
      )}
      <section className="chat-workspace" aria-label="Mensagens">
        <aside className={`chat-inbox${ativa ? " has-conversation" : ""}`}>
          <div className="chat-inbox-heading">
            <h2>Mensagens</h2>
            <button type="button" className="mini-btn" onClick={carregar}>
              Atualizar
            </button>
          </div>
          <label className="chat-search">
            <span className="sr-only">Buscar conversa</span>
            <input
              type="search"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar conversa"
            />
          </label>
          {carregando && <p role="status">Carregando conversas.</p>}
          <ListaConversas
            conversas={filtradas}
            selecionada={selecionada}
            onSelecionar={(id) => setParams({ conversa: String(id) })}
          />
          {!carregando && !filtradas.length && (
            <p className="chat-empty-search">
              Suas conversas aparecem após a confirmação de um vínculo.
            </p>
          )}
        </aside>
        {ativa ? (
          <Thread
            key={ativa.id}
            chat={ativa}
            email={email}
            onVoltar={() => setParams({})}
            onAtualizarLista={carregar}
          />
        ) : (
          <div className="chat-empty-search">
            Selecione uma conversa para consultar ou enviar mensagens.
          </div>
        )}
      </section>
    </div>
  );
}
