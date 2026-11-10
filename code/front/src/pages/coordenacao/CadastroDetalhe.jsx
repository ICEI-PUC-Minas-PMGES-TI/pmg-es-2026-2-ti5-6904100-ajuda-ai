import { useCallback, useEffect, useId, useState } from 'react';
import { api } from '../../api/client';
import Icon from '../../components/Icon';
import Modal from '../../components/Modal';
import { textoResposta } from '../../components/PerguntasAdicionais';
import { Avatar, dataCurta, RequisitosDeclarados, ROTULO_STATUS_CADASTRO, statusCadastroTom } from './comum';
import ConferenciaAcademica, { conferenciaLiberaAprovacao, justificativaDaConferencia } from './ConferenciaAcademica';

const ROTULO_TIPO = { padrinho: 'Padrinho', apadrinhado: 'Apadrinhado' };
const ROTULO_PAPEL = { candidato: 'Candidato a padrinho', padrinho: 'Padrinho', apadrinhado: 'Apadrinhado' };

function simNao(valor) {
  if (valor === true) return 'Sim';
  if (valor === false) return 'Não';
  return 'Não informado';
}

function Bloco({ icon, titulo, children }) {
  return (
    <section className="detail-block">
      <h3><Icon name={icon} size={17} /> {titulo}</h3>
      {children}
    </section>
  );
}

function Chips({ itens, vazio = 'Não informado' }) {
  if (!itens?.length) return <p className="detail-muted">{vazio}</p>;
  return <ul className="detail-chips">{itens.map((i) => <li key={i}>{i}</li>)}</ul>;
}

/** Dados enviados no cadastro + decisão da coordenação (aprovar/rejeitar). */
export default function CadastroDetalhe({ id, programa, onFechar, onDecidido }) {
  const [detalhe, setDetalhe] = useState(null);
  const [erro, setErro] = useState('');
  const [acao, setAcao] = useState('');
  const [erroAcao, setErroAcao] = useState('');
  const [rejeitando, setRejeitando] = useState(false);
  const [motivo, setMotivo] = useState('');
  const [conferencia, setConferencia] = useState(null);
  const motivoId = useId();
  const participacaoId = detalhe?.participacao?.id;

  // A conferência acadêmica (F09) é da participação no ciclo, não da conta.
  useEffect(() => {
    if (!participacaoId) return undefined;
    let ativo = true;
    api.candidatura(participacaoId)
      .then((dados) => { if (ativo) setConferencia(dados.conferencia); })
      .catch((error) => { if (ativo) setErroAcao(error.message || 'Não foi possível carregar a conferência acadêmica.'); });
    return () => { ativo = false; };
  }, [participacaoId, detalhe?.statusCadastro]);

  const carregar = useCallback(async () => {
    setErro('');
    try {
      setDetalhe(await api.cadastroCoordenacao(id, programa));
    } catch (error) {
      setErro(error.message || 'Não foi possível carregar o cadastro.');
    }
  }, [id, programa]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  async function decidir(nome, fn, mensagem) {
    setAcao(nome);
    setErroAcao('');
    try {
      setDetalhe(await fn());
      onDecidido?.(mensagem, { avancar: true });
    } catch (error) {
      setErroAcao(error.message || 'Não foi possível concluir a ação.');
    } finally {
      setAcao('');
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
    return <div className="cand-detail"><div className="coord-state" role="status"><div className="coord-spinner" aria-hidden="true" /><p>Carregando cadastro…</p></div></div>;
  }

  const r = detalhe.respostas || {};
  const ehPadrinho = detalhe.tipoParticipacao === 'padrinho';
  const pendente = detalhe.statusCadastro === 'pendente';
  const aprovado = detalhe.statusCadastro === 'aprovado';
  const extras = r.extras || {};
  const liberada = conferenciaLiberaAprovacao(conferencia);
  const meta = [
    detalhe.curso,
    detalhe.periodo ? `${detalhe.periodo}º período` : null,
    detalhe.turno || null,
  ].filter(Boolean).join(' · ');

  return (
    <article className="cand-detail" aria-labelledby={`cad-${id}-nome`}>
      <button type="button" className="back-to-list" onClick={onFechar}><Icon name="arrowLeft" size={16} /> Voltar à lista</button>

      <header className="detail-head detail-head-compact">
        <Avatar pessoa={detalhe} tamanho="md" />
        <div className="detail-head-copy">
          <div className="detail-head-title">
            <h2 id={`cad-${id}-nome`}>{detalhe.nome}</h2>
            <span className={`status-pill ${statusCadastroTom(detalhe.statusCadastro)}`}>
              {ROTULO_STATUS_CADASTRO[detalhe.statusCadastro]}
            </span>
          </div>
          <p className="detail-head-meta">{meta}</p>
          <p className="detail-head-meta">
            <a href={`mailto:${detalhe.email}`}>{detalhe.email}</a>
            <span aria-hidden="true">·</span>
            Cadastro em {dataCurta(detalhe.criadoEm)}
            {detalhe.participacao?.programa ? (
              <><span aria-hidden="true">·</span>{detalhe.participacao.programa}</>
            ) : null}
          </p>
        </div>
      </header>

      {pendente || (!aprovado && detalhe.motivoRejeicao) || (!aprovado && !pendente) || erroAcao ? (
        <section className="detail-action-bar">
          {pendente ? (
            <>
              <p className="detail-muted small">
                {!liberada
                  ? conferencia?.verificacao
                    ? 'A conferência registrou requisitos obrigatórios não atendidos: aprovação bloqueada.'
                    : 'Registre a conferência acadêmica com os requisitos atendidos para liberar a aprovação.'
                  : ehPadrinho
                    ? 'Aprovar também aprova a candidatura deste ciclo'
                    : 'Após aprovar, entra na fila de matching'}
              </p>
              <div className="decision-buttons decision-buttons-row">
                <button
                  type="button"
                  className="decision approve"
                  disabled={Boolean(acao) || !liberada}
                  onClick={() => decidir('aprovar', () => api.aprovarCadastro(id, programa), `Cadastro de ${detalhe.nome} aprovado.`)}
                >
                  <Icon name="check" size={16} /> {acao === 'aprovar' ? 'Aprovando…' : 'Aprovar'}
                </button>
                <button
                  type="button"
                  className="decision reject"
                  disabled={Boolean(acao)}
                  onClick={() => {
                    if (!motivo.trim()) setMotivo(justificativaDaConferencia(conferencia));
                    setRejeitando(true);
                  }}
                >
                  <Icon name="close" size={16} /> Rejeitar
                </button>
              </div>
            </>
          ) : !aprovado ? (
            <>
              {detalhe.motivoRejeicao && (
                <p className="detail-muted small" style={{ marginRight: 'auto' }}>Motivo: {detalhe.motivoRejeicao}</p>
              )}
              <div className="decision-buttons decision-buttons-row">
                <button
                  type="button"
                  className="decision approve"
                  disabled={Boolean(acao) || !liberada}
                  onClick={() => decidir('aprovar', () => api.aprovarCadastro(id, programa), `Cadastro de ${detalhe.nome} aprovado.`)}
                >
                  <Icon name="check" size={16} /> {acao === 'aprovar' ? 'Aprovando…' : 'Rever e aprovar'}
                </button>
              </div>
            </>
          ) : null}
          {erroAcao && <p className="form-error" role="alert"><Icon name="alert" size={15} /> {erroAcao}</p>}
        </section>
      ) : null}

      <div className="detail-flow">
        {participacaoId && (
          <ConferenciaAcademica
            participacaoId={participacaoId}
            conferencia={conferencia}
            onRegistrada={(atualizado) => {
              setConferencia(atualizado.conferencia);
              onDecidido?.(`Conferência acadêmica de ${detalhe.nome} registrada.`);
            }}
          />
        )}
        {ehPadrinho ? (
          <>
            <details className="detail-disclosure">
              <summary>Requisitos e declaração</summary>
              <RequisitosDeclarados
                requisitos={r.requisitos}
                respondidos={Array.isArray(r.requisitos)}
                legado={r.declaraPreRequisitos}
                periodo={detalhe.periodo}
              />
            </details>
            <Bloco icon="file" titulo="Motivação">
              <p className="detail-text">{r.motivacao || 'Não informada.'}</p>
            </Bloco>
            {r.experiencias && (
              <Bloco icon="star" titulo="Experiências">
                <p className="detail-text">{r.experiencias}</p>
              </Bloco>
            )}
          </>
        ) : (
          <>
            <Bloco icon="checkCircle" titulo="Declaração acadêmica">
              <p className="detail-text">
                {r.declaraPrimeiroPeriodo === true
                  ? 'Declarou estar no 1º período e confirmou os dados acadêmicos.'
                  : 'Envio legado sem declaração explícita — confira no sistema da faculdade.'}
              </p>
            </Bloco>
            <Bloco icon="chat" titulo="O que espera do padrinho">
              <p className="detail-text">{r.expectativa || 'Não informado.'}</p>
            </Bloco>
            {r.outrasInformacoes && (
              <Bloco icon="file" titulo="Outras informações">
                <p className="detail-text">{r.outrasInformacoes}</p>
              </Bloco>
            )}
          </>
        )}

        <div className="detail-two">
          <Bloco icon="tag" titulo={ehPadrinho ? 'Áreas que pode apoiar' : 'Áreas em que quer apoio'}>
            <Chips itens={r.areas} />
          </Bloco>
          <Bloco icon="clock" titulo="Disponibilidade">
            <Chips itens={r.disponibilidade} />
          </Bloco>
        </div>

        <Bloco icon="person" titulo="Perfil">
          <dl className="detail-facts">
            <div><dt>Gênero</dt><dd>{r.genero || 'Não informado'}</dd></div>
            <div><dt>Bolsista ProUni</dt><dd>{simNao(r.bolsistaProuni)}</dd></div>
            <div><dt>De outra cidade</dt><dd>{simNao(r.deOutraCidade)}</dd></div>
          </dl>
          {detalhe.interesses?.length > 0 && (
            <><p className="detail-sub">Interesses</p><Chips itens={detalhe.interesses} /></>
          )}
        </Bloco>

        {Object.keys(extras).length > 0 && (
          <Bloco icon="form" titulo="Perguntas adicionais">
            <dl className="detail-extras">
              {Object.entries(extras).map(([pid, valor]) => (
                <div key={pid}><dt>{`Pergunta ${pid}`}</dt><dd>{textoResposta(valor) || '—'}</dd></div>
              ))}
            </dl>
          </Bloco>
        )}

        {detalhe.historico?.length > 0 && (
          <details className="detail-disclosure">
            <summary>Outras participações</summary>
            <ul className="detail-history">
              {detalhe.historico.map((h) => (
                <li key={h.id}><strong>{h.programa}</strong> · {ROTULO_PAPEL[h.papel] || h.papel}</li>
              ))}
            </ul>
          </details>
        )}
      </div>

      {rejeitando && (
        <Modal
          titulo="Rejeitar cadastro?"
          descricao={`O cadastro de ${detalhe.nome} será marcado como rejeitado e o aluno não terá acesso aos recursos de ${ROTULO_TIPO[detalhe.tipoParticipacao]?.toLowerCase()}.`}
          onFechar={() => setRejeitando(false)}
          acoes={(
            <>
              <button type="button" className="ghost-button" onClick={() => setRejeitando(false)}>Cancelar</button>
              <button
                type="button"
                className="danger-button"
                disabled={!motivo.trim() || Boolean(acao)}
                onClick={() => {
                  setRejeitando(false);
                  decidir('rejeitar', () => api.rejeitarCadastro(id, motivo.trim(), programa), `Cadastro de ${detalhe.nome} rejeitado.`);
                }}
              >
                Rejeitar
              </button>
            </>
          )}
        >
          <label htmlFor={motivoId} className="field-label">Justificativa (obrigatória, visível ao aluno)</label>
          <textarea id={motivoId} className="detail-textarea" rows={4} maxLength={1000} required value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Ex.: requisitos acadêmicos não confirmados." data-autofocus />
        </Modal>
      )}
    </article>
  );
}
