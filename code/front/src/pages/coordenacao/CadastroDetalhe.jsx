import { useCallback, useEffect, useId, useState } from 'react';
import { api } from '../../api/client';
import Icon from '../../components/Icon';
import Modal from '../../components/Modal';
import { textoResposta } from '../../components/PerguntasAdicionais';
import { Avatar, dataCurta, RequisitosDeclarados, ROTULO_STATUS_CADASTRO, statusCadastroTom } from './comum';

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
  const motivoId = useId();

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
      onDecidido?.(mensagem);
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

  return (
    <article className="cand-detail" aria-labelledby={`cad-${id}-nome`}>
      <button type="button" className="back-to-list" onClick={onFechar}><Icon name="arrowLeft" size={16} /> Voltar à lista</button>

      <header className="detail-head">
        <Avatar pessoa={detalhe} tamanho="lg" />
        <div>
          <h2 id={`cad-${id}-nome`}>{detalhe.nome}</h2>
          <p><Icon name="school" size={15} /> {detalhe.curso} • {detalhe.periodo}º período{detalhe.turno ? ` • ${detalhe.turno}` : ''}</p>
          <p><Icon name="calendar" size={15} /> Cadastro enviado em {dataCurta(detalhe.criadoEm)}</p>
          <p><Icon name="mail" size={15} /> <a href={`mailto:${detalhe.email}`}>{detalhe.email}</a></p>
          <div className="detail-tags">
            <span className={`status-pill ${statusCadastroTom(detalhe.statusCadastro)}`}>{ROTULO_STATUS_CADASTRO[detalhe.statusCadastro]}</span>
            <span className="detail-tag"><Icon name={ehPadrinho ? 'groups' : 'person'} size={14} /> Quer participar como {ROTULO_TIPO[detalhe.tipoParticipacao]?.toLowerCase()}</span>
            {detalhe.participacao && <span className="detail-tag"><Icon name="calendar" size={14} /> Programa {detalhe.participacao.programa}</span>}
          </div>
        </div>
      </header>

      <div className="detail-grid">
        <div className="detail-main">
          {ehPadrinho ? (
            <>
              <Bloco icon="checkCircle" titulo="Requisitos do ciclo e declaração do candidato">
                <RequisitosDeclarados requisitos={r.requisitos} respondidos={Array.isArray(r.requisitos)} legado={r.declaraPreRequisitos} periodo={detalhe.periodo} />
              </Bloco>
              <Bloco icon="file" titulo="Motivação"><p className="detail-text">{r.motivacao || 'Não informada.'}</p></Bloco>
              {r.experiencias && <Bloco icon="star" titulo="Experiências relevantes"><p className="detail-text">{r.experiencias}</p></Bloco>}
            </>
          ) : (
            <>
              <Bloco icon="chat" titulo="O que espera do padrinho"><p className="detail-text">{r.expectativa || 'Não informado.'}</p></Bloco>
              {r.outrasInformacoes && <Bloco icon="file" titulo="Outras informações"><p className="detail-text">{r.outrasInformacoes}</p></Bloco>}
            </>
          )}
          <div className="detail-two">
            <Bloco icon="tag" titulo={ehPadrinho ? 'Áreas que pode apoiar' : 'Áreas em que quer apoio'}><Chips itens={r.areas} /></Bloco>
            <Bloco icon="clock" titulo="Disponibilidade"><Chips itens={r.disponibilidade} /></Bloco>
          </div>
          <Bloco icon="person" titulo="Perfil">
            <dl className="detail-facts">
              <div><dt>Gênero</dt><dd>{r.genero || 'Não informado'}</dd></div>
              <div><dt>Bolsista ProUni</dt><dd>{simNao(r.bolsistaProuni)}</dd></div>
              <div><dt>De outra cidade</dt><dd>{simNao(r.deOutraCidade)}</dd></div>
            </dl>
            {detalhe.interesses?.length > 0 && <><p className="detail-sub">Interesses</p><Chips itens={detalhe.interesses} /></>}
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
            <Bloco icon="history" titulo="Outras participações">
              <ul className="detail-history">
                {detalhe.historico.map((h) => <li key={h.id}><strong>{h.programa}</strong> · {ROTULO_PAPEL[h.papel] || h.papel}</li>)}
              </ul>
            </Bloco>
          )}
        </div>

        <aside className="detail-side">
          <section className="detail-block">
            <h3><Icon name="chart" size={17} /> Decisão da coordenação</h3>
            {pendente ? (
              <div className="decision-buttons">
                <button type="button" className="decision approve" disabled={Boolean(acao)} onClick={() => decidir('aprovar', () => api.aprovarCadastro(id, programa), `Cadastro de ${detalhe.nome} aprovado.`)}>
                  <Icon name="check" size={17} /> {acao === 'aprovar' ? 'Aprovando…' : 'Aprovar cadastro'}
                </button>
                <button type="button" className="decision reject" disabled={Boolean(acao)} onClick={() => setRejeitando(true)}>
                  <Icon name="close" size={17} /> Rejeitar cadastro
                </button>
              </div>
            ) : (
              <>
                <p className="detail-text">
                  {aprovado ? 'Cadastro aprovado' : 'Cadastro rejeitado'}
                  {detalhe.analisadoEm ? ` em ${dataCurta(detalhe.analisadoEm)}` : ''}
                  {detalhe.analisadoPor ? ` por ${detalhe.analisadoPor}` : ''}.
                </p>
                {!aprovado && detalhe.motivoRejeicao && <p className="detail-muted">Motivo informado ao aluno: {detalhe.motivoRejeicao}</p>}
                {!aprovado && (
                  <div className="decision-buttons">
                    <button type="button" className="decision approve" disabled={Boolean(acao)} onClick={() => decidir('aprovar', () => api.aprovarCadastro(id, programa), `Cadastro de ${detalhe.nome} aprovado.`)}>
                      <Icon name="check" size={17} /> {acao === 'aprovar' ? 'Aprovando…' : 'Rever e aprovar'}
                    </button>
                  </div>
                )}
              </>
            )}
            <p className="detail-muted small">
              {ehPadrinho
                ? 'Aprovar também aprova a candidatura a padrinho deste ciclo.'
                : 'Após a aprovação, o apadrinhado entra na fila de definição de padrinho.'}
            </p>
          </section>
          {erroAcao && <p className="form-error" role="alert"><Icon name="alert" size={15} /> {erroAcao}</p>}
        </aside>
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
          <label htmlFor={motivoId} className="field-label">Motivo (opcional, visível ao aluno)</label>
          <textarea id={motivoId} className="detail-textarea" rows={4} maxLength={500} value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Ex.: pré-requisitos não atendidos." data-autofocus />
        </Modal>
      )}
    </article>
  );
}
