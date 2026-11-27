export default function RelatorioMatching({ relatorio }) {
  if (!relatorio) return null;
  return (
    <section className="matching-config-card" aria-label="Relatório da rodada">
      <div>
        <h2>Relatório da rodada</h2>
        <p>
          {relatorio.novosAtendidos} aluno(s) sem vínculo receberam sugestão.{" "}
          {relatorio.semSugestao?.length || 0} continuam sem sugestão.
        </p>
        <p>
          Política {relatorio.politica?.versao}: primeiro atendimento e
          qualidade; equilíbrio entre soluções de mesma qualidade.
        </p>
        {relatorio.paresRecusadosNoCiclo > 0 && (
          <p>
            {relatorio.paresRecusadosNoCiclo} par(es) recusado(s) permanecem
            fora das sugestões do ciclo.
          </p>
        )}
        <h3>Ocupação dos padrinhos</h3>
        {(relatorio.cargaPadrinhos || []).some((p) => p.confirmados === 0) && (
          <p>
            Padrinhos sem apadrinhados confirmados:{" "}
            {(relatorio.cargaPadrinhos || [])
              .filter((p) => p.confirmados === 0)
              .map((p) => `${p.nome} (${p.sugeridos} sugestão/ões)`)
              .join("; ")}
            .
          </p>
        )}
        <table>
          <thead>
            <tr>
              <th>Padrinho</th>
              <th>Confirmados</th>
              <th>Sugestões</th>
              <th>Total projetado</th>
            </tr>
          </thead>
          <tbody>
            {(relatorio.cargaPadrinhos || []).map((p) => (
              <tr key={p.participacaoId}>
                <td>{p.nome}</td>
                <td>{p.confirmados}</td>
                <td>{p.sugeridos}</td>
                <td>
                  {p.totalProjetado}/{p.limite}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {relatorio.semSugestao?.length > 0 && (
          <>
            <h3>Alunos ainda sem sugestão</h3>
            <ul>
              {relatorio.semSugestao.map((a) => (
                <li key={a.participacaoId}>
                  <strong>{a.nome}</strong>: {a.descricao}
                  {a.pendencias?.length > 0 && (
                    <span> Dados pendentes: {a.pendencias.join(", ")}.</span>
                  )}
                </li>
              ))}
            </ul>
          </>
        )}
        <p>As sugestões ainda dependem da confirmação da coordenação.</p>
      </div>
    </section>
  );
}
