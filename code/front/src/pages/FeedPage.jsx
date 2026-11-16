import { useCallback, useEffect, useRef, useState } from "react";
import { Navigate, useOutletContext } from "react-router-dom";
import {
  api,
  feedEventsUrl,
  getAlunoSession,
  getStoredToken,
} from "../api/client";
import { abrirFeedStream } from "../api/feed-stream";
import Icon from "../components/Icon";
import Modal from "../components/Modal";
import "../feed.css";

export const categoriasFeed = [
  "Comunicados",
  "Dicas acadêmicas",
  "Campus",
  "Oportunidades",
];

export function filtrarPublicacoes(itens, categoria) {
  return categoria
    ? itens.filter((post) => post.categoria === categoria)
    : itens;
}

/** Aluno que não participa do ciclo não abre o feed, nem por URL direta. */
export default function FeedPage({ coordenacao = false }) {
  const contexto = useOutletContext();
  if (!coordenacao && contexto?.resolucao && !contexto.resolucao.participante)
    return <Navigate to="/aluno/perfil" replace />;
  return <FeedConteudo coordenacao={coordenacao} />;
}

function FeedConteudo({ coordenacao }) {
  const email = coordenacao ? undefined : getAlunoSession()?.email;
  const [itens, setItens] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState("");
  const [estado, setEstado] = useState("Conectando às atualizações…");
  const [podePublicar, setPodePublicar] = useState(false);
  const [editor, setEditor] = useState(null);
  const [ocupado, setOcupado] = useState(false);
  const [confirmar, setConfirmar] = useState(null);
  const [categoria, setCategoria] = useState("");
  const sequencia = useRef(0);

  const carregar = useCallback(async () => {
    const consulta = ++sequencia.current;
    try {
      const lista = await api.feed(email);
      if (consulta === sequencia.current) {
        setItens(lista);
        setErro("");
      }
    } catch (e) {
      if (consulta === sequencia.current) setErro(e.message);
    } finally {
      if (consulta === sequencia.current) setCarregando(false);
    }
  }, [email]);

  useEffect(() => {
    let ativo = true;
    let atualizando = false;
    let pendente = false;
    const sincronizar = async () => {
      if (atualizando) {
        pendente = true;
        return;
      }
      atualizando = true;
      do {
        pendente = false;
        await carregar();
      } while (pendente && ativo);
      atualizando = false;
    };
    void sincronizar();
    api
      .permissoesFeed(email)
      .then((p) => {
        if (ativo) setPodePublicar(p.podePublicar);
      })
      .catch(() => {});
    const fechar = abrirFeedStream({
      url: feedEventsUrl,
      token: () =>
        coordenacao ? getStoredToken() : getAlunoSession()?.accessToken,
      onEstado: (valor) => {
        if (ativo) setEstado(valor);
      },
      onEvento: (evento) => {
        if (ativo && evento.type !== "feed.heartbeat") void sincronizar();
      },
    });
    return () => {
      ativo = false;
      sequencia.current++;
      fechar();
    };
  }, [carregar, coordenacao, email]);

  async function executar(acao) {
    setOcupado(true);
    setErro("");
    try {
      await acao();
      await carregar();
      return true;
    } catch (e) {
      setErro(e.message);
      return false;
    } finally {
      setOcupado(false);
    }
  }

  async function salvar(event) {
    event.preventDefault();
    const dados = {
      texto: editor.texto,
      categoria: editor.categoria,
      imagens: editor.imagens,
    };
    if (
      await executar(() =>
        editor.id
          ? api.atualizarPublicacao(editor.id, dados, email)
          : api.criarPublicacao(dados, email),
      )
    )
      setEditor(null);
  }

  async function anexar(event) {
    const arquivos = [...event.target.files];
    event.target.value = "";
    if (arquivos.length + editor.imagens.length > 10) {
      setErro("A publicação aceita até 10 imagens.");
      return;
    }
    setOcupado(true);
    try {
      for (const arquivo of arquivos) {
        if (
          arquivo.size > 5 * 1024 * 1024 ||
          !["image/png", "image/jpeg", "image/webp"].includes(arquivo.type)
        )
          throw new Error("Envie PNG, JPEG ou WebP de até 5 MB.");
        const midia = await api.uploadFeed(arquivo, email);
        setEditor(
          (atual) =>
            atual && {
              ...atual,
              imagens: [...atual.imagens, midia.chave],
              previews: [...atual.previews, midia.url],
            },
        );
      }
    } catch (e) {
      setErro(e.message);
    } finally {
      setOcupado(false);
    }
  }

  return (
    <FeedView
      {...{
        itens,
        carregando,
        erro,
        estado,
        podePublicar,
        editor,
        ocupado,
        confirmar,
        categoria,
        setCategoria,
        setEditor,
        setConfirmar,
        executar,
        salvar,
        anexar,
        email,
      }}
    />
  );
}

/** Mesmas ações e permissões da tela, renderizáveis sem uma sessão de navegador. */
export function FeedView({
  itens = [],
  carregando = false,
  erro = "",
  estado = "",
  podePublicar = false,
  editor = null,
  ocupado = false,
  confirmar = null,
  categoria = "",
  setCategoria,
  setEditor,
  setConfirmar,
  executar,
  salvar,
  anexar,
  email,
}) {
  // Lista de quem curtiu (post ou comentário), carregada ao abrir.
  const [curtidores, setCurtidores] = useState(null);
  function abrirCurtidores(titulo, buscar) {
    setCurtidores({ titulo, itens: null, erro: "" });
    buscar()
      .then((lista) => setCurtidores({ titulo, itens: lista, erro: "" }))
      .catch((e) => setCurtidores({ titulo, itens: [], erro: e.message }));
  }
  const visiveis = filtrarPublicacoes(itens, categoria);
  const categorias = [
    ...new Set([...categoriasFeed, ...itens.map((post) => post.categoria)]),
  ];
  return (
    <section className="feed-page">
      <header className="dash-header">
        <div>
          <span className="eyebrow">COMUNIDADE</span>
          <h1>Feed do programa</h1>
          <p>Comunicados da coordenação e publicações dos padrinhos.</p>
          <small role="status">{estado}</small>
        </div>
        {podePublicar && (
          <button
            className="primary-button inline"
            onClick={() =>
              setEditor({
                texto: "",
                categoria: "Comunicados",
                imagens: [],
                previews: [],
              })
            }
          >
            <Icon name="plus" size={17} /> Nova publicação
          </button>
        )}
      </header>
      <label className="feed-filter">
        Filtrar por categoria
        <select
          value={categoria}
          onChange={(event) => setCategoria(event.target.value)}
        >
          <option value="">Todas as categorias</option>
          {categorias.map((valor) => (
            <option key={valor} value={valor}>
              {valor}
            </option>
          ))}
        </select>
      </label>
      {erro && (
        <p className="dash-inline-error" role="alert">
          {erro}
        </p>
      )}
      {carregando && <p role="status">Carregando publicações…</p>}
      {!carregando && !visiveis.length && (
        <p className="empty-copy">Nenhuma publicação nesta categoria.</p>
      )}
      <div className="feed-list">
        {visiveis.map((post) => (
          <article className="dash-card feed-post" key={post.id}>
            <header>
              <span className="feed-avatar">{post.iniciais}</span>
              <div>
                <strong>{post.autor}</strong>
                <small>
                  {post.descricaoAutor} · {post.tempo}
                </small>
              </div>
              <span className="feed-category" data-categoria={post.categoria}>
                {post.categoria}
              </span>
            </header>
            <p className="feed-text">{post.texto}</p>
            {post.imagens.length > 0 && (
              <div className="feed-images">
                {post.imagens.map((url, i) => (
                  <a key={i} href={url} target="_blank" rel="noreferrer">
                    <img
                      src={url}
                      alt={`Imagem ${i + 1} da publicação`}
                      loading="lazy"
                    />
                  </a>
                ))}
              </div>
            )}
            <div className="feed-actions">
              {post.podeInteragir && (
                <button
                  className="ghost-button"
                  disabled={ocupado}
                  aria-pressed={post.curtidoPeloUsuario}
                  onClick={() =>
                    executar(() =>
                      api.curtirPublicacao(
                        post.id,
                        post.curtidoPeloUsuario ? -1 : 1,
                        email,
                      ),
                    )
                  }
                >
                  {post.curtidoPeloUsuario ? "Descurtir" : "Curtir"} ·{" "}
                  {post.curtidas}
                </button>
              )}
              {post.curtidas > 0 && (
                <button
                  className="mini-btn"
                  onClick={() =>
                    abrirCurtidores("Quem curtiu a publicação", () =>
                      api.curtidoresPublicacao(post.id, email),
                    )
                  }
                >
                  Ver quem curtiu
                </button>
              )}
              <span>{post.comentarios} comentário(s)</span>
              {!post.podeAdministrar && post.podeExcluir && (
                <button
                  className="mini-btn"
                  disabled={ocupado}
                  onClick={() => setConfirmar(post.id)}
                >
                  Excluir
                </button>
              )}
              {post.podeAdministrar && (
                <>
                  <button
                    className="mini-btn"
                    disabled={ocupado}
                    onClick={() =>
                      setEditor({
                        id: post.id,
                        texto: post.texto,
                        categoria: post.categoria,
                        imagens: [...post.midias],
                        previews: [...post.imagens],
                      })
                    }
                  >
                    Editar
                  </button>
                  <button
                    className="mini-btn"
                    disabled={ocupado}
                    onClick={() => setConfirmar(post.id)}
                  >
                    Excluir
                  </button>
                </>
              )}
            </div>
            <ul className="feed-comments">
              {post.comentariosDetalhes.map((c) => (
                <li key={c.id}>
                  <span className="feed-avatar small" aria-hidden="true">
                    {(c.autor?.nome || "?").trim().charAt(0).toUpperCase()}
                  </span>
                  <div className="feed-comment-body">
                    {c.autor?.nome && <strong>{c.autor.nome}</strong>}
                    <span>{c.texto}</span>
                    <span className="feed-comment-likes">
                      {post.podeInteragir && (
                        <button
                          className="mini-btn"
                          disabled={ocupado}
                          aria-pressed={c.curtidoPorMim}
                          onClick={() =>
                            executar(() =>
                              api.curtirComentario(
                                post.id,
                                c.id,
                                c.curtidoPorMim ? -1 : 1,
                                email,
                              ),
                            )
                          }
                        >
                          {c.curtidoPorMim ? "Descurtir" : "Curtir"}
                        </button>
                      )}
                      {c.curtidas > 0 && (
                        <button
                          className="mini-btn"
                          onClick={() =>
                            abrirCurtidores("Quem curtiu o comentário", () =>
                              api.curtidoresComentario(post.id, c.id, email),
                            )
                          }
                        >
                          ♥ {c.curtidas}
                        </button>
                      )}
                      {c.curtidoPelaCoordenacao && (
                        <span className="feed-selo-coordenacao">
                          Curtido pela coordenação
                        </span>
                      )}
                    </span>
                  </div>
                  {c.podeExcluir && (
                    <button
                      className="mini-btn"
                      disabled={ocupado}
                      onClick={() =>
                        executar(() =>
                          api.excluirComentario(post.id, c.id, email),
                        )
                      }
                      aria-label="Excluir comentário"
                    >
                      Excluir
                    </button>
                  )}
                </li>
              ))}
            </ul>
            {post.podeInteragir && (
              <form
                className="feed-comment-form"
                onSubmit={async (e) => {
                  e.preventDefault();
                  const form = e.currentTarget;
                  const texto = new FormData(form).get("comentario").trim();
                  if (
                    texto &&
                    (await executar(() =>
                      api.comentarPublicacao(post.id, texto, email),
                    ))
                  )
                    form.reset();
                }}
              >
                <input
                  name="comentario"
                  aria-label="Seu comentário"
                  placeholder="Escreva um comentário…"
                  maxLength={2000}
                  required
                />
                <button className="mini-btn" disabled={ocupado}>
                  Comentar
                </button>
              </form>
            )}
          </article>
        ))}
      </div>
      {curtidores && (
        <Modal titulo={curtidores.titulo} onFechar={() => setCurtidores(null)}>
          {curtidores.itens === null && <p role="status">Carregando…</p>}
          {curtidores.erro && (
            <p className="dash-inline-error" role="alert">
              {curtidores.erro}
            </p>
          )}
          {curtidores.itens?.length === 0 && !curtidores.erro && (
            <p className="empty-copy">Ninguém curtiu ainda.</p>
          )}
          <ul className="feed-curtidores">
            {(curtidores.itens ?? []).map((c, i) => (
              <li key={`${c.autor.id}-${i}`}>
                <span className="feed-avatar small" aria-hidden="true">
                  {c.autor.nome.trim().charAt(0).toUpperCase()}
                </span>
                <strong>{c.autor.nome}</strong>
                {c.coordenacao && (
                  <span className="feed-selo-coordenacao">Coordenação</span>
                )}
              </li>
            ))}
          </ul>
        </Modal>
      )}
      {editor && (
        <Modal
          titulo={editor.id ? "Editar publicação" : "Nova publicação"}
          onFechar={() => {
            if (!ocupado) setEditor(null);
          }}
          acoes={
            <button
              form="feed-editor"
              className="primary-button inline"
              disabled={
                ocupado || (!editor.texto.trim() && !editor.imagens.length)
              }
            >
              {ocupado ? "Salvando…" : "Publicar"}
            </button>
          }
        >
          <form id="feed-editor" className="feed-editor" onSubmit={salvar}>
            <label>
              Categoria
              <input
                list="feed-categorias"
                maxLength={80}
                value={editor.categoria}
                onChange={(e) =>
                  setEditor({ ...editor, categoria: e.target.value })
                }
              />
              <datalist id="feed-categorias">
                {categorias.map((valor) => (
                  <option key={valor} value={valor} />
                ))}
              </datalist>
            </label>
            <label>
              Texto
              <textarea
                rows={6}
                maxLength={10000}
                value={editor.texto}
                onChange={(e) =>
                  setEditor({ ...editor, texto: e.target.value })
                }
              />
            </label>
            <label>
              Imagens (até 10, 5 MB cada)
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp"
                multiple
                disabled={ocupado}
                onChange={anexar}
              />
            </label>
            <div className="feed-images">
              {editor.previews.map((url, i) => (
                <div key={i}>
                  <img src={url} alt={`Anexo ${i + 1}`} />
                  <button
                    type="button"
                    className="mini-btn"
                    disabled={ocupado}
                    onClick={() =>
                      setEditor({
                        ...editor,
                        imagens: editor.imagens.filter((_, j) => i !== j),
                        previews: editor.previews.filter((_, j) => i !== j),
                      })
                    }
                  >
                    Remover imagem
                  </button>
                </div>
              ))}
            </div>
            {erro && (
              <p className="form-error" role="alert">
                {erro}
              </p>
            )}
          </form>
        </Modal>
      )}
      {confirmar && (
        <Modal
          titulo="Excluir publicação?"
          descricao="A publicação e seus comentários serão removidos do feed."
          onFechar={() => setConfirmar(null)}
          acoes={
            <button
              className="danger-button"
              disabled={ocupado}
              onClick={async () => {
                if (
                  await executar(() => api.excluirPublicacao(confirmar, email))
                )
                  setConfirmar(null);
              }}
            >
              Excluir publicação
            </button>
          }
        />
      )}
    </section>
  );
}
