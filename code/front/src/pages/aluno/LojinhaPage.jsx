import { useCallback, useEffect, useState } from 'react';
import { api } from '../../api/client';
import Icon from '../../components/Icon';
import { EstadoCarregando, EstadoErro, EstadoVazio } from './partes';
import './lojinha.css';

const moeda = (valor) => Number(valor || 0).toLocaleString('pt-BR');

function dataHora(valor) {
  if (!valor) return '—';
  const data = new Date(valor);
  return Number.isNaN(data.getTime())
    ? '—'
    : new Intl.DateTimeFormat('pt-BR', {
        dateStyle: 'short',
        timeStyle: 'short',
      }).format(data);
}

function situacaoResgate(valor) {
  return ({
    aguardando_entrega: 'Aguardando retirada',
    entregue: 'Entregue',
    cancelado: 'Cancelado',
  })[valor] || valor || '—';
}

function podeResgatar(item, saldo) {
  return (
    Number(saldo) >= item.custoXp
    && (item.estoque === null || item.estoque > 0)
    && (item.limitePorAluno == null || item.resgatesFeitos < item.limitePorAluno)
  );
}

function chaveIdempotencia() {
  if (!globalThis.crypto?.randomUUID) {
    throw new Error('Este navegador não permite gerar uma chave segura para o resgate.');
  }
  return globalThis.crypto.randomUUID();
}

export default function LojinhaPage() {
  const [itens, setItens] = useState(null);
  const [saldo, setSaldo] = useState(null);
  const [resgates, setResgates] = useState(null);
  const [aba, setAba] = useState('catalogo');
  const [selecionada, setSelecionada] = useState(null);
  const [carregandoDetalhe, setCarregandoDetalhe] = useState(false);
  const [confirmando, setConfirmando] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const [comprovante, setComprovante] = useState(null);
  const [erro, setErro] = useState('');
  const [erroModal, setErroModal] = useState('');

  const carregar = useCallback(async () => {
    setErro('');
    try {
      const [lista, carteira] = await Promise.all([
        api.lojinhaAluno(),
        api.saldoLojinhaAluno(),
      ]);
      setItens(lista);
      setSaldo(carteira.saldo ?? 0);
    } catch (error) {
      setErro(error.message || 'Não foi possível carregar a lojinha.');
    }
  }, []);

  useEffect(() => {
    carregar();
  }, [carregar]);

  const carregarResgates = useCallback(async () => {
    setErro('');
    try {
      setResgates(await api.historicoLojinhaAluno());
    } catch (error) {
      setErro(error.message || 'Não foi possível carregar seus resgates.');
    }
  }, []);

  async function abrirDetalhe(item) {
    setSelecionada(item);
    setConfirmando(false);
    setErroModal('');
    setCarregandoDetalhe(true);
    try {
      setSelecionada(await api.detalheLojinhaAluno(item.id));
    } catch (error) {
      setErroModal(error.message || 'Não foi possível carregar os detalhes.');
    } finally {
      setCarregandoDetalhe(false);
    }
  }

  async function confirmarResgate() {
    if (!selecionada || ocupado) return;
    setOcupado(true);
    setErroModal('');
    try {
      const resultado = await api.resgatarLojinhaAluno(selecionada.id, {
        chaveIdempotencia: chaveIdempotencia(),
        versao: selecionada.versao,
        custoXp: selecionada.custoXp,
      });
      setComprovante(resultado);
      setSelecionada(null);
      setConfirmando(false);
      await carregar();
    } catch (error) {
      setErroModal(error.message || 'Não foi possível concluir o resgate.');
      if (error.status === 409) {
        try {
          setSelecionada(await api.detalheLojinhaAluno(selecionada.id));
          setConfirmando(false);
        } catch (atualizarError) {
          setErroModal(
            `${error.message || 'O resgate não foi concluído.'} Não foi possível atualizar os detalhes: ${atualizarError.message}`,
          );
        }
      }
    } finally {
      setOcupado(false);
    }
  }

  if (!itens && !erro) return <EstadoCarregando texto="Carregando a lojinha…" />;
  if (erro && !itens) return <EstadoErro mensagem={erro} onTentar={carregar} />;

  return (
    <div className="aluno-page lojinha-page">
      <header className="status-intro lojinha-intro">
        <div className="status-intro-copy">
          <h1>Lojinha</h1>
          <p>Troque suas moedas por recompensas disponíveis para sua participação.</p>
        </div>
        <div className="lojinha-saldo" aria-label={`Saldo: ${moeda(saldo)} moedas`}>
          <Icon name="tag" size={20} />
          <span><strong>{moeda(saldo)}</strong> moedas</span>
        </div>
      </header>

      <nav className="lojinha-tabs" aria-label="Seções da lojinha">
        <button
          type="button"
          className={aba === 'catalogo' ? 'ativo' : ''}
          aria-current={aba === 'catalogo' ? 'page' : undefined}
          onClick={() => { setAba('catalogo'); setErro(''); }}
        >
          Recompensas
        </button>
        <button
          type="button"
          className={aba === 'resgates' ? 'ativo' : ''}
          aria-current={aba === 'resgates' ? 'page' : undefined}
          onClick={() => { setAba('resgates'); carregarResgates(); }}
        >
          Meus resgates
        </button>
        <button type="button" className="lojinha-atualizar" onClick={aba === 'catalogo' ? carregar : carregarResgates}>
          <Icon name="refresh" size={16} /> Atualizar
        </button>
      </nav>

      {erro && <p className="lojinha-erro" role="alert">{erro}</p>}

      {aba === 'catalogo' ? (
        itens.length ? (
          <div className="lojinha-grid">
            {itens.map((item) => {
              const disponivel = podeResgatar(item, saldo);
              return (
                <article className="lojinha-card" key={item.id}>
                  {item.imagemUrl ? (
                    <img className="lojinha-imagem" src={item.imagemUrl} alt="" loading="lazy" />
                  ) : (
                    <div className="lojinha-imagem lojinha-sem-imagem" aria-hidden="true">
                      <Icon name="tag" size={34} />
                    </div>
                  )}
                  <div className="lojinha-card-conteudo">
                    <h2>{item.nome}</h2>
                    <p>{item.descricao}</p>
                    <div className="lojinha-card-meta">
                      <strong>{moeda(item.custoXp)} moedas</strong>
                      <span>{item.estoque === null ? 'Estoque ilimitado' : `${item.estoque} disponíveis`}</span>
                    </div>
                    <button type="button" className="primary-button inline" onClick={() => abrirDetalhe(item)}>
                      Ver detalhes
                    </button>
                    {!disponivel && (
                      <span className="lojinha-indisponivel">
                        {item.estoque !== null && item.estoque <= 0
                          ? 'Esgotada'
                          : item.limitePorAluno != null && item.resgatesFeitos >= item.limitePorAluno
                            ? 'Limite de resgates atingido'
                            : 'Saldo insuficiente'}
                      </span>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        ) : (
          <EstadoVazio icon="tag" titulo="Nenhuma recompensa disponível" texto="Quando houver recompensas disponíveis para sua participação, elas aparecerão aqui." />
        )
      ) : resgates === null ? (
        erro ? (
          <button type="button" className="outline-button" onClick={carregarResgates}>
            Tentar carregar meus resgates novamente
          </button>
        ) : <EstadoCarregando texto="Carregando seus resgates…" />
      ) : resgates.length ? (
        <div className="lojinha-resgates">
          {resgates.map((item) => (
            <article className="lojinha-resgate" key={item.id}>
              <div>
                <h2>{item.nome}</h2>
                <p>{moeda(item.custoXp)} moedas · {dataHora(item.criadoEm)}</p>
                <span>{situacaoResgate(item.situacao)}</span>
              </div>
              <strong className="lojinha-codigo">{item.codigo}</strong>
            </article>
          ))}
        </div>
      ) : (
        <EstadoVazio icon="history" titulo="Você ainda não resgatou recompensas" texto="Seus resgates e códigos de retirada ficarão disponíveis aqui." />
      )}

      {selecionada && (
        <div className="lojinha-modal-fundo" role="presentation" onMouseDown={(event) => {
          if (event.target === event.currentTarget && !ocupado) setSelecionada(null);
        }}>
          <section className="lojinha-modal" role="dialog" aria-modal="true" aria-labelledby="lojinha-modal-titulo">
            <button type="button" className="lojinha-fechar" aria-label="Fechar detalhes" disabled={ocupado} onClick={() => setSelecionada(null)}>×</button>
            {selecionada.imagemUrl && <img className="lojinha-modal-imagem" src={selecionada.imagemUrl} alt="" />}
            <h2 id="lojinha-modal-titulo">{confirmando ? 'Confirmar resgate' : selecionada.nome}</h2>
            {carregandoDetalhe ? (
              <p role="status">Carregando detalhes…</p>
            ) : !confirmando ? (
              <>
                {erroModal && <p className="lojinha-erro" role="alert">{erroModal}</p>}
                <p>{selecionada.descricao}</p>
                <dl className="lojinha-detalhes">
                  <div><dt>Custo</dt><dd>{moeda(selecionada.custoXp)} moedas</dd></div>
                  <div><dt>Estoque</dt><dd>{selecionada.estoque === null ? 'Ilimitado' : `${selecionada.estoque} disponíveis`}</dd></div>
                  {selecionada.limitePorAluno != null && <div><dt>Seus resgates</dt><dd>{selecionada.resgatesFeitos} de {selecionada.limitePorAluno}</dd></div>}
                  {selecionada.disponivelAte && <div><dt>Disponível até</dt><dd>{dataHora(selecionada.disponivelAte)}</dd></div>}
                </dl>
                <div className="lojinha-condicoes"><strong>Condições de retirada</strong><p>{selecionada.condicoesRetirada}</p></div>
                <div className="lojinha-modal-acoes">
                  <button type="button" className="outline-button" onClick={() => setSelecionada(null)}>Voltar</button>
                  <button
                    type="button"
                    className="primary-button inline"
                    disabled={!podeResgatar(selecionada, saldo)}
                    onClick={() => { setConfirmando(true); setErroModal(''); }}
                  >
                    Resgatar
                  </button>
                </div>
              </>
            ) : (
              <>
                <p>Será debitado <strong>{moeda(selecionada.custoXp)} moedas</strong>. Seu saldo após a troca será de <strong>{moeda(saldo - selecionada.custoXp)} moedas</strong>.</p>
                <div className="lojinha-condicoes"><strong>Condições de retirada</strong><p>{selecionada.condicoesRetirada}</p></div>
                {erroModal && <p className="lojinha-erro" role="alert">{erroModal}</p>}
                <div className="lojinha-modal-acoes">
                  <button type="button" className="outline-button" disabled={ocupado} onClick={() => setConfirmando(false)}>Revisar</button>
                  <button type="button" className="primary-button inline" disabled={ocupado} onClick={confirmarResgate}>
                    {ocupado ? 'Confirmando…' : 'Confirmar resgate'}
                  </button>
                </div>
              </>
            )}
          </section>
        </div>
      )}

      {comprovante && (
        <div className="lojinha-modal-fundo" role="presentation">
          <section className="lojinha-modal" role="dialog" aria-modal="true" aria-labelledby="lojinha-comprovante-titulo">
            <h2 id="lojinha-comprovante-titulo">Resgate confirmado</h2>
            <p>Apresente este código ao retirar sua recompensa.</p>
            <strong className="lojinha-comprovante-codigo">{comprovante.codigo}</strong>
            <p>Saldo restante: {moeda(comprovante.saldoAtual)} moedas</p>
            <div className="lojinha-modal-acoes">
              <button type="button" className="primary-button inline" onClick={() => { setComprovante(null); setAba('resgates'); carregarResgates(); }}>
                Ver meus resgates
              </button>
              <button type="button" className="outline-button" onClick={() => setComprovante(null)}>Fechar</button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
