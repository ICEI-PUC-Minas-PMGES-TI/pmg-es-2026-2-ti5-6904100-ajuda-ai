import { useEffect, useRef, useState } from "react";
import { api } from "../api/client";
import Modal from "./Modal";

const percentual = (valor) =>
  typeof valor === "number"
    ? `${(valor * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`
    : "Não disponível";

export function CompatibilidadeDestino({ destino }) {
  const c = destino.compatibilidade || {};
  return (
    <p>
      {destino.vagas} vaga(s) de {destino.capacidade}. Aderência:{" "}
      {percentual(c.aderencia ?? c.score)}. Cobertura: {percentual(c.cobertura)}
      .{destino.bloqueio && ` ${destino.bloqueio}`}
    </p>
  );
}

function TransferirPar({ pessoa, programa, onFechar, onConcluido }) {
  const [destinos, setDestinos] = useState(null);
  const [destinoId, setDestinoId] = useState("");
  const [motivo, setMotivo] = useState("");
  const [erro, setErro] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [tentou, setTentou] = useState(false);
  const intencao = useRef(null);
  const enviando = useRef(false);
  const ativo = useRef(true);
  useEffect(() => {
    ativo.current = true;
    api
      .destinosMatching(pessoa.id, pessoa.vinculoId)
      .then((r) => {
        if (ativo.current && r.programa === programa)
          setDestinos(r.destinos || []);
      })
      .catch((e) => {
        if (ativo.current) setErro(e.message);
      });
    return () => {
      ativo.current = false;
    };
  }, [pessoa.id, pessoa.vinculoId, programa]);
  const escolhido = destinos?.find((d) => d.padrinhoId === Number(destinoId));
  async function confirmar(e) {
    e.preventDefault();
    if (!escolhido?.permitido || !motivo.trim() || enviando.current) return;
    intencao.current ??= {
      padrinhoDestinoId: escolhido.padrinhoId,
      motivo: motivo.trim(),
      operacaoId: crypto.randomUUID(),
    };
    enviando.current = true;
    setSalvando(true);
    setTentou(true);
    setErro("");
    try {
      await api.transferirVinculoMatching(pessoa.vinculoId, intencao.current);
      if (ativo.current) onConcluido();
    } catch (error) {
      if (ativo.current)
        setErro(
          error.message ||
            "Não foi possível confirmar o resultado. Tente novamente ou atualize os grupos.",
        );
    } finally {
      enviando.current = false;
      if (ativo.current) setSalvando(false);
    }
  }
  return (
    <Modal
      titulo={`Transferir ${pessoa.nome}`}
      descricao={`Programa ${programa}. A origem será encerrada somente se o destino puder ser confirmado.`}
      onFechar={() => {
        if (!enviando.current) onFechar();
      }}
    >
      <form onSubmit={confirmar}>
        {!destinos && !erro && (
          <p role="status">Consultando vagas e compatibilidade.</p>
        )}
        {destinos && (
          <>
            <label>
              Padrinho destino
              <select
                value={destinoId}
                disabled={tentou}
                onChange={(e) => setDestinoId(e.target.value)}
                required
              >
                <option value="">Selecione um destino</option>
                {destinos.map((d) => (
                  <option
                    key={d.padrinhoId}
                    value={d.padrinhoId}
                    disabled={!d.permitido}
                  >
                    {d.nome} — {d.vagas} vaga(s)
                    {d.bloqueio ? ` — ${d.bloqueio}` : ""}
                  </option>
                ))}
              </select>
            </label>
            {escolhido && <CompatibilidadeDestino destino={escolhido} />}
            {!destinos.some((d) => d.permitido) && (
              <p>Nenhum destino disponível atende às regras atuais.</p>
            )}
            <label>
              Motivo da transferência
              <textarea
                value={motivo}
                onChange={(e) => setMotivo(e.target.value)}
                disabled={tentou}
                maxLength={1000}
                rows={3}
                required
              />
            </label>
          </>
        )}
        {erro && <p role="alert">{erro}</p>}
        {tentou && erro && (
          <p>
            Uma nova tentativa repete a mesma operação. Para escolher outro
            destino, atualize os grupos primeiro.
          </p>
        )}
        <div className="modal-actions">
          <button type="button" disabled={salvando} onClick={onFechar}>
            {tentou ? "Atualizar grupos" : "Cancelar"}
          </button>
          <button
            type="submit"
            className="primary-button inline"
            disabled={salvando || !escolhido?.permitido || !motivo.trim()}
          >
            {salvando
              ? "Transferindo…"
              : tentou
                ? "Tentar mesma transferência"
                : "Confirmar transferência"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

export function ListaGruposMatching({ dados, onTransferir }) {
  return (
    <>
      {!dados.grupos?.length && (
        <p>Nenhum grupo canônico formado neste ciclo.</p>
      )}
      {(dados.inconsistencias || []).map((i, n) => (
        <p role="alert" key={`${i.participacaoId}-${n}`}>
          {i.nome}: {i.motivo}
        </p>
      ))}
      {(dados.grupos || []).map((g) => (
        <article key={g.id} className="matching-person">
          <h3>
            {g.nome} · {g.padrinho.nome}
          </h3>
          <p>{g.ocupacao} apadrinhado(s).</p>
          {!g.apadrinhados.length && <p>Aguardando novos vínculos.</p>}
          {g.apadrinhados.map((a) => (
            <div key={a.vinculoId} className="matching-person-head">
              <span>{a.nome}</span>
              <button
                type="button"
                className="mini-btn"
                disabled={!dados.podeMovimentar}
                onClick={() => onTransferir(a)}
              >
                Transferir {a.nome}
              </button>
            </div>
          ))}
        </article>
      ))}
      {!!dados.historico?.length && (
        <details>
          <summary>Histórico de movimentações</summary>
          <ul>
            {dados.historico.map((e) => (
              <li key={e.id}>
                {e.acao === "transferido"
                  ? "Transferência"
                  : e.acao === "criado"
                    ? "Criação de vínculo"
                    : "Encerramento"}{" "}
                · {e.responsavel} ·{" "}
                {e.criadoEm ? new Date(e.criadoEm).toLocaleString("pt-BR") : ""}
                {e.motivo ? ` · ${e.motivo}` : ""} · vínculos{" "}
                {e.vinculoOrigemId || "—"} → {e.vinculoDestinoId || "—"}
              </li>
            ))}
          </ul>
        </details>
      )}
    </>
  );
}

export default function GruposMatching(props) {
  return <GruposDoPrograma key={props.programa} {...props} />;
}

function GruposDoPrograma({ programa, atualizacao, onAlterado }) {
  const [dados, setDados] = useState(null);
  const [erro, setErro] = useState("");
  const [revisao, setRevisao] = useState(0);
  const [selecionada, setSelecionada] = useState(null);
  const [mensagem, setMensagem] = useState("");
  useEffect(() => {
    let atual = true;
    setErro("");
    api
      .gruposMatching(programa)
      .then((r) => {
        if (atual) setDados(r);
      })
      .catch((e) => {
        if (atual) setErro(e.message);
      });
    return () => {
      atual = false;
    };
  }, [programa, atualizacao, revisao]);
  function atualizar() {
    setSelecionada(null);
    setRevisao((v) => v + 1);
  }
  return (
    <section className="matching-results">
      <div className="matching-results-head">
        <div>
          <h2>Grupos e transferências</h2>
          <p>
            Escolha o vínculo a movimentar. O destino será revalidado na
            confirmação.
          </p>
        </div>
        <button type="button" className="mini-btn" onClick={atualizar}>
          Atualizar grupos
        </button>
      </div>
      {erro && <p role="alert">{erro}</p>}
      {mensagem && <p role="status">{mensagem}</p>}
      {!dados && !erro && <p role="status">Carregando grupos.</p>}
      {dados && (
        <ListaGruposMatching dados={dados} onTransferir={setSelecionada} />
      )}
      {selecionada && (
        <TransferirPar
          pessoa={selecionada}
          programa={programa}
          onFechar={atualizar}
          onConcluido={() => {
            atualizar();
            setMensagem(
              "Transferência confirmada. Os grupos foram atualizados.",
            );
            onAlterado?.();
          }}
        />
      )}
    </section>
  );
}
