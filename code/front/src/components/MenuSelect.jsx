import { useEffect, useId, useRef, useState } from 'react';
import Icon from './Icon';

/**
 * Select com lista estilizada (mesmo padrão do seletor de ciclo).
 * options: string[] | { value: string, label: string, hint?: string }[]
 */
export default function MenuSelect({
  label,
  icon,
  value = '',
  options = [],
  placeholder = 'Selecione',
  onChange,
  required = false,
  disabled = false,
  className = '',
  'aria-label': ariaLabel,
}) {
  const id = useId();
  const wrapRef = useRef(null);
  const btnRef = useRef(null);
  const [aberto, setAberto] = useState(false);

  const itens = options.map((opt) => (
    typeof opt === 'string' ? { value: opt, label: opt } : opt
  ));
  const atual = itens.find((item) => item.value === value);

  useEffect(() => {
    if (!aberto) return undefined;
    function fora(e) {
      if (!wrapRef.current?.contains(e.target)) setAberto(false);
    }
    function tecla(e) {
      if (e.key === 'Escape') {
        setAberto(false);
        btnRef.current?.focus();
      }
    }
    document.addEventListener('mousedown', fora);
    document.addEventListener('keydown', tecla);
    return () => {
      document.removeEventListener('mousedown', fora);
      document.removeEventListener('keydown', tecla);
    };
  }, [aberto]);

  function escolher(item) {
    onChange?.(item.value);
    setAberto(false);
    btnRef.current?.focus();
  }

  return (
    <div className={`field-wrap menu-select-wrap ${className}`.trim()}>
      {label && <span className="field-label" id={`${id}-label`}>{label}</span>}
      <div className="menu-select program-select" ref={wrapRef}>
        <button
          ref={btnRef}
          type="button"
          id={id}
          className={`program-select-btn menu-select-btn${aberto ? ' open' : ''}${!atual ? ' placeholder' : ''}`}
          aria-haspopup="listbox"
          aria-expanded={aberto}
          aria-controls={`${id}-lista`}
          aria-labelledby={label ? `${id}-label` : undefined}
          aria-label={ariaLabel || label}
          disabled={disabled}
          onClick={() => setAberto((v) => !v)}
        >
          {icon && <Icon name={icon} size={17} />}
          <span className="program-select-label">
            <strong>{atual?.label || placeholder}</strong>
          </span>
          <Icon name="chevronDown" size={16} className={`select-chevron${aberto ? ' open' : ''}`} />
        </button>
        {aberto && (
          <ul
            id={`${id}-lista`}
            className="program-select-list menu-select-list"
            role="listbox"
            aria-label={ariaLabel || label || placeholder}
          >
            {itens.map((item) => (
              <li key={item.value} role="presentation">
                <button
                  type="button"
                  role="option"
                  aria-selected={item.value === value}
                  className={item.value === value ? 'selected' : ''}
                  onClick={() => escolher(item)}
                >
                  <span className="program-option-main">
                    <strong>{item.label}</strong>
                    {item.hint && <span>{item.hint}</span>}
                  </span>
                  {item.value === value && <Icon name="check" size={16} />}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      {required && (
        <input
          tabIndex={-1}
          className="sr-only"
          value={value}
          required
          onChange={() => {}}
          aria-hidden="true"
        />
      )}
    </div>
  );
}
