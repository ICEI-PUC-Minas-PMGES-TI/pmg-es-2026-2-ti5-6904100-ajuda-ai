import { useId } from 'react';

/** Interruptor acessível (role="switch"). */
export default function Toggle({ checked, onChange, label, descricao, disabled = false, className = '' }) {
  const id = useId();
  return (
    <div className={`toggle-row ${className}`}>
      <span className="toggle-copy">
        <label htmlFor={id}>{label}</label>
        {descricao && <span>{descricao}</span>}
      </span>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={Boolean(checked)}
        disabled={disabled}
        className={`toggle-switch${checked ? ' on' : ''}`}
        onClick={() => onChange(!checked)}
      >
        <span className="toggle-knob" aria-hidden="true" />
      </button>
    </div>
  );
}
