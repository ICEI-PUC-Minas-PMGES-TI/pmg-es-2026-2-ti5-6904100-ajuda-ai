/** SSE por fetch: Bearer no header, decoder incremental e cancelamento por tela. */
export function abrirFeedStream({ url, token, onEvento, onEstado = () => {} }) {
  const vida = new AbortController();
  const esperar = (ms) =>
    new Promise((resolve) => {
      const terminar = () => {
        clearTimeout(timer);
        vida.signal.removeEventListener("abort", terminar);
        resolve();
      };
      const timer = setTimeout(terminar, ms);
      vida.signal.addEventListener("abort", terminar, { once: true });
    });
  void (async () => {
    let atraso = 1000;
    while (!vida.signal.aborted) {
      const tentativa = new AbortController();
      let watchdog;
      let reader;
      const cancelar = () => {
        tentativa.abort();
        void reader?.cancel().catch(() => {});
      };
      vida.signal.addEventListener("abort", cancelar, { once: true });
      try {
        const jwt = token();
        if (!jwt) {
          onEstado("Sessão expirada. Entre novamente.");
          return;
        }
        const renovar = () => {
          clearTimeout(watchdog);
          watchdog = setTimeout(cancelar, 45000);
        };
        renovar();
        const resposta = await fetch(url, {
          headers: {
            Authorization: `Bearer ${jwt}`,
            Accept: "text/event-stream",
          },
          signal: tentativa.signal,
        });
        if ([401, 403].includes(resposta.status)) {
          onEstado("Sessão expirada ou sem acesso. Entre novamente.");
          return;
        }
        if (
          !resposta.ok ||
          !resposta.headers
            .get("content-type")
            ?.includes("text/event-stream") ||
          !resposta.body
        )
          throw new Error("Stream indisponível");
        const parser = criarParserSse((evento) => {
          if (vida.signal.aborted) return;
          if (evento.type === "feed.ready" || evento.type === "feed.heartbeat")
            onEstado(
              evento.data?.conectado
                ? "Atualizações ao vivo"
                : "Aguardando conexão do servidor ao tempo real",
            );
          onEvento(evento);
        });
        reader = resposta.body.getReader();
        const decoder = new TextDecoder();
        atraso = 1000;
        while (!vida.signal.aborted) {
          const { value, done } = await reader.read();
          if (done) break;
          renovar();
          parser(decoder.decode(value, { stream: true }));
        }
      } catch {
        /* Reconexão cobre perda de rede e stream sem heartbeat. */
      } finally {
        clearTimeout(watchdog);
        tentativa.abort();
        await reader?.cancel().catch(() => {});
        vida.signal.removeEventListener("abort", cancelar);
      }
      if (vida.signal.aborted) return;
      onEstado("Reconectando às atualizações ao vivo…");
      await esperar(atraso);
      atraso = Math.min(atraso * 2, 15000);
    }
  })();
  return () => vida.abort();
}

export function criarParserSse(onEvento) {
  let buffer = "";
  return (trecho) => {
    buffer += trecho;
    if (buffer.length > 1024 * 1024)
      throw new Error("Evento excede o tamanho permitido.");
    let fim;
    while ((fim = /\r?\n\r?\n/.exec(buffer))) {
      const bloco = buffer.slice(0, fim.index);
      buffer = buffer.slice(fim.index + fim[0].length);
      let type = "message";
      let id;
      const dados = [];
      for (const linha of bloco.split(/\r?\n/)) {
        if (linha.startsWith("event:")) type = linha.slice(6).trim();
        if (linha.startsWith("id:")) id = linha.slice(3).trim();
        if (linha.startsWith("data:")) dados.push(linha.slice(5).trimStart());
      }
      if (dados.length) {
        let data;
        try {
          data = JSON.parse(dados.join("\n"));
        } catch {
          continue;
        }
        onEvento({ type, id, data });
      }
    }
  };
}
