import MultiSelect from "./MultiSelect";

export const GENEROS_PREFERENCIA = ["Feminino", "Masculino", "Não binário"];
export function textoPreferenciaGenero(valor) {
  if (!valor || !preferenciaGeneroValida(valor)) return "Não informado";
  return valor.modo === "sem_preferencia"
    ? "Sem preferência"
    : valor.generos.join(", ");
}
export function preferenciaGeneroValida(valor) {
  if (valor == null) return true;
  if (typeof valor !== "object" || !Array.isArray(valor.generos)) return false;
  if (valor.modo === "sem_preferencia") return valor.generos.length === 0;
  return (
    valor.modo === "preferencia" &&
    valor.generos.length > 0 &&
    new Set(valor.generos).size === valor.generos.length &&
    valor.generos.every((g) => GENEROS_PREFERENCIA.includes(g))
  );
}
export default function PreferenciaGenero({
  valor,
  onChange,
  erro,
  id = "preferencia-genero",
}) {
  return (
    <div className="field-wrap span-two">
      <label className="field-label" htmlFor={id}>
        Preferência de gênero para o par (opcional)
      </label>
      <select
        id={id}
        value={valor?.modo || ""}
        onChange={(e) =>
          onChange(
            e.target.value ? { modo: e.target.value, generos: [] } : undefined,
          )
        }
        aria-invalid={erro || undefined}
      >
        <option value="">Não informado</option>
        <option value="sem_preferencia">Sem preferência</option>
        <option value="preferencia">Tenho preferência</option>
      </select>
      {valor?.modo === "preferencia" && (
        <>
          <span id={`${id}-opcoes`}>Gêneros de preferência</span>
          <MultiSelect
            id={`${id}-lista`}
            ariaLabelledby={`${id}-opcoes`}
            opcoes={GENEROS_PREFERENCIA}
            valores={Array.isArray(valor.generos) ? valor.generos : []}
            onChange={(generos) => onChange({ ...valor, generos })}
            placeholder="Selecione um ou mais gêneros"
            erro={erro}
          />
        </>
      )}
      <p className="field-hint">
        Sua preferência ajuda na compatibilidade. Ela não impede a combinação
        com outras pessoas.
      </p>
      {erro && (
        <span className="error-message" role="alert">
          Selecione ao menos um gênero ou escolha sem preferência.
        </span>
      )}
    </div>
  );
}
