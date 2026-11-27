import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { api } from '../../api/client';
import Icon from '../../components/Icon';
import Modal from '../../components/Modal';
import Toggle from '../../components/Toggle';
import { useToast } from '../../components/Toast';

/** Limites iguais aos do servidor (que continua sendo a autoridade). */
export const LIMITES_CONQUISTA = { nomeMax: 80, descricaoMax: 500, imagemMax: 500, xpMax: 50 };

export const ROTULO_ESTADO = { rascunho: 'Rascunho', publicada: 'Publicada', arquivada: 'Arquivada' };
const TOM_ESTADO = { rascunho: 'amber', publicada: 'green', arquivada: 'muted' };
export const ROTULO_PUBLICO_CONQUISTA = { TODOS: 'Todos os participantes', PADRINHOS: 'Padrinhos', APADRINHADOS: 'Apadrinhados' };
const FILTROS = [
  { valor: 'todas', rotulo: 'Todas' },
  { valor: 'publicada', rotulo: 'Publicadas' },
  { valor: 'rascunho', rotulo: 'Rascunhos' },
  { valor: 'arquivada', rotulo: 'Arquivadas' },
];

/** Campos que a API congela depois da primeira publicação. */
export const CONGELADOS_CONQUISTA = ['criterio', 'meta', 'publico', 'programaCodigo', 'xp'];

export function formDaConquista(c) {
  return {
    nome: c?.nome ?? '',
    descricao: c?.descricao ?? '',
    imagemUrl: c?.imagemUrl ?? '',
    criterio: c?.criterio ?? 'MISSOES_CONCLUIDAS',
    meta: c?.meta != null ? String(c.meta) : '3',
    publico: c?.publico ?? 'TODOS',
    programaCodigo: c?.programaCodigo ?? '',
    xp: c?.xp != null ? String(c.xp) : '0',
    publicar: false,
  };
}

/**
 * Mensagem do primeiro problema do formulário, ou '' se está pronto.
 * Repete as regras do servidor para avisar antes de enviar.
 */
export function validarConquista(form, criterios = []) {
  const L = LIMITES_CONQUISTA;
  if (!form.nome.trim()) return 'Informe o nome da conquista.';
  if (form.nome.trim().length > L.nomeMax) return `O nome tem no máximo ${L.nomeMax} caracteres.`;
  if (!form.descricao.trim()) return 'Informe a descrição da conquista.';
  if (form.imagemUrl.trim() && !/^https:\/\/\S+$/i.test(form.imagemUrl.trim())) return 'A imagem precisa ser um endereço https://.';
  const def = criterios.find((c) => c.criterio === form.criterio);
  if (criterios.length && !def) return 'Escolha um critério da lista.';
  const meta = Number(form.meta);
  if (!Number.isInteger(meta) || form.meta === '') return 'A meta precisa ser um número inteiro.';
  if (def && (meta < def.metaMin || meta > def.metaMax)) return `Para "${def.rotulo}", a meta vai de ${def.metaMin} a ${def.metaMax}.`;
  if (form.publico === 'APADRINHADOS' && form.criterio === 'FEED_PUBLICACOES') return 'Só padrinhos com dupla publicam no feed: escolha outro público ou outro critério.';
  const xp = Number(form.xp);
  if (!Number.isInteger(xp) || xp < 0 || xp > L.xpMax) return `O XP vai de 0 a ${L.xpMax} (0 = só a medalha).`;
  return '';
}

/** Corpo da criação, já normalizado para a API. */
export function corpoCriacaoConquista(form) {
  return {
    nome: form.nome.trim(),
    descricao: form.descricao.trim(),
    imagemUrl: form.imagemUrl.trim() || null,
    criterio: form.criterio,
    meta: Number(form.meta),
    publico: form.publico,
    programaCodigo: form.programaCodigo || null,
    xp: Number(form.xp),
    publicar: form.publicar,
  };
}

/** Só o que mudou em relação à conquista salva (para o PATCH). */
export function alteracoesConquista(original, form) {
  const novo = corpoCriacaoConquista(form);
  delete novo.publicar;
  const atual = {
    nome: original.nome,
    descricao: original.descricao,
    imagemUrl: original.imagemUrl ?? null,
    criterio: original.criterio,
    meta: original.meta,
    publico: original.publico,
    programaCodigo: original.programaCodigo ?? null,
    xp: original.xp,
  };
  return Object.fromEntries(Object.entries(novo).filter(([k, v]) => v !== atual[k]));
}

function ordenar(lista) {
  const ordem = { publicada: 0, rascunho: 1, arquivada: 2 };
  return [...lista].sort((a, b) => ordem[a.estado] - ordem[b.estado] || b.criadoEm.localeCompare(a.criadoEm));
}

export function ListaConquistas({ conquistas, ocupadoId = null, onEditar, onPublicar, onArquivar, onExcluir }) {
  return (
    <div className="users-table-wrap">
      <table className="users-table recompensas-table">
        <caption className="sr-only">Conquistas</caption>
        <thead>
          <tr>
            <th scope="col">Conquista</th>
            <th scope="col">Estado</th>
            <th scope="col">Critério</th>
            <th scope="col">Público</th>
            <th scope="col">XP</th>
            <th scope="col">Obtida por</th>
            <th scope="col"><span className="sr-only">Ações</span></th>
          </tr>
        </thead>
        <tbody>
          {conquistas.map((c) => {
            const ocupado = ocupadoId === c.id;
            return (
              <tr key={c.id} className={c.estado === 'publicada' ? undefined : 'inativo'}>
                <td data-label="Conquista">
                  <span className="user-cell">
                    {c.imagemUrl
                      ? <img className="recompensa-thumb" src={c.imagemUrl} alt="" loading="lazy" />
                      : <span className="pucstop-icon" aria-hidden="true"><Icon name="trophy" size={16} /></span>}
                    <span>
                      <strong>{c.nome}</strong>
                      <small className="recompensa-sub">{c.programaCodigo ? `Só no ciclo ${c.programaCodigo}` : 'Todos os ciclos'}</small>
                    </span>
                  </span>
                </td>
                <td data-label="Estado"><span className={`flag ${TOM_ESTADO[c.estado] || 'muted'}`}>{ROTULO_ESTADO[c.estado] || c.estado}</span></td>
                <td data-label="Critério">{c.criterioTexto}</td>
                <td data-label="Público">{ROTULO_PUBLICO_CONQUISTA[c.publico] || c.publico}</td>
                <td data-label="XP">{c.xp > 0 ? `+${c.xp} XP` : 'Só a medalha'}</td>
                <td data-label="Obtida por">{c.desbloqueios === 1 ? '1 aluno' : `${c.desbloqueios} alunos`}</td>
                <td className="user-actions">
                  <div>
                    <button type="button" className="mini-btn" disabled={ocupado} onClick={() => onEditar?.(c)} aria-label={`Editar conquista ${c.nome}`}>
                      <Icon name="edit" size={14} /> Editar
                    </button>
                    {c.estado !== 'publicada' && (
                      <button type="button" className="mini-btn" disabled={ocupado} onClick={() => onPublicar?.(c)} aria-label={`Publicar conquista ${c.nome}`}>
                        <Icon name="send" size={14} /> {c.estado === 'arquivada' ? 'Republicar' : 'Publicar'}
                      </button>
                    )}
                    {c.estado === 'publicada' && (
                      <button type="button" className="mini-btn" disabled={ocupado} onClick={() => onArquivar?.(c)} aria-label={`Arquivar conquista ${c.nome}`}>
                        <Icon name="history" size={14} /> Arquivar
                      </button>
                    )}
                    {c.podeExcluir && (
                      <button type="button" className="mini-btn" disabled={ocupado} onClick={() => onExcluir?.(c)} aria-label={`Excluir conquista ${c.nome}`}>
                        <Icon name="trash" size={14} /> Excluir
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function FormularioConquista({ original, criterios = [], programas = [], onCancelar, onSalvo }) {
  const criando = !original;
  const congelado = Boolean(original?.publicadaEm);
  const [form, setForm] = useState(() => formDaConquista(original));
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');
  const trava = useRef(false);
  const base = useId();
  const formId = `${base}-form`;
  const L = LIMITES_CONQUISTA;
  const def = criterios.find((c) => c.criterio === form.criterio);

  const erroValidacao = validarConquista(form, criterios);
  const alteracoes = criando ? null : alteracoesConquista(original, form);
  const semAlteracoes = !criando && Object.keys(alteracoes).length === 0;
  const podeSalvar = !salvando && !erroValidacao && !semAlteracoes;

  const campo = (nome, valor) => setForm((f) => ({ ...f, [nome]: valor }));
  const fechar = () => { if (!salvando) onCancelar(); };

  async function salvar(evento) {
    evento.preventDefault();
    if (!podeSalvar || trava.current) return;
    trava.current = true;
    setSalvando(true);
    setErro('');
    try {
      const salvo = criando
        ? await api.criarConquista(corpoCriacaoConquista(form))
        : await api.atualizarConquista(original.id, { atualizadoEm: original.atualizadoEm, ...alteracoes });
      onSalvo(salvo, criando);
    } catch (error) {
      setErro(error.message || 'Não foi possível salvar a conquista.');
    } finally {
      trava.current = false;
      setSalvando(false);
    }
  }

  return (
    <Modal
      titulo={criando ? 'Nova conquista' : `Editar "${original.nome}"`}
      descricao={congelado
        ? 'Já publicada: critério, meta, público, programa e XP ficam como os alunos viram. Dá para mudar nome, descrição e imagem.'
        : 'A conquista é desbloqueada pelo servidor quando o aluno cumpre o critério com o que fez de verdade no app.'}
      onFechar={fechar}
      tamanho="lg"
      className="recompensa-modal"
      acoes={(
        <>
          <button type="button" className="ghost-button" onClick={fechar} disabled={salvando}>Cancelar</button>
          <button type="submit" form={formId} className="primary-button inline" disabled={!podeSalvar}>
            <Icon name="save" size={16} /> {salvando ? 'Salvando…' : criando ? (form.publicar ? 'Criar e publicar' : 'Criar rascunho') : 'Salvar alterações'}
          </button>
        </>
      )}
    >
      <form id={formId} className="pucstop-form recompensa-form" onSubmit={salvar} noValidate>
        <label className="editor-field" htmlFor={`${base}-nome`}>
          <span>Nome <strong className="recompensa-obrigatorio" aria-hidden="true">*</strong></span>
          <input id={`${base}-nome`} value={form.nome} maxLength={L.nomeMax} required aria-required="true" data-autofocus placeholder="Ex.: Explorador do campus" onChange={(e) => campo('nome', e.target.value)} />
        </label>
        <label className="editor-field" htmlFor={`${base}-descricao`}>
          <span>Descrição <strong className="recompensa-obrigatorio" aria-hidden="true">*</strong></span>
          <textarea id={`${base}-descricao`} className="detail-textarea" rows={2} maxLength={L.descricaoMax} required aria-required="true" value={form.descricao} onChange={(e) => campo('descricao', e.target.value)} />
        </label>
        <label className="editor-field" htmlFor={`${base}-imagem`}>
          <span>Imagem (URL https, opcional)</span>
          <input id={`${base}-imagem`} type="url" inputMode="url" maxLength={L.imagemMax} placeholder="https://…" value={form.imagemUrl} onChange={(e) => campo('imagemUrl', e.target.value)} />
        </label>

        <fieldset className="recompensa-bloco" disabled={congelado}>
          <legend>Critério de desbloqueio</legend>
          <div className="editor-grid pucstop-grid">
            <label className="editor-field" htmlFor={`${base}-criterio`}>
              <span>Condição</span>
              <select id={`${base}-criterio`} value={form.criterio} onChange={(e) => campo('criterio', e.target.value)}>
                {criterios.map((c) => <option key={c.criterio} value={c.criterio}>{c.rotulo}</option>)}
              </select>
            </label>
            <label className="editor-field" htmlFor={`${base}-meta`}>
              <span>Meta{def ? ` (${def.metaMin} a ${def.metaMax})` : ''}</span>
              <input id={`${base}-meta`} type="number" inputMode="numeric" min={def?.metaMin} max={def?.metaMax} step="1" value={form.meta} onChange={(e) => campo('meta', e.target.value)} />
            </label>
            <label className="editor-field" htmlFor={`${base}-publico`}>
              <span>Público</span>
              <select id={`${base}-publico`} value={form.publico} onChange={(e) => campo('publico', e.target.value)}>
                {Object.entries(ROTULO_PUBLICO_CONQUISTA).map(([valor, rotulo]) => <option key={valor} value={valor}>{rotulo}</option>)}
              </select>
            </label>
            <label className="editor-field" htmlFor={`${base}-programa`}>
              <span>Programa</span>
              <select id={`${base}-programa`} value={form.programaCodigo} onChange={(e) => campo('programaCodigo', e.target.value)}>
                <option value="">Todos os ciclos</option>
                {form.programaCodigo && !programas.some((p) => p.codigo === form.programaCodigo) && <option value={form.programaCodigo}>{form.programaCodigo}</option>}
                {programas.map((p) => <option key={p.codigo} value={p.codigo}>{p.titulo ? `${p.codigo} — ${p.titulo}` : p.codigo}</option>)}
              </select>
            </label>
            <label className="editor-field" htmlFor={`${base}-xp`}>
              <span>XP ao desbloquear (0 a {L.xpMax})</span>
              <input id={`${base}-xp`} type="number" inputMode="numeric" min="0" max={L.xpMax} step="1" value={form.xp} onChange={(e) => campo('xp', e.target.value)} />
            </label>
          </div>
          <p className="field-hint">
            {def?.escopo === 'GERAL'
              ? 'Vale para a carreira inteira: cada aluno desbloqueia uma vez.'
              : 'Conta o que o aluno fez no semestre: pode ser obtida de novo em outro ciclo.'}
            {' '}O XP é opcional e entra no teto geral do semestre; não repete o XP das missões.
          </p>
        </fieldset>

        {criando && (
          <div className="editor-toggles">
            <Toggle label="Publicar agora" descricao="Desligado, fica como rascunho até você publicar." checked={form.publicar} onChange={(v) => campo('publicar', v)} />
          </div>
        )}

        {erro && <p className="form-error" role="alert"><Icon name="alert" size={15} /> {erro}</p>}
        {!erro && (erroValidacao || semAlteracoes) && (
          <p className="detail-muted small" role="status">{erroValidacao || 'Nenhuma alteração para salvar.'}</p>
        )}
      </form>
    </Modal>
  );
}

export default function ConquistasPage() {
  const mostrarToast = useToast();
  const [conquistas, setConquistas] = useState(null);
  const [criterios, setCriterios] = useState([]);
  const [programas, setProgramas] = useState([]);
  const [erro, setErro] = useState('');
  const [erroAcao, setErroAcao] = useState('');
  const [filtro, setFiltro] = useState('todas');
  const [editando, setEditando] = useState(null); // null | 'novo' | conquista
  const [excluindo, setExcluindo] = useState(null);
  const [ocupadoId, setOcupadoId] = useState(null);
  const trava = useRef(false);

  const carregar = useCallback(async () => {
    setErro('');
    try {
      const [lista, condicoes] = await Promise.all([api.conquistasCoordenacao(), api.criteriosConquista()]);
      setConquistas(ordenar(lista));
      setCriterios(condicoes);
    } catch (error) {
      setErro(error.message || 'Não foi possível carregar as conquistas.');
    }
  }, []);

  useEffect(() => {
    carregar();
    api.programas().then((lista) => setProgramas(Array.isArray(lista) ? lista : [])).catch(() => setProgramas([]));
  }, [carregar]);

  function substituir(item) {
    setConquistas((lista) => ordenar([...(lista || []).filter((c) => c.id !== item.id), item]));
  }

  const contagem = useMemo(() => {
    const lista = conquistas || [];
    const por = (e) => lista.filter((c) => c.estado === e).length;
    return { todas: lista.length, publicada: por('publicada'), rascunho: por('rascunho'), arquivada: por('arquivada') };
  }, [conquistas]);

  const lista = useMemo(
    () => (conquistas || []).filter((c) => filtro === 'todas' || c.estado === filtro),
    [conquistas, filtro],
  );

  async function executar(conquista, chamada, sucesso, falha) {
    if (trava.current) return;
    trava.current = true;
    setOcupadoId(conquista.id);
    setErroAcao('');
    try {
      substituir(await chamada(conquista.id));
      mostrarToast(sucesso, 'sucesso');
    } catch (error) {
      setErroAcao(`${falha} "${conquista.nome}": ${error.message || 'erro desconhecido.'}`);
    } finally {
      trava.current = false;
      setOcupadoId(null);
    }
  }

  async function excluir() {
    if (trava.current || !excluindo) return;
    trava.current = true;
    setOcupadoId(excluindo.id);
    setErroAcao('');
    try {
      await api.excluirConquista(excluindo.id);
      setConquistas((atual) => (atual || []).filter((c) => c.id !== excluindo.id));
      mostrarToast(`Conquista "${excluindo.nome}" excluída.`, 'sucesso');
      setExcluindo(null);
    } catch (error) {
      setErroAcao(error.message || 'Não foi possível excluir.');
      setExcluindo(null);
      if (error.motivo === 'conquista-em-uso') carregar();
    } finally {
      trava.current = false;
      setOcupadoId(null);
    }
  }

  return (
    <section className="users-page pucstops-page recompensas-page conquistas-page">
      <header className="dash-header">
        <div>
          <h1>Conquistas</h1>
          <p>Medalhas que os alunos desbloqueiam ao cumprir um critério no app. O servidor confere o progresso real; quem já obteve continua com a conquista mesmo se ela for editada ou arquivada.</p>
        </div>
        <button type="button" className="primary-button inline" onClick={() => setEditando('novo')} disabled={!criterios.length}>
          <Icon name="plus" size={17} /> Nova conquista
        </button>
      </header>

      {conquistas && conquistas.length > 0 && (
        <div className="filter-chips" role="group" aria-label="Filtrar por estado">
          {FILTROS.map((f) => (
            <button key={f.valor} type="button" aria-pressed={filtro === f.valor} className={`filter-chip${filtro === f.valor ? ' active' : ''}`} onClick={() => setFiltro(f.valor)}>
              {f.rotulo} ({contagem[f.valor]})
            </button>
          ))}
        </div>
      )}

      {erro && <div className="dash-inline-error" role="alert">{erro}<button type="button" onClick={carregar}>Tentar novamente</button></div>}
      {erroAcao && <div className="dash-inline-error" role="alert">{erroAcao}<button type="button" onClick={() => setErroAcao('')}>Fechar</button></div>}
      {!conquistas && !erro && <div className="coord-state" role="status"><div className="coord-spinner" aria-hidden="true" /><p>Carregando conquistas…</p></div>}
      {conquistas?.length === 0 && <p className="empty-copy">Nenhuma conquista cadastrada. Crie a primeira escolhendo um critério e uma meta.</p>}
      {conquistas && conquistas.length > 0 && lista.length === 0 && <p className="empty-copy">Nenhuma conquista com este filtro.</p>}

      {lista.length > 0 && (
        <ListaConquistas
          conquistas={lista}
          ocupadoId={ocupadoId}
          onEditar={(c) => setEditando(c)}
          onPublicar={(c) => executar(c, api.publicarConquista, `Conquista "${c.nome}" publicada.`, 'Não foi possível publicar')}
          onArquivar={(c) => executar(c, api.arquivarConquista, `Conquista "${c.nome}" arquivada. Quem já obteve continua com ela.`, 'Não foi possível arquivar')}
          onExcluir={(c) => setExcluindo(c)}
        />
      )}

      {conquistas?.length > 0 && (
        <p className="detail-muted small">Conquistas sem nenhum aluno podem ser excluídas; as já obtidas são arquivadas, preservando a coleção dos alunos.</p>
      )}

      {editando && (
        <FormularioConquista
          original={editando === 'novo' ? null : editando}
          criterios={criterios}
          programas={programas}
          onCancelar={() => setEditando(null)}
          onSalvo={(salvo, criada) => {
            substituir(salvo);
            setEditando(null);
            mostrarToast(criada ? `Conquista "${salvo.nome}" criada.` : `Conquista "${salvo.nome}" atualizada.`, 'sucesso');
          }}
        />
      )}

      {excluindo && (
        <Modal
          titulo={`Excluir "${excluindo.nome}"?`}
          descricao="Nenhum aluno obteve esta conquista ainda: ela será apagada de vez."
          onFechar={() => { if (ocupadoId !== excluindo.id) setExcluindo(null); }}
          acoes={(
            <>
              <button type="button" className="ghost-button" disabled={ocupadoId === excluindo.id} onClick={() => setExcluindo(null)} data-autofocus>Cancelar</button>
              <button type="button" className="danger-button" disabled={ocupadoId === excluindo.id} onClick={excluir}>
                <Icon name="trash" size={16} /> {ocupadoId === excluindo.id ? 'Aguarde…' : 'Excluir de vez'}
              </button>
            </>
          )}
        />
      )}
    </section>
  );
}
