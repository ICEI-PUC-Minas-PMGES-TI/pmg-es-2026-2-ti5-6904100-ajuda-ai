import { useCallback, useEffect, useId, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../../api/client';
import Icon from '../../components/Icon';
import Modal from '../../components/Modal';
import DuplicarFormularioModal from './DuplicarFormularioModal';
import PerguntasAdicionais, { TIPOS_PERGUNTA, tipoPerguntaSuportado } from '../../components/PerguntasAdicionais';
import Toggle from '../../components/Toggle';
import { useToast } from '../../components/Toast';
import { OPERADORES_CONDICAO, operadorPrecisaValor, rotuloCondicao } from '../../formularios/visibilidade';

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

const ROTULO_STATUS = { rascunho: 'Rascunho', publicado: 'Publicado', encerrado: 'Encerrado' };
const MENSAGEM_SALVO = {
  rascunho: 'Formulário salvo como rascunho.',
  publicado: 'Formulário salvo e publicado para os alunos.',
  encerrado: 'Alterações salvas. O formulário segue encerrado.',
};

function rotuloSituacao(formulario) {
  if (formulario.status === 'rascunho' && !formulario.salvo) return 'Sugerido';
  return ROTULO_STATUS[formulario.status] ?? 'Rascunho';
}

/** Só rascunhos nunca publicados saem; os demais guardam a versão das respostas. */
function podeExcluir(formulario) {
  return Boolean(formulario?.salvo) && formulario.status === 'rascunho' && formulario.versao === 0;
}

function paraEdicao(formulario) {
  return {
    publicado: Boolean(formulario?.publicado),
    perguntas: (formulario?.perguntas || []).map((p) => ({ ...p, opcoes: p.opcoes ? [...p.opcoes] : [] })),
  };
}

function serializarCondicao(condicao) {
  if (!condicao?.perguntaId || !condicao?.operador) return undefined;
  const base = { perguntaId: condicao.perguntaId, operador: condicao.operador };
  if (operadorPrecisaValor(condicao.operador)) return { ...base, valor: (condicao.valor || '').trim() };
  return base;
}

function serializar(rascunho) {
  return JSON.stringify({
    publicado: rascunho.publicado,
    perguntas: rascunho.perguntas.map((p) => ({
      id: p.id,
      enunciado: p.enunciado,
      tipo: p.tipo,
      opcoes: comOpcoes(p.tipo) ? p.opcoes : [],
      obrigatoria: Boolean(p.obrigatoria),
      ajuda: (p.ajuda || '').trim(),
      secao: (p.secao || '').trim(),
      matching: comOpcoes(p.tipo) && Boolean(p.matching),
      visivelSe: serializarCondicao(p.visivelSe),
    })),
  });
}

/** Remove condições que apontam para perguntas que não estão mais acima. */
function sanitizarCondicoes(perguntas) {
  const vistos = new Set();
  return perguntas.map((p) => {
    const condicao = p.visivelSe;
    const valida = condicao?.perguntaId && vistos.has(condicao.perguntaId);
    vistos.add(p.id);
    return valida ? p : { ...p, visivelSe: undefined };
  });
}

/** Mensagem do primeiro problema que o servidor também recusaria; '' se estiver válido. */
function validarRascunho(perguntas) {
  const anteriores = new Set();
  for (let i = 0; i < perguntas.length; i += 1) {
    const p = perguntas[i];
    const n = i + 1;
    if (!tipoPerguntaSuportado(p.tipo)) return 'Tipo não suportado: remova ou substitua a pergunta antes de salvar ou publicar.';
    if (!p.enunciado.trim()) return `A pergunta ${n} precisa de um enunciado.`;
    if (comOpcoes(p.tipo)) {
      const opcoes = p.opcoes.map((o) => o.trim()).filter(Boolean);
      if (opcoes.length === 0) return `A pergunta ${n} precisa de pelo menos uma opção.`;
      if (new Set(opcoes).size !== opcoes.length) return `A pergunta ${n} tem opções repetidas.`;
    }
    if (p.visivelSe) {
      if (!anteriores.has(p.visivelSe.perguntaId)) return `A pergunta ${n} só pode depender de uma pergunta anterior.`;
      if (operadorPrecisaValor(p.visivelSe.operador) && !(p.visivelSe.valor || '').trim()) {
        return `A condição da pergunta ${n} precisa de um valor para comparar.`;
      }
    }
    anteriores.add(p.id);
  }
  return '';
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
  const [resumo, setResumo] = useState([]);
  const [confirmarExclusao, setConfirmarExclusao] = useState(false);
  const [excluindo, setExcluindo] = useState(false);
  const [confirmarEncerrar, setConfirmarEncerrar] = useState(false);
  const [encerrando, setEncerrando] = useState(false);
  const [duplicando, setDuplicando] = useState(false);
  const [arrastando, setArrastando] = useState(null);
  const [sobre, setSobre] = useState(null);

  useEffect(() => {
    api.programas().then(setProgramas).catch(() => setProgramas([]));
  }, []);

  /** Situação de cada público no programa (alimenta os selos das abas). */
  const atualizarResumo = useCallback(() => {
    api.formulariosCoordenacao(programaParam || undefined).then(setResumo).catch(() => setResumo([]));
  }, [programaParam]);

  useEffect(() => {
    atualizarResumo();
  }, [atualizarResumo]);

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
      perguntas: sanitizarCondicoes(atual.perguntas.map((p, i) => {
        if (i !== indice) return p;
        const nova = { ...p, ...parcial };
        if (parcial.tipo && comOpcoes(parcial.tipo) && nova.opcoes.length === 0) nova.opcoes = ['Opção 1'];
        if (parcial.tipo && !comOpcoes(parcial.tipo)) nova.matching = false;
        if (parcial.visivelSe === null) nova.visivelSe = undefined;
        return nova;
      })),
    }));
    setErroSalvar('');
  }

  function reordenar(origem, destino) {
    if (origem === destino || origem == null || destino == null) return;
    setRascunho((atual) => {
      const lista = [...atual.perguntas];
      if (origem < 0 || origem >= lista.length || destino < 0 || destino >= lista.length) return atual;
      const [item] = lista.splice(origem, 1);
      lista.splice(destino, 0, item);
      return { ...atual, perguntas: sanitizarCondicoes(lista) };
    });
    setErroSalvar('');
  }

  function mover(indice, direcao) {
    reordenar(indice, indice + direcao);
  }

  function remover(indice) {
    setRascunho((atual) => ({
      ...atual,
      perguntas: sanitizarCondicoes(atual.perguntas.filter((_, i) => i !== indice)),
    }));
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
    const problema = validarRascunho(rascunho.perguntas);
    if (problema) {
      setErroSalvar(problema);
      return;
    }
    setSalvando(true);
    setErroSalvar('');
    try {
      const corpo = JSON.parse(serializar(rascunho));
      const salvo = await api.salvarFormulario(tipo, { programa: formulario.programa, ...corpo });
      setFormulario(salvo);
      setRascunho(paraEdicao(salvo));
      atualizarResumo();
      mostrarToast(MENSAGEM_SALVO[salvo.status] ?? MENSAGEM_SALVO.rascunho, 'sucesso');
    } catch (error) {
      setErroSalvar(error.message || 'Não foi possível salvar o formulário.');
    } finally {
      setSalvando(false);
    }
  }

  async function excluirRascunho() {
    setExcluindo(true);
    setErroSalvar('');
    try {
      const padrao = await api.excluirFormulario(tipo, formulario.programa);
      setFormulario(padrao);
      setRascunho(paraEdicao(padrao));
      atualizarResumo();
      mostrarToast('Rascunho excluído. Voltamos às perguntas sugeridas.', 'sucesso');
    } catch (error) {
      setErroSalvar(error.message || 'Não foi possível excluir o rascunho.');
    } finally {
      setExcluindo(false);
      setConfirmarExclusao(false);
    }
  }

  async function encerrar() {
    setEncerrando(true);
    setErroSalvar('');
    try {
      const encerrado = await api.encerrarFormulario(tipo, { programa: formulario.programa });
      setFormulario(encerrado);
      setRascunho(paraEdicao(encerrado));
      atualizarResumo();
      mostrarToast('Formulário encerrado. As respostas já enviadas foram mantidas.', 'sucesso');
    } catch (error) {
      setErroSalvar(error.message || 'Não foi possível encerrar o formulário.');
    } finally {
      setEncerrando(false);
      setConfirmarEncerrar(false);
    }
  }

  function aposDuplicar(copia) {
    setDuplicando(false);
    mostrarToast(`Formulário duplicado como rascunho para o programa ${copia.programa}.`, 'sucesso');
    const novos = new URLSearchParams(params);
    novos.set('programa', copia.programa);
    setParams(novos);
  }

  const aba = ABAS.find((a) => a.tipo === tipo);
  const programaAtual = formulario?.programa || programaParam;
  const status = formulario?.status || 'rascunho';

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
            {resumo.find((f) => f.tipo === a.tipo) && <small className="forms-tab-status">{rotuloSituacao(resumo.find((f) => f.tipo === a.tipo))}</small>}
          </button>
        ))}
      </div>

      <div className="forms-toolbar">
        <span className={`publish-badge${status === 'publicado' ? ' on' : ''}${status === 'encerrado' ? ' closed' : ''}`}>
          <span className="dot" aria-hidden="true" />
          {status === 'publicado' && 'Formulário publicado'}
          {status === 'encerrado' && 'Formulário encerrado'}
          {status === 'rascunho' && (formulario?.salvo === false ? 'Rascunho (nunca salvo)' : 'Rascunho')}
          {formulario?.versao > 0 && <> · versão {formulario.versao}</>}
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
              descricao={
                status === 'encerrado' && !rascunho.publicado
                  ? 'Encerrado: não aceita novas respostas. Publique e salve para reabrir (nova versão).'
                  : rascunho.publicado
                    ? 'As perguntas aparecem no cadastro depois de salvar. Alterar um formulário publicado cria nova versão.'
                    : 'Enquanto for rascunho, os alunos não veem estas perguntas.'
              }
              checked={rascunho.publicado}
              onChange={(v) => setRascunho((atual) => ({ ...atual, publicado: v }))}
            />
          </div>

          {formulario?.camposFixos?.length > 0 && (
            <details className="fixed-fields">
              <summary><Icon name="lock" size={15} /> Campos fixos do perfil ({formulario.camposFixos.length})</summary>
              <p>Sempre aparecem no cadastro e não podem ser editados aqui. As perguntas abaixo são <strong>personalizadas</strong> e ficam depois deles.</p>
              <ul>
                {formulario.camposFixos.map((campo) => (
                  <li key={campo.id}>
                    {campo.rotulo}
                    {campo.matching && <span className="matching-tag">matching</span>}
                  </li>
                ))}
              </ul>
            </details>
          )}

          {rascunho.perguntas.length === 0 && <p className="empty-copy">Nenhuma pergunta adicional. Adicione a primeira abaixo.</p>}

          <ol className="question-list">
            {rascunho.perguntas.map((pergunta, indice) => (
              <PerguntaEditor
                key={pergunta.id}
                pergunta={pergunta}
                indice={indice}
                anteriores={rascunho.perguntas.slice(0, indice)}
                secoes={[...new Set(rascunho.perguntas.map((p) => (p.secao || '').trim()).filter(Boolean))]}
                total={rascunho.perguntas.length}
                arrastando={arrastando === indice}
                sobre={sobre === indice}
                onDragStart={() => setArrastando(indice)}
                onDragOver={() => setSobre(indice)}
                onDrop={() => { reordenar(arrastando, indice); setArrastando(null); setSobre(null); }}
                onDragEnd={() => { setArrastando(null); setSobre(null); }}
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
            <Link className="outline-button" to={`/coordenacao/formularios/respostas?tipo=${tipo}&programa=${encodeURIComponent(programaAtual)}`}>
              <Icon name="chart" size={18} /> Consultar respostas
            </Link>
            {formulario?.salvo && (
              <button type="button" className="outline-button" onClick={() => setDuplicando(true)} disabled={sujo || programas.length < 2} title={sujo ? 'Salve as alterações antes de duplicar.' : undefined}>
                <Icon name="file" size={18} /> Duplicar para outro programa
              </button>
            )}
            {status === 'publicado' && (
              <button type="button" className="outline-button" onClick={() => setConfirmarEncerrar(true)} disabled={sujo || encerrando} title={sujo ? 'Salve as alterações antes de encerrar.' : undefined}>
                <Icon name="lock" size={18} /> Encerrar novas respostas
              </button>
            )}
            {podeExcluir(formulario) && (
              <button type="button" className="danger-button" onClick={() => setConfirmarExclusao(true)} disabled={excluindo}>
                <Icon name="trash" size={16} /> Excluir rascunho
              </button>
            )}
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

      {confirmarEncerrar && (
        <Modal
          titulo="Encerrar novas respostas?"
          descricao={`Os ${aba.rotulo.toLowerCase()} deixam de poder se cadastrar enquanto o formulário estiver encerrado. As respostas já enviadas são mantidas.`}
          onFechar={() => setConfirmarEncerrar(false)}
          acoes={(
            <>
              <button type="button" className="ghost-button" onClick={() => setConfirmarEncerrar(false)} data-autofocus>Cancelar</button>
              <button type="button" className="danger-button" onClick={encerrar} disabled={encerrando}>{encerrando ? 'Encerrando…' : 'Encerrar'}</button>
            </>
          )}
        />
      )}

      {duplicando && (
        <DuplicarFormularioModal
          tipo={tipo}
          origem={formulario.programa}
          programas={programas}
          onFechar={() => setDuplicando(false)}
          onDuplicado={aposDuplicar}
        />
      )}

      {confirmarExclusao && (
        <Modal
          titulo="Excluir rascunho?"
          descricao={`O rascunho de ${aba.rotulo.toLowerCase()} será apagado e o programa volta às perguntas sugeridas.`}
          onFechar={() => setConfirmarExclusao(false)}
          acoes={(
            <>
              <button type="button" className="ghost-button" onClick={() => setConfirmarExclusao(false)} data-autofocus>Cancelar</button>
              <button type="button" className="danger-button" onClick={excluirRascunho} disabled={excluindo}>{excluindo ? 'Excluindo…' : 'Excluir'}</button>
            </>
          )}
        />
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

export function PerguntaEditor({
  pergunta, indice, total, anteriores = [], secoes = [],
  arrastando, sobre, onDragStart, onDragOver, onDrop, onDragEnd,
  onChange, onMover, onRemover,
}) {
  const enunciadoId = useId();
  const tipoId = useId();
  const ajudaId = useId();
  const secaoId = useId();
  const secoesId = useId();
  const condicaoId = useId();
  const [confirmar, setConfirmar] = useState(false);
  const precisaOpcoes = comOpcoes(pergunta.tipo);
  const condicao = pergunta.visivelSe;
  const perguntaAlvo = anteriores.find((p) => p.id === condicao?.perguntaId);
  const opcoesAlvo = comOpcoes(perguntaAlvo?.tipo) ? (perguntaAlvo.opcoes || []).filter((o) => o.trim()) : [];

  function editarOpcao(i, valor) {
    onChange({ opcoes: pergunta.opcoes.map((o, j) => (j === i ? valor : o)) });
  }

  function editarCondicao(parcial) {
    if (parcial === null) {
      onChange({ visivelSe: null });
      return;
    }
    const atual = condicao || { perguntaId: anteriores[0]?.id || '', operador: 'igual', valor: '' };
    onChange({ visivelSe: { ...atual, ...parcial } });
  }

  return (
    <li
      className={`question-card${arrastando ? ' dragging' : ''}${sobre ? ' drop-target' : ''}`}
      onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; onDragOver?.(); }}
      onDrop={(e) => { e.preventDefault(); onDrop?.(); }}
    >
      <div className="question-head">
        <button
          type="button"
          className="question-grip"
          draggable
          aria-label={`Arrastar pergunta ${indice + 1}`}
          title="Arraste para reordenar"
          onDragStart={(e) => {
            e.dataTransfer.effectAllowed = 'move';
            e.dataTransfer.setData('text/plain', String(indice));
            onDragStart?.();
          }}
          onDragEnd={() => onDragEnd?.()}
        >
          <Icon name="grip" size={16} />
        </button>
        <strong>Pergunta {indice + 1}</strong>
        <span className="matching-tag custom">Personalizada</span>
        {condicao && <span className="matching-tag" title={rotuloCondicao(condicao, anteriores)}>Condicional</span>}
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

      <label className="q-label" htmlFor={ajudaId}>Texto de ajuda (opcional)</label>
      <span className="q-input-wrap">
        <Icon name="help" size={16} />
        <input id={ajudaId} value={pergunta.ajuda || ''} maxLength={300} placeholder="Explique como responder" onChange={(e) => onChange({ ajuda: e.target.value })} />
      </span>

      <label className="q-label" htmlFor={secaoId}>Seção (opcional)</label>
      <span className="q-input-wrap">
        <Icon name="form" size={16} />
        <input id={secaoId} list={secoesId} value={pergunta.secao || ''} maxLength={60} placeholder="Ex.: Rotina e disponibilidade" onChange={(e) => onChange({ secao: e.target.value })} />
        <datalist id={secoesId}>{secoes.map((s) => <option key={s} value={s} />)}</datalist>
      </span>

      <label className="q-label" htmlFor={tipoId}>Tipo de resposta</label>
      {!tipoPerguntaSuportado(pergunta.tipo) && <p className="error-message" role="alert">Tipo não suportado ({String(pergunta.tipo)}). Remova ou substitua esta pergunta.</p>}
      <select id={tipoId} className="q-select" value={pergunta.tipo} onChange={(e) => onChange({ tipo: e.target.value })}>
        {!tipoPerguntaSuportado(pergunta.tipo) && <option value={pergunta.tipo} disabled>Tipo não suportado ({String(pergunta.tipo)})</option>}
        {TIPOS_PERGUNTA.map((t) => <option key={t.valor} value={t.valor}>{t.rotulo}</option>)}
      </select>

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
      {precisaOpcoes && (
        <Toggle className="q-required" label="Usar como critério de matching" descricao="A resposta ficará disponível para combinar padrinhos e apadrinhados." checked={Boolean(pergunta.matching)} onChange={(v) => onChange({ matching: v })} />
      )}

      {anteriores.length > 0 && (
        <div className="q-condition" id={condicaoId}>
          <Toggle
            className="q-required"
            label="Lógica condicional"
            descricao="Mostrar esta pergunta só se a resposta de outra pergunta anterior cumprir a condição."
            checked={Boolean(condicao)}
            onChange={(ligado) => {
              if (!ligado) editarCondicao(null);
              else editarCondicao({ perguntaId: anteriores[anteriores.length - 1].id, operador: 'igual', valor: '' });
            }}
          />
          {condicao && (
            <div className="q-condition-fields">
              <label>
                <span>Pergunta</span>
                <select value={condicao.perguntaId} onChange={(e) => editarCondicao({ perguntaId: e.target.value, valor: '' })}>
                  {anteriores.map((p, i) => (
                    <option key={p.id} value={p.id}>{i + 1}. {p.enunciado.trim() || '(sem enunciado)'}</option>
                  ))}
                </select>
              </label>
              <label>
                <span>Condição</span>
                <select value={condicao.operador} onChange={(e) => editarCondicao({ operador: e.target.value })}>
                  {OPERADORES_CONDICAO.map((op) => <option key={op.valor} value={op.valor}>{op.rotulo}</option>)}
                </select>
              </label>
              {operadorPrecisaValor(condicao.operador) && (
                <label>
                  <span>Valor</span>
                  {opcoesAlvo.length > 0 ? (
                    <select value={condicao.valor || ''} onChange={(e) => editarCondicao({ valor: e.target.value })}>
                      <option value="">Selecione</option>
                      {opcoesAlvo.map((opcao) => <option key={opcao} value={opcao}>{opcao}</option>)}
                    </select>
                  ) : (
                    <input value={condicao.valor || ''} maxLength={300} placeholder="Valor esperado" onChange={(e) => editarCondicao({ valor: e.target.value })} />
                  )}
                </label>
              )}
              <p className="q-hint"><Icon name="info" size={14} /> {rotuloCondicao(condicao, anteriores)}</p>
            </div>
          )}
        </div>
      )}

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
