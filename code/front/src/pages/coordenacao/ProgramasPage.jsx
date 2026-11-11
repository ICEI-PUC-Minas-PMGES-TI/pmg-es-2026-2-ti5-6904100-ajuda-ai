import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { Link, useSearchParams, useNavigate, useOutletContext } from 'react-router-dom';
import { api } from '../../api/client';
import Icon from '../../components/Icon';
import Modal from '../../components/Modal';
import { useToast } from '../../components/Toast';

const ETAPAS = [
  { valor: 'inscricoes', rotulo: 'Inscrições abertas' },
  { valor: 'analise', rotulo: 'Análise de candidaturas' },
  { valor: 'formacao', rotulo: 'Formação dos grupos' },
  { valor: 'andamento', rotulo: 'Programa em andamento' },
  { valor: 'encerramento', rotulo: 'Encerramento' },
];

const TRANSICOES_ETAPA = {
  inscricoes: ['inscricoes', 'encerramento'],
  analise: ['inscricoes', 'analise', 'encerramento'],
  formacao: ['formacao', 'andamento', 'encerramento'],
  andamento: ['andamento', 'encerramento'],
  encerramento: ['encerramento'],
};

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

const PADRAO_CODIGO = /^\d{4}\/[12]$/;

export function sugestaoCronograma(codigo) {
  const [ano, semestre] = codigo.split('/');
  const dia = (mes, d) => `${ano}-${mes}-${d}`;
  return semestre === '1'
    ? {
      inscricoesInicio: dia('02', '01'), inscricoesFim: dia('02', '28'),
      analiseInicio: dia('03', '01'), analiseFim: dia('03', '30'),
      formacaoInicio: dia('04', '01'), formacaoFim: dia('04', '20'),
      andamentoInicio: dia('04', '21'), andamentoFim: dia('06', '15'), encerramentoEm: dia('06', '20'),
    }
    : {
      inscricoesInicio: dia('08', '01'), inscricoesFim: dia('08', '28'),
      analiseInicio: dia('09', '01'), analiseFim: dia('09', '30'),
      formacaoInicio: dia('10', '01'), formacaoFim: dia('10', '20'),
      andamentoInicio: dia('10', '21'), andamentoFim: dia('12', '15'), encerramentoEm: dia('12', '20'),
    };
}

export function validarCronograma(datas, completo = false) {
  let anterior = '';
  let rotuloAnterior = '';
  for (const { chave, rotulo } of DATAS) {
    const valor = datas[chave] || '';
    if (!valor) {
      if (completo) return `Informe ${rotulo.toLowerCase()}.`;
      continue;
    }
    const partes = /^(\d{4})-(\d{2})-(\d{2})$/.exec(valor);
    const data = partes ? new Date(Date.UTC(Number(partes[1]), Number(partes[2]) - 1, Number(partes[3]))) : new Date(NaN);
    if (!partes || data.getUTCFullYear() !== Number(partes[1]) || data.getUTCMonth() !== Number(partes[2]) - 1 || data.getUTCDate() !== Number(partes[3]) || Number(partes[1]) < 2000 || Number(partes[1]) > 2100) {
      return `Data inválida: ${rotulo}. Use uma data real entre 2000 e 2100.`;
    }
    if (anterior && valor < anterior) {
      return `Ordem do cronograma inválida: ${rotulo} deve ser igual ou posterior a ${rotuloAnterior.toLowerCase()}.`;
    }
    anterior = valor;
    rotuloAnterior = rotulo;
  }
  return '';
}

/** Semestre pela data (mesma regra do backend: jan–jun = /1, jul–dez = /2). */
function codigoDaData(data = new Date()) {
  return `${data.getFullYear()}/${data.getMonth() < 6 ? 1 : 2}`;
}

function semestreSeguinte(codigo) {
  const [ano, semestre] = codigo.split('/').map(Number);
  return semestre === 1 ? `${ano}/2` : `${ano + 1}/1`;
}

/** Sugestões para o novo ciclo: o vigente pela data e os próximos, se ainda não existem. */
export function sugestoesDeCiclo(existentes, data = new Date()) {
  const atual = codigoDaData(data);
  const lista = [atual, semestreSeguinte(atual), semestreSeguinte(semestreSeguinte(atual))];
  return lista.filter((codigo) => !existentes.includes(codigo));
}

export default function ProgramasPage() {
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const contexto = useOutletContext() || {};
  const [excluindo, setExcluindo] = useState(null);
  const [confirmacaoExclusao, setConfirmacaoExclusao] = useState('');
  const [erroExclusao, setErroExclusao] = useState('');
  const [ocupadoExclusao, setOcupadoExclusao] = useState(false);
  const [acaoPrograma, setAcaoPrograma] = useState(null);
  const [processandoAcao, setProcessandoAcao] = useState(false);
  const travaExclusao = useRef(false);
  const programaFoco = params.get('programa') || '';
  const pendencia = PENDENCIAS[params.get('pendencia')];
  const mostrarToast = useToast();
  const [programas, setProgramas] = useState(null);
  const [erro, setErro] = useState('');
  const [editando, setEditando] = useState(null);
  const [confirmarCiclo, setConfirmarCiclo] = useState(false);
  const [erroCiclo, setErroCiclo] = useState('');
  const [novoCodigo, setNovoCodigo] = useState('');
  const [criando, setCriando] = useState(null);
  const codigosExistentes = (programas || []).map((p) => p.codigo);
  const sugestoes = sugestoesDeCiclo(codigosExistentes);
  const vigentePelaData = codigoDaData();

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

  useEffect(() => {
    if (params.get('novo') !== '1' || !programas) return;
    iniciarNovoCiclo();
    const novos = new URLSearchParams(params);
    novos.delete('novo');
    setParams(novos, { replace: true });
  }, [programas, params, setParams]);

  function iniciarNovoCiclo() {
    setErroCiclo('');
    setNovoCodigo(sugestoes[0] || '');
    setConfirmarCiclo(true);
  }

  async function abrirCiclo() {
    const codigo = novoCodigo.trim();
    if (!PADRAO_CODIGO.test(codigo)) {
      setErroCiclo('Informe o ciclo no formato AAAA/1 ou AAAA/2 (ex.: 2027/1).');
      return;
    }
    if (codigosExistentes.includes(codigo)) {
      setErroCiclo(`O ciclo ${codigo} já existe.`);
      return;
    }
    const anterior = [...(programas || [])].sort((a, b) => b.codigo.localeCompare(a.codigo)).find((p) => p.requisitosPadrinho?.length);
    setCriando({
      codigo,
      datas: sugestaoCronograma(codigo),
      requisitosPadrinho: (anterior?.requisitosPadrinho || []).map((r) => ({ descricao: r.descricao, obrigatorio: r.obrigatorio !== false })),
      vagasApadrinhados: 80,
      gruposPrevistos: 25,
      etapaAtual: 'inscricoes',
      inscricoesAbertas: true,
    });
    setConfirmarCiclo(false);
  }

  async function excluirPrograma() {
    if (travaExclusao.current || confirmacaoExclusao !== 'COORDENADOR') return;
    travaExclusao.current = true; setOcupadoExclusao(true); setErroExclusao('');
    try {
      await api.excluirPrograma(excluindo.codigo, confirmacaoExclusao);
      setProgramas(lista => lista.filter(p => p.codigo !== excluindo.codigo));
      contexto.programaExcluido?.(excluindo.codigo);
      setExcluindo(null); mostrarToast('Programa excluído.', 'sucesso');
      await carregar();
    } catch(e) {setErroExclusao(e.message || 'Não foi possível excluir o programa.');}
    finally {travaExclusao.current = false; setOcupadoExclusao(false);}
  }

  async function executarAcaoPrograma() {
    if (!acaoPrograma || processandoAcao) return;
    setProcessandoAcao(true);
    try {
      if (acaoPrograma.tipo === 'encerrar') {
        await api.encerrarInscricoes(acaoPrograma.programa.codigo);
        mostrarToast(`Inscrições do programa ${acaoPrograma.programa.codigo} encerradas. Nenhuma candidatura foi decidida.`, 'sucesso');
      } else {
        await api.liberarMatching(acaoPrograma.programa.codigo);
        mostrarToast(`Matching liberado para o programa ${acaoPrograma.programa.codigo}. Os vínculos continuam manuais.`, 'sucesso');
      }
      setAcaoPrograma(null);
      await carregar();
      await contexto.carregarProgramas?.();
    } catch (error) {
      mostrarToast(error.message || 'Não foi possível atualizar o programa.', 'erro');
    } finally {
      setProcessandoAcao(false);
    }
  }

  return (
    <section className="programs-page">
      {excluindo && <ConfirmarExclusaoPrograma programa={excluindo} confirmacao={confirmacaoExclusao} ocupado={ocupadoExclusao} erro={erroExclusao} onAlterar={setConfirmacaoExclusao} onConfirmar={excluirPrograma} onFechar={() => setExcluindo(null)} />}
      {acaoPrograma && (
        <Modal
          titulo={acaoPrograma.tipo === 'encerrar' ? 'Encerrar inscrições?' : 'Liberar matching?'}
          descricao={acaoPrograma.tipo === 'encerrar'
            ? `As inscrições do programa ${acaoPrograma.programa.codigo} serão encerradas. Nenhuma candidatura será aprovada nem vinculada por esta ação.`
            : `O matching do programa ${acaoPrograma.programa.codigo} será liberado para vínculos manuais. É necessário encerrar as inscrições, decidir todas as candidaturas e preparar ao menos um padrinho aprovado.`}
          onFechar={() => { if (!processandoAcao) setAcaoPrograma(null); }}
          acoes={(
            <>
              <button type="button" className="ghost-button" disabled={processandoAcao} onClick={() => setAcaoPrograma(null)}>Cancelar</button>
              <button type="button" className="primary-button inline" disabled={processandoAcao} onClick={executarAcaoPrograma}>
                {processandoAcao ? 'Processando…' : acaoPrograma.tipo === 'encerrar' ? 'Encerrar inscrições' : 'Liberar matching'}
              </button>
            </>
          )}
        >
          {acaoPrograma.tipo === 'liberar' && <p className="detail-muted">A liberação não cria grupos nem define padrinhos automaticamente.</p>}
        </Modal>
      )}
      <header className="dash-header">
        <div>
          <h1>Programas</h1>
          <p>Ciclos do programa de apadrinhamento, etapas, vagas e calendário.</p>
        </div>
        <button type="button" className="primary-button inline" onClick={iniciarNovoCiclo}>
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

      {criando && (
        <EditorPrograma
          programa={criando}
          novo
          onCancelar={() => setCriando(null)}
          onSalvo={async (salvo) => {
            setCriando(null);
            mostrarToast(`Ciclo ${salvo.codigo} aberto.`, 'sucesso');
            await carregar();
            await contexto.carregarProgramas?.();
          }}
        />
      )}

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
                  {!p.inscricoesAbertas && <span className="flag muted">Inscrições encerradas</span>}
                  {p.formularioPublicado && <span className="flag purple">Formulário publicado</span>}
                  {p.matchingLiberado && <span className="flag green">Matching liberado</span>}
                </div>
              </div>
              <button type="button" className="ghost-button" onClick={async () => {
                await contexto.carregarProgramas?.();
                navigate(`/coordenacao?${new URLSearchParams({programa: p.codigo})}`);
              }}>Administrar este programa</button>
              <button type="button" className="ghost-button" aria-expanded={editando === p.codigo} onClick={() => setEditando(editando === p.codigo ? null : p.codigo)}>
                <Icon name="edit" size={16} /> {editando === p.codigo ? 'Fechar configuração' : 'Configurar programa'}
              </button>
              {p.podeEncerrarInscricoes && (
                <button type="button" className="mini-btn danger" onClick={() => setAcaoPrograma({ tipo: 'encerrar', programa: p })}>
                  Encerrar inscrições
                </button>
              )}
              {p.podeLiberarMatching && (
                <button type="button" className="mini-btn primary" onClick={() => setAcaoPrograma({ tipo: 'liberar', programa: p })}>
                  Liberar matching
                </button>
              )}
              {p.matchingLiberado && (
                <Link className="mini-btn primary" to={`/coordenacao/matching?${new URLSearchParams({ programa: p.codigo })}`}>
                  Abrir matching
                </Link>
              )}
              <details className="program-overflow">
                <summary aria-label={`Mais ações do programa ${p.codigo}`}>Mais ações</summary>
                <button type="button" className="ghost-button" onClick={() => {setExcluindo(p); setConfirmacaoExclusao(''); setErroExclusao('');}}>Excluir programa</button>
              </details>
            </header>

            <dl className="program-totals">
              <div><dt>Candidaturas</dt><dd>{p.totais?.candidaturas ?? 0}</dd></div>
              <div><dt>Padrinhos</dt><dd>{p.totais?.padrinhos ?? 0}</dd></div>
              <div><dt>Apadrinhados</dt><dd>{p.totais?.apadrinhados ?? 0}<small> / {p.vagasApadrinhados} vagas</small></dd></div>
              <div><dt>Grupos</dt><dd>{p.totais?.grupos ?? 0}<small> / {p.gruposPrevistos} previstos</small></dd></div>
            </dl>

            <section className="program-requirements" aria-label={`Requisitos para padrinho — ${p.codigo}`}>
              <h3><Icon name="checkCircle" size={16} /> Requisitos para padrinho — {p.codigo}</h3>
              {p.requisitosPadrinho?.length ? (
                <ul className="detail-chips">
                  {p.requisitosPadrinho.map((r) => <li key={r.id}>{r.descricao}{r.obrigatorio ? '' : ' (desejável)'}</li>)}
                </ul>
              ) : (
                <p className="detail-muted">Nenhuma disciplina exigida. Basta estar a partir do 2º período.</p>
              )}
            </section>

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
          descricao="Escolha o semestre. Em seguida você revisa o cronograma sugerido e os requisitos antes de criar o ciclo."
          onFechar={() => setConfirmarCiclo(false)}
          acoes={(
            <>
              <button type="button" className="ghost-button" onClick={() => setConfirmarCiclo(false)} data-autofocus>Cancelar</button>
              <button type="button" className="primary-button inline" onClick={abrirCiclo}>Revisar cronograma</button>
            </>
          )}
        >
          <label className="editor-field" htmlFor="novo-ciclo-codigo">
            <span>Código do ciclo</span>
            <input
              id="novo-ciclo-codigo"
              list="novo-ciclo-sugestoes"
              value={novoCodigo}
              placeholder="Ex.: 2027/1"
              maxLength={6}
              onChange={(e) => { setNovoCodigo(e.target.value); setErroCiclo(''); }}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); abrirCiclo(); } }}
            />
            <datalist id="novo-ciclo-sugestoes">
              {sugestoes.map((codigo) => <option key={codigo} value={codigo} />)}
            </datalist>
          </label>
          <p className="field-hint">
            Pela data de hoje, o ciclo vigente é <strong>{vigentePelaData}</strong>
            {codigosExistentes.includes(vigentePelaData) ? ' (já aberto).' : ' — ainda não aberto: cadastros e candidaturas ficam bloqueados até ele existir.'}
            {' '}O ciclo não é criado automaticamente.
          </p>
          {erroCiclo && <p className="form-error" role="alert">{erroCiclo}</p>}
        </Modal>
      )}
    </section>
  );
}

export function ConfirmarExclusaoPrograma({ programa, confirmacao, ocupado, erro, onAlterar, onConfirmar, onFechar }) {
  const permitido = !ocupado && confirmacao === 'COORDENADOR';
  const fechar = () => { if (!ocupado) onFechar(); };
  return <Modal
    titulo={`Excluir programa ${programa.codigo}?`}
    descricao="A operação é permanente. Programas com candidaturas, participações, histórico, formulários ou comunicados não podem ser excluídos. Encerre o programa nesses casos."
    onFechar={fechar}
    acoes={<>
      <button type="button" disabled={ocupado} onClick={fechar}>Cancelar</button>
      <button type="button" className="danger-button" disabled={!permitido} onClick={() => { if (permitido) onConfirmar(); }}>Excluir definitivamente</button>
    </>}
  >
    <label>Digite COORDENADOR para confirmar<input disabled={ocupado} value={confirmacao} onChange={e => onAlterar(e.target.value)} /></label>
    {erro && <p role="alert">{erro}</p>}
  </Modal>;
}

function EditorPrograma({ programa, onCancelar, onSalvo, novo = false }) {
  const [form, setForm] = useState(() => ({
    etapaAtual: programa.etapaAtual,
    vagasApadrinhados: String(programa.vagasApadrinhados ?? ''),
    gruposPrevistos: String(programa.gruposPrevistos ?? ''),
    ...Object.fromEntries(DATAS.map((d) => [d.chave, programa.datas?.[d.chave] || ''])),
    requisitosPadrinho: (programa.requisitosPadrinho || []).map((r) => ({ ...r })),
  }));
  const [novoRequisito, setNovoRequisito] = useState('');
  const encerrado = programa.etapaAtual === 'encerramento';
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');
  const base = useId();

  function campo(chave, valor) {
    setForm((atual) => ({ ...atual, [chave]: valor }));
    setErro('');
  }

  function adicionarRequisito() {
    const descricao = novoRequisito.trim();
    if (!descricao) return;
    if (form.requisitosPadrinho.some((r) => r.descricao.toLowerCase() === descricao.toLowerCase())) {
      setErro(`"${descricao}" já está na lista.`);
      return;
    }
    campo('requisitosPadrinho', [...form.requisitosPadrinho, { descricao, obrigatorio: true }]);
    setNovoRequisito('');
  }

  function alterarRequisito(indice, parcial) {
    campo('requisitosPadrinho', form.requisitosPadrinho.map((r, i) => (i === indice ? { ...r, ...parcial } : r)));
  }

  async function salvar(event) {
    event.preventDefault();
    const datas = Object.fromEntries(DATAS.map((d) => [d.chave, form[d.chave]]));
    const erroDatas = validarCronograma(datas, novo);
    if (erroDatas) {
      setErro(erroDatas);
      return;
    }
    const corpo = novo
      ? { ...datas, requisitosPadrinho: form.requisitosPadrinho }
      : {
        etapaAtual: form.etapaAtual,
        vagasApadrinhados: Number(form.vagasApadrinhados),
        gruposPrevistos: Number(form.gruposPrevistos),
      };
    if (!novo) {
      DATAS.forEach((d) => {
        if (form[d.chave]) corpo[d.chave] = form[d.chave];
      });
      if (!encerrado) corpo.requisitosPadrinho = form.requisitosPadrinho;
    }
    setSalvando(true);
    try {
      onSalvo(novo
        ? await api.criarPrograma(programa.codigo, corpo)
        : await api.atualizarPrograma(programa.codigo, corpo));
    } catch (error) {
      setErro(error.message || 'Não foi possível salvar o programa.');
    } finally {
      setSalvando(false);
    }
  }

  return (
    <form className="program-editor" onSubmit={salvar}>
      {novo && <h2>Revisar novo ciclo {programa.codigo}</h2>}
      <p className="field-hint">As datas sugeridas aparecem nos campos e só são gravadas quando você confirma. Nenhuma data é ajustada automaticamente.</p>
      {!novo && <>
        <div className="editor-grid">
          <label className="editor-field">
            <span>Etapa atual</span>
            <select value={form.etapaAtual} disabled={encerrado} onChange={(e) => campo('etapaAtual', e.target.value)}>
              {ETAPAS.map((e) => (
                <option
                  key={e.valor}
                  value={e.valor}
                  disabled={!TRANSICOES_ETAPA[programa.etapaAtual]?.includes(e.valor)}
                >
                  {e.rotulo}
                </option>
              ))}
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
        <p className="field-hint">A abertura e o encerramento das inscrições e a liberação do matching são feitas pelas ações do programa para preservar a ordem das etapas.</p>
      </>}
      <fieldset className="editor-dates">
        <legend>Calendário</legend>
        <div className="editor-grid">
          {DATAS.map((d) => (
            <label key={d.chave} className="editor-field" htmlFor={`${base}-${d.chave}`}>
              <span>{d.rotulo}</span>
              <input id={`${base}-${d.chave}`} type="date" value={form[d.chave]} required={novo} onChange={(e) => campo(d.chave, e.target.value)} />
            </label>
          ))}
        </div>
      </fieldset>
      <fieldset className="editor-requirements">
        <legend>Requisitos para padrinho neste ciclo</legend>
        <p className="field-hint">
          {encerrado
            ? 'Ciclo encerrado: os requisitos ficam como registro histórico e não podem ser alterados.'
            : 'Disciplinas ou condições que o candidato a padrinho precisa declarar que cumpre. Valem só para este ciclo; candidaturas já enviadas guardam os requisitos da época.'}
        </p>
        {form.requisitosPadrinho.length === 0 && <p className="detail-muted">Nenhum requisito: basta estar a partir do 2º período.</p>}
        <ul className="requirement-list">
          {form.requisitosPadrinho.map((r, i) => (
            <li key={`${r.id || 'novo'}-${i}`}>
              <span>{r.descricao}</span>
              <label className="requirement-flag">
                <input type="checkbox" checked={r.obrigatorio !== false} disabled={encerrado} onChange={(e) => alterarRequisito(i, { obrigatorio: e.target.checked })} />
                Obrigatório
              </label>
              <button type="button" className="mini-btn danger" disabled={encerrado} onClick={() => campo('requisitosPadrinho', form.requisitosPadrinho.filter((_, j) => j !== i))} aria-label={`Remover requisito ${r.descricao}`}>
                <Icon name="trash" size={14} /> Remover
              </button>
            </li>
          ))}
        </ul>
        {!encerrado && (
          <div className="requirement-add">
            <label className="editor-field" htmlFor={`${base}-novo-requisito`}>
              <span>Adicionar requisito</span>
              <input
                id={`${base}-novo-requisito`}
                value={novoRequisito}
                maxLength={120}
                placeholder="Ex.: Aprovação em Cálculo I"
                onChange={(e) => setNovoRequisito(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); adicionarRequisito(); } }}
              />
            </label>
            <button type="button" className="ghost-button" onClick={adicionarRequisito} disabled={!novoRequisito.trim()}>
              <Icon name="plus" size={15} /> Adicionar
            </button>
          </div>
        )}
      </fieldset>
      {erro && <p className="form-error" role="alert"><Icon name="alert" size={15} /> {erro}</p>}
      <div className="editor-actions">
        <button type="submit" className="primary-button inline" disabled={salvando}><Icon name="save" size={16} /> {salvando ? 'Salvando…' : novo ? 'Confirmar criação' : 'Salvar programa'}</button>
        <button type="button" className="ghost-button" onClick={onCancelar} disabled={salvando}>Cancelar</button>
      </div>
    </form>
  );
}
