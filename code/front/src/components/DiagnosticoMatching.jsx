export default function DiagnosticoMatching({ dados }) {
  if (!dados?.criterios?.length) return null;
  return (
    <section
      className="matching-config-card"
      aria-label="Dados antes da execução"
    >
      <div>
        <h2>Dados antes da execução</h2>
        <p>
          Confira os dados dos participantes elegíveis. Ausência de resposta não
          significa incompatibilidade.
        </p>
        <ul>
          {dados.criterios.map((c) => (
            <li key={c.chave}>
              <strong>{c.nome}</strong>
              {c.obrigatorio
                ? " — Condição obrigatória"
                : " — Preferência ponderada"}
              . Padrinhos com dados: {c.padrinhos.conhecidos}/
              {c.padrinhos.total}; apadrinhados com dados:{" "}
              {c.apadrinhados.conhecidos}/{c.apadrinhados.total}.
            </li>
          ))}
        </ul>
        {dados.pendencias?.length ? (
          <details>
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
