# Contrato de API: resgates e XP da coordenação

Referência para integrar o app mobile da coordenação às rotas da F29
(entrega e cancelamento de resgates) e da F26 (XP, moedas e ajustes). É o
mesmo contrato usado pelas telas web "Resgates" e "XP e moedas"
(`code/front/src/pages/coordenacao/ResgatesPage.jsx` e `XpPage.jsx`;
chamadas em `code/front/src/api/client.js`).

Fonte da verdade: `code/back/api/src/gamificacao/resgates/resgates-admin.*`
e `code/back/api/src/gamificacao/xp/xp-admin.*`. Testes de contrato em
`code/back/api/test/resgates-xp.integration.spec.ts`. Regras de negócio em
[lojinha](lojinha.md) e [XP](xp.md).

## Convenções

- **Base**: mesma URL da API, sem prefixo global (ex.: `GET {API}/coordenacao/resgates`).
- **Autenticação**: `Authorization: Bearer <accessToken>`. Todas as rotas
  exigem perfil `coordenador` no token.
- **Corpo**: JSON (`Content-Type: application/json`).
- **Campos desconhecidos são recusados**: a API usa `ValidationPipe` com
  `whitelist` e `forbidNonWhitelisted`. Um campo ou parâmetro de query a mais
  gera 400 (`property X should not exist`). Envie só o que está documentado.
- **Datas**: strings ISO 8601 em UTC (`2026-11-20T18:04:11.000Z`).
- **Responsável**: quem entrega, cancela ou ajusta vem do token (e-mail e,
  quando existe, `usuarios.id`). Não existe campo para informar o responsável.
- **Moedas × XP**: `custoXp` (nome histórico) é o custo em **moedas**. O
  estorno devolve só moedas; o XP acumulado e o nível não mudam com
  resgates. Ajustes da coordenação mexem nos dois na mesma quantidade.

### Formato dos erros

| Status | Quando | Corpo |
| --- | --- | --- |
| 400 | Validação do corpo ou da query | `{ statusCode: 400, message: string[], error: "Bad Request" }` (lista de mensagens do class-validator) |
| 400 | `:id` não é UUID v4 / `:usuarioId` não é inteiro | `{ statusCode: 400, message: "Validation failed (uuid v4 is expected)" \| "Validation failed (numeric string is expected)", error: "Bad Request" }` |
| 401 | Sem token, token inválido ou expirado | `{ statusCode: 401, message: "Token de acesso não informado." \| "Token de acesso inválido ou expirado.", error: "Unauthorized" }` |
| 403 | Token de aluno (padrinho/apadrinhado) | `{ statusCode: 403, message: "Acesso restrito à coordenação do programa.", error: "Forbidden" }` |
| 404 | Recurso inexistente | `{ statusCode: 404, message: "...", error: "Not Found" }` |
| 409 / 422 de regra | Ver cada rota | `{ statusCode, message, motivo }`: decida pelo **`motivo`**, mostre o `message` |

O `message` dos erros de regra já vem em português, pronto para exibir.

---

## `/coordenacao/resgates` (F29)

Situações de um resgate: `aguardando_entrega` (sem desfecho), `entregue`,
`cancelado`. Cada resgate tem no máximo um desfecho, que não pode ser
alterado depois.

### Objeto `ResgateAdmin`

```jsonc
{
  "id": "3f1c…-uuid",
  "codigo": "A1B2C3D4E5",          // código do comprovante (10 hex, maiúsculas)
  "situacao": "aguardando_entrega", // | "entregue" | "cancelado"
  "participante": { "id": 12, "nome": "Mariana Souza", "email": "mariana@sga.pucminas.br" },
  "recompensa": {
    "id": "9a0e…-uuid",
    "nome": "Caneca Ajuda-aí",       // nome da versão resgatada
    "versao": 2,
    "programaCodigo": "2026/2"       // null = recompensa aberta a todos os programas
  },
  "custoXp": 120,                    // moedas debitadas no resgate
  "condicoesRetirada": "Retirar na sala da coordenação, 2ª a 6ª, 9h–17h.",
  "resgatadoEm": "2026-11-18T14:02:00.000Z",
  "entregueEm": null,                // preenchido só quando "entregue"
  "canceladoEm": null,               // preenchido só quando "cancelado"
  "motivoCancelamento": null,        // preenchido só quando "cancelado"
  "responsavel": null                // null em aguardando; { id: number|null, email: string|null } nos demais
}
```

### `GET /coordenacao/resgates`

Lista até **200** resgates, do mais recente para o mais antigo. Não há
paginação: use os filtros para reduzir a lista.

| Query | Tipo | Regra |
| --- | --- | --- |
| `situacao` | `aguardando_entrega` \| `entregue` \| `cancelado` | opcional |
| `programa` | string | opcional; formato de `programas.codigo` (`^[A-Za-z0-9._/-]{1,20}$`, ex.: `2026/2`). Filtra recompensas restritas a esse programa |
| `recompensaId` | UUID v4 | opcional |
| `busca` | string, até 120 | opcional; parte do nome ou do e-mail (sem diferenciar maiúsculas) **ou** o código exato do comprovante |

**200** → `ResgateAdmin[]` (pode ser `[]`).
**400** → valor de filtro inválido (ex.: `situacao=pendente`).

### `GET /coordenacao/resgates/:id`

**200** → `ResgateAdmin`.
**400** → `id` não é UUID v4. **404** → `"Resgate não encontrado."`

### `POST /coordenacao/resgates/:id/entregar`

Sem corpo. Registra a entrega com data e responsável. A unidade continua
saindo do estoque.

**200** → `ResgateAdmin` atualizado (`situacao: "entregue"`, `entregueEm`, `responsavel`).

| Erro | `motivo` | Mensagem |
| --- | --- | --- |
| 404 | — | `Resgate não encontrado.` |
| 409 | `resgate-entregue` | `Este resgate já foi entregue.` |
| 409 | `resgate-cancelado` | `Este resgate já foi cancelado.` |

### `POST /coordenacao/resgates/:id/cancelar`

```json
{ "motivo": "Aluno não retirou no prazo combinado" }
```

| Campo | Regra |
| --- | --- |
| `motivo` | obrigatório, string de 3 a 300 caracteres, não pode ser só espaços (a API grava sem espaços nas pontas) |

Faz tudo numa transação só: devolve as **moedas** do resgate ao
participante (aparece no extrato como `RECOMPENSA` positivo, descrição
`Estorno: <nome>`), devolve a unidade ao estoque e grava o desfecho com
motivo e responsável.

**200** → `ResgateAdmin` atualizado (`situacao: "cancelado"`, `canceladoEm`, `motivoCancelamento`, `responsavel`).

| Erro | `motivo` | Mensagem |
| --- | --- | --- |
| 400 | — | `motivo` ausente, vazio, curto ou longo demais |
| 404 | — | `Resgate não encontrado.` |
| 409 | `resgate-entregue` | `Este resgate já foi entregue.` |
| 409 | `resgate-cancelado` | `Este resgate já foi cancelado.` |

Duas pessoas agindo ao mesmo tempo no mesmo resgate (entregar × cancelar,
ou dois cancelamentos): só a primeira vale; a outra recebe 409. Não há
estorno duplo. No app, ao receber 409, recarregue o item com `GET /:id`.

> O cancelamento **não** libera o `limitePorAluno` hoje: o resgate cancelado
> continua contando. Essa regra está entre as decisões abertas do grupo.

---

## `/coordenacao/xp` (F26)

### `GET /coordenacao/xp`

| Query | Tipo | Regra |
| --- | --- | --- |
| `busca` | string, até 120 | opcional; parte do nome ou do e-mail |

Lista até **50** usuários em ordem de nome, sem paginação. Quem nunca
movimentou XP aparece com zeros.

**200** →

```jsonc
[
  {
    "usuario": { "id": 12, "nome": "Mariana Souza", "email": "mariana@sga.pucminas.br" },
    "moedas": 80,          // saldo para a lojinha
    "xpAcumulado": 200,    // trajetória; define o nível, não cai com resgates
    "nivel": {
      "numero": 3, "nome": "…", "xpMinimo": 150, "proximoXp": 300, "proximoNome": "…",
      "xpNoNivel": 50, "xpDoNivel": 150, "xpRestante": 100,
      "progresso": 33,     // inteiro 0–100 (barra); 100 no nível máximo
      "maximo": false      // no nível máximo: proximoXp/proximoNome/xpDoNivel = null
    },
    "atualizadoEm": "2026-11-18T14:02:00.000Z"   // null se nunca movimentou
  }
]
```

O objeto `nivel` é o mesmo de `GET /me/xp`, e o app já tem esse modelo.

### `GET /coordenacao/xp/:usuarioId`

| Parâmetro | Tipo | Regra |
| --- | --- | --- |
| `:usuarioId` | inteiro | `usuarios.id` |
| `limite` (query) | inteiro 1–100 | opcional, padrão 20; tamanho da página do extrato |
| `antes` (query) | inteiro ≥ 1 | opcional; `id` da última movimentação já recebida (cursor) |

**200** → o mesmo resumo de `GET /me/xp`, mais `usuario`, `movimentacoes` e `ajustes`:

```jsonc
{
  "usuario": { "id": 12, "nome": "Mariana Souza", "email": "…" },
  "saldo": 80, "moedas": 80, "xpAcumulado": 200, "nivel": { /* como acima */ },
  "ciclo": "2026/2",
  "limites": { "totens": { "ganho": 120, "limite": 400 }, "ciclo": { "ganho": 200, "limite": 1500 } },
  "atualizadoEm": "2026-11-18T14:02:00.000Z",
  "movimentacoes": [            // mais recente primeiro; página de `limite` itens
    {
      "id": "481",              // string (bigint); use como `antes` na próxima página
      "quantidade": -120,       // efeito nas moedas
      "xp": 0,                  // efeito no XP acumulado (0 em resgate e estorno)
      "tipo": "RECOMPENSA",     // PUCSTOP_CLAIM | RECOMPENSA | AJUSTE_ADMIN | MISSAO
      "referencia": { "tipo": "RESGATE", "id": "3f1c…" },   // ou null
      "descricao": "Caneca Ajuda-aí",
      "saldoApos": 80,          // moedas após o lançamento
      "criadoEm": "2026-11-18T14:02:00.000Z"
    }
  ],
  "ajustes": [                  // todos, mais recente primeiro (sem paginação)
    {
      "id": "c2d4…-uuid",
      "quantidade": 30,
      "motivo": "Participação no mutirão",
      "responsavel": { "id": 3, "email": "coord@pucminas.br" },
      "saldoApos": 200,
      "criadoEm": "2026-11-10T12:00:00.000Z"
    }
  ]
}
```

Para a próxima página do extrato, chame de novo com
`antes=<id da última movimentação>` e pare quando vierem menos de `limite`
itens. Os ajustes vêm completos em toda chamada.

**400** → `usuarioId` não numérico, `limite` fora de 1–100, `antes` < 1.
**404** → `"Participante não encontrado."`

### `POST /coordenacao/xp/:usuarioId/ajustes`

```json
{
  "quantidade": -15,
  "motivo": "Correção de crédito duplicado",
  "chaveIdempotencia": "7d9f5a8e-2b1c-4c3a-9f10-2a6b1e4c8d00"
}
```

| Campo | Regra |
| --- | --- |
| `quantidade` | inteiro, diferente de 0, entre −200 e +200. Positivo credita, negativo debita **XP e moedas** na mesma quantidade |
| `motivo` | obrigatório, 3 a 300 caracteres, não pode ser só espaços |
| `chaveIdempotencia` | UUID v4 gerado **uma vez por ajuste**, quando o formulário é aberto. Mantenha a mesma chave em novas tentativas do mesmo envio |

**201** →

```jsonc
{
  "ajuste": { "id": "…", "quantidade": -15, "motivo": "…", "responsavel": { "id": 3, "email": "…" }, "saldoApos": 65, "criadoEm": "…" },
  "saldo": 65,          // moedas atuais
  "xpAcumulado": 185    // XP acumulado atual
}
```

Reenviar com a **mesma chave** (por exemplo, depois de um timeout) devolve
**201** com o ajuste já gravado, sem lançar de novo.

| Erro | `motivo` | Quando |
| --- | --- | --- |
| 400 | — | `quantidade` 0, decimal, fora de ±200 ou ausente; `motivo` inválido; `chaveIdempotencia` ausente ou não UUID v4 |
| 403 | — | token sem perfil `coordenador` |
| 404 | — | `Participante não encontrado.` |
| 409 | — | `Chave já usada em outro ajuste.`: a chave já foi usada para outro participante ou outra quantidade. Gere uma chave nova |
| 422 | `saldo-insuficiente` | o débito deixaria as **moedas** negativas |
| 422 | `xp-insuficiente` | o débito deixaria o **XP acumulado** negativo |
| 422 | `ajuste-fora-do-limite` | proteção do ledger para mais de ±200 (na prática a validação 400 responde antes) |

Ajustes não podem ser editados nem apagados. Para corrigir um ajuste
errado, faça outro no sentido contrário.

---

## Checklist para o mobile

- [ ] Esconder as telas para perfis que não são `coordenador` (a API responde 403 de qualquer forma).
- [ ] Usar o `motivo` dos erros 409/422 para decidir a ação e mostrar o `message`.
- [ ] Depois de 409 em entregar/cancelar, recarregar o resgate.
- [ ] Gerar `chaveIdempotencia` ao abrir o formulário de ajuste, não a cada toque em "Salvar".
- [ ] Pedir confirmação antes de cancelar, avisando que as moedas voltam ao aluno.
- [ ] Mostrar "moedas" para `custoXp`/`saldo` e "XP" para `xpAcumulado`.
- [ ] Não enviar campos extras (a API responde 400).
