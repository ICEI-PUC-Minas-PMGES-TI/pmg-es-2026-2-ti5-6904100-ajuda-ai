import { useState } from 'react';
import { api } from '../../api/client';
import Icon from '../../components/Icon';
import Modal from '../../components/Modal';
import { Avatar } from './comum';

const ROTULO_PAPEL = { candidato: 'Candidato a padrinho', padrinho: 'Padrinho', apadrinhado: 'Apadrinhado' };

/**
 * Vínculos ativos da participação (matching F11/F12 ou grupo legado). Uma
 * aprovação já usada só pode ser revogada depois de encerrar os vínculos.
 */
export default function VinculosAtivos({ detalhe, onAlterado }) {
  const [confirmando, setConfirmando] = useState(null);
  const [processando, setProcessando] = useState(false);
  const [erro, setErro] = useState('');
  const vinculos = detalhe?.vinculos || [];
  if (!vinculos.length) return null;

  async function encerrar(vinculo) {
    setProcessando(true);
    setErro('');
    try {
      if (vinculo.vinculoId) {
        const atualizado = await api.encerrarVinculo(detalhe.id, vinculo.vinculoId);
        onAlterado?.(atualizado, `Vínculo com ${vinculo.nome} encerrado.`);
      } else {
        // Grupo legado: o vínculo é desfeito pelo lado do apadrinhado.
        await api.desvincularCandidatura(detalhe.papel === 'apadrinhado' ? detalhe.id : vinculo.participacaoId);
        onAlterado?.(null, `Vínculo com ${vinculo.nome} desfeito.`);
      }
    } catch (error) {
      setErro(error.message || 'Não foi possível encerrar o vínculo.');
    } finally {
      setProcessando(false);
      setConfirmando(null);
    }
  }

  return (
    <section className="detail-block">
      <h3><Icon name="link" size={17} /> Vínculos ativos <span className="detail-note">{vinculos.length}</span></h3>
      <ul className="vinculos-lista">
        {vinculos.map((v) => (
          <li key={`${v.vinculoId ?? 'grupo'}-${v.participacaoId}`}>
            <Avatar pessoa={v} tamanho="sm" />
            <span className="vinculo-copy">
              <strong>{v.nome}</strong>
              <small>{ROTULO_PAPEL[v.papel] || v.papel} · {v.origem === 'matching' ? 'Matching' : `Grupo ${v.grupo}`}</small>
            </span>
            <button type="button" className="mini-btn danger" disabled={processando} onClick={() => setConfirmando(v)}>
              <Icon name="close" size={14} /> Encerrar
            </button>
          </li>
        ))}
      </ul>
      <p className="detail-muted small">Para revogar a aprovação, encerre antes os vínculos ativos.</p>
      {erro && <p className="form-error" role="alert"><Icon name="alert" size={15} /> {erro}</p>}

      {confirmando && (
        <Modal
          titulo="Encerrar vínculo?"
          descricao={`O vínculo entre ${detalhe.nome} e ${confirmando.nome} será encerrado. O histórico do matching é mantido.`}
          onFechar={() => !processando && setConfirmando(null)}
          acoes={(
            <>
              <button type="button" className="ghost-button" onClick={() => setConfirmando(null)} disabled={processando} data-autofocus>Cancelar</button>
              <button type="button" className="danger-button" onClick={() => encerrar(confirmando)} disabled={processando}>
                {processando ? 'Encerrando…' : 'Encerrar vínculo'}
              </button>
            </>
          )}
        />
      )}
    </section>
  );
}
