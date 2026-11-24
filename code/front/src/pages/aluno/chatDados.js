const ordem = { enviada: 0, entregue: 1, lida: 2 };
export function mesclarMensagens(atuais, novas) {
  const porId = new Map(atuais.map((m) => [m.id, m]));
  for (const nova of novas) {
    const anterior = porId.get(nova.id);
    const estado =
      anterior && (ordem[anterior.estado] ?? 0) > (ordem[nova.estado] ?? 0)
        ? anterior.estado
        : nova.estado;
    const recibos =
      anterior?.recibos || nova.recibos
        ? {
            ...anterior?.recibos,
            ...nova.recibos,
            lidas: Math.max(
              anterior?.recibos?.lidas || 0,
              nova.recibos?.lidas || 0,
            ),
            entregues: Math.max(
              anterior?.recibos?.entregues || 0,
              nova.recibos?.entregues || 0,
            ),
          }
        : undefined;
    porId.set(nova.id, {
      ...anterior,
      ...nova,
      estado,
      ...(recibos ? { recibos } : {}),
    });
  }
  return [...porId.values()].sort((a, b) => a.id - b.id);
}
export function tituloConversa(chat) {
  return chat.tipo === "coletivo"
    ? chat.titulo || "Conversa do grupo"
    : chat.participantes?.find(
        (p) => p.participacaoId !== chat.minhaParticipacaoId,
      )?.nome || "Conversa privada";
}
export function horarioMensagem(data) {
  return data
    ? new Date(data).toLocaleString("pt-BR", {
        day: "2-digit",
        month: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "";
}
/** IDs exatos também podem abrir o histórico; e-mail só resolve privado ativo. */
export function alvoConversa(conversas, { vinculo, grupo, pessoa } = {}) {
  if (grupo)
    return conversas.find(
      (c) => c.tipo === "coletivo" && String(c.grupoId) === String(grupo),
    );
  if (vinculo)
    return conversas.find(
      (c) =>
        c.tipo === "privado" && String(c.matchingVinculoId) === String(vinculo),
    );
  return pessoa
    ? conversas.find(
        (c) =>
          c.tipo === "privado" &&
          c.podeEnviar &&
          c.participantes?.some((p) => p.email === pessoa),
      )
    : undefined;
}
