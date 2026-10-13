import { useEffect, useId, useState } from 'react';
import { api } from '../../api/client';
import Icon from '../../components/Icon';

const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

export function dataCurta(iso) {
  if (!iso) return '';
  const data = new Date(iso);
  if (Number.isNaN(data.getTime())) return '';
  return `${data.getDate()} de ${MESES[data.getMonth()]}. de ${data.getFullYear()}`;
}

export function badgeClass(status, papel) {
  if (papel === 'padrinho') return 'aprovada';
  if (status === 'pendente') return 'nova';
  if (status === 'em_analise') return 'analise';
  if (status === 'nao_aprovado') return 'rejeitada';
  if (status === 'em_andamento' || status === 'concluido') return 'aprovada';
  return 'analise';
}

export const ROTULO_SITUACAO_COORD = {
  nenhuma: 'Sem participação',
  candidatura_pendente: 'Candidatura nova',
  candidatura_em_analise: 'Candidatura em análise',
  candidatura_rejeitada: 'Candidatura rejeitada',
  padrinho_ativo: 'Padrinho ativo',
  apadrinhado_pendente: 'Cadastro aguardando aprovação',
  apadrinhado_rejeitado: 'Cadastro rejeitado',
  apadrinhado_aguardando: 'Aguardando padrinho',
  apadrinhado_ativo: 'Apadrinhado com padrinho',
  concluido: 'Concluído',
};

export function situacaoTom(situacao) {
  if (situacao === 'apadrinhado_aguardando') return 'analise';
  if (situacao === 'apadrinhado_pendente') return 'nova';
  if (situacao === 'apadrinhado_rejeitado') return 'rejeitada';
  if (situacao === 'candidatura_pendente') return 'nova';
  if (situacao === 'candidatura_em_analise') return 'analise';
  if (situacao === 'candidatura_rejeitada') return 'rejeitada';
  return 'aprovada';
}

export const ROTULO_STATUS_CADASTRO = {
  pendente: 'Aguardando análise',
  aprovado: 'Aprovado',
  rejeitado: 'Rejeitado',
};

export function statusCadastroTom(status) {
  if (status === 'pendente') return 'nova';
  if (status === 'rejeitado') return 'rejeitada';
  return 'aprovada';
}

/**
 * Requisitos do ciclo com a declaração do candidato (foto do envio). Registros
 * antigos, sem a foto, mostram a declaração única de pré-requisitos (legado).
 */
export function RequisitosDeclarados({ requisitos, respondidos = true, legado, periodo }) {
  return (
    <>
      <ul className="check-list">
        <li><Icon name={periodo > 1 ? 'check' : 'alert'} size={14} /> {periodo ? `Está no ${periodo}º período` : 'Período não informado'} (mínimo: 2º).</li>
        {(requisitos || []).map((r) => (
          <li key={r.id} className={respondidos && !r.cumpre ? 'nao-cumpre' : undefined}>
            <Icon name={!respondidos ? 'info' : r.cumpre ? 'check' : 'close'} size={14} />{' '}
            {r.descricao}{r.obrigatorio ? '' : ' (desejável)'}
            {respondidos ? (r.cumpre ? ' — declarou que cumpre' : ' — declarou que NÃO cumpre') : ''}
          </li>
        ))}
      </ul>
      {!respondidos && (
        <p className={legado ? 'detail-muted small' : 'detail-warn'}>
          <Icon name={legado ? 'info' : 'alert'} size={15} /> Candidatura anterior aos requisitos por ciclo: {legado ? 'o candidato declarou cumprir os pré-requisitos da época.' : 'o candidato não declarou os pré-requisitos.'}
        </p>
      )}
      {respondidos && !requisitos?.length && <p className="detail-muted small">O ciclo não exigia disciplinas.</p>}
      <p className="detail-muted small">Declaração do próprio aluno; não há verificação automática do histórico acadêmico.</p>
    </>
  );
}

export function Avatar({ pessoa, tamanho = 'sm' }) {
  return (
    <span className={`coord-avatar ${tamanho}`} aria-hidden="true">
      {pessoa?.fotoUrl ? <img src={pessoa.fotoUrl} alt="" /> : pessoa?.iniciais}
    </span>
  );
}

/**
 * Select de padrinhos aprovados + botão para criar o vínculo
 * (POST /coordenacao/vinculos). `padrinhos` pode vir pronto do pai.
 */
export function DefinirPadrinho({ apadrinhado, programa, padrinhos: padrinhosProp, onVinculado }) {
  const [padrinhos, setPadrinhos] = useState(padrinhosProp || null);
  const [escolhido, setEscolhido] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState('');
  const id = useId();

  useEffect(() => {
    if (padrinhosProp) {
      setPadrinhos(padrinhosProp);
      return undefined;
    }
    let ativo = true;
    api.usuarios(programa || undefined, 'padrinho')
      .then((lista) => { if (ativo) setPadrinhos(lista); })
      .catch((error) => { if (ativo) { setPadrinhos([]); setErro(error.message); } });
    return () => { ativo = false; };
  }, [programa, padrinhosProp]);

  async function vincular() {
    if (!escolhido) {
      setErro('Selecione um padrinho.');
      return;
    }
    setEnviando(true);
    setErro('');
    try {
      const resultado = await api.vincular(apadrinhado.id, Number(escolhido));
      onVinculado?.(resultado);
    } catch (error) {
      setErro(error.message || 'Não foi possível definir o padrinho.');
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="define-match">
      <label htmlFor={id}>Definir padrinho para {apadrinhado.nome}</label>
      <div className="define-match-row">
        <select id={id} value={escolhido} onChange={(e) => { setEscolhido(e.target.value); setErro(''); }} disabled={!padrinhos || enviando}>
          <option value="">{padrinhos ? (padrinhos.length ? 'Selecione um padrinho' : 'Nenhum padrinho aprovado') : 'Carregando padrinhos…'}</option>
          {(padrinhos || []).map((p) => (
            <option key={p.id} value={p.id}>
              {p.nome} · {p.curso}{p.grupo ? ` · ${p.grupo} (${p.apadrinhados} apadrinhado(s))` : ' · sem grupo'}
            </option>
          ))}
        </select>
        <button type="button" className="primary-button inline" onClick={vincular} disabled={enviando || !padrinhos?.length}>
          <Icon name="link" size={16} /> {enviando ? 'Vinculando…' : 'Definir padrinho'}
        </button>
      </div>
      {erro && <p className="form-error" role="alert">{erro}</p>}
    </div>
  );
}
