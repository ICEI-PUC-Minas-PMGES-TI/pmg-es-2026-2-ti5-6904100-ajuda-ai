import { useEffect, useRef, useState } from "react";
import { api } from "../api/client";
import Modal from "./Modal";
import { useToast } from "./Toast";

function data(valor) {
  return valor
    ? new Date(valor).toLocaleString("pt-BR")
    : "Data não registrada";
}
export function HistoricoParMatching({ eventos = [] }) {
  if (!eventos.length) return null;
  return (
    <details>
      <summary>Histórico das decisões do par</summary>
      <ul>
        {eventos.map((e) => (
          <li key={e.id}>
            <strong>
              {e.acao === "reconsiderado" ? "Reconsiderado" : "Recusado"}
            </strong>{" "}
            por {e.responsavel}, {data(e.decididaEm)}.{" "}
            {e.motivo || "Sem motivo informado."}
          </li>
        ))}
      </ul>
    </details>
  );
}
export function ValidadeSugestaoMatching({ dados }) {
  if (
    dados?.status !== "obsoleta" &&
    !(dados?.status === "pendente" && dados?.podeAprovar === false)
  )
    return null;
  const mensagens =
    dados.validade?.mensagens || dados.explicacao?.validade?.mensagens || [];
  return (
    <div className="dash-inline-error" role="status">
      <strong>Sugestão desatualizada.</strong>{" "}
      {mensagens.length
        ? mensagens.join(" ")
        : "Gere uma nova rodada antes de decidir este par."}
    </div>
  );
}

export default function ParesRecusadosMatching({
  programa,
  atualizacao,
  onReconsiderado,
}) {
  const [pares, setPares] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState("");
  const [selecionado, setSelecionado] = useState(null);
  const [justificativa, setJustificativa] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [tentativa, setTentativa] = useState(0);
  const trava = useRef(false);
  const toast = useToast();
  const contextoAtual = useRef(null);
  useEffect(() => {
    const contexto = { programa, ativo: true };
    contextoAtual.current = contexto;
    return () => {
      contexto.ativo = false;
    };
  }, [programa]);
  useEffect(() => {
    let ativo = true;
    setPares([]);
    setErro("");
    setCarregando(true);
    setSelecionado(null);
    if (!programa) {
      setCarregando(false);
      return;
    }
    api
      .paresRecusadosMatching(programa)
      .then((lista) => {
        if (ativo) setPares(lista);
      })
      .catch((e) => {
        if (ativo) setErro(e.message);
      })
      .finally(() => {
        if (ativo) setCarregando(false);
      });
    return () => {
      ativo = false;
    };
  }, [programa, atualizacao, tentativa]);
  async function reconsiderar(event) {
    event.preventDefault();
    if (trava.current || !selecionado || !justificativa.trim()) return;
    const contexto = contextoAtual.current;
    trava.current = true;
    setSalvando(true);
    setErro("");
    try {
      await api.reconsiderarParMatching(selecionado.id, justificativa.trim());
      if (!contexto?.ativo) return;
      setSelecionado(null);
      setPares((lista) => lista.filter((p) => p.id !== selecionado.id));
      toast(
        "Par reconsiderado. Gere uma nova rodada para obter novas sugestões.",
        "sucesso",
      );
      onReconsiderado?.();
    } catch (e) {
      if (contexto?.ativo)
        setErro(e.message || "Não foi possível reconsiderar o par.");
    } finally {
      trava.current = false;
      if (contextoAtual.current?.ativo) setSalvando(false);
    }
  }
  return (
    <section
      className="matching-config-card"
      aria-label="Pares recusados no ciclo"
    >
      <div>
        <h2>Pares recusados no ciclo</h2>
        <p>
          Estes pares ficam fora das novas rodadas até a coordenação
          reconsiderar. As candidaturas continuam disponíveis para outras
          combinações.
        </p>
        {carregando && <p role="status">Carregando pares recusados…</p>}
        {erro && !selecionado && (
          <p role="alert">
            {erro}{" "}
            <button type="button" onClick={() => setTentativa((v) => v + 1)}>
              Tentar novamente
            </button>
          </p>
        )}
        {!carregando && !erro && !pares.length && (
          <p>Nenhum par recusado está impedido neste ciclo.</p>
        )}
        {pares.map((p) => (
          <article key={p.id}>
            <h3>
              {p.padrinho?.nome} e {p.apadrinhado?.nome}
            </h3>
            <p>
              Recusado por {p.responsavel}, {data(p.decididaEm)}.{" "}
              {p.motivo || "Sem motivo informado."}
            </p>
            <HistoricoParMatching eventos={p.historico} />
            <button
              type="button"
              className="mini-btn"
              disabled={!p.podeReconsiderar}
              onClick={() => {
                setSelecionado(p);
                setJustificativa("");
                setErro("");
              }}
            >
              Reconsiderar par
            </button>
          </article>
        ))}
        {selecionado && (
          <Modal
            titulo="Reconsiderar este par?"
            descricao="A decisão anterior será preservada. O par poderá aparecer em uma nova rodada; nenhum vínculo será aprovado automaticamente."
            onFechar={() => {
              if (!salvando) setSelecionado(null);
            }}
          >
            <form onSubmit={reconsiderar}>
              <label>
                Justificativa da reconsideração
                <textarea
                  required
                  maxLength={1000}
                  rows={3}
                  value={justificativa}
                  onChange={(e) => setJustificativa(e.target.value)}
                />
              </label>
              {erro && <p role="alert">{erro}</p>}
              <div className="modal-actions">
                <button
                  type="button"
                  disabled={salvando}
                  onClick={() => setSelecionado(null)}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="primary-button inline"
                  disabled={salvando || !justificativa.trim()}
                >
                  {salvando ? "Registrando…" : "Confirmar reconsideração"}
                </button>
              </div>
            </form>
          </Modal>
        )}
      </div>
    </section>
  );
}
