import { useCallback, useEffect, useRef, useState } from "react";
import {
  api,
  feedEventsUrl,
  getAlunoSession,
  getStoredToken,
} from "../api/client";
import { abrirFeedStream } from "../api/feed-stream";
import { consultarFeedAutorizado } from "../api/feed-access";
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
  const sessao = getAlunoSession();
  const identidade = coordenacao
    ? getStoredToken()
    : `${sessao?.email}:${sessao?.accessToken}`;
  return <FeedConteudo key={identidade} coordenacao={coordenacao} />;
}

function FeedConteudo({ coordenacao }) {
  const email = coordenacao ? undefined : getAlunoSession()?.email;
  const token = coordenacao ? getStoredToken() : getAlunoSession()?.accessToken;
  const [itens, setItens] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState("");
  const [estado, setEstado] = useState("Conectando às atualizações…");
  const [podePublicar, setPodePublicar] = useState(false);
  const [podeLer, setPodeLer] = useState(null);
  const [editor, setEditor] = useState(null);
  const [ocupado, setOcupado] = useState(false);
  const [confirmar, setConfirmar] = useState(null);
  const [categoria, setCategoria] = useState("");
  // Seletor de semestre (só coordenação): "" = semestre atual.
  const [semestre, setSemestre] = useState("");
  const [ciclos, setCiclos] = useState(null);
  const sequencia = useRef(0);
  const escopo = `${coordenacao}:${email}:${token}:${semestre}`;
  const escopoAtual = useRef(escopo);
  escopoAtual.current = escopo;
  const identidadeAtual = useCallback(
    () =>
      token ===
        (coordenacao ? getStoredToken() : getAlunoSession()?.accessToken) &&
      (coordenacao || email === getAlunoSession()?.email),
    [token, coordenacao, email],
  );
  const limparAcesso = useCallback(() => {
    sequencia.current++;
    setPodeLer(false);
    setPodePublicar(false);
    setItens([]);
    setEditor(null);
    setConfirmar(null);
    setCarregando(false);
  }, []);

  useEffect(() => {
    if (!coordenacao) return undefined;
    let ativo = true;
    api
      .feedCiclos()
      .then((c) => ativo && setCiclos(c))
      .catch(() => {});
    return () => {
      ativo = false;
    };
  }, [coordenacao]);

  const carregar = useCallback(async () => {
    if (escopoAtual.current !== escopo) return;
    if (!token || !identidadeAtual()) {
      limparAcesso();
      return;
    }
    const consulta = ++sequencia.current;
    try {
      const lista = await consultarFeedAutorizado({
        permissoes: () => api.permissoesFeed(email),
        listar: () => api.feed(email, coordenacao ? semestre : undefined),
        vigente: () =>
          consulta === sequencia.current &&
          identidadeAtual() &&
          escopoAtual.current === escopo,
        aoPermissoes: (p) => {
          setPodeLer(p.podeLer === true);
          setPodePublicar(p.podePublicar === true);
          if (!p.podePublicar) setEditor(null);
          if (!p.podeLer) limparAcesso();
        },
      });
      if (lista !== null) {
        setItens(lista);
        setErro("");
      }
    } catch (e) {
      if (
        consulta === sequencia.current &&
        identidadeAtual() &&
        escopoAtual.current === escopo
      ) {
        if ([401, 403].includes(e.status)) limparAcesso();
        setErro(e.message);
      }
    } finally {
      if (consulta === sequencia.current) setCarregando(false);
    }
  }, [email, coordenacao, semestre, identidadeAtual, limparAcesso, escopo]);

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
    const atualizarVisivel = () => {
      if (document.visibilityState !== "hidden") void sincronizar();
    };
    const timer = setInterval(atualizarVisivel, 10000);
    window.addEventListener("focus", atualizarVisivel);
    document.addEventListener("visibilitychange", atualizarVisivel);
    const fechar =
      podeLer === false
        ? () => {}
        : abrirFeedStream({
            url: `${feedEventsUrl}${coordenacao && semestre ? `?programa=${encodeURIComponent(semestre)}` : ""}`,
            token: () => (identidadeAtual() ? token : null),
            onEstado: (valor) => {
              if (ativo) setEstado(valor);
            },
            onEvento: (evento) => {
              if (!ativo || !identidadeAtual()) return;
              if (evento.type === "feed.access") {
                limparAcesso();
                return;
              }
              if (evento.type !== "feed.heartbeat") void sincronizar();
            },
            onSemAcesso: () => {
              if (ativo) limparAcesso();
            },
          });
    return () => {
      ativo = false;
      sequencia.current++;
      fechar();
      clearInterval(timer);
      window.removeEventListener("focus", atualizarVisivel);
      document.removeEventListener("visibilitychange", atualizarVisivel);
    };
  }, [
    carregar,
    coordenacao,
    email,
    token,
    identidadeAtual,
    limparAcesso,
    podeLer,
    semestre,
  ]);

  async function executar(acao) {
    if (!identidadeAtual() || podeLer === false) return false;
    setOcupado(true);
    setErro("");
    try {
      await acao();
      if (escopoAtual.current !== escopo || !identidadeAtual()) return false;
      await carregar();
      return true;
    } catch (e) {
      if (escopoAtual.current !== escopo || !identidadeAtual()) return false;
      if ([401, 403].includes(e.status)) await carregar();
      setErro(e.message);
      return false;
    } finally {
      if (escopoAtual.current === escopo) setOcupado(false);
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
        if (escopoAtual.current !== escopo || !identidadeAtual()) return;
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
      if (escopoAtual.current === escopo && identidadeAtual())
        setErro(e.message);
    } finally {
      if (escopoAtual.current === escopo) setOcupado(false);
    }
  }

  if (podeLer === false)
    return (
      <section className="feed-page" role="status">
        <h1>Feed indisponível</h1>
        <p>{erro || "O feed é dos participantes aprovados do ciclo atual."}</p>
        <button type="button" onClick={carregar}>
          Atualizar acesso
        </button>
      </section>
    );
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
        ciclos,
        semestre,
        setSemestre: (valor) => {
          sequencia.current++;
          setItens([]);
          setEditor(null);
          setConfirmar(null);
          setOcupado(false);
          setCarregando(true);
          setSemestre(valor);
        },
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
  ciclos = null,
  semestre = "",
  setSemestre,
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
  // Semestre anterior: só consulta (e remoção), sem publicar nem editar.
  const consultandoAntigo = Boolean(semestre) && semestre !== ciclos?.atual;
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
        {podePublicar && !consultandoAntigo && (
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
      {ciclos && ciclos.semestres.length > 1 && (
        <label className="feed-filter">
          Semestre
          <select
            value={semestre || ciclos.atual}
            onChange={(event) =>
              setSemestre(
                event.target.value === ciclos.atual ? "" : event.target.value,
              )
            }
          >
            {ciclos.semestres.map((valor) => (
              <option key={valor} value={valor}>
                {valor === ciclos.atual ? `${valor} (atual)` : valor}
              </option>
            ))}
          </select>
        </label>
      )}
      {consultandoAntigo && (
        <p className="empty-copy" role="status">
          Consultando o semestre {semestre}: as publicações ficam somente para
          leitura, e só é possível removê-las.
        </p>
      )}
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
                  {post.cicloAtual !== false && (
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
                  )}
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
