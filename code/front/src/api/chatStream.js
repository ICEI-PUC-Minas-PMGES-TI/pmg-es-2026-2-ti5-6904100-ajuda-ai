/** Parser compartilhado pelo chat: SSE pode dividir um caractere ou frame entre chunks. */
export async function consumirEventosChat(response, onEvent, signal) {
  if (!response.body)
    throw new Error("O servidor não abriu a atualização das conversas.");
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  const cancelar = () => {
    reader.cancel().catch(() => {});
  };
  signal?.addEventListener("abort", cancelar, { once: true });
  try {
    while (!signal?.aborted) {
      const { value, done } = await reader.read();
      buffer += decoder.decode(value, { stream: !done });
      if (buffer.length > 65536)
        throw new Error("Evento de conversa inválido.");
      let separador;
      while ((separador = /\r?\n\r?\n/.exec(buffer))) {
        const frame = buffer.slice(0, separador.index);
        buffer = buffer.slice(separador.index + separador[0].length);
        let tipo = "message",
          id;
        const dados = [];
        for (const linha of frame.split(/\r?\n/)) {
          if (linha.startsWith("event:")) tipo = linha.slice(6).trim();
          else if (linha.startsWith("id:")) id = linha.slice(3).trim();
          else if (linha.startsWith("data:"))
            dados.push(linha.slice(5).trimStart());
        }
        if (dados.length && !signal?.aborted)
          onEvent({ tipo, id, dados: JSON.parse(dados.join("\n")) });
      }
      if (done) break;
    }
  } finally {
    signal?.removeEventListener("abort", cancelar);
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}
