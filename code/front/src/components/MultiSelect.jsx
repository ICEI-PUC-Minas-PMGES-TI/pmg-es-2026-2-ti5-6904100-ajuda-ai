import { useEffect, useId, useRef, useState } from 'react';
import Icon from './Icon';

/**
 * Seleção múltipla em formato de campo: abre uma lista de caixas de seleção.
 * `valores` é string[]; `onChange` recebe o novo array.
 */
export default function MultiSelect({ id, opcoes, valores, onChange, placeholder, icon, erro, ariaLabelledby }) {
  const [aberto, setAberto] = useState(false);
  const listaId = useId();
  const wrapRef = useRef(null);
  const botaoRef = useRef(null);

  useEffect(() => {
    if (!aberto) return undefined;
    function onClickFora(event) {
      if (!wrapRef.current?.contains(event.target)) setAberto(false);
    }
    function onKey(event) {
      if (event.key === 'Escape') {
        setAberto(false);
        botaoRef.current?.focus();
      }
    }
    document.addEventListener('mousedown', onClickFora);
    document.addEventListener('keydown', onKey);
    wrapRef.current?.querySelector('.multi-list input')?.focus();
    return () => {
      document.removeEventListener('mousedown', onClickFora);
      document.removeEventListener('keydown', onKey);
    };
  }, [aberto]);

  function alternar(opcao) {
    onChange(valores.includes(opcao) ? valores.filter((v) => v !== opcao) : [...valores, opcao]);
  }

  const resumo = valores.length === 0 ? placeholder : valores.join(', ');

  return (
    <div className="multi-select" ref={wrapRef}>
      <button
        id={id}
        ref={botaoRef}
        type="button"
        className={`field multi-trigger${erro ? ' field-error' : ''}${valores.length ? ' has-value' : ''}`}
        aria-haspopup="true"
        aria-expanded={aberto}
        aria-controls={listaId}
        aria-labelledby={ariaLabelledby ? `${ariaLabelledby} ${id}` : undefined}
        onClick={() => setAberto((v) => !v)}
      >
        {icon && <Icon name={icon} size={17} />}
        <span className="multi-summary">{resumo}</span>
        <Icon name="chevronDown" size={16} className={`multi-chevron${aberto ? ' open' : ''}`} />
      </button>
      {aberto && (
        <div id={listaId} className="multi-list" role="group" aria-label={placeholder}>
          {opcoes.map((opcao) => (
            <label key={opcao} className="multi-option">
              <input type="checkbox" checked={valores.includes(opcao)} onChange={() => alternar(opcao)} />
              <span>{opcao}</span>
            </label>
          ))}
          <button type="button" className="multi-done" onClick={() => { setAberto(false); botaoRef.current?.focus(); }}>
            Concluir
          </button>
        </div>
      )}
    </div>
  );
}
