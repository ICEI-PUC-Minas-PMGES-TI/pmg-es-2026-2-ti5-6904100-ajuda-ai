import { useCallback, useEffect, useState } from 'react';
import { Link, useOutletContext } from 'react-router-dom';
import { api } from '../../api/client';
import Icon from '../../components/Icon';
import { EstadoCarregando, EstadoErro, EstadoVazio } from './partes';
import { formatarData, ROTULO_PAPEL, ROTULO_STATUS } from './util';

function descrever(item) {
  const { papel, status, grupo } = item;
  if (status === 'nao_aprovado') return { titulo: 'Candidatura não aprovada', texto: 'Neste ciclo sua candidatura não foi aprovada.', tom: 'pink' };
  if (papel === 'candidato') {
    return { titulo: 'Candidatura a padrinho', texto: status === 'em_analise' ? 'Sua candidatura está em análise pela coordenação.' : 'Sua candidatura foi enviada e aguarda análise.', tom: 'amber' };
  }
  if (papel === 'padrinho') {
    return status === 'concluido'
      ? { titulo: 'Padrinho', texto: 'Você atuou como padrinho e concluiu o semestre.', tom: 'purple' }
      : { titulo: 'Padrinho ativo', texto: 'Você está atuando como padrinho neste semestre.', tom: 'green' };
  }
  if (status === 'concluido') return { titulo: 'Apadrinhado', texto: 'Você participou e concluiu sua jornada.', tom: 'purple' };
  return grupo
    ? { titulo: 'Apadrinhado ativo', texto: 'Você está sendo acompanhado(a) por um padrinho neste semestre.', tom: 'green' }
    : { titulo: 'Aprovado — aguardando matching', texto: 'Seu cadastro foi aprovado e o match está em andamento.', tom: 'blue' };
}

function rotuloPill(item) {
  if (item.papel === 'candidato' && item.status === 'pendente') return 'Enviada';
  return ROTULO_STATUS[item.status] || item.status;
}

export default function HistoricoPage() {
  const { email } = useOutletContext();
  const [lista, setLista] = useState(null);
  const [erro, setErro] = useState('');

  const carregar = useCallback(async () => {
    setErro('');
    try {
      setLista(await api.historico(email));
    } catch (error) {
      setErro(error.message || 'Não foi possível carregar seu histórico.');
    }
  }, [email]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  if (erro && !lista) return <EstadoErro mensagem={erro} onTentar={carregar} />;
  if (!lista) return <EstadoCarregando texto="Carregando seu histórico…" />;

  const cronologico = [...lista].sort((a, b) => String(a.programa).localeCompare(String(b.programa)) || String(a.criadoEm).localeCompare(String(b.criadoEm)));
  const comoPadrinho = lista.filter((i) => i.papel === 'padrinho');
  const totalApadrinhados = comoPadrinho.reduce((soma, i) => soma + (Number(i.apadrinhados) || 0), 0);
  const ciclos = new Set(lista.map((i) => i.programa)).size;
  const papeis = cronologico.map((i) => (i.papel === 'candidato' ? 'Candidato' : ROTULO_PAPEL[i.papel]));
  const transicao = papeis.length > 1 && papeis[0] !== papeis[papeis.length - 1] ? `${papeis[0]} → ${papeis[papeis.length - 1]}` : papeis[papeis.length - 1] || '—';
  const atual = cronologico[cronologico.length - 1];
  const atualInfo = atual ? descrever(atual) : null;

  return (
    <div className="aluno-page history-page">
      <header className="status-intro">
        <img src="/images/historico.png" alt="" className="status-intro-art" />
        <div className="status-intro-copy">
          <h1>Histórico de participação</h1>
          <p>Veja sua evolução no programa e seus papéis em cada ciclo.</p>
        </div>
      </header>

      {lista.length === 0 ? (
        <EstadoVazio icon="history" titulo="Nenhuma participação registrada" texto="Quando você participar de um ciclo do programa, ele aparece aqui." />
      ) : (
        <>
          <section className="timeline-card history-board" aria-label="Resumo e ciclos">
            <div className="timeline-card-head">
              <div>
                <h2>Sua trajetória</h2>
                <p>Resumo dos ciclos e papéis no Ajuda-aí.</p>
              </div>
              <Link to="/aluno/candidatura" className="help-inline">Ver status atual</Link>
            </div>

            <div className="history-stats">
              <div className="history-stat">
                <strong>{ciclos}</strong>
                <span>Ciclos no programa</span>
              </div>
              {comoPadrinho.length > 0 ? (
                <div className="history-stat">
                  <strong>{totalApadrinhados}</strong>
                  <span>Apadrinhados · {comoPadrinho.length} semestre(s)</span>
                </div>
              ) : (
                <div className="history-stat">
                  <strong>{lista.filter((i) => i.papel === 'apadrinhado').length}</strong>
                  <span>Ciclos como apadrinhado</span>
                </div>
              )}
              <div className="history-stat">
                <strong className="small">{papeis.length > 1 ? 'Transição' : 'Papel'}</strong>
                <span>{transicao}</span>
              </div>
            </div>

            <ol className="history-track" aria-label="Linha do tempo dos ciclos">
              {cronologico.map((item, indice) => {
                const info = descrever(item);
                return (
                  <li key={item.id} className={`${info.tom}${indice === cronologico.length - 1 ? ' atual' : ' concluida'}`}>
                    <span className="history-track-dot" aria-hidden="true" />
                    <strong>{item.programa}</strong>
                    <span>{info.titulo}</span>
                  </li>
                );
              })}
            </ol>
          </section>

          <ol className="history-list">
            {cronologico.map((item) => {
              const info = descrever(item);
              return (
                <li key={item.id} className={`history-card ${info.tom}`}>
                  <div className="history-card-head">
                    <div>
                      <small>Programa {item.programa}</small>
                      <h2>{info.titulo}</h2>
                      <p>{info.texto}</p>
                    </div>
                    <span className={`history-pill ${info.tom}`}>{rotuloPill(item)}</span>
                  </div>
                  <dl className="history-meta">
                    <div><dt>Papel</dt><dd>{ROTULO_PAPEL[item.papel] || item.papel}</dd></div>
                    {item.papel === 'padrinho' && <div><dt>Apadrinhados</dt><dd>{item.apadrinhados}</dd></div>}
                    <div><dt>Grupo</dt><dd>{item.grupo || 'Sem vínculo'}</dd></div>
                    <div><dt>Início</dt><dd>{formatarData(item.inicioEm || item.criadoEm) || '—'}</dd></div>
                  </dl>
                </li>
              );
            })}
          </ol>

          <div className="status-foot">
            {atualInfo && (
              <div className="status-next">
                <span className="status-next-icon" aria-hidden="true"><Icon name="clock" size={22} /></span>
                <div>
                  <strong>Situação mais recente</strong>
                  <p>{atual.programa} · {atualInfo.titulo}. {atualInfo.texto}</p>
                </div>
                <Link to="/aluno/candidatura" className="ghost-button">Acompanhar</Link>
              </div>
            )}
            {totalApadrinhados > 0 ? (
              <div className="deadline-box">
                <Icon name="trophy" size={22} />
                <div>
                  <strong>Impacto total</strong>
                  <p>Você já apoiou {totalApadrinhados} apadrinhado(s) em {comoPadrinho.length} semestre(s) como padrinho.</p>
                </div>
              </div>
            ) : (
              <div className="deadline-box">
                <Icon name="info" size={22} />
                <div>
                  <strong>Continue acompanhando</strong>
                  <p>Novos ciclos e mudanças de papel aparecem aqui automaticamente.</p>
                </div>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
