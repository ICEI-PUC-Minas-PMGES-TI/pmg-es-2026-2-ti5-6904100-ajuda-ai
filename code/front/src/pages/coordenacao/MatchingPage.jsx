import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useOutletContext } from 'react-router-dom';
import { api } from '../../api/client';
import Icon from '../../components/Icon';
import Modal from '../../components/Modal';
import { useToast } from '../../components/Toast';

const STATUS = [
  ['pendente', 'Pendentes'],
  ['aprovada', 'Aprovadas'],
  ['recusada', 'Recusadas'],
  ['obsoleta', 'Desatualizadas'],
];

const TIPOS_CRITERIO = [
  { valor: 'sim_nao', rotulo: 'Sim / Não' },
  { valor: 'escolha_unica', rotulo: 'Escolha única' },
  { valor: 'multipla_escolha', rotulo: 'Múltipla escolha' },
];

const OPERACOES = [
  { valor: 'igualdade', rotulo: 'Igualdade' },
  { valor: 'intersecao', rotulo: 'Interseção' },
  { valor: 'diferenca', rotulo: 'Diferença' },
];

function percentual(valor) {
  return `${Math.round(Number(valor || 0) * 100)}%`;
}

function dataHora(valor) {
  if (!valor) return '—';
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(new Date(valor));
}

function nomePessoa(pessoa) {
  return pessoa?.nome || pessoa?.respostas?.nome || pessoa?.usuarioId || 'Participante';
}

function rotuloTipo(tipo) {
  return TIPOS_CRITERIO.find((t) => t.valor === tipo)?.rotulo || tipo || '—';
}

function CampoPessoa({ pessoa, titulo }) {
  const respostas = pessoa?.respostas || {};
  return (
    <article className="matching-person">
      <span className="matching-role">{titulo}</span>
      <h3>{nomePessoa(pessoa)}</h3>
      <p>{pessoa?.email || pessoa?.usuarioId}</p>
      <dl>
        <div><dt>Curso</dt><dd>{pessoa?.curso || respostas.curso || '—'}</dd></div>
        <div><dt>Período</dt><dd>{pessoa?.periodo || respostas.periodo || '—'}</dd></div>
        <div><dt>Candidatura</dt><dd>{pessoa?.status || '—'}</dd></div>
      </dl>
    </article>
  );
}

function Explicacao({ explicacao }) {
  const criterios = explicacao?.criterios || [];
  return (
    <section className="matching-explanation">
      <div className="matching-score-head">
        <div>
          <h3>Compatibilidade calculada</h3>
          <p>Este score descreve o cálculo configurado; não é probabilidade de sucesso.</p>
        </div>
        <strong>{percentual(explicacao?.score)}</strong>
      </div>
      <div className="matching-criteria-results">
        {criterios.map((criterio, index) => (
          <article key={`${criterio.criterioPadrinhoId || criterio.campoPadrinho}-${index}`}>
            <div>
              <strong>
                {criterio.rotuloPadrinho
                  || criterio.nomePadrinho
                  || criterio.campoPadrinho
                  || `Critério ${criterio.criterioPadrinhoId || index + 1}`}
              </strong>
              <span>Peso {criterio.peso}</span>
            </div>
            {!criterio.considerado ? (
              <p>Não considerado: uma das respostas está ausente.</p>
            ) : (
              <>
                <p className={criterio.compativel ? 'matching-ok' : 'matching-no'}>
                  {criterio.compativel ? 'Compatível' : 'Sem correspondência'}
                  {' · '}contribuição {criterio.contribuicao}/{criterio.peso}
                </p>
                <small>
                  Padrinho: {Array.isArray(criterio.valorPadrinho)
                    ? criterio.valorPadrinho.join(', ')
                    : String(criterio.valorPadrinho)}
                  {' · '}Apadrinhado: {Array.isArray(criterio.valorApadrinhado)
                    ? criterio.valorApadrinhado.join(', ')
                    : String(criterio.valorApadrinhado)}
                </small>
              </>
            )}
          </article>
        ))}
      </div>
    </section>
  );
}

function DetalheSugestao({ id, onFechar, onAlterado }) {
  const toast = useToast();
  const [dados, setDados] = useState(null);
  const [erro, setErro] = useState('');
  const [acao, setAcao] = useState('');
  const [confirmar, setConfirmar] = useState('');
  const [motivo, setMotivo] = useState('');

  useEffect(() => {
    let ativo = true;
    api.sugestaoMatching(id)
      .then((resposta) => { if (ativo) setDados(resposta); })
      .catch((e) => { if (ativo) setErro(e.message); });
    return () => { ativo = false; };
  }, [id]);

  async function decidir(tipo) {
    setAcao(tipo);
    setErro('');
    try {
      if (tipo === 'aprovar') await api.aprovarSugestaoMatching(id);
      else await api.recusarSugestaoMatching(id, motivo.trim());
      toast(tipo === 'aprovar' ? 'Match aprovado e vínculo confirmado.' : 'Sugestão recusada.', 'sucesso');
      onAlterado();
      onFechar();
    } catch (e) {
      setErro(e.message || 'Não foi possível registrar a decisão.');
      setConfirmar('');
      api.sugestaoMatching(id).then(setDados).catch(() => {});
    } finally {
      setAcao('');
    }
  }

  if (!dados && !erro) {
    return <Modal titulo="Comparar candidatos" onFechar={onFechar}><p role="status">Carregando comparação…</p></Modal>;
  }

  return (
    <>
      <Modal
        titulo="Comparar candidatos"
        descricao={`Programa ${dados?.padrinho?.programa || dados?.apadrinhado?.programa || ''}`}
        onFechar={onFechar}
        tamanho="lg"
        className="matching-detail-modal"
        acoes={dados?.status === 'pendente' ? (
          <>
            <button type="button" className="danger-button" onClick={() => setConfirmar('recusar')}>
              Recusar sugestão
            </button>
            <button type="button" className="primary-button inline" onClick={() => setConfirmar('aprovar')}>
              <Icon name="check" size={16} /> Aprovar este par
            </button>
          </>
        ) : null}
      >
        {erro && <p className="dash-inline-error" role="alert">{erro}</p>}
        {dados && (
          <>
            <div className="matching-compare">
              <CampoPessoa pessoa={dados.padrinho} titulo="Padrinho" />
              <span className="matching-compare-link"><Icon name="link" size={22} /></span>
              <CampoPessoa pessoa={dados.apadrinhado} titulo="Apadrinhado" />
            </div>
            <div className="matching-capacity">
              <p>
                <strong>Padrinho:</strong>{' '}
                {dados.capacidade
                  ? `${dados.capacidade.padrinho.restante} de ${dados.capacidade.padrinho.limite} vaga(s) restante(s)`
                  : 'capacidade indisponível'}
              </p>
              <p>
                <strong>Apadrinhado:</strong>{' '}
                {dados.capacidade
                  ? `${dados.capacidade.apadrinhado.restante} de ${dados.capacidade.apadrinhado.limite} vaga(s) restante(s)`
                  : 'capacidade indisponível'}
              </p>
            </div>
            <Explicacao explicacao={dados.explicacao} />
            {dados.status !== 'pendente' && (
              <p className="matching-decision">
                Decisão: <strong>{dados.status}</strong> por {dados.decididaPor || '—'} em {dataHora(dados.decididaEm)}.
                {dados.motivoDecisao ? ` Motivo: ${dados.motivoDecisao}` : ''}
              </p>
            )}
            {dados.outbox?.length > 0 && (
              <p className="matching-chat-note">
                <Icon name="chat" size={16} /> Há {dados.outbox.length} efeito(s) de chat registrado(s) para processamento.
              </p>
            )}
          </>
        )}
      </Modal>
      {confirmar && (
        <Modal
          titulo={confirmar === 'aprovar' ? 'Confirmar este match?' : 'Recusar esta sugestão?'}
          descricao={confirmar === 'aprovar'
            ? `Será criado o vínculo entre ${nomePessoa(dados?.padrinho)} e ${nomePessoa(dados?.apadrinhado)}. As condições serão revalidadas no servidor.`
            : 'A recusa não reprova nenhuma candidatura e não remove vínculos existentes.'}
          onFechar={() => setConfirmar('')}
          acoes={(
            <>
              <button type="button" className="ghost-button" onClick={() => setConfirmar('')}>Cancelar</button>
              <button
                type="button"
                className={confirmar === 'aprovar' ? 'primary-button inline' : 'danger-button'}
                disabled={Boolean(acao)}
                onClick={() => decidir(confirmar)}
              >
                {acao ? 'Registrando…' : confirmar === 'aprovar' ? 'Confirmar match' : 'Confirmar recusa'}
              </button>
            </>
          )}
        >
          {confirmar === 'recusar' && (
            <label className="field-label">
              Motivo administrativo (opcional)
              <textarea maxLength={1000} rows={3} value={motivo} onChange={(e) => setMotivo(e.target.value)} />
            </label>
          )}
          {erro && <p className="form-error" role="alert">{erro}</p>}
        </Modal>
      )}
    </>
  );
}

function rascunhoCriterioVazio() {
  return {
    nome: '',
    descricao: '',
    enunciadoPadrao: '',
    tipo: 'escolha_unica',
    alternativas: [{ id: '', rotulo: '' }, { id: '', rotulo: '' }],
    ativo: true,
  };
}

function EditorCriterioModal({ inicial, onFechar, onSalvo }) {
  const toast = useToast();
  const editando = Boolean(inicial?.id);
  const versao = inicial?.versao || inicial?.versoes?.[0];
  const [form, setForm] = useState(() => {
    if (!inicial) return rascunhoCriterioVazio();
    return {
      nome: inicial.nome || '',
      descricao: inicial.descricao || '',
      enunciadoPadrao: versao?.enunciadoPadrao || '',
      tipo: versao?.tipo || 'escolha_unica',
      alternativas: (versao?.alternativas?.length
        ? versao.alternativas
        : [{ id: '', rotulo: '' }]).map((a) => ({ id: a.id || '', rotulo: a.rotulo || '' })),
      ativo: inicial.ativo !== false,
    };
  });
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');
  const [semelhantes, setSemelhantes] = useState([]);
  const usos = inicial?.usos;

  useEffect(() => {
    const nome = form.nome.trim();
    if (nome.length < 3) {
      setSemelhantes([]);
      return undefined;
    }
    const timer = setTimeout(() => {
      api.criteriosMatchingSemelhantes(nome, inicial?.id)
        .then(setSemelhantes)
        .catch(() => setSemelhantes([]));
    }, 280);
    return () => clearTimeout(timer);
  }, [form.nome, inicial?.id]);

  function alterar(chave, valor) {
    setForm((atual) => {
      const novo = { ...atual, [chave]: valor };
      if (chave === 'tipo' && valor === 'sim_nao') novo.alternativas = [];
      if (chave === 'tipo' && valor !== 'sim_nao' && !atual.alternativas.length) {
        novo.alternativas = [{ id: '', rotulo: '' }, { id: '', rotulo: '' }];
      }
      return novo;
    });
  }

  async function salvar(event) {
    event.preventDefault();
    setSalvando(true);
    setErro('');
    const corpo = {
      nome: form.nome.trim(),
      descricao: form.descricao.trim() || undefined,
      enunciadoPadrao: form.enunciadoPadrao.trim(),
      tipo: form.tipo,
      ativo: form.ativo,
      ...(form.tipo === 'sim_nao'
        ? {}
        : {
          alternativas: form.alternativas
            .map((a) => ({
              ...(a.id.trim() ? { id: a.id.trim() } : {}),
              rotulo: a.rotulo.trim(),
            }))
            .filter((a) => a.rotulo),
        }),
    };
    try {
      if (editando) await api.atualizarCriterioMatching(inicial.id, corpo);
      else await api.criarCriterioMatching(corpo);
      toast(editando ? 'Critério atualizado.' : 'Critério criado no catálogo.', 'sucesso');
      onSalvo();
      onFechar();
    } catch (e) {
      setErro(e.message || 'Não foi possível salvar o critério.');
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Modal
      titulo={editando ? `Editar critério · ${inicial.nome}` : 'Novo critério de matching'}
      descricao="Critérios do catálogo alimentam perguntas de matching nos formulários e a configuração do algoritmo."
      onFechar={onFechar}
      tamanho="lg"
    >
      <form className="matching-config-form matching-catalog-form" onSubmit={salvar}>
        <label>Nome<input value={form.nome} maxLength={120} required onChange={(e) => alterar('nome', e.target.value)} /></label>
        {semelhantes.length > 0 && (
          <p className="matching-help" role="status">
            Definições semelhantes já cadastradas (não serão fundidas automaticamente):{' '}
            {semelhantes.map((s) => `${s.nome}${s.ativo === false ? ' (inativo)' : ''}`).join('; ')}.
            Prefira reutilizar um critério existente se for o mesmo conceito.
          </p>
        )}
        <label>Descrição (opcional)<textarea rows={2} maxLength={1000} value={form.descricao} onChange={(e) => alterar('descricao', e.target.value)} /></label>
        <label>Enunciado padrão<input value={form.enunciadoPadrao} maxLength={200} required onChange={(e) => alterar('enunciadoPadrao', e.target.value)} /></label>
        <label>
          Tipo
          <select value={form.tipo} onChange={(e) => alterar('tipo', e.target.value)}>
            {TIPOS_CRITERIO.map((t) => <option key={t.valor} value={t.valor}>{t.rotulo}</option>)}
          </select>
        </label>
        {form.tipo !== 'sim_nao' && (
          <fieldset className="matching-alt-fields">
            <legend>Alternativas</legend>
            {form.alternativas.map((alt, index) => (
              <div className="matching-alt-row" key={index}>
                <input
                  placeholder="Rótulo"
                  maxLength={80}
                  value={alt.rotulo}
                  onChange={(e) => setForm((atual) => ({
                    ...atual,
                    alternativas: atual.alternativas.map((a, i) => (i === index ? { ...a, rotulo: e.target.value } : a)),
                  }))}
                  required
                />
                <button
                  type="button"
                  className="mini-btn danger"
                  aria-label={`Remover alternativa ${index + 1}`}
                  disabled={form.alternativas.length <= 1}
                  onClick={() => setForm((atual) => ({
                    ...atual,
                    alternativas: atual.alternativas.filter((_, i) => i !== index),
                  }))}
                >
                  <Icon name="trash" size={14} />
                </button>
              </div>
            ))}
            <button
              type="button"
              className="mini-btn"
              disabled={form.alternativas.length >= 30}
              onClick={() => setForm((atual) => ({
                ...atual,
                alternativas: [...atual.alternativas, { id: '', rotulo: '' }],
              }))}
            >
              <Icon name="plus" size={14} /> Alternativa
            </button>
          </fieldset>
        )}
        <label className="matching-check-inline">
          <input type="checkbox" checked={form.ativo} onChange={(e) => alterar('ativo', e.target.checked)} />
          Critério ativo no catálogo
        </label>
        {usos && (
          <p className="matching-help">
            Usos: {(usos.formularios || []).length} formulário(s)
            {(usos.formularios || []).length
              ? ` (${usos.formularios.map((f) => `${f.programa}/${f.tipo}`).join(', ')})`
              : ''}
            {' · '}
            {usos.configuracoes || 0} configuração(ões) de matching.
          </p>
        )}
        {erro && <p className="form-error" role="alert">{erro}</p>}
        <div className="modal-actions matching-inline-actions">
          <button type="button" className="ghost-button" onClick={onFechar}>Cancelar</button>
          <button type="submit" className="primary-button inline" disabled={salvando}>
            {salvando ? 'Salvando…' : editando ? 'Salvar alterações' : 'Criar critério'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function CatalogoCriterios() {
  const toast = useToast();
  const [lista, setLista] = useState([]);
  const [busca, setBusca] = useState('');
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState('');
  const [editor, setEditor] = useState(null);
  const [acaoId, setAcaoId] = useState(null);

  const carregar = useCallback(async (termo = busca) => {
    setCarregando(true);
    setErro('');
    try {
      setLista(await api.criteriosMatching(termo.trim() || undefined));
    } catch (e) {
      setErro(e.message || 'Não foi possível carregar o catálogo.');
    } finally {
      setCarregando(false);
    }
  }, [busca]);

  useEffect(() => { carregar(''); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function alternarAtivo(item) {
    setAcaoId(item.id);
    try {
      await api.ativarCriterioMatching(item.id, !item.ativo);
      toast(item.ativo ? 'Critério desativado.' : 'Critério ativado.', 'sucesso');
      await carregar();
    } catch (e) {
      setErro(e.message);
    } finally {
      setAcaoId(null);
    }
  }

  async function excluir(item) {
    if (!window.confirm(`Excluir o critério “${item.nome}”? Só é possível se não houver usos.`)) return;
    setAcaoId(item.id);
    try {
      await api.excluirCriterioMatching(item.id);
      toast('Critério excluído.', 'sucesso');
      await carregar();
    } catch (e) {
      setErro(e.message);
    } finally {
      setAcaoId(null);
    }
  }

  async function abrirEdicao(item) {
    try {
      const detalhe = await api.criterioMatching(item.id);
      setEditor(detalhe);
    } catch (e) {
      setErro(e.message);
    }
  }

  return (
    <section className="matching-catalog">
      <header className="matching-catalog-head">
        <div>
          <h2>Critérios de matching</h2>
          <p>
            Catálogo reutilizável. Crie aqui e use em{' '}
            <Link to="/coordenacao/formularios">Formulários</Link>
            {' '}via <strong>Adicionar pergunta de matching</strong>. Depois selecione os pares na configuração do algoritmo.
          </p>
        </div>
        <button type="button" className="primary-button inline" onClick={() => setEditor({})}>
          <Icon name="plus" size={16} /> Novo critério
        </button>
      </header>

      <form
        className="matching-catalog-search"
        onSubmit={(e) => { e.preventDefault(); carregar(); }}
      >
        <label>
          <span className="sr-only">Buscar critérios</span>
          <input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar por nome ou descrição"
          />
        </label>
        <button type="submit" className="mini-btn">Buscar</button>
      </form>

      {erro && <div className="dash-inline-error" role="alert">{erro}</div>}
      {carregando && <p className="empty-copy" role="status">Carregando catálogo…</p>}

      {!carregando && !lista.length && (
        <div className="matching-empty">
          <Icon name="spark" size={28} />
          <h3>Nenhum critério no catálogo</h3>
          <p>Crie o primeiro critério para usá-lo nos formulários e na configuração do matching.</p>
        </div>
      )}

      <div className="matching-catalog-list">
        {lista.map((item) => {
          const versao = item.versao;
          const usos = item.usos || {};
          const forms = usos.formularios || [];
          return (
            <article key={item.id} className={`matching-catalog-card${item.ativo ? '' : ' inactive'}`}>
              <div>
                <div className="matching-catalog-title">
                  <strong>{item.nome}</strong>
                  <span className={`status-pill ${item.ativo ? 'aprovada' : 'sem-vinculo'}`}>
                    {item.ativo ? 'Ativo' : 'Inativo'}
                  </span>
                  <span className="matching-tag custom">{rotuloTipo(versao?.tipo)}</span>
                </div>
                <p>{item.descricao || versao?.enunciadoPadrao || 'Sem descrição.'}</p>
                <small>
                  v{item.versaoAtual || versao?.versao || 1}
                  {' · '}
                  {forms.length} formulário(s)
                  {forms.length ? `: ${forms.map((f) => `${f.programa}/${f.tipo}`).join(', ')}` : ''}
                  {' · '}
                  {usos.configuracoes || 0} config(s)
                </small>
              </div>
              <div className="matching-inline-actions">
                <button type="button" className="mini-btn" onClick={() => abrirEdicao(item)}>
                  <Icon name="settings" size={14} /> Editar
                </button>
                <button
                  type="button"
                  className="mini-btn"
                  disabled={acaoId === item.id}
                  onClick={() => alternarAtivo(item)}
                >
                  {item.ativo ? 'Desativar' : 'Ativar'}
                </button>
                <button
                  type="button"
                  className="mini-btn danger"
                  disabled={acaoId === item.id}
                  onClick={() => excluir(item)}
                >
                  <Icon name="trash" size={14} />
                </button>
              </div>
            </article>
          );
        })}
      </div>

      {editor && (
        <EditorCriterioModal
          inicial={editor.id ? editor : null}
          onFechar={() => setEditor(null)}
          onSalvo={() => carregar()}
        />
      )}
    </section>
  );
}

function ConfiguracaoMatching({ programa, visao, onSalvo }) {
  const toast = useToast();
  const atual = visao?.configuracao;
  const disponiveis = visao?.criteriosDisponiveis || [];
  const [aberto, setAberto] = useState(false);
  const [capP, setCapP] = useState(3);
  const [capA, setCapA] = useState(1);
  const [criterios, setCriterios] = useState([]);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');

  useEffect(() => {
    if (!atual) {
      setCapP(3);
      setCapA(1);
      setCriterios([]);
      return;
    }
    setCapP(atual.capacidadePorPadrinho);
    setCapA(atual.capacidadePorApadrinhado);
    setCriterios(
      (atual.criterios || [])
        .filter((c) => c.criterioPadrinhoId && c.criterioApadrinhadoId)
        .map((c) => ({
          criterioPadrinhoId: c.criterioPadrinhoId,
          criterioApadrinhadoId: c.criterioApadrinhadoId,
          operacao: c.operacao || 'igualdade',
          peso: c.peso || 10,
        })),
    );
  }, [atual]);

  const habilitaveis = disponiveis.filter((c) => c.habilitavel);
  const opcoes = (habilitaveis.length ? habilitaveis : disponiveis).filter((c) => c.ativo !== false);

  function alterar(index, chave, valor) {
    setCriterios((lista) => lista.map((item, i) => {
      if (i !== index) return item;
      const novo = { ...item, [chave]: Number(valor) || valor };
      if (chave === 'criterioPadrinhoId') {
        const meta = disponiveis.find((c) => c.id === Number(valor));
        novo.operacao = meta?.tipo === 'multipla_escolha' ? 'intersecao' : 'igualdade';
      }
      return novo;
    }));
  }

  async function salvar(event) {
    event.preventDefault();
    setSalvando(true);
    setErro('');
    try {
      await api.salvarMatchingConfiguracao({
        programa,
        liberado: atual?.liberado === true,
        capacidadePorPadrinho: Number(capP),
        capacidadePorApadrinhado: Number(capA),
        criterios: criterios.map((c) => ({
          criterioPadrinhoId: Number(c.criterioPadrinhoId),
          criterioApadrinhadoId: Number(c.criterioApadrinhadoId),
          operacao: c.operacao,
          peso: Number(c.peso),
        })),
      });
      toast('Configuração de matching salva em uma nova versão.', 'sucesso');
      setAberto(false);
      onSalvo();
    } catch (e) {
      setErro(e.message || 'Não foi possível salvar a configuração.');
    } finally {
      setSalvando(false);
    }
  }

  return (
    <section className="matching-config-card">
      <div>
        <span className="eyebrow">CONFIGURAÇÃO {atual ? `V${atual.versao}` : ''}</span>
        <h2>Critérios e capacidades</h2>
        <p>
          {atual
            ? `${atual.criterios?.length || 0} critério(s) · até ${atual.capacidadePorPadrinho} apadrinhado(s) por padrinho · até ${atual.capacidadePorApadrinhado} padrinho(s) por apadrinhado.`
            : 'Defina critérios do catálogo antes de liberar e executar o matching.'}
        </p>
        <p className="matching-help">
          Os critérios são geridos na aba <strong>Critérios de matching</strong> e inseridos nos formulários
          com <strong>Adicionar pergunta de matching</strong>. Prefira critérios <em>habilitáveis</em>
          (já coletados nos dois públicos).
        </p>
      </div>
      <button type="button" className="mini-btn" onClick={() => setAberto(true)}>
        <Icon name="settings" size={15} /> {atual ? 'Editar configuração' : 'Configurar'}
      </button>
      {aberto && (
        <Modal
          titulo="Configurar matching"
          descricao="Cada salvamento cria uma versão. Selecione pares de critérios do catálogo."
          onFechar={() => setAberto(false)}
          tamanho="lg"
        >
          <form className="matching-config-form" onSubmit={salvar}>
            <div className="matching-cap-fields">
              <label>Limite por padrinho<input type="number" min="1" max="20" value={capP} onChange={(e) => setCapP(e.target.value)} required /></label>
              <label>Limite por apadrinhado<input type="number" min="1" max="20" value={capA} onChange={(e) => setCapA(e.target.value)} required /></label>
            </div>
            <div className="matching-config-head">
              <h3>Pares de critérios</h3>
              <button
                type="button"
                className="mini-btn"
                disabled={!opcoes.length}
                onClick={() => {
                  const primeiro = opcoes[0];
                  setCriterios((lista) => [...lista, {
                    criterioPadrinhoId: primeiro.id,
                    criterioApadrinhadoId: primeiro.id,
                    operacao: primeiro.tipo === 'multipla_escolha' ? 'intersecao' : 'igualdade',
                    peso: 10,
                  }]);
                }}
              >
                <Icon name="plus" size={14} /> Adicionar
              </button>
            </div>
            {!opcoes.length && (
              <p className="matching-help">
                Nenhum critério disponível. Cadastre no catálogo e adicione perguntas de matching nos formulários de padrinho e apadrinhado.
              </p>
            )}
            {criterios.map((criterio, index) => {
              const metaP = disponiveis.find((c) => c.id === Number(criterio.criterioPadrinhoId));
              return (
                <div className="matching-config-row" key={`${index}-${criterio.criterioPadrinhoId}`}>
                  <label>
                    Critério do padrinho
                    <select
                      value={criterio.criterioPadrinhoId || ''}
                      onChange={(e) => alterar(index, 'criterioPadrinhoId', e.target.value)}
                      required
                    >
                      <option value="" disabled>Selecione</option>
                      {disponiveis.map((c) => (
                        <option key={`p-${c.id}`} value={c.id} disabled={!c.ativo && !c.coletadoPadrinho}>
                          {c.nome}
                          {c.habilitavel ? '' : c.coletadoPadrinho ? ' (só padrinho)' : ' (não coletado)'}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Critério do apadrinhado
                    <select
                      value={criterio.criterioApadrinhadoId || ''}
                      onChange={(e) => alterar(index, 'criterioApadrinhadoId', e.target.value)}
                      required
                    >
                      <option value="" disabled>Selecione</option>
                      {disponiveis.map((c) => (
                        <option key={`a-${c.id}`} value={c.id} disabled={!c.ativo && !c.coletadoApadrinhado}>
                          {c.nome}
                          {c.habilitavel ? '' : c.coletadoApadrinhado ? ' (só apadrinhado)' : ' (não coletado)'}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Comparação
                    <select value={criterio.operacao} onChange={(e) => alterar(index, 'operacao', e.target.value)}>
                      {OPERACOES.map((op) => (
                        <option
                          key={op.valor}
                          value={op.valor}
                          disabled={op.valor !== 'igualdade' && metaP?.tipo === 'sim_nao'}
                        >
                          {op.rotulo}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>Peso<input type="number" min="1" max="100" value={criterio.peso} onChange={(e) => alterar(index, 'peso', e.target.value)} /></label>
                  <button type="button" className="mini-btn danger" aria-label="Remover critério" onClick={() => setCriterios((lista) => lista.filter((_, i) => i !== index))}><Icon name="trash" size={14} /></button>
                </div>
              );
            })}
            {!criterios.length && <p className="empty-copy">Adicione ao menos um par de critérios do catálogo.</p>}
            <p className="matching-help">Respostas ausentes são ignoradas no denominador do score; não são tratadas como incompatibilidade.</p>
            {erro && <p className="form-error" role="alert">{erro}</p>}
            <div className="modal-actions matching-inline-actions">
              <button type="button" className="ghost-button" onClick={() => setAberto(false)}>Cancelar</button>
              <button type="submit" className="primary-button inline" disabled={salvando || !criterios.length}>{salvando ? 'Salvando…' : 'Salvar nova versão'}</button>
            </div>
          </form>
        </Modal>
      )}
    </section>
  );
}

export default function MatchingPage() {
  const { programaQ } = useOutletContext();
  const programa = programaQ;
  const toast = useToast();
  const [aba, setAba] = useState('operacao');
  const [visao, setVisao] = useState(null);
  const [execucoes, setExecucoes] = useState([]);
  const [sugestoes, setSugestoes] = useState([]);
  const [status, setStatus] = useState('pendente');
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState('');
  const [executando, setExecutando] = useState(false);
  const [liberando, setLiberando] = useState(false);
  const [confirmarExecucao, setConfirmarExecucao] = useState(false);
  const [detalheId, setDetalheId] = useState(null);

  const carregar = useCallback(async () => {
    if (!programa) return;
    setCarregando(true);
    setErro('');
    try {
      const [v, e, s] = await Promise.all([
        api.matchingVisao(programa),
        api.execucoesMatching(programa),
        api.sugestoesMatching(programa, status),
      ]);
      setVisao(v);
      setExecucoes(e);
      setSugestoes(s);
    } catch (e) {
      setErro(e.message || 'Não foi possível carregar o matching.');
    } finally {
      setCarregando(false);
    }
  }, [programa, status]);

  useEffect(() => { carregar(); }, [carregar]);

  async function alternarLiberacao() {
    setLiberando(true);
    try {
      await api.liberarMatching(programa, !visao.configuracao?.liberado);
      toast(visao.configuracao?.liberado ? 'Matching bloqueado.' : 'Matching liberado.', 'sucesso');
      await carregar();
    } catch (e) {
      setErro(e.message);
    } finally {
      setLiberando(false);
    }
  }

  async function executar() {
    setExecutando(true);
    setConfirmarExecucao(false);
    setErro('');
    try {
      const resposta = await api.executarMatching(programa);
      toast(`Execução concluída: ${resposta.totalSugestoes || 0} sugestão(ões).`, 'sucesso');
      setStatus('pendente');
      await carregar();
    } catch (e) {
      setErro(e.message || 'A execução falhou.');
      await carregar();
    } finally {
      setExecutando(false);
    }
  }

  const totais = visao?.totais || {};
  const ultimaExecucao = execucoes[0];
  const bloqueios = visao?.bloqueios || [];
  const releaseDisabled = !visao?.configuracao;
  const cards = useMemo(() => [
    ['Pessoas elegíveis', `${totais.padrinhosElegiveis || 0} padrinhos · ${totais.apadrinhadosElegiveis || 0} apadrinhados`, 'users'],
    ['Sugestões pendentes', totais.sugestoesPendentes || 0, 'spark'],
    ['Vínculos confirmados', totais.vinculos || 0, 'link'],
    ['Pessoas sem vínculo', totais.pessoasSemVinculo || 0, 'person'],
  ], [totais]);

  return (
    <section className="matching-page">
      <header className="dash-header compact">
        <div>
          <h1>Matching</h1>
          <p>Gere uma alocação viável, compare cada par e confirme os vínculos individualmente. Programa {programa}.</p>
        </div>
        {aba === 'operacao' && (
          <div className="matching-run-actions">
            <button type="button" className="mini-btn" disabled={releaseDisabled || liberando} onClick={alternarLiberacao}>
              <Icon name={visao?.configuracao?.liberado ? 'lock' : 'checkCircle'} size={15} />
              {liberando ? 'Atualizando…' : visao?.configuracao?.liberado ? 'Bloquear matching' : 'Liberar matching'}
            </button>
            <button type="button" className="primary-button inline" disabled={!visao?.podeExecutar || executando} onClick={() => setConfirmarExecucao(true)}>
              <Icon name="spark" size={16} /> {executando ? 'Executando…' : 'Gerar sugestões'}
            </button>
          </div>
        )}
      </header>

      <div className="forms-tabs" role="tablist" aria-label="Seções do matching">
        <button type="button" role="tab" aria-selected={aba === 'operacao'} className={`forms-tab${aba === 'operacao' ? ' active' : ''}`} onClick={() => setAba('operacao')}>
          Operação
        </button>
        <button type="button" role="tab" aria-selected={aba === 'criterios'} className={`forms-tab${aba === 'criterios' ? ' active' : ''}`} onClick={() => setAba('criterios')}>
          Critérios de matching
        </button>
      </div>

      {aba === 'criterios' && <CatalogoCriterios />}

      {aba === 'operacao' && (
        <>
          {erro && <div className="dash-inline-error" role="alert">{erro}<button type="button" onClick={carregar}>Tentar novamente</button></div>}
          {carregando && !visao && <p className="empty-copy" role="status">Carregando matching…</p>}

          {visao && (
            <>
              <div className={`matching-gate ${visao.podeExecutar ? 'ready' : 'blocked'}`}>
                <Icon name={visao.podeExecutar ? 'checkCircle' : 'alert'} size={20} />
                <div>
                  <strong>{visao.podeExecutar ? 'Pronto para executar' : 'Matching bloqueado'}</strong>
                  {visao.podeExecutar
                    ? <p>Inscrições encerradas, etapa liberada e candidatos elegíveis disponíveis.</p>
                    : <ul>{bloqueios.map((item) => <li key={item}>{item}</li>)}</ul>}
                </div>
              </div>

              <div className="matching-summary">
                {cards.map(([titulo, valor, icon]) => (
                  <article key={titulo}><Icon name={icon} size={20} /><div><strong>{valor}</strong><span>{titulo}</span></div></article>
                ))}
              </div>

              <ConfiguracaoMatching programa={programa} visao={visao} onSalvo={carregar} />

              <section className="matching-results">
                <div className="matching-results-head">
                  <div>
                    <h2>Sugestões</h2>
                    <p>
                      {ultimaExecucao
                        ? `Última execução ${ultimaExecucao.status} em ${dataHora(ultimaExecucao.criadoEm)} · configuração v${ultimaExecucao.configSnapshot?.versao || '—'}.`
                        : 'Nenhuma execução registrada.'}
                    </p>
                  </div>
                  <div className="forms-tabs" role="tablist" aria-label="Situação das sugestões">
                    {STATUS.map(([valor, rotulo]) => (
                      <button key={valor} type="button" role="tab" aria-selected={status === valor} className={`forms-tab${status === valor ? ' active' : ''}`} onClick={() => setStatus(valor)}>{rotulo}</button>
                    ))}
                  </div>
                </div>

                {!carregando && !sugestoes.length && (
                  <div className="matching-empty">
                    <Icon name="spark" size={28} />
                    <h3>Nenhuma sugestão {STATUS.find(([v]) => v === status)?.[1].toLowerCase()}</h3>
                    <p>{status === 'pendente' ? 'Execute o matching ou revise os bloqueios acima.' : 'Não há resultados neste estado.'}</p>
                  </div>
                )}
                <div className="matching-list">
                  {sugestoes.map((sugestao) => (
                    <article key={sugestao.id} className={`matching-row ${sugestao.status}`}>
                      <div className="matching-pair">
                        <div><small>Padrinho</small><strong>{nomePessoa(sugestao.padrinho)}</strong><span>{sugestao.padrinho?.curso || 'Curso não informado'}</span></div>
                        <Icon name="link" size={20} />
                        <div><small>Apadrinhado</small><strong>{nomePessoa(sugestao.apadrinhado)}</strong><span>{sugestao.apadrinhado?.curso || 'Curso não informado'}</span></div>
                      </div>
                      <div className="matching-row-score"><strong>{percentual(sugestao.score)}</strong><span>score calculado</span></div>
                      <span className={`status-pill ${sugestao.status === 'aprovada' ? 'aprovada' : sugestao.status === 'recusada' ? 'rejeitada' : sugestao.status === 'obsoleta' ? 'sem-vinculo' : 'analise'}`}>{sugestao.status}</span>
                      <button type="button" className="mini-btn" onClick={() => setDetalheId(sugestao.id)}><Icon name="eye" size={15} /> Comparar</button>
                    </article>
                  ))}
                </div>
              </section>

              {!visao.chat?.disponivel && (
                <div className="matching-chat-warning">
                  <Icon name="chat" size={18} />
                  <div><strong>Integração de chat pendente</strong><p>{visao.chat.mensagem} {visao.chat.pendencias} evento(s) aguardando processamento.</p></div>
                </div>
              )}
            </>
          )}
        </>
      )}

      {confirmarExecucao && (
        <Modal
          titulo="Gerar nova rodada de sugestões?"
          descricao="A execução usa a configuração atual e os vínculos existentes. Sugestões pendentes de rodadas anteriores ficarão desatualizadas; decisões e vínculos já confirmados serão preservados."
          onFechar={() => setConfirmarExecucao(false)}
          acoes={(
            <>
              <button type="button" className="ghost-button" onClick={() => setConfirmarExecucao(false)}>Cancelar</button>
              <button type="button" className="primary-button inline" onClick={executar}>Executar matching</button>
            </>
          )}
        >
          <p className="matching-help">O algoritmo maximiza primeiro a quantidade de pares viáveis e depois a compatibilidade total, respeitando capacidade em ambos os lados e desempate estável.</p>
        </Modal>
      )}
      {detalheId && <DetalheSugestao id={detalheId} onFechar={() => setDetalheId(null)} onAlterado={carregar} />}
    </section>
  );
}
