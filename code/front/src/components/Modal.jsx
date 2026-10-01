import { useEffect, useId, useRef } from 'react';
import Icon from './Icon';

const FOCAVEIS =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Diálogo modal acessível: foco inicial dentro do diálogo, Tab preso,
 * Esc fecha e o foco volta para o elemento que abriu.
 */
export default function Modal({ titulo, descricao, onFechar, children, acoes, tamanho = 'md', className = '' }) {
  const tituloId = useId();
  const descricaoId = useId();
  const painelRef = useRef(null);
  const fecharRef = useRef(onFechar);
  fecharRef.current = onFechar;

  useEffect(() => {
    const anterior = document.activeElement;
    const painel = painelRef.current;
    const primeiro = painel?.querySelector('[data-autofocus]') || painel?.querySelector(FOCAVEIS);
    (primeiro || painel)?.focus();

    function onKey(event) {
      if (event.key === 'Escape') {
        event.stopPropagation();
        fecharRef.current?.();
        return;
      }
      if (event.key !== 'Tab' || !painel) return;
      const itens = Array.from(painel.querySelectorAll(FOCAVEIS));
      if (itens.length === 0) return;
      const inicio = itens[0];
      const fim = itens[itens.length - 1];
      if (event.shiftKey && document.activeElement === inicio) {
        event.preventDefault();
        fim.focus();
      } else if (!event.shiftKey && document.activeElement === fim) {
        event.preventDefault();
        inicio.focus();
      }
    }
    document.addEventListener('keydown', onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = overflow;
      if (anterior && typeof anterior.focus === 'function') anterior.focus();
    };
  }, []);

  return (
    <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onFechar?.(); }}>
      <div
        ref={painelRef}
        className={`modal-card modal-${tamanho} ${className}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={tituloId}
        aria-describedby={descricao ? descricaoId : undefined}
        tabIndex={-1}
      >
        <div className="modal-head">
          <h2 id={tituloId}>{titulo}</h2>
          {onFechar && (
            <button type="button" className="modal-close" aria-label="Fechar" onClick={onFechar}>
              <Icon name="close" size={18} />
            </button>
          )}
        </div>
        {descricao && <p id={descricaoId} className="modal-desc">{descricao}</p>}
        <div className="modal-body">{children}</div>
        {acoes && <div className="modal-actions">{acoes}</div>}
      </div>
    </div>
  );
}
