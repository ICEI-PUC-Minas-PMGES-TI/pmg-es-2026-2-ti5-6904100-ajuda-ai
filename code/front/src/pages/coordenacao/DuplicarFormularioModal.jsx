import { useId, useState } from 'react';
import { api } from '../../api/client';
import Modal from '../../components/Modal';

/** Escolhe o programa de destino e duplica o formulário salvo como novo rascunho. */
export default function DuplicarFormularioModal({ tipo, origem, programas, onFechar, onDuplicado }) {
  const seletorId = useId();
  const destinos = programas.filter((p) => p.codigo !== origem);
  const [destino, setDestino] = useState(destinos[0]?.codigo ?? '');
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState('');

  async function duplicar() {
    setEnviando(true);
    setErro('');
    try {
      onDuplicado(await api.duplicarFormulario(tipo, { programaOrigem: origem, programaDestino: destino }));
    } catch (error) {
      setErro(error.message || 'Não foi possível duplicar o formulário.');
      setEnviando(false);
    }
  }

  return (
    <Modal
      titulo="Duplicar para outro programa"
      descricao={`As perguntas salvas do programa ${origem} serão copiadas como rascunho. O programa de destino não pode ter formulário salvo.`}
      onFechar={onFechar}
      acoes={(
        <>
          <button type="button" className="ghost-button" onClick={onFechar}>Cancelar</button>
          <button type="button" className="primary-button" onClick={duplicar} disabled={!destino || enviando}>{enviando ? 'Duplicando…' : 'Duplicar'}</button>
        </>
      )}
    >
      <label className="q-label" htmlFor={seletorId}>Programa de destino</label>
      <select id={seletorId} className="q-select" value={destino} onChange={(e) => setDestino(e.target.value)} data-autofocus>
        {destinos.map((p) => <option key={p.codigo} value={p.codigo}>{p.nome || `Programa ${p.codigo}`}{p.vigente ? ' (vigente)' : ''}</option>)}
      </select>
      {erro && <p className="form-error" role="alert">{erro}</p>}
    </Modal>
  );
}
