import { useCallback, useEffect, useId, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../../api/client';
import Icon from '../../components/Icon';
import Modal from '../../components/Modal';
import PerguntasAdicionais, { TIPOS_PERGUNTA } from '../../components/PerguntasAdicionais';
import Toggle from '../../components/Toggle';
import { useToast } from '../../components/Toast';

const ABAS = [
  { tipo: 'apadrinhado', rotulo: 'Apadrinhados' },
  { tipo: 'padrinho', rotulo: 'Padrinhos' },
];

let contadorLocal = 0;
function novoId() {
  contadorLocal += 1;
  return `pergunta-${Date.now().toString(36)}-${contadorLocal}`;
}

function comOpcoes(tipo) {
  return tipo === 'checklist' || tipo === 'dropdown';
}

function paraEdicao(formulario) {
  return {
    publicado: Boolean(formulario?.publicado),
    perguntas: (formulario?.perguntas || []).map((p) => ({ ...p, opcoes: p.opcoes ? [...p.opcoes] : [] })),
  };
}

function serializar(rascunho) {
  return JSON.stringify({
    publicado: rascunho.publicado,
    perguntas: rascunho.perguntas.map((p) => ({ id: p.id, enunciado: p.enunciado, tipo: p.tipo, opcoes: comOpcoes(p.tipo) ? p.opcoes : [], obrigatoria: Boolean(p.obrigatoria) })),
  });
}

export default function FormulariosPage() {
  const [params, setParams] = useSearchParams();
  const tipo = params.get('tipo') === 'padrinho' ? 'padrinho' : 'apadrinhado';
  const programaParam = params.get('programa') || '';
  const mostrarToast = useToast();

  const [programas, setProgramas] = useState([]);
  const [formulario, setFormulario] = useState(null);
  const [rascunho, setRascunho] = useState(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState('');
  const [erroSalvar, setErroSalvar] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [previa, setPrevia] = useState(false);
  const [respostasPrevia, setRespostasPrevia] = useState({});
  const [descartar, setDescartar] = useState(null);

  useEffect(() => {
    api.programas().then(setProgramas).catch(() => setProgramas([]));
  }, []);

  const carregar = useCallback(async () => {
    setCarregando(true);
    setErro('');
    setErroSalvar('');
    setFormulario(null);
    setRascunho(null);
    try {
      const dados = await api.formularioCoordenacao(tipo, programaParam || undefined);
      setFormulario(dados);
      setRascunho(paraEdicao(dados));
    } catch (error) {
      setErro(error.message || 'Não foi possível carregar o formulário.');
    } finally {
      setCarregando(false);
    }
  }, [tipo, programaParam]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  const sujo = useMemo(() => formulario && rascunho && serializar(rascunho) !== serializar(paraEdicao(formulario)), [formulario, rascunho]);

  function trocar(chave, valor) {
    const aplicar = () => {
      const novos = new URLSearchParams(params);
      novos.set(chave, valor);
      setParams(novos);
    };
    if (sujo) setDescartar(() => aplicar);
    else aplicar();
  }

  function editarPergunta(indice, parcial) {
    setRascunho((atual) => ({
      ...atual,
      perguntas: atual.perguntas.map((p, i) => {
        if (i !== indice) return p;
        const nova = { ...p, ...parcial };
        if (parcial.tipo && comOpcoes(parcial.tipo) && nova.opcoes.length === 0) nova.opcoes = ['Opção 1'];
        return nova;
      }),
    }));
    setErroSalvar('');
  }

  function mover(indice, direcao) {
    setRascunho((atual) => {
      const lista = [...atual.perguntas];
      const alvo = indice + direcao;
      if (alvo < 0 || alvo >= lista.length) return atual;
      [lista[indice], lista[alvo]] = [lista[alvo], lista[indice]];
      return { ...atual, perguntas: lista };
    });
  }

  function remover(indice) {
    setRascunho((atual) => ({ ...atual, perguntas: atual.perguntas.filter((_, i) => i !== indice) }));
  }

  function adicionar() {
    setRascunho((atual) => ({
      ...atual,
      perguntas: [...atual.perguntas, { id: novoId(), enunciado: '', tipo: 'texto_curto', opcoes: [], obrigatoria: false }],
    }));
    window.setTimeout(() => {
      const campos = document.querySelectorAll('.question-card .question-statement');
      campos[campos.length - 1]?.focus();
    }, 0);
  }

  async function salvar() {
    setSalvando(true);
    setErroSalvar('');
    try {
      const corpo = JSON.parse(serializar(rascunho));
      const salvo = await api.salvarFormulario(tipo, { programa: formulario.programa, ...corpo });
      setFormulario(salvo);
      setRascunho(paraEdicao(salvo));
      mostrarToast(salvo.publicado ? 'Formulário salvo e publicado para os alunos.' : 'Formulário salvo como rascunho.', 'sucesso');
    } catch (error) {
      setErroSalvar(error.message || 'Não foi possível salvar o formulário.');
    } finally {
      setSalvando(false);
    }
  }

  const aba = ABAS.find((a) => a.tipo === tipo);
  const programaAtual = formulario?.programa || programaParam;

  return (
    <section className="forms-page">
      <header className="dash-header">
        <div>
          <span className="eyebrow"><Icon name="clipboard" size={15} /> FORMULÁRIOS</span>
          <h1>Gerenciador de Formulários: {aba.rotulo}</h1>
          <p>Configure as perguntas adicionais que aparecem no cadastro dos {aba.rotulo.toLowerCase()} do programa.</p>
        </div>
      </header>

      <div className="forms-tabs" role="tablist" aria-label="Tipo de formulário">
        {ABAS.map((a) => (
          <button key={a.tipo} type="button" role="tab" aria-selected={a.tipo === tipo} className={`forms-tab${a.tipo === tipo ? ' active' : ''}`} onClick={() => a.tipo !== tipo && trocar('tipo', a.tipo)}>
            {a.rotulo}
          </button>
        ))}
      </div>

      <div className="forms-toolbar">
        <span className={`publish-badge${formulario?.publicado ? ' on' : ''}`}>
          <span className="dot" aria-hidden="true" />
          {formulario?.publicado ? 'Formulário publicado' : formulario?.salvo === false ? 'Rascunho (nunca salvo)' : 'Rascunho'}
          {sujo && <em> · alterações não salvas</em>}
        </span>
        <label className="filter-select program-picker">
          <Icon name="calendar" size={16} />
          <span className="sr-only">Programa</span>
          <select value={programaAtual} onChange={(e) => trocar('programa', e.target.value)}>
            {!programas.some((p) => p.codigo === programaAtual) && programaAtual && <option value={programaAtual}>Programa {programaAtual}</option>}
            {programas.map((p) => <option key={p.codigo} value={p.codigo}>{p.nome || `Programa ${p.codigo}`}{p.vigente ? ' (vigente)' : ''}</option>)}
          </select>
        </label>
      </div>

      {carregando && !rascunho && <div className="coord-state" role="status"><div className="coord-spinner" aria-hidden="true" /><p>Carregando formulário…</p></div>}
      {erro && <div className="dash-inline-error" role="alert">{erro}<button type="button" onClick={carregar}>Tentar novamente</button></div>}

      {rascunho && (
        <>
          <div className="forms-publish">
            <Toggle
              label="Publicar para os alunos"
              descricao={rascunho.publicado ? 'As perguntas aparecem no cadastro depois de salvar.' : 'Enquanto for rascunho, os alunos não veem estas perguntas.'}
              checked={rascunho.publicado}
              onChange={(v) => setRascunho((atual) => ({ ...atual, publicado: v }))}
            />
          </div>

          {rascunho.perguntas.length === 0 && <p className="empty-copy">Nenhuma pergunta adicional. Adicione a primeira abaixo.</p>}

          <ol className="question-list">
            {rascunho.perguntas.map((pergunta, indice) => (
              <PerguntaEditor
                key={pergunta.id}
                pergunta={pergunta}
                indice={indice}
                total={rascunho.perguntas.length}
                onChange={(parcial) => editarPergunta(indice, parcial)}
                onMover={(d) => mover(indice, d)}
                onRemover={() => remover(indice)}
              />
            ))}
          </ol>

          <button type="button" className="add-question" onClick={adicionar} disabled={rascunho.perguntas.length >= 30}>
            <Icon name="plus" size={18} /> Adicionar nova pergunta
          </button>

          {erroSalvar && <p className="form-error" role="alert"><Icon name="alert" size={16} /> {erroSalvar}</p>}

          <div className="forms-actions">
            <button type="button" className="primary-button" onClick={salvar} disabled={salvando}>
              <Icon name="save" size={18} /> {salvando ? 'Salvando…' : 'Salvar alterações'}
            </button>
            <button type="button" className="outline-button" onClick={() => { setRespostasPrevia({}); setPrevia(true); }}>
              <Icon name="eye" size={18} /> Ver prévia do formulário
            </button>
            <button type="button" className="link-btn" onClick={() => (sujo ? setDescartar(() => carregar) : carregar())}>Cancelar</button>
          </div>
          <p className="forms-hint"><Icon name="info" size={15} /> As alterações ficam disponíveis para os {aba.rotulo.toLowerCase()} após salvar com o formulário publicado.</p>
        </>
      )}

      {previa && rascunho && (
        <Modal titulo={`Prévia: cadastro de ${aba.rotulo.toLowerCase()}`} descricao="É assim que o aluno vê a seção de perguntas adicionais." onFechar={() => setPrevia(false)} tamanho="lg">
          {rascunho.perguntas.length === 0 ? (
            <p className="empty-copy">Sem perguntas adicionais — o aluno verá apenas os campos padrão do cadastro.</p>
          ) : (
            <div className="preview-form">
              {!rascunho.publicado && <p className="detail-warn"><Icon name="alert" size={15} /> Rascunho: os alunos só verão estas perguntas depois de publicar e salvar.</p>}
              <PerguntasAdicionais
                perguntas={rascunho.perguntas.filter((p) => p.enunciado.trim())}
                valores={respostasPrevia}
                onChange={(id, valor) => setRespostasPrevia((atual) => ({ ...atual, [id]: valor }))}
              />
            </div>
          )}
        </Modal>
      )}

      {descartar && (
        <Modal
          titulo="Descartar alterações?"
          descricao="As alterações não salvas neste formulário serão perdidas."
          onFechar={() => setDescartar(null)}
          acoes={(
            <>
              <button type="button" className="ghost-button" onClick={() => setDescartar(null)} data-autofocus>Continuar editando</button>
              <button type="button" className="danger-button" onClick={() => { const fn = descartar; setDescartar(null); fn(); }}>Descartar</button>
            </>
          )}
        />
      )}
    </section>
  );
}

function PerguntaEditor({ pergunta, indice, total, onChange, onMover, onRemover }) {
  const enunciadoId = useId();
  const tipoId = useId();
  const [confirmar, setConfirmar] = useState(false);
  const precisaOpcoes = comOpcoes(pergunta.tipo);

  function editarOpcao(i, valor) {
    onChange({ opcoes: pergunta.opcoes.map((o, j) => (j === i ? valor : o)) });
  }

  return (
    <li className="question-card">
      <div className="question-head">
        <span className="question-grip" aria-hidden="true"><Icon name="grip" size={16} /></span>
        <strong>Pergunta {indice + 1}</strong>
        <div className="question-tools">
          <button type="button" className="icon-square" onClick={() => onMover(-1)} disabled={indice === 0} aria-label={`Mover pergunta ${indice + 1} para cima`}><Icon name="arrowUp" size={16} /></button>
          <button type="button" className="icon-square" onClick={() => onMover(1)} disabled={indice === total - 1} aria-label={`Mover pergunta ${indice + 1} para baixo`}><Icon name="arrowDown" size={16} /></button>
          <button type="button" className="icon-square danger" onClick={() => setConfirmar(true)} aria-label={`Excluir pergunta ${indice + 1}`}><Icon name="trash" size={16} /></button>
        </div>
      </div>

      <label className="q-label" htmlFor={enunciadoId}>Enunciado</label>
      <span className="q-input-wrap">
        <Icon name="chat" size={16} />
        <input id={enunciadoId} className="question-statement" value={pergunta.enunciado} maxLength={200} placeholder="Digite a pergunta" onChange={(e) => onChange({ enunciado: e.target.value })} aria-invalid={!pergunta.enunciado.trim() || undefined} />
      </span>
      {!pergunta.enunciado.trim() && <span className="error-message">O enunciado é obrigatório.</span>}

      <label className="q-label" htmlFor={tipoId}>Tipo de resposta</label>
      <select id={tipoId} className="q-select" value={pergunta.tipo} onChange={(e) => onChange({ tipo: e.target.value })}>
        {TIPOS_PERGUNTA.map((t) => <option key={t.valor} value={t.valor}>{t.rotulo}</option>)}
      </select>
      {pergunta.tipo === 'upload' && <p className="q-hint"><Icon name="info" size={14} /> O envio de arquivos ainda não está disponível para os alunos: o campo aparece desabilitado e não é obrigatório.</p>}

      {precisaOpcoes && (
        <fieldset className="q-options">
          <legend>Opções</legend>
          {pergunta.opcoes.map((opcao, i) => (
            <div key={i} className="q-option">
              <span className={`q-option-mark ${pergunta.tipo}`} aria-hidden="true" />
              <input value={opcao} maxLength={80} onChange={(e) => editarOpcao(i, e.target.value)} aria-label={`Opção ${i + 1} da pergunta ${indice + 1}`} placeholder={`Opção ${i + 1}`} />
              <button type="button" className="icon-square danger" onClick={() => onChange({ opcoes: pergunta.opcoes.filter((_, j) => j !== i) })} disabled={pergunta.opcoes.length <= 1} aria-label={`Remover opção ${i + 1}`}><Icon name="trash" size={15} /></button>
            </div>
          ))}
          <button type="button" className="add-option" onClick={() => onChange({ opcoes: [...pergunta.opcoes, `Opção ${pergunta.opcoes.length + 1}`] })} disabled={pergunta.opcoes.length >= 20}>
            <Icon name="plus" size={15} /> Adicionar opção
          </button>
        </fieldset>
      )}

      <Toggle className="q-required" label="Resposta obrigatória" checked={pergunta.obrigatoria} onChange={(v) => onChange({ obrigatoria: v })} />

      {confirmar && (
        <Modal
          titulo={`Excluir pergunta ${indice + 1}?`}
          descricao={pergunta.enunciado ? `“${pergunta.enunciado}” será removida ao salvar.` : 'A pergunta será removida ao salvar.'}
          onFechar={() => setConfirmar(false)}
          acoes={(
            <>
              <button type="button" className="ghost-button" onClick={() => setConfirmar(false)} data-autofocus>Cancelar</button>
              <button type="button" className="danger-button" onClick={() => { setConfirmar(false); onRemover(); }}>Excluir</button>
            </>
          )}
        />
      )}
    </li>
  );
}
