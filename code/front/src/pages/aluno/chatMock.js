const CONVERSAS = [
  {
    id: "mock-apadrinhado",
    participante: {
      nome: "Marina Costa",
      iniciais: "MC",
      curso: "Psicologia",
      papel: "Apadrinhada",
    },
    programa: "2026/2",
    mensagens: [
      {
        id: 1,
        remetente: "outro",
        texto: "Oi! Que bom que fomos conectados 😊",
        hora: "09:12",
      },
      {
        id: 2,
        remetente: "eu",
        texto: "Oi, Marina! Seja bem-vinda ao programa!",
        hora: "09:15",
        estado: "lida",
      },
      {
        id: 3,
        remetente: "outro",
        texto: "Obrigada! Estou animada para começar.",
        hora: "09:18",
      },
      {
        id: 4,
        remetente: "eu",
        texto: "Vamos combinar um café no campus?",
        hora: "09:20",
        estado: "entregue",
      },
      {
        id: 5,
        remetente: "eu",
        texto: "Posso te mostrar a biblioteca também.",
        hora: "09:22",
        estado: "enviada",
      },
    ],
  },
  {
    id: "mock-padrinho",
    participante: {
      nome: "Thiago Martins",
      iniciais: "TM",
      curso: "Engenharia de Software",
      papel: "Padrinho",
    },
    programa: "2026/2",
    mensagens: [
      {
        id: 1,
        remetente: "outro",
        texto: "Olá! Sou seu padrinho neste semestre.",
        hora: "Ontem",
      },
      {
        id: 2,
        remetente: "eu",
        texto: "Olá, Thiago! Muito prazer 😊",
        hora: "Ontem",
        estado: "lida",
      },
      {
        id: 3,
        remetente: "outro",
        texto: "Quando fica melhor para conversarmos?",
        hora: "Ontem",
      },
    ],
  },
];

export function criarConversasMock() {
  return CONVERSAS.map((conversa) => ({
    ...conversa,
    participante: { ...conversa.participante },
    mensagens: conversa.mensagens.map((mensagem) => ({ ...mensagem })),
  }));
}
