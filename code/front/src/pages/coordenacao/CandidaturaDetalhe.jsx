import { useCallback, useEffect, useId, useState } from 'react';
import { api } from '../../api/client';
import Icon from '../../components/Icon';
import Modal from '../../components/Modal';
import { textoResposta } from '../../components/PerguntasAdicionais';
import { Avatar, badgeClass, dataCurta, DefinirPadrinho, RequisitosDeclarados } from './comum';
import ConferenciaAcademica, { conferenciaLiberaAprovacao, justificativaDaConferencia } from './ConferenciaAcademica';
import VinculosAtivos from './VinculosAtivos';

function simNao(valor) {
  if (valor === true) return 'Sim';
  if (valor === false) return 'Não';
  return 'Não informado';
}

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
  const [confirmarRevogar, setConfirmarRevogar] = useState(false);
  const [perguntas, setPerguntas] = useState({});
  const statusId = useId();
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

  async function executar(nome, fn, mensagem) {
    setAcao(nome);
    setErroAcao('');
    try {
      const atualizado = await fn();
      // Observações só mudam pelo botão "Salvar observações": preserva o rascunho digitado.
      setDetalhe((atual) => ({ ...atualizado, observacoes: atual?.observacoes ?? atualizado.observacoes }));
      onAtualizado?.(atualizado, mensagem);
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
  const formRespondido = detalhe.formularioRespondido;
  const decisao = detalhe.decisao;
  const podeRevogar = aprovada && !rejeitada;
  const temVinculos = (detalhe.vinculos?.length ?? 0) > 0;
  const liberada = conferenciaLiberaAprovacao(detalhe.conferencia);

  function aoMudarConferenciaOuVinculo(atualizado, mensagem) {
    if (atualizado) setDetalhe((atual) => ({ ...atualizado, observacoes: atual?.observacoes ?? atualizado.observacoes }));
    else carregar();
    onAtualizado?.(atualizado, mensagem);
  }

  function abrirRejeicao() {
    if (!justificativa.trim()) setJustificativa(justificativaDaConferencia(detalhe.conferencia));
    setConfirmarRejeicao(true);
  }

  return (
    <article className="cand-detail" aria-labelledby={`cand-${id}-nome`}>
      <button type="button" className="back-to-list" onClick={onFechar}><Icon name="arrowLeft" size={16} /> Voltar à lista</button>

      <header className="detail-head">
        <Avatar pessoa={detalhe} tamanho="lg" />
        <div>
          <h2 id={`cand-${id}-nome`}>{detalhe.nome}</h2>
          <p><Icon name="school" size={15} /> {detalhe.curso}{detalhe.periodo ? ` • ${detalhe.periodo}º período` : ''}</p>
          <p><Icon name="calendar" size={15} /> {ehApadrinhado ? 'Cadastro enviado' : 'Candidatura enviada'} em {dataCurta(detalhe.criadoEm)}</p>
          <p><Icon name="mail" size={15} /> <a href={`mailto:${detalhe.email}`}>{detalhe.email}</a></p>
          <div className="detail-tags">
            <span className={`status-pill ${badgeClass(detalhe.status, detalhe.papel)}`}>{detalhe.statusRotulo}</span>
            {!ehApadrinhado && (
              <span className="detail-tag"><Icon name="school" size={14} /> {detalhe.jaFoiApadrinhadoEm ? `Já foi apadrinhado em ${detalhe.jaFoiApadrinhadoEm}` : 'Nunca foi apadrinhado'}</span>
            )}
            {!ehApadrinhado && (
              <span className="detail-tag"><Icon name="home" size={14} /> {detalhe.numeroCandidatura > 1 ? `${detalhe.numeroCandidatura}ª candidatura para padrinho` : 'Primeira candidatura'}</span>
            )}
            {detalhe.grupo && <span className="detail-tag"><Icon name="groups" size={14} /> {detalhe.grupo}</span>}
          </div>
        </div>
      </header>

      <div className={`detail-grid${ehApadrinhado ? ' is-apadrinhado' : ''}`}>
        <div className="detail-main">
          <ConferenciaAcademica
            participacaoId={id}
            conferencia={detalhe.conferencia}
            onRegistrada={(atualizado) => aoMudarConferenciaOuVinculo(atualizado, `Conferência acadêmica de ${detalhe.nome} registrada.`)}
          />
          {!ehApadrinhado && (
            <>
              <Bloco icon="checkCircle" titulo="Requisitos do ciclo e declaração do candidato" extra={<span className="detail-note">Programa {detalhe.programa}</span>}>
                <RequisitosDeclarados requisitos={detalhe.requisitos} respondidos={detalhe.requisitosRespondidos} legado={r.declaraPreRequisitos} periodo={detalhe.periodo} />
              </Bloco>
              <Bloco icon="file" titulo="Motivação"><p className="detail-text">{r.motivacao || 'Não informada.'}</p></Bloco>
              <Bloco icon="star" titulo="Experiências relevantes"><p className="detail-text">{r.experiencias || 'Não informadas.'}</p></Bloco>
            </>
          )}
          {ehApadrinhado && (
            <>
              <Bloco icon="checkCircle" titulo="Declaração acadêmica">
                <p className="detail-text">
                  {r.declaraPrimeiroPeriodo === true
                    ? 'Declarou estar no 1º período e confirmou os dados acadêmicos para conferência.'
                    : 'Envio legado sem declaração explícita de 1º período — confira curso, período e e-mail no sistema da faculdade.'}
                </p>
                <dl className="detail-facts">
                  <div><dt>Identificação acadêmica</dt><dd>{detalhe.email}</dd></div>
                  <div><dt>Curso / período</dt><dd>{detalhe.curso} · {detalhe.periodo}º período</dd></div>
                </dl>
              </Bloco>
              <Bloco icon="chat" titulo="O que espera do padrinho"><p className="detail-text">{r.expectativa || 'Não informado.'}</p></Bloco>
              {r.outrasInformacoes && <Bloco icon="file" titulo="Outras informações"><p className="detail-text">{r.outrasInformacoes}</p></Bloco>}
            </>
          )}
          <div className="detail-two">
            <Bloco icon="tag" titulo={ehApadrinhado ? 'Áreas em que quer apoio' : 'Áreas que pode apoiar'}><Chips itens={r.areas} /></Bloco>
            <Bloco icon="clock" titulo="Disponibilidade"><Chips itens={r.disponibilidade} /></Bloco>
          </div>
          <Bloco icon="person" titulo="Perfil">
            <dl className="detail-facts">
              <div><dt>Gênero</dt><dd>{r.genero || 'Não informado'}</dd></div>
              <div><dt>Bolsista ProUni</dt><dd>{simNao(r.bolsistaProuni)}</dd></div>
              <div><dt>De outra cidade</dt><dd>{simNao(r.deOutraCidade)}</dd></div>
              {r.turno && <div><dt>Turno</dt><dd>{r.turno}</dd></div>}
            </dl>
            {r.interesses?.length > 0 && <><p className="detail-sub">Interesses</p><Chips itens={r.interesses} /></>}
          </Bloco>
          <Bloco icon="form" titulo="Formulário respondido">
            {formRespondido ? (
              <dl className="detail-facts">
                <div><dt>Versão</dt><dd>v{formRespondido.versao ?? '—'}</dd></div>
                <div><dt>Programa</dt><dd>{formRespondido.programa || detalhe.programa}</dd></div>
                <div><dt>Público</dt><dd>{formRespondido.tipo || (ehApadrinhado ? 'apadrinhado' : 'padrinho')}</dd></div>
              </dl>
            ) : (
              <p className="detail-muted">Envio sem formulário publicado ou anterior ao versionamento.</p>
            )}
          </Bloco>
          {Object.keys(extras).length > 0 && (
            <Bloco icon="form" titulo="Perguntas adicionais">
              <dl className="detail-extras">
                {Object.entries(extras).map(([pid, valor]) => (
                  <div key={pid}><dt>{perguntas[pid] || `Pergunta ${pid}`}</dt><dd>{textoResposta(valor) || '—'}</dd></div>
                ))}
              </dl>
            </Bloco>
          )}
          <Bloco icon="history" titulo="Histórico no programa">
            {detalhe.historico?.length ? (
              <ul className="detail-history">
                {detalhe.historico.map((h) => <li key={h.id}><strong>{h.programa}</strong> · {h.papel === 'candidato' ? 'Candidato' : h.papel === 'padrinho' ? 'Padrinho' : 'Apadrinhado'} · {h.statusRotulo}</li>)}
              </ul>
            ) : (
              <p className="detail-muted">{ehApadrinhado ? 'Primeira participação no programa.' : 'Primeira candidatura — sem participações anteriores.'}</p>
            )}
          </Bloco>
        </div>

        <aside className="detail-side">
          {modoApadrinhado || ehApadrinhado ? (
            <section className="detail-block">
              <h3><Icon name="link" size={17} /> Vínculo</h3>
              {temVinculos ? (
                <p className="detail-muted">Padrinho definido. Veja os vínculos ativos abaixo.</p>
              ) : detalhe.grupo ? (
                <>
                  <p className="detail-text">Já vinculado ao {detalhe.grupo}.</p>
                  <div className="decision-buttons">
                    <button
                      type="button"
                      className="decision review"
                      disabled={Boolean(acao)}
                      onClick={async () => {
                        setAcao('desvincular');
                        setErroAcao('');
                        try {
                          await api.desvincularCandidatura(id);
                          await carregar();
                          onAtualizado?.(null, `Vínculo de ${detalhe.nome} desfeito.`);
                        } catch (error) {
                          setErroAcao(error.message || 'Não foi possível desfazer o vínculo.');
                        } finally {
                          setAcao('');
                        }
                      }}
                    >
                      <Icon name="refresh" size={17} /> {acao === 'desvincular' ? 'Desfazendo…' : 'Desfazer vínculo'}
                    </button>
                  </div>
                </>
              ) : (
                <DefinirPadrinho
                  apadrinhado={detalhe}
                  programa={detalhe.programa || programa}
                  onVinculado={(res) => {
                    setDetalhe((atual) => ({ ...atual, grupo: res.apadrinhado?.grupo || res.padrinho?.grupo }));
                    onAtualizado?.({ ...detalhe, grupo: res.apadrinhado?.grupo }, `${detalhe.nome} agora tem padrinho: ${res.padrinho?.nome} (${res.padrinho?.grupo || res.apadrinhado?.grupo}).`);
                  }}
                />
              )}
              {podeRevogar && (
                <div className="decision-buttons" style={{ marginTop: 12 }}>
                  <button type="button" className="decision reject" disabled={Boolean(acao) || temVinculos} title={temVinculos ? 'Encerre os vínculos ativos antes de revogar.' : undefined} onClick={() => setConfirmarRevogar(true)}>
                    <Icon name="close" size={17} /> Revogar aprovação
                  </button>
                </div>
              )}
            </section>
          ) : (
            <section className="detail-block">
              <h3><Icon name="chart" size={17} /> Status da análise</h3>
              <label className="sr-only" htmlFor={statusId}>Status da análise</label>
              <select
                id={statusId}
                className="detail-select"
                value={decidida ? 'decidida' : detalhe.status}
                disabled={decidida || Boolean(acao)}
                onChange={(e) => executar('status', () => api.atualizarCandidatura(id, { status: e.target.value }), 'Status atualizado.')}
              >
                {decidida && <option value="decidida">{detalhe.statusRotulo}</option>}
                <option value="pendente">Nova</option>
                <option value="em_analise">Em análise</option>
              </select>
              <div className="decision-buttons">
                <button type="button" className="decision approve" disabled={aprovada || Boolean(acao) || (!decidida && !liberada)} onClick={() => executar('aprovar', () => api.aprovarCandidatura(id), `Candidatura de ${detalhe.nome} aprovada.`)}>
                  <Icon name="check" size={17} /> {acao === 'aprovar' ? 'Aprovando…' : aprovada ? 'Aprovada' : 'Aprovar candidatura'}
                </button>
                <button type="button" className="decision reject" disabled={decidida || Boolean(acao)} onClick={abrirRejeicao}>
                  <Icon name="close" size={17} /> {rejeitada ? 'Rejeitada' : 'Rejeitar candidatura'}
                </button>
                <button type="button" className="decision review" disabled={decidida || detalhe.status === 'em_analise' || Boolean(acao)} onClick={() => executar('revisao', () => api.atualizarCandidatura(id, { status: 'em_analise' }), 'Candidatura marcada para revisão (em análise).')}>
                  <Icon name="refresh" size={17} /> {acao === 'revisao' ? 'Enviando…' : 'Solicitar revisão'}
                </button>
                {podeRevogar && (
                  <button type="button" className="decision reject" disabled={Boolean(acao) || temVinculos} title={temVinculos ? 'Encerre os vínculos ativos antes de revogar.' : undefined} onClick={() => setConfirmarRevogar(true)}>
                    <Icon name="close" size={17} /> Revogar aprovação
                  </button>
                )}
              </div>
              {!decidida && !liberada && (
                <p className="detail-muted small">
                  {detalhe.conferencia?.verificacao
                    ? 'A conferência registrou requisitos obrigatórios não atendidos: aprovação bloqueada.'
                    : 'Registre a conferência acadêmica com os requisitos atendidos para liberar a aprovação.'}
                </p>
              )}
              {decidida && <p className="detail-muted small">{aprovada ? detalhe.status === 'aprovado' ? 'Candidatura aprovada. Aguardando matching; atividade depende do vínculo confirmado.' : 'Vínculo confirmado neste ciclo.' : 'Candidatura rejeitada neste ciclo.'}</p>}
            </section>
          )}

          <VinculosAtivos detalhe={detalhe} onAlterado={aoMudarConferenciaOuVinculo} />

          {decisao && (
            <section className="detail-block">
              <h3><Icon name="history" size={17} /> Registro da decisão</h3>
              <dl className="detail-facts">
                <div><dt>Resultado</dt><dd>{decisao.resultado === 'aprovado' ? 'Aprovado' : 'Não aprovado'}</dd></div>
                <div><dt>Data</dt><dd>{decisao.em ? dataCurta(decisao.em) : '—'}</dd></div>
                <div><dt>Responsável</dt><dd>{decisao.por || '—'}</dd></div>
              </dl>
              {decisao.justificativa && <p className="detail-muted">Justificativa: {decisao.justificativa}</p>}
            </section>
          )}

          {erroAcao && <p className="form-error" role="alert"><Icon name="alert" size={15} /> {erroAcao}</p>}

          <section className="detail-block">
            <h3><Icon name="form" size={17} /> <label htmlFor={obsId}>Observações da coordenação</label></h3>
            <textarea
              id={obsId}
              className="detail-textarea"
              rows={5}
              maxLength={1000}
              value={observacoes}
              placeholder="Adicione observações sobre esta candidatura…"
              onChange={(e) => { setObservacoes(e.target.value); setObsSalvas(false); }}
            />
            <div className="obs-foot">
              <span>{observacoes.length}/1000</span>
              <button type="button" className="mini-btn" onClick={salvarObservacoes} disabled={salvandoObs || observacoes === (detalhe.observacoes || '')}>
                <Icon name="save" size={14} /> {salvandoObs ? 'Salvando…' : 'Salvar observações'}
              </button>
            </div>
            {obsSalvas && <p className="detail-ok" role="status"><Icon name="check" size={14} /> Observações salvas.</p>}
            <p className="private-note"><Icon name="info" size={15} /> Estas informações são privadas e visíveis apenas para a coordenação do programa.</p>
          </section>
        </aside>
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
                  executar('rejeitar', () => api.rejeitarCandidatura(id, justificativa.trim()), `Candidatura de ${detalhe.nome} rejeitada.`);
                }}
              >
                Rejeitar
              </button>
            </>
          )}
        ><label>Justificativa visível ao candidato<textarea required maxLength={1000} value={justificativa} onChange={e => setJustificativa(e.target.value)}/></label></Modal>
      )}

      {confirmarRevogar && (
        <Modal
          titulo="Revogar aprovação?"
          descricao={`A aprovação de ${detalhe.nome} será retirada. Se houver vínculo, desfaça-o antes.`}
          onFechar={() => setConfirmarRevogar(false)}
          acoes={(
            <>
              <button type="button" className="ghost-button" onClick={() => setConfirmarRevogar(false)} data-autofocus>Cancelar</button>
              <button
                type="button"
                className="danger-button"
                disabled={!justificativa.trim() || Boolean(acao)}
                onClick={() => {
                  setConfirmarRevogar(false);
                  executar('revogar', () => api.revogarAprovacao(id, justificativa.trim()), `Aprovação de ${detalhe.nome} revogada.`);
                }}
              >
                Revogar
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
