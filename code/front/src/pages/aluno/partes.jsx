import Icon from '../../components/Icon';

export function PageHeader({ titulo, subtitulo, children }) {
  return (
    <header className="aluno-page-header">
      <div>
        <h1>{titulo}</h1>
        {subtitulo && <p>{subtitulo}</p>}
      </div>
      {children && <div className="aluno-page-tools">{children}</div>}
    </header>
  );
}

export function EstadoCarregando({ texto = 'Carregando…' }) {
  return (
    <div className="aluno-state" role="status">
      <div className="coord-spinner" aria-hidden="true" />
      <p>{texto}</p>
    </div>
  );
}

export function EstadoErro({ mensagem, onTentar }) {
  return (
    <div className="aluno-state error" role="alert">
      <Icon name="alert" size={26} />
      <p>{mensagem}</p>
      {onTentar && <button type="button" className="ghost-button" onClick={onTentar}>Tentar novamente</button>}
    </div>
  );
}

export function EstadoVazio({ icon = 'info', titulo, texto, children }) {
  return (
    <div className="aluno-empty">
      <span className="aluno-empty-icon" aria-hidden="true"><Icon name={icon} size={28} /></span>
      <h2>{titulo}</h2>
      {texto && <p>{texto}</p>}
      {children && <div className="aluno-empty-actions">{children}</div>}
    </div>
  );
}
