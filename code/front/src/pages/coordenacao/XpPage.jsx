import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { api } from '../../api/client';
import Icon from '../../components/Icon';
import Modal from '../../components/Modal';
import { useToast } from '../../components/Toast';
import { dataCurta } from './comum';
import {
  formularioDoPendente,
  gravarPendente,
  lerPendente,
  limparPendente,
  pendenteConfirmado,
  respostaIncerta,
} from './ajustePendente';

/** Iguais aos do servidor (`LIMITES.ajusteAdmin` e motivo do ajuste). */
export const LIMITES_AJUSTE_XP = { max: 200, motivoMin: 3, motivoMax: 300 };

export const ROTULO_TIPO_MOVIMENTACAO = {
  PUCSTOP_CLAIM: 'Totem',
  RECOMPENSA: 'Lojinha',
  AJUSTE_ADMIN: 'Ajuste da coordenação',
  MISSAO: 'Missão',
};

const novaChave = () =>
  (globalThis.crypto?.randomUUID?.() ?? 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  }));

/**
 * Valida o formulário de ajuste. `sentido`: 'credito' ou 'debito';
 * `moedas`: saldo atual (um débito nunca deixa negativo).
 */
export function validarAjusteXp({ sentido, quantidade, motivo }, moedas) {
  const t = String(quantidade ?? '').trim();
  if (!/^\d+$/.test(t) || Number(t) === 0) return 'Informe uma quantidade inteira maior que zero.';
  const n = Number(t);
  if (n > LIMITES_AJUSTE_XP.max) return `Cada ajuste vai até ${LIMITES_AJUSTE_XP.max} pontos.`;
  if (sentido === 'debito' && typeof moedas === 'number' && n > moedas) return `O aluno tem ${moedas} moedas; o débito não pode passar disso.`;
  // Como o banco conta (`char_length`): pontos de código, sem as pontas.
  const m = [...String(motivo ?? '').trim()].length;
  if (m < LIMITES_AJUSTE_XP.motivoMin) return `Escreva o motivo (mínimo ${LIMITES_AJUSTE_XP.motivoMin} caracteres).`;
  if (m > LIMITES_AJUSTE_XP.motivoMax) return `Motivo com no máximo ${LIMITES_AJUSTE_XP.motivoMax} caracteres.`;
  return '';
}

/** Corpo do POST de ajuste a partir do formulário. */
export function corpoAjusteXp({ sentido, quantidade, motivo }, chave) {
  const n = Number(String(quantidade).trim());
  return { quantidade: sentido === 'debito' ? -n : n, motivo: String(motivo).trim(), chaveIdempotencia: chave };
}

const sinal = (n) => (n > 0 ? `+${n.toLocaleString('pt-BR')}` : n.toLocaleString('pt-BR'));

export function ListaParticipantesXp({ participantes, onAbrir }) {
  return (
    <div className="users-table-wrap">
      <table className="users-table xp-table">
        <caption className="sr-only">XP e moedas dos participantes</caption>
        <thead>
          <tr>
            <th scope="col">Participante</th>
            <th scope="col">Nível</th>
            <th scope="col">XP acumulado</th>
            <th scope="col">Moedas</th>
            <th scope="col"><span className="sr-only">Ações</span></th>
          </tr>
        </thead>
        <tbody>
          {participantes.map((p) => (
            <tr key={p.usuario.id}>
              <td data-label="Participante">
                <strong>{p.usuario.nome}</strong>
                <small className="recompensa-sub">{p.usuario.email}</small>
              </td>
              <td data-label="Nível">{p.nivel.numero} · {p.nivel.nome}</td>
              <td data-label="XP acumulado">{p.xpAcumulado.toLocaleString('pt-BR')} XP</td>
              <td data-label="Moedas">{p.moedas.toLocaleString('pt-BR')}</td>
              <td className="user-actions">
                <div>
                  <button type="button" className="mini-btn" onClick={() => onAbrir?.(p)} aria-label={`Ver extrato e ajustar XP de ${p.usuario.nome}`}>
                    <Icon name="history" size={14} /> Extrato e ajuste
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Extrato do participante e formulário de ajuste justificado. */
export function ExtratoXp({ participante, onFechar, onAjustado }) {
  const [extrato, setExtrato] = useState(null);
  const [erroCarga, setErroCarga] = useState('');
  const [mais, setMais] = useState(false);
  const [form, setForm] = useState({ sentido: 'credito', quantidade: '', motivo: '' });
  const [tocado, setTocado] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');
  const id = participante.usuario.id;
  // Envio anterior sem resposta conclusiva (fechar/reabrir ou recarregar a
  // página não gera outra chave para a mesma intenção).
  const [pendente, setPendente] = useState(() => lerPendente(id));
  const [aviso, setAviso] = useState('');
  const chave = useRef(pendente?.chave ?? novaChave());
  const trava = useRef(false);
  const base = useId();

  const carregar = useCallback(async () => {
    setErroCarga('');
    try {
      const dados = await api.xpParticipante(id, { limite: 20 });
      setExtrato(dados);
      setMais(dados.movimentacoes.length === 20);
      return dados;
    } catch (error) {
      setErroCarga(error.message || 'Não foi possível carregar o extrato.');
      return null;
    }
  }, [id]);

  /** Confere no extrato se a intenção pendente já foi gravada. */
  const reconciliar = useCallback((dados, atual) => {
    if (!dados || !atual) return;
    if (pendenteConfirmado(atual, dados.ajustes)) {
      limparPendente(id);
      setPendente(null);
      chave.current = novaChave();
      setForm({ sentido: 'credito', quantidade: '', motivo: '' });
      setAviso(`O ajuste enviado antes (${sinal(atual.corpo.quantidade)}: ${atual.corpo.motivo}) já estava registrado. Nada foi lançado de novo.`);
    } else {
      setForm(formularioDoPendente(atual));
      setAviso('');
    }
  }, [id]);

  useEffect(() => {
    let vivo = true;
    carregar().then((dados) => { if (vivo) reconciliar(dados, lerPendente(id)); });
    return () => { vivo = false; };
  }, [carregar, reconciliar, id]);

  function descartarPendente() {
    limparPendente(id);
    setPendente(null);
    chave.current = novaChave();
    setForm({ sentido: 'credito', quantidade: '', motivo: '' });
    setErro('');
  }

  async function carregarMais() {
    const ultimo = extrato?.movimentacoes.at(-1)?.id;
    if (!ultimo) return;
    try {
      const dados = await api.xpParticipante(id, { limite: 20, antes: ultimo });
      setExtrato((atual) => ({ ...atual, movimentacoes: [...atual.movimentacoes, ...dados.movimentacoes] }));
      setMais(dados.movimentacoes.length === 20);
    } catch (error) {
      setErroCarga(error.message || 'Não foi possível carregar mais.');
    }
  }

  const erroValidacao = validarAjusteXp(form, extrato?.moedas);
  function campo(chaveCampo, valor) {
    setForm((atual) => ({ ...atual, [chaveCampo]: valor }));
    setErro('');
  }

  async function salvar(event) {
    event.preventDefault();
    setTocado(true);
    if (erroValidacao || salvando || trava.current) return;
    trava.current = true;
    setSalvando(true);
    setAviso('');
    // Enquanto houver intenção pendente, o reenvio usa a mesma chave: se os
    // dados mudaram e a anterior entrou, o servidor responde 409 e nada dobra.
    const corpo = corpoAjusteXp(form, chave.current);
    // Havia um envio anterior sem resposta? Um erro que não prova nada sobre
    // ele (400, 401, 403…) não pode apagá-lo.
    const haviaPendente = Boolean(pendente);
    gravarPendente(id, corpo);
    try {
      const resposta = await api.ajustarXp(id, corpo);
      limparPendente(id);
      setPendente(null);
      chave.current = novaChave();
      setForm({ sentido: 'credito', quantidade: '', motivo: '' });
      setTocado(false);
      await carregar();
      onAjustado?.(resposta);
    } catch (error) {
      if (respostaIncerta(error)) {
        // Pode ter entrado: guarda a intenção e a chave para o reenvio.
        setPendente(lerPendente(id));
        setErro(`${error.message || 'Sem resposta do servidor.'} O ajuste pode ter sido registrado: reenvie (não duplica) ou confira o extrato.`);
      } else if (error.status === 409) {
        // A chave já pertence a um ajuste gravado: a intenção está resolvida.
        limparPendente(id);
        setPendente(null);
        chave.current = novaChave();
        await carregar();
        setErro(error.message || 'Esta chave já foi usada em outro ajuste.');
      } else if (error.status === 422 || !haviaPendente) {
        // 422 só sai quando NÃO há ajuste com esta chave (o servidor procura a
        // chave antes de validar saldo); sem pendente anterior, este envio
        // também não gravou nada. A chave continua valendo para corrigir e reenviar.
        limparPendente(id);
        setPendente(null);
        setErro(error.message || 'Não foi possível registrar o ajuste.');
      } else {
        // Erro que não diz se o envio anterior entrou: mantém a intenção.
        setPendente(lerPendente(id));
        setErro(error.message || 'Não foi possível registrar o ajuste.');
      }
    } finally {
      trava.current = false;
      setSalvando(false);
    }
  }

  const fechar = () => { if (!salvando) onFechar(); };
  return (
    <Modal
      titulo={`XP e moedas de ${participante.usuario.nome}`}
      descricao={participante.usuario.email}
      onFechar={fechar}
      tamanho="lg"
      acoes={<button type="button" className="ghost-button" onClick={fechar} disabled={salvando}>Fechar</button>}
    >
      {erroCarga && <p className="form-error" role="alert">{erroCarga}</p>}
      {!extrato && !erroCarga && <p className="detail-muted small" role="status">Carregando…</p>}
      {extrato && (
        <>
          <div className="users-summary xp-resumo">
            <div className="summary-tile"><strong>{extrato.nivel.numero}</strong><span>{extrato.nivel.nome}</span></div>
            <div className="summary-tile"><strong>{extrato.xpAcumulado.toLocaleString('pt-BR')}</strong><span>XP acumulado</span></div>
            <div className="summary-tile"><strong>{extrato.moedas.toLocaleString('pt-BR')}</strong><span>Moedas para a lojinha</span></div>
          </div>
          <p className="field-hint">XP acumulado é tudo o que o aluno ganhou e define o nível; trocas na lojinha gastam só moedas.</p>

          <form className="pucstop-form" onSubmit={salvar} noValidate>
            <h3 className="recompensa-historico-titulo">Novo ajuste</h3>
            {aviso && <p className="detail-muted small" role="status">{aviso}</p>}
            {pendente && (
              <div className="dash-inline-error" role="alert">
                Um envio anterior deste ajuste ficou sem resposta. Reenvie para confirmar: com a mesma chave ele não é lançado duas vezes.
                <button type="button" onClick={descartarPendente} disabled={salvando}>Descartar</button>
              </div>
            )}
            <div className="editor-grid pucstop-grid">
              <label className="editor-field" htmlFor={`${base}-sentido`}>
                <span>Tipo</span>
                <select id={`${base}-sentido`} className="detail-select" value={form.sentido} onChange={(e) => campo('sentido', e.target.value)}>
                  <option value="credito">Crédito (somar)</option>
                  <option value="debito">Débito (corrigir para menos)</option>
                </select>
              </label>
              <label className="editor-field" htmlFor={`${base}-qtd`}>
                <span>Quantidade (XP e moedas)</span>
                <input id={`${base}-qtd`} type="number" inputMode="numeric" min={1} max={LIMITES_AJUSTE_XP.max} step="1" value={form.quantidade} onChange={(e) => campo('quantidade', e.target.value)} />
              </label>
            </div>
            <label className="editor-field" htmlFor={`${base}-motivo`}>
              <span>Motivo</span>
              <input id={`${base}-motivo`} maxLength={LIMITES_AJUSTE_XP.motivoMax * 2} placeholder="Ex.: participou do mutirão; crédito duplicado por erro" value={form.motivo} onChange={(e) => campo('motivo', e.target.value)} />
            </label>
            <p className="field-hint">Até {LIMITES_AJUSTE_XP.max} por ajuste. Fica registrado com você como responsável; lançamentos anteriores não são apagados.</p>
            {tocado && erroValidacao && <p className="detail-muted small" role="status">{erroValidacao}</p>}
            {erro && <p className="form-error" role="alert"><Icon name="alert" size={15} /> {erro}</p>}
            <button type="submit" className="primary-button inline" disabled={salvando || (tocado && !!erroValidacao)}>
              <Icon name="save" size={16} /> {salvando ? 'Registrando…' : 'Registrar ajuste'}
            </button>
          </form>

          <h3 className="recompensa-historico-titulo">Extrato</h3>
          {extrato.movimentacoes.length === 0 && <p className="detail-muted small">Nenhuma movimentação ainda.</p>}
          <ul className="recompensa-historico">
            {extrato.movimentacoes.map((m) => (
              <li key={m.id}>
                <strong>{sinal(m.quantidade)} moedas</strong>
                {m.xp ? ` · ${sinal(m.xp)} XP` : ''}
                <span className="detail-muted"> · {m.descricao.startsWith(ROTULO_TIPO_MOVIMENTACAO[m.tipo] ?? '\u0000') ? '' : `${ROTULO_TIPO_MOVIMENTACAO[m.tipo] || m.tipo} · `}{m.descricao} · saldo {m.saldoApos.toLocaleString('pt-BR')} · {dataCurta(m.criadoEm)}</span>
              </li>
            ))}
          </ul>
          {mais && <button type="button" className="ghost-button" onClick={carregarMais}>Carregar mais</button>}

          {extrato.ajustes.length > 0 && (
            <>
              <h3 className="recompensa-historico-titulo">Ajustes da coordenação</h3>
              <ul className="recompensa-historico">
                {extrato.ajustes.map((a) => (
                  <li key={a.id}>
                    <strong>{sinal(a.quantidade)}</strong>
                    <span className="detail-muted"> · {a.motivo} · {a.responsavel.email || 'coordenação'} · {dataCurta(a.criadoEm)}</span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </>
      )}
    </Modal>
  );
}

export default function XpPage() {
  const mostrarToast = useToast();
  const [busca, setBusca] = useState('');
  const [participantes, setParticipantes] = useState(null);
  const [erro, setErro] = useState('');
  const [aberto, setAberto] = useState(null);

  const carregar = useCallback(async (termo) => {
    setErro('');
    try {
      setParticipantes(await api.xpParticipantes(termo || undefined));
    } catch (error) {
      setErro(error.message || 'Não foi possível carregar os participantes.');
    }
  }, []);

  // Busca no servidor com um pequeno atraso enquanto digita.
  useEffect(() => {
    const timer = setTimeout(() => carregar(busca.trim()), 300);
    return () => clearTimeout(timer);
  }, [busca, carregar]);

  return (
    <section className="users-page pucstops-page xp-page">
      <header className="dash-header">
        <div>
          <h1>XP e moedas</h1>
          <p>Consulte o XP, o nível e as moedas de cada aluno e faça correções justificadas. Cada ajuste fica no extrato com o responsável.</p>
        </div>
      </header>

      <div className="cand-tools users-tools">
        <label className="search-field">
          <Icon name="search" size={17} />
          <span className="sr-only">Buscar participante</span>
          <input type="search" value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar por nome ou e-mail…" />
        </label>
      </div>

      {erro && <div className="dash-inline-error" role="alert">{erro}<button type="button" onClick={() => carregar(busca.trim())}>Tentar novamente</button></div>}
      {!participantes && !erro && <div className="coord-state" role="status"><div className="coord-spinner" aria-hidden="true" /><p>Carregando…</p></div>}
      {participantes?.length === 0 && <p className="empty-copy">Ninguém encontrado.</p>}
      {participantes?.length > 0 && <ListaParticipantesXp participantes={participantes} onAbrir={setAberto} />}
      {participantes?.length >= 50 && <p className="detail-muted small">Mostrando os 50 primeiros. Refine a busca.</p>}

      {aberto && (
        <ExtratoXp
          participante={aberto}
          onFechar={() => setAberto(null)}
          onAjustado={(r) => {
            mostrarToast(`Ajuste registrado: ${sinal(r.ajuste.quantidade)} para ${aberto.usuario.nome}.`, 'sucesso');
            carregar(busca.trim());
          }}
        />
      )}
    </section>
  );
}
