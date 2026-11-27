export default function DiagnosticoMatching({ dados }) {
  if (!dados?.criterios?.length) return null;
  return (
    <section
      className="matching-config-card matching-diagnostic"
      aria-label="Dados antes da execução"
    >
      <div>
        <h2>Dados antes da execução</h2>
        <p>
          Confira os dados dos participantes elegíveis. Ausência de resposta não
          significa incompatibilidade.
        </p>
        <div className="matching-data-list">
          {dados.criterios.map((c) => (
            <article className="matching-data-item" key={c.chave}>
              <strong>{c.nome}</strong>
              <span className="matching-data-type">{c.obrigatorio ? 'Condição obrigatória' : 'Preferência ponderada'}</span>
              {[['Padrinhos', c.padrinhos], ['Apadrinhados', c.apadrinhados]].map(([rotulo, grupo]) => (
                <div className="matching-data-coverage" key={rotulo}>
                  <div><span>{rotulo} com dados</span><strong>{grupo.conhecidos}/{grupo.total}</strong></div>
                  <meter min="0" max={grupo.total || 1} value={grupo.conhecidos} aria-label={`${rotulo} com dados de ${c.nome}`} />
                </div>
              ))}
            </article>
          ))}
        </div>
        {dados.pendencias?.length ? (
          <details className="matching-data-pending">
            <summary>
              {dados.pendencias.length} participante(s) com dados pendentes
            </summary>
            <ul>
              {dados.pendencias.map((p) => (
                <li key={p.participacaoId}>
                  <strong>{p.nome}</strong> ({p.papel}): {p.campos.join(", ")}.
                  {p.obrigatorio && " Há condição obrigatória pendente."}
                </li>
              ))}
            </ul>
          </details>
        ) : (
          <p>
            Os dados dos critérios configurados estão disponíveis para os
            participantes elegíveis.
          </p>
        )}
      </div>
    </section>
  );
}
