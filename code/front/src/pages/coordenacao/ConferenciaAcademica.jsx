import { useEffect, useId, useState } from 'react';
import { api } from '../../api/client';
import Icon from '../../components/Icon';
import { dataCurta } from './comum';

export const ROTULO_CONFERENCIA = {
  requisitos_atendidos: 'Requisitos atendidos',
  requisitos_nao_atendidos: 'Requisitos não atendidos',
};

export function conferenciaTom(resultado) {
  if (resultado === 'requisitos_atendidos') return 'aprovada';
  if (resultado === 'requisitos_nao_atendidos') return 'rejeitada';
  return 'nova';
}

/** A aprovação só é liberada com conferência registrada e requisitos atendidos. */
export function conferenciaLiberaAprovacao(conferencia) {
  return conferencia?.verificacao?.resultado === 'requisitos_atendidos';
}

/** Sugestão de justificativa quando a conferência apontou requisitos não atendidos. */
export function justificativaDaConferencia(conferencia) {
  const verificacao = conferencia?.verificacao;
  if (verificacao?.resultado !== 'requisitos_nao_atendidos') return '';
  const faltas = verificacao.itens.filter((i) => i.obrigatorio && !i.atende).map((i) => i.descricao);
  return `Requisitos não atendidos na conferência acadêmica: ${faltas.join('; ')}.`;
}

function dataHora(iso) {
  const data = new Date(iso);
  if (Number.isNaN(data.getTime())) return '—';
  const hora = data.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  return `${dataCurta(iso)} às ${hora}`;
}

function textoParaConsulta(dados) {
  return [
    `Nome: ${dados.nome}`,
    `E-mail institucional: ${dados.email}`,
    `Curso: ${dados.curso}`,
    `Período: ${dados.periodo ? `${dados.periodo}º` : 'não informado'}`,
    dados.turno ? `Turno: ${dados.turno}` : null,
    `Papel: ${dados.papel} · Programa ${dados.programa}`,
  ].filter(Boolean).join('\n');
}

/** Parte da última conferência; item novo começa sem marcação. */
function marcacoesIniciais(conferencia) {
  const anteriores = Object.fromEntries((conferencia?.verificacao?.itens || []).map((i) => [i.id, i.atende]));
  return Object.fromEntries((conferencia?.itens || []).map((i) => [i.id, anteriores[i.id]]));
}

/**
 * Conferência acadêmica (F09). Não há integração com o sistema da faculdade:
 * a coordenação consulta lá com os dados abaixo, marca cada requisito do papel
 * (e os critérios do programa, para padrinhos) e registra o resultado com
 * observações, responsável e data.
 */
export default function ConferenciaAcademica({ participacaoId, conferencia, onRegistrada }) {
  const [marcacoes, setMarcacoes] = useState(() => marcacoesIniciais(conferencia));
  const [observacoes, setObservacoes] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');
  const [copiado, setCopiado] = useState(false);
  const [verHistorico, setVerHistorico] = useState(false);
  const tituloId = useId();
  const obsId = useId();
  const grupo = useId();

  useEffect(() => {
    setMarcacoes(marcacoesIniciais(conferencia));
  }, [conferencia]);

  if (!conferencia) return null;
  const { itens = [], verificacao, anteriores = [], podeRegistrar, dadosParaConsulta: dados } = conferencia;
  const completo = itens.length > 0 && itens.every((i) => typeof marcacoes[i.id] === 'boolean');

  async function copiar() {
    try {
      await navigator.clipboard.writeText(textoParaConsulta(dados));
      setCopiado(true);
      window.setTimeout(() => setCopiado(false), 2000);
    } catch {
      setErro('Não foi possível copiar. Selecione os dados manualmente.');
    }
  }

  async function registrar() {
    setSalvando(true);
    setErro('');
    try {
      const atualizado = await api.registrarVerificacao(
        participacaoId,
        itens.map((i) => ({ id: i.id, atende: marcacoes[i.id] })),
        observacoes.trim(),
      );
      setObservacoes('');
      onRegistrada?.(atualizado);
    } catch (error) {
      setErro(error.message || 'Não foi possível registrar a conferência.');
    } finally {
      setSalvando(false);
    }
  }

  return (
    <section className="detail-block conferencia" aria-labelledby={tituloId}>
      <h3 id={tituloId}>
        <Icon name="userSearch" size={17} /> Conferência acadêmica
        <span className={`status-pill ${conferenciaTom(verificacao?.resultado)}`}>
          {verificacao ? ROTULO_CONFERENCIA[verificacao.resultado] : 'Não conferida'}
        </span>
      </h3>

      {dados && (
        <div className="conferencia-dados">
          <p className="detail-sub">Dados para consultar no sistema da faculdade</p>
          <dl className="detail-facts">
            <div><dt>Nome</dt><dd>{dados.nome}</dd></div>
            <div><dt>E-mail institucional</dt><dd>{dados.email}</dd></div>
            <div><dt>Curso / período</dt><dd>{dados.curso}{dados.periodo ? ` · ${dados.periodo}º período` : ''}{dados.turno ? ` · ${dados.turno}` : ''}</dd></div>
            <div><dt>Papel</dt><dd>{dados.papel} · {dados.programa}</dd></div>
          </dl>
          <button type="button" className="mini-btn" onClick={copiar}>
            <Icon name={copiado ? 'check' : 'clipboard'} size={14} /> {copiado ? 'Dados copiados' : 'Copiar dados'}
          </button>
        </div>
      )}

      {podeRegistrar && (
        <div className="conferencia-form">
          <p className="detail-sub">Requisitos conferidos</p>
          <ul className="conferencia-itens">
            {itens.map((item) => (
              <li key={item.id} className={marcacoes[item.id] === false && item.obrigatorio ? 'nao-atende' : undefined}>
                <span className="conferencia-desc">
                  {item.descricao}
                  <small>{item.origem === 'programa' ? 'Critério do programa' : 'Requisito do papel'}{item.obrigatorio ? '' : ' · opcional'}</small>
                </span>
                <span className="conferencia-opcoes" role="radiogroup" aria-label={item.descricao}>
                  <label>
                    <input type="radio" name={`${grupo}-${item.id}`} checked={marcacoes[item.id] === true} onChange={() => setMarcacoes((m) => ({ ...m, [item.id]: true }))} />
                    Atende
                  </label>
                  <label>
                    <input type="radio" name={`${grupo}-${item.id}`} checked={marcacoes[item.id] === false} onChange={() => setMarcacoes((m) => ({ ...m, [item.id]: false }))} />
                    Não atende
                  </label>
                </span>
              </li>
            ))}
          </ul>
          <label htmlFor={obsId} className="detail-sub">Observações da conferência</label>
          <textarea
            id={obsId}
            className="detail-textarea"
            rows={3}
            maxLength={1000}
            value={observacoes}
            onChange={(e) => setObservacoes(e.target.value)}
            placeholder="Ex.: matrícula ativa e histórico conferidos no SGA."
          />
          <div className="decision-buttons">
            <button type="button" className="decision approve" disabled={!completo || salvando} onClick={registrar}>
              <Icon name="checkCircle" size={17} /> {salvando ? 'Registrando…' : verificacao ? 'Registrar nova conferência' : 'Registrar conferência'}
            </button>
          </div>
          {!completo && <p className="detail-muted small">Marque todos os itens para registrar a conferência.</p>}
        </div>
      )}

      {verificacao && (
        <div className="conferencia-registro">
          <p className="detail-sub">Registro da conferência</p>
          <dl className="detail-facts">
            <div><dt>Resultado</dt><dd>{ROTULO_CONFERENCIA[verificacao.resultado]}</dd></div>
            <div><dt>Responsável</dt><dd>{verificacao.por || '—'}</dd></div>
            <div><dt>Data</dt><dd>{dataHora(verificacao.em)}</dd></div>
          </dl>
          {!podeRegistrar && (
            <ul className="check-list">
              {verificacao.itens.map((i) => (
                <li key={i.id} className={i.atende ? undefined : 'nao-cumpre'}>
                  <Icon name={i.atende ? 'check' : 'close'} size={14} /> {i.descricao}
                </li>
              ))}
            </ul>
          )}
          {verificacao.observacoes && <p className="detail-text">{verificacao.observacoes}</p>}
        </div>
      )}

      {anteriores.length > 0 && (
        <>
          <button type="button" className="link-btn" aria-expanded={verHistorico} onClick={() => setVerHistorico((v) => !v)}>
            {verHistorico ? 'Ocultar' : 'Ver'} conferências anteriores ({anteriores.length})
          </button>
          {verHistorico && (
            <ul className="detail-history">
              {anteriores.map((a, i) => (
                <li key={`${a.em}-${i}`}>
                  <strong>{ROTULO_CONFERENCIA[a.resultado]}</strong> · {dataHora(a.em)} · {a.por || '—'}
                  {a.observacoes ? ` — ${a.observacoes}` : ''}
                </li>
              ))}
            </ul>
          )}
        </>
      )}

      {!verificacao && !podeRegistrar && (
        <p className="detail-muted">Decidida sem conferência registrada (registro anterior a esta etapa).</p>
      )}
      {erro && <p className="form-error" role="alert"><Icon name="alert" size={15} /> {erro}</p>}
      <p className="private-note">
        <Icon name="info" size={15} /> Não há integração com o sistema da faculdade: consulte lá e registre aqui o que foi conferido. Visível só para a coordenação.
      </p>
    </section>
  );
}
