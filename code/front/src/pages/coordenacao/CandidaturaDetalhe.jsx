import { useCallback, useEffect, useId, useState } from 'react';
import { api } from '../../api/client';
import Icon from '../../components/Icon';
import Modal from '../../components/Modal';
import { textoResposta } from '../../components/PerguntasAdicionais';
import { Avatar, badgeClass, dataCurta, DefinirPadrinho, RequisitosDeclarados } from './comum';

function Bloco({ icon, titulo, children, extra }) {
  return (
    <section className="detail-block">
      <h3><Icon name={icon} size={17} /> {titulo}{extra}</h3>
      {children}
    </section>
  );
}

function Chips({ itens, vazio = 'Não informado' }) {
  if (!itens?.length) return <p className="detail-muted">{vazio}</p>;
  return <ul className="detail-chips">{itens.map((i) => <li key={i}>{i}</li>)}</ul>;
}

export default function CandidaturaDetalhe({ id, programa, modoApadrinhado, onFechar, onAtualizado }) {
  const [detalhe, setDetalhe] = useState(null);
  const [erro, setErro] = useState('');
  const [observacoes, setObservacoes] = useState('');
  const [salvandoObs, setSalvandoObs] = useState(false);
  const [obsSalvas, setObsSalvas] = useState(false);
  const [acao, setAcao] = useState('');
  const [erroAcao, setErroAcao] = useState('');
  const [justificativa, setJustificativa] = useState('');
  const [confirmarRejeicao, setConfirmarRejeicao] = useState(false);
  const [perguntas, setPerguntas] = useState({});
  const obsId = useId();

  const carregar = useCallback(async () => {
    setErro('');
    try {
      const dados = await api.candidatura(id);
      setDetalhe(dados);
      setObservacoes(dados.observacoes || '');
    } catch (error) {
      setErro(error.message || 'Não foi possível carregar a candidatura.');
    }
  }, [id]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  const tipoFormulario = detalhe?.papel === 'apadrinhado' ? 'apadrinhado' : 'padrinho';
  const temExtras = detalhe?.respostas?.extras && Object.keys(detalhe.respostas.extras).length > 0;
  useEffect(() => {
    if (!temExtras) return undefined;
    let ativo = true;
    api.formularioCoordenacao(tipoFormulario, detalhe.programa)
      .then((f) => { if (ativo) setPerguntas(Object.fromEntries((f.perguntas || []).map((p) => [p.id, p.enunciado]))); })
      .catch(() => {});
    return () => { ativo = false; };
  }, [temExtras, tipoFormulario, detalhe?.programa]);

  async function executar(nome, fn, mensagem, opcoes = {}) {
    setAcao(nome);
    setErroAcao('');
    try {
      const atualizado = await fn();
      setDetalhe((atual) => ({ ...atualizado, observacoes: atual?.observacoes ?? atualizado.observacoes }));
      onAtualizado?.(atualizado, mensagem, opcoes);
    } catch (error) {
      setErroAcao(error.message || 'Não foi possível concluir a ação.');
    } finally {
      setAcao('');
    }
  }

  async function salvarObservacoes() {
    setSalvandoObs(true);
    setErroAcao('');
    setObsSalvas(false);
    try {
      const atualizado = await api.atualizarCandidatura(id, { observacoes });
      setDetalhe(atualizado);
      setObsSalvas(true);
    } catch (error) {
      setErroAcao(error.message || 'Não foi possível salvar as observações.');
    } finally {
      setSalvandoObs(false);
    }
  }

  if (erro) {
    return (
      <div className="cand-detail" role="alert">
        <button type="button" className="back-to-list" onClick={onFechar}><Icon name="arrowLeft" size={16} /> Voltar à lista</button>
        <div className="dash-inline-error">{erro}<button type="button" onClick={carregar}>Tentar novamente</button></div>
      </div>
    );
  }
  if (!detalhe) {
    return <div className="cand-detail"><div className="coord-state" role="status"><div className="coord-spinner" aria-hidden="true" /><p>Carregando detalhes…</p></div></div>;
  }

  const r = detalhe.respostas || {};
  const ehApadrinhado = detalhe.papel === 'apadrinhado';
  const aprovada = detalhe.status === 'aprovado'
    || detalhe.papel === 'padrinho'
    || (ehApadrinhado && detalhe.status === 'em_andamento');
  const rejeitada = detalhe.status === 'nao_aprovado';
  const decidida = aprovada || rejeitada;
  const extras = r.extras || {};
  const meta = [
    detalhe.curso,
    detalhe.periodo ? `${detalhe.periodo}º período` : null,
  ].filter(Boolean).join(' · ');

  return (
    <article className="cand-detail" aria-labelledby={`cand-${id}-nome`}>
      <button type="button" className="back-to-list" onClick={onFechar}><Icon name="arrowLeft" size={16} /> Voltar à lista</button>

      <header className="detail-head detail-head-compact">
        <Avatar pessoa={detalhe} tamanho="md" />
        <div className="detail-head-copy">
          <div className="detail-head-title">
            <h2 id={`cand-${id}-nome`}>{detalhe.nome}</h2>
            <span className={`status-pill ${badgeClass(detalhe.status, detalhe.papel)}`}>{detalhe.statusRotulo}</span>
          </div>
          <p className="detail-head-meta">{meta}</p>
          <p className="detail-head-meta">
            <a href={`mailto:${detalhe.email}`}>{detalhe.email}</a>
            <span aria-hidden="true">·</span>
            {ehApadrinhado ? 'Cadastro' : 'Enviada'} em {dataCurta(detalhe.criadoEm)}
            {detalhe.grupo ? <><span aria-hidden="true">·</span>{detalhe.grupo}</> : null}
          </p>
        </div>
      </header>

      {((modoApadrinhado || ehApadrinhado) && !detalhe.grupo) || (!decidida && !(modoApadrinhado || ehApadrinhado)) || erroAcao ? (
        <section className="detail-action-bar">
          {(modoApadrinhado || ehApadrinhado) && !detalhe.grupo ? (
            <DefinirPadrinho
              apadrinhado={detalhe}
              programa={detalhe.programa || programa}
              onVinculado={(res) => {
                setDetalhe((atual) => ({ ...atual, grupo: res.apadrinhado?.grupo || res.padrinho?.grupo }));
                onAtualizado?.(
                  { ...detalhe, grupo: res.apadrinhado?.grupo },
                  `${detalhe.nome} agora tem padrinho: ${res.padrinho?.nome} (${res.padrinho?.grupo || res.apadrinhado?.grupo}).`,
                );
              }}
            />
          ) : !decidida ? (
            <>
              <p className="detail-muted small">Decisão deste ciclo</p>
              <div className="decision-buttons decision-buttons-row">
                <button
                  type="button"
                  className="decision approve"
                  disabled={Boolean(acao)}
                  onClick={() => executar('aprovar', () => api.aprovarCandidatura(id), `Candidatura de ${detalhe.nome} aprovada.`, { avancar: true })}
                >
                  <Icon name="check" size={16} /> {acao === 'aprovar' ? 'Aprovando…' : 'Aprovar'}
                </button>
                <button
                  type="button"
                  className="decision reject"
                  disabled={Boolean(acao)}
                  onClick={() => { setJustificativa(''); setConfirmarRejeicao(true); }}
                >
                  <Icon name="close" size={16} /> Rejeitar
                </button>
              </div>
            </>
          ) : null}
          {erroAcao && <p className="form-error" role="alert"><Icon name="alert" size={15} /> {erroAcao}</p>}
        </section>
      ) : null}

      <div className="detail-flow">
        {!ehApadrinhado && (
          <>
            <Bloco icon="file" titulo="Motivação">
              <p className="detail-text">{r.motivacao || 'Não informada.'}</p>
            </Bloco>
            {r.experiencias && (
              <Bloco icon="star" titulo="Experiências">
                <p className="detail-text">{r.experiencias}</p>
              </Bloco>
            )}
            <div className="detail-two">
              <Bloco icon="tag" titulo="Áreas de apoio"><Chips itens={r.areas} /></Bloco>
              <Bloco icon="clock" titulo="Disponibilidade"><Chips itens={r.disponibilidade} /></Bloco>
            </div>
            <details className="detail-disclosure">
              <summary>Requisitos e declaração</summary>
              <RequisitosDeclarados
                requisitos={detalhe.requisitos}
                respondidos={detalhe.requisitosRespondidos}
                legado={r.declaraPreRequisitos}
                periodo={detalhe.periodo}
              />
            </details>
          </>
        )}

        {ehApadrinhado && (
          <>
            <Bloco icon="chat" titulo="O que espera do padrinho">
              <p className="detail-text">{r.expectativa || 'Não informado.'}</p>
            </Bloco>
            <div className="detail-two">
              <Bloco icon="tag" titulo="Áreas de apoio"><Chips itens={r.areas} /></Bloco>
              <Bloco icon="clock" titulo="Disponibilidade"><Chips itens={r.disponibilidade} /></Bloco>
            </div>
            {r.outrasInformacoes && (
              <Bloco icon="file" titulo="Outras informações">
                <p className="detail-text">{r.outrasInformacoes}</p>
              </Bloco>
            )}
          </>
        )}

        {Object.keys(extras).length > 0 && (
          <Bloco icon="form" titulo="Perguntas adicionais">
            <dl className="detail-extras">
              {Object.entries(extras).map(([pid, valor]) => (
                <div key={pid}>
                  <dt>{perguntas[pid] || `Pergunta ${pid}`}</dt>
                  <dd>{textoResposta(valor) || '—'}</dd>
                </div>
              ))}
            </dl>
          </Bloco>
        )}

        {detalhe.historico?.length > 1 && (
          <details className="detail-disclosure">
            <summary>Histórico no programa</summary>
            <ul className="detail-history">
              {detalhe.historico.map((h) => (
                <li key={h.id}>
                  <strong>{h.programa}</strong>
                  {' · '}
                  {h.papel === 'candidato' ? 'Candidato' : h.papel === 'padrinho' ? 'Padrinho' : 'Apadrinhado'}
                  {' · '}
                  {h.statusRotulo}
                </li>
              ))}
            </ul>
          </details>
        )}

        <section className="detail-block">
          <h3><Icon name="form" size={17} /> <label htmlFor={obsId}>Observações internas</label></h3>
          <textarea
            id={obsId}
            className="detail-textarea"
            rows={3}
            maxLength={1000}
            value={observacoes}
            placeholder="Notas visíveis só para a coordenação…"
            onChange={(e) => { setObservacoes(e.target.value); setObsSalvas(false); }}
          />
          <div className="obs-foot">
            <span>{observacoes.length}/1000</span>
            <button
              type="button"
              className="mini-btn"
              onClick={salvarObservacoes}
              disabled={salvandoObs || observacoes === (detalhe.observacoes || '')}
            >
              <Icon name="save" size={14} /> {salvandoObs ? 'Salvando…' : 'Salvar'}
            </button>
          </div>
          {obsSalvas && <p className="detail-ok" role="status"><Icon name="check" size={14} /> Salvas.</p>}
        </section>
      </div>

      {confirmarRejeicao && (
        <Modal
          titulo="Rejeitar candidatura?"
          descricao={`A candidatura de ${detalhe.nome} será marcada como não aprovada neste ciclo.`}
          onFechar={() => setConfirmarRejeicao(false)}
          acoes={(
            <>
              <button type="button" className="ghost-button" onClick={() => setConfirmarRejeicao(false)} data-autofocus>Cancelar</button>
              <button
                type="button"
                className="danger-button"
                disabled={!justificativa.trim() || Boolean(acao)}
                onClick={() => {
                  setConfirmarRejeicao(false);
                  executar(
                    'rejeitar',
                    () => api.rejeitarCandidatura(id, justificativa.trim()),
                    `Candidatura de ${detalhe.nome} rejeitada.`,
                    { avancar: true },
                  );
                }}
              >
                Rejeitar
              </button>
            </>
          )}
        >
          <label>
            Justificativa visível ao candidato
            <textarea required maxLength={1000} value={justificativa} onChange={(e) => setJustificativa(e.target.value)} />
          </label>
        </Modal>
      )}
    </article>
  );
}
