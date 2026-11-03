import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { api } from '../../api/client';
import Icon from '../../components/Icon';
import { useToast } from '../../components/Toast';
import { formatarData } from '../aluno/util';

const PUBLICOS = [
  { valor: 'todos', rotulo: 'Todos os participantes' },
  { valor: 'padrinhos', rotulo: 'Somente padrinhos' },
  { valor: 'apadrinhados', rotulo: 'Somente apadrinhados' },
];

const ROTULO_PUBLICO = { todos: 'Todos', padrinhos: 'Padrinhos', apadrinhados: 'Apadrinhados' };

export default function ComunicadosPage() {
  const mostrarToast = useToast();
  const [avisos, setAvisos] = useState(null);
  const [erroLista, setErroLista] = useState('');
  const [form, setForm] = useState({ titulo: '', descricao: '', publico: 'todos' });
  const [erros, setErros] = useState({});
  const [enviando, setEnviando] = useState(false);
  const [erroEnvio, setErroEnvio] = useState('');
  const tituloRef = useRef(null);
  const ids = { titulo: useId(), descricao: useId(), publico: useId() };

  const carregar = useCallback(async () => {
    setErroLista('');
    try {
      setAvisos(await api.avisos());
    } catch (error) {
      setErroLista(error.message || 'Não foi possível carregar os comunicados.');
    }
  }, []);

  useEffect(() => {
    carregar();
  }, [carregar]);

  function campo(chave, valor) {
    setForm((atual) => ({ ...atual, [chave]: valor }));
    setErros((atual) => ({ ...atual, [chave]: false }));
    setErroEnvio('');
  }

  async function enviar(event) {
    event.preventDefault();
    const novos = { titulo: !form.titulo.trim(), descricao: !form.descricao.trim() };
    setErros(novos);
    if (novos.titulo || novos.descricao) return;
    setEnviando(true);
    try {
      await api.criarComunicado({
        titulo: form.titulo.trim(),
        descricao: form.descricao.trim(),
        publico: form.publico,
      });
      setForm({ titulo: '', descricao: '', publico: form.publico });
      mostrarToast('Comunicado publicado para os alunos.', 'sucesso');
      carregar();
      tituloRef.current?.focus();
    } catch (error) {
      setErroEnvio(error.message || 'Não foi possível publicar o comunicado.');
    } finally {
      setEnviando(false);
    }
  }

  return (
    <section className="coord-settings">
      <header className="dash-header">
        <div>
          <span className="eyebrow"><Icon name="megaphone" size={15} /> COMUNICADOS</span>
          <h1>Comunicados</h1>
          <p>Envie notificações para padrinhos, apadrinhados ou todos os participantes do programa.</p>
        </div>
      </header>

      <div className="coord-settings-grid">
        <section className="dash-card" aria-labelledby="comunicados-titulo">
          <h2 id="comunicados-titulo"><Icon name="megaphone" size={18} /> Criar comunicado</h2>
          <form className="announce-form" onSubmit={enviar} noValidate>
            <label htmlFor={ids.titulo}>Título</label>
            <input
              ref={tituloRef}
              id={ids.titulo}
              value={form.titulo}
              maxLength={120}
              onChange={(e) => campo('titulo', e.target.value)}
              aria-invalid={erros.titulo || undefined}
              placeholder="Ex.: Encontro de boas-vindas"
            />
            {erros.titulo && <span className="error-message">Informe o título.</span>}

            <label htmlFor={ids.descricao}>Mensagem</label>
            <textarea
              id={ids.descricao}
              rows={4}
              value={form.descricao}
              maxLength={600}
              onChange={(e) => campo('descricao', e.target.value)}
              aria-invalid={erros.descricao || undefined}
              placeholder="Escreva o comunicado para os participantes…"
            />
            <span className="char-hint">{form.descricao.length}/600</span>
            {erros.descricao && <span className="error-message">Escreva a mensagem.</span>}

            <label htmlFor={ids.publico}>Público</label>
            <select id={ids.publico} value={form.publico} onChange={(e) => campo('publico', e.target.value)}>
              {PUBLICOS.map((p) => (
                <option key={p.valor} value={p.valor}>{p.rotulo}</option>
              ))}
            </select>

            {erroEnvio && (
              <p className="form-error" role="alert">
                <Icon name="alert" size={15} /> {erroEnvio}
              </p>
            )}
            <button type="submit" className="primary-button" disabled={enviando}>
              <Icon name="send" size={17} /> {enviando ? 'Publicando…' : 'Publicar comunicado'}
            </button>
          </form>
        </section>

        <section className="dash-card" aria-labelledby="lista-comunicados">
          <h2 id="lista-comunicados"><Icon name="bell" size={18} /> Comunicados publicados</h2>
          {erroLista && (
            <div className="dash-inline-error" role="alert">
              {erroLista}
              <button type="button" onClick={carregar}>Tentar novamente</button>
            </div>
          )}
          {!avisos && !erroLista && <p className="empty-copy" role="status">Carregando…</p>}
          {avisos?.length === 0 && <p className="empty-copy">Nenhum comunicado publicado.</p>}
          <ul className="announce-list">
            {avisos?.map((a) => (
              <li key={a.id}>
                <div className="announce-head">
                  <strong>{a.titulo}</strong>
                  <span className="flag purple">{ROTULO_PUBLICO[a.publico] || a.publico}</span>
                </div>
                <p>{a.descricao}</p>
                <small>{formatarData(a.data)}</small>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </section>
  );
}
