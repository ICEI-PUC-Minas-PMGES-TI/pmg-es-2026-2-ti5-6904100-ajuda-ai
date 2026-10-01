import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../../api/client';
import Icon from '../../components/Icon';
import Modal from '../../components/Modal';
import Toggle from '../../components/Toggle';
import { useToast } from '../../components/Toast';

const ETAPAS = [
  { valor: 'inscricoes', rotulo: 'Inscrições abertas' },
  { valor: 'analise', rotulo: 'Análise de candidaturas' },
  { valor: 'formacao', rotulo: 'Formação dos grupos' },
  { valor: 'andamento', rotulo: 'Programa em andamento' },
  { valor: 'encerramento', rotulo: 'Encerramento' },
];

const DATAS = [
  { chave: 'inscricoesInicio', rotulo: 'Início das inscrições' },
  { chave: 'inscricoesFim', rotulo: 'Fim das inscrições' },
  { chave: 'analiseInicio', rotulo: 'Início da análise' },
  { chave: 'analiseFim', rotulo: 'Fim da análise' },
  { chave: 'formacaoInicio', rotulo: 'Início da formação dos grupos' },
  { chave: 'formacaoFim', rotulo: 'Fim da formação dos grupos' },
  { chave: 'andamentoInicio', rotulo: 'Início das atividades' },
  { chave: 'andamentoFim', rotulo: 'Fim das atividades' },
  { chave: 'encerramentoEm', rotulo: 'Encerramento' },
];

const PENDENCIAS = {
  grupos: {
    titulo: 'Grupos abaixo do previsto',
    texto: 'Há menos grupos formados do que o previsto. Revise a quantidade de grupos previstos ou defina padrinhos para os apadrinhados sem vínculo.',
    link: { status: 'sem_vinculo', rotulo: 'Ver apadrinhados sem vínculo' },
  },
  prazo: {
    titulo: 'Prazo de inscrições',
    texto: 'O prazo de inscrições está próximo ou já passou. Revise as datas e se as inscrições continuam abertas.',
  },
};

export default function ProgramasPage() {
  const [params] = useSearchParams();
  const programaFoco = params.get('programa') || '';
  const pendencia = PENDENCIAS[params.get('pendencia')];
  const mostrarToast = useToast();
  const [programas, setProgramas] = useState(null);
  const [erro, setErro] = useState('');
  const [editando, setEditando] = useState(null);
  const [confirmarCiclo, setConfirmarCiclo] = useState(false);
  const [abrindo, setAbrindo] = useState(false);
  const [erroCiclo, setErroCiclo] = useState('');

  const carregar = useCallback(async () => {
    setErro('');
    try {
      const lista = await api.programas();
      setProgramas(lista);
      return lista;
    } catch (error) {
      setErro(error.message || 'Não foi possível carregar os programas.');
      return null;
    }
  }, []);

  const abrirEditorRef = useRef(Boolean(pendencia));
  useEffect(() => {
    carregar().then((lista) => {
      if (lista && abrirEditorRef.current) {
        abrirEditorRef.current = false;
        const alvo = lista.find((p) => p.codigo === programaFoco) || lista.find((p) => p.vigente) || lista[0];
        if (alvo) setEditando(alvo.codigo);
      }
    });
  }, [carregar, programaFoco]);

  async function abrirCiclo() {
    setAbrindo(true);
    setErroCiclo('');
    try {
      const criado = await api.criarPrograma();
      setConfirmarCiclo(false);
      mostrarToast(`Ciclo ${criado.codigo} aberto.`, 'sucesso');
      await carregar();
    } catch (error) {
      setErroCiclo(error.message || 'Não foi possível abrir o novo ciclo.');
    } finally {
      setAbrindo(false);
    }
  }

  return (
    <section className="programs-page">
      <header className="dash-header">
        <div>
          <h1>Programas</h1>
          <p>Ciclos do programa de apadrinhamento, etapas, vagas e calendário.</p>
        </div>
        <button type="button" className="primary-button inline" onClick={() => { setErroCiclo(''); setConfirmarCiclo(true); }}>
          <Icon name="plus" size={17} /> Abrir novo ciclo
        </button>
      </header>

      {pendencia && (
        <div className="pending-banner" role="status">
          <Icon name="alert" size={20} />
          <div>
            <strong>{pendencia.titulo}</strong>
            <p>{pendencia.texto}</p>
            {pendencia.link && (
              <Link className="text-link" to={`/coordenacao/candidaturas?${new URLSearchParams({ ...(programaFoco ? { programa: programaFoco } : {}), status: pendencia.link.status })}`}>
                {pendencia.link.rotulo} <Icon name="arrow" size={14} />
              </Link>
            )}
          </div>
        </div>
      )}

      {erro && <div className="dash-inline-error" role="alert">{erro}<button type="button" onClick={carregar}>Tentar novamente</button></div>}
      {!programas && !erro && <div className="coord-state" role="status"><div className="coord-spinner" aria-hidden="true" /><p>Carregando programas…</p></div>}
      {programas?.length === 0 && <p className="empty-copy">Nenhum programa cadastrado. Abra o primeiro ciclo.</p>}

      <div className="program-list">
        {programas?.map((p) => (
          <article key={p.codigo} className={`program-card${p.codigo === programaFoco ? ' focus' : ''}`} aria-labelledby={`prog-${p.id}`}>
            <header className="program-card-head">
              <div>
                <h2 id={`prog-${p.id}`}>{p.nome || p.titulo}</h2>
                <div className="summary-flags">
                  <span className={`flag ${p.encerrado ? 'muted' : 'purple'}`}>{p.statusRotulo}</span>
                  {p.vigente && <span className="flag green">Vigente</span>}
                  {p.inscricoesAbertas && <span className="flag purple">Inscrições abertas</span>}
                  {p.formularioPublicado && <span className="flag purple">Formulário publicado</span>}
                  {p.matchingPendente && <span className="flag amber">Matching pendente</span>}
                </div>
              </div>
              <button type="button" className="ghost-button" aria-expanded={editando === p.codigo} onClick={() => setEditando(editando === p.codigo ? null : p.codigo)}>
                <Icon name="edit" size={16} /> {editando === p.codigo ? 'Fechar edição' : 'Editar'}
              </button>
            </header>

            <dl className="program-totals">
              <div><dt>Candidaturas</dt><dd>{p.totais?.candidaturas ?? 0}</dd></div>
              <div><dt>Padrinhos</dt><dd>{p.totais?.padrinhos ?? 0}</dd></div>
              <div><dt>Apadrinhados</dt><dd>{p.totais?.apadrinhados ?? 0}<small> / {p.vagasApadrinhados} vagas</small></dd></div>
              <div><dt>Grupos</dt><dd>{p.totais?.grupos ?? 0}<small> / {p.gruposPrevistos} previstos</small></dd></div>
            </dl>

            <ol className="program-stages" aria-label="Etapas">
              {p.etapas.map((e) => (
                <li key={e.id} className={e.estado}>
                  <span className="stage-dot" aria-hidden="true">{e.estado === 'concluida' && <Icon name="check" size={12} />}</span>
                  <strong>{e.titulo}{e.estado === 'atual' && <span className="sr-only"> (etapa atual)</span>}</strong>
                  <small>{e.periodoTexto}</small>
                </li>
              ))}
            </ol>

            {editando === p.codigo && (
              <EditorPrograma
                programa={p}
                onCancelar={() => setEditando(null)}
                onSalvo={(atualizado) => {
                  setProgramas((lista) => lista.map((item) => (item.codigo === atualizado.codigo ? { ...item, ...atualizado } : item)));
                  setEditando(null);
                  mostrarToast(`Programa ${atualizado.codigo} atualizado.`, 'sucesso');
                  carregar();
                }}
              />
            )}
          </article>
        ))}
      </div>

      {confirmarCiclo && (
        <Modal
          titulo="Abrir novo ciclo?"
          descricao="Um novo programa será criado com o próximo código de semestre e as etapas padrão."
          onFechar={() => !abrindo && setConfirmarCiclo(false)}
          acoes={(
            <>
              <button type="button" className="ghost-button" onClick={() => setConfirmarCiclo(false)} disabled={abrindo} data-autofocus>Cancelar</button>
              <button type="button" className="primary-button inline" onClick={abrirCiclo} disabled={abrindo}>{abrindo ? 'Abrindo…' : 'Abrir ciclo'}</button>
            </>
          )}
        >
          {erroCiclo && <p className="form-error" role="alert">{erroCiclo}</p>}
        </Modal>
      )}
    </section>
  );
}

function EditorPrograma({ programa, onCancelar, onSalvo }) {
  const [form, setForm] = useState(() => ({
    etapaAtual: programa.etapaAtual,
    inscricoesAbertas: programa.inscricoesAbertas,
    matchingPendente: programa.matchingPendente,
    vagasApadrinhados: String(programa.vagasApadrinhados ?? ''),
    gruposPrevistos: String(programa.gruposPrevistos ?? ''),
    ...Object.fromEntries(DATAS.map((d) => [d.chave, programa.datas?.[d.chave] || ''])),
  }));
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');
  const base = useId();

  function campo(chave, valor) {
    setForm((atual) => ({ ...atual, [chave]: valor }));
    setErro('');
  }

  async function salvar(event) {
    event.preventDefault();
    const corpo = {
      etapaAtual: form.etapaAtual,
      inscricoesAbertas: form.inscricoesAbertas,
      matchingPendente: form.matchingPendente,
      vagasApadrinhados: Number(form.vagasApadrinhados),
      gruposPrevistos: Number(form.gruposPrevistos),
    };
    DATAS.forEach((d) => {
      if (form[d.chave]) corpo[d.chave] = form[d.chave];
    });
    setSalvando(true);
    try {
      onSalvo(await api.atualizarPrograma(programa.codigo, corpo));
    } catch (error) {
      setErro(error.message || 'Não foi possível salvar o programa.');
    } finally {
      setSalvando(false);
    }
  }

  return (
    <form className="program-editor" onSubmit={salvar}>
      <div className="editor-grid">
        <label className="editor-field">
          <span>Etapa atual</span>
          <select value={form.etapaAtual} onChange={(e) => campo('etapaAtual', e.target.value)}>
            {ETAPAS.map((e) => <option key={e.valor} value={e.valor}>{e.rotulo}</option>)}
          </select>
        </label>
        <label className="editor-field">
          <span>Vagas para apadrinhados</span>
          <input type="number" min="0" max="10000" value={form.vagasApadrinhados} onChange={(e) => campo('vagasApadrinhados', e.target.value)} required />
        </label>
        <label className="editor-field">
          <span>Grupos previstos</span>
          <input type="number" min="0" max="10000" value={form.gruposPrevistos} onChange={(e) => campo('gruposPrevistos', e.target.value)} required />
        </label>
      </div>
      <div className="editor-toggles">
        <Toggle label="Inscrições abertas" checked={form.inscricoesAbertas} onChange={(v) => campo('inscricoesAbertas', v)} />
        <Toggle label="Matching pendente" descricao="Sinaliza no dashboard que a formação de grupos está em andamento." checked={form.matchingPendente} onChange={(v) => campo('matchingPendente', v)} />
      </div>
      <fieldset className="editor-dates">
        <legend>Calendário</legend>
        <div className="editor-grid">
          {DATAS.map((d) => (
            <label key={d.chave} className="editor-field" htmlFor={`${base}-${d.chave}`}>
              <span>{d.rotulo}</span>
              <input id={`${base}-${d.chave}`} type="date" value={form[d.chave]} onChange={(e) => campo(d.chave, e.target.value)} />
            </label>
          ))}
        </div>
      </fieldset>
      {erro && <p className="form-error" role="alert"><Icon name="alert" size={15} /> {erro}</p>}
      <div className="editor-actions">
        <button type="submit" className="primary-button inline" disabled={salvando}><Icon name="save" size={16} /> {salvando ? 'Salvando…' : 'Salvar programa'}</button>
        <button type="button" className="ghost-button" onClick={onCancelar} disabled={salvando}>Cancelar</button>
      </div>
    </form>
  );
}
