# XP — gamificação central

XP é global por `usuarios.id`, independente do ciclo de apadrinhamento.
O ledger é a fonte de verdade; a carteira materializa seu saldo.
[Decisão arquitetural](../decisoes/ADR-0002-xp-central.md).

## Modelo e invariantes

O schema `gamificacao` é mantido por migrations, sem entidades registradas
para `synchronize`:

- `xp_movimentacoes`: evento, quantidade, tipo, referência, descrição,
  chave de idempotência única e saldo após o evento.
  Quantidade não pode ser zero; coleta de PucStop sempre credita valor positivo.
- `xp_carteiras`: uma linha por usuário, saldo não negativo e ponto de trava.
- `pucstop_coletas`: usuário, PucStop, data, XP concedido e movimentação.
  Única por usuário/PucStop e por movimentação, sem coordenada.

Ledger e coletas aceitam somente inserção; triggers recusam
UPDATE/DELETE/TRUNCATE. FKs usam `RESTRICT`, sem cascata.
Correções de XP geram nova movimentação, nunca edição de registro anterior.

`registrarMovimentacao`, em `src/gamificacao/gamificacao.ts`, exige
transação aberta pelo chamador. Trava a carteira com `FOR UPDATE`, grava
ledger com `saldo_apos` e atualiza o saldo na mesma transação.
A invariante é `saldo = sum(quantidade)`, inclusive sob concorrência.

## Identidade e integração

Usuário vem do `sub` do JWT com e-mail conferido no cadastro.
Não usar e-mail como FK, ID do PUCMaps ou identidade enviada no corpo.
A conferência impede que IDs da base demo sejam confundidos com usuários reais.

PucStops usam a mesma transação para coleta e crédito.
Editar o XP de um ponto afeta só novas coletas:
[regras de PucStops](../mapa/pucstops.md).

## API e app

- `GET /me/xp`: `{saldo, totalGanho, totalGasto, atualizadoEm}`; sem
  movimentação, 0/null. Leitura não cria carteira. `totalGanho` soma PucStops
  e ajustes da coordenação; `totalGasto` soma as trocas na lojinha menos os
  estornos. Sempre `saldo = totalGanho - totalGasto` (F26).
- `GET /me/xp/movimentacoes?limite=1..100&antes=<id>`: histórico do próprio
  usuário, mais recente primeiro, com paginação por cursor.

Ambos exigem JWT. O app guarda o saldo em `SessaoUsuario.xp`,
lê da API e substitui pelo `xpTotal` devolvido por uma coleta; nunca o calcula
somando recompensas no cliente.

Níveis, meta visual da home e loja não se deduzem do ledger; não há regra de nível
herdada automaticamente da origem.

## Extensão

Novas origens de XP usam `registrarMovimentacao`, referência e chave de
idempotência próprias. Os tipos aceitos têm CHECK em migration; ampliar esse
conjunto exige mudança explícita de estrutura. O ledger admite débitos tipados,
mas isso não implementa por si só uma loja ou fluxo de recompensa.

A lojinha (cadastro, resgate, entrega e cancelamento) está em
[lojinha](lojinha.md).

## Ajustes da coordenação (F26)

Rotas em `/coordenacao/xp` (perfil `coordenador`), código em
`src/gamificacao/xp/xp-admin.*`.

- `GET /coordenacao/xp?busca=`: participantes com saldo e totais (até 50).
- `GET /coordenacao/xp/:usuarioId`: saldo, totais, extrato paginado como em
  `/me/xp/movimentacoes` e a lista de ajustes com motivo e responsável.
- `POST /coordenacao/xp/:usuarioId/ajustes`: `{ quantidade, motivo,
  chaveIdempotencia }`. Quantidade inteira diferente de zero (até ±100.000),
  motivo de 3 a 300 caracteres. Débito que deixaria o saldo negativo: 422
  `saldo-insuficiente`. Repetir a mesma chave devolve o ajuste já feito.

O ajuste entra no ledger como `AJUSTE_ADMIN` (chave `ajuste:<chave>`) e em
`xp_ajustes` (migration `1793600000000-EntregaResgatesEAjustesXp`), com
motivo, responsável e a movimentação. As duas tabelas são só de inserção:
corrigir um ajuste é fazer outro.

Pendente de decisão do grupo: política de saldo no encerramento do programa
e expiração de XP. Hoje o saldo permanece entre programas e nada expira.

Concorrência e consistência são verificadas em
`test/pucstops-xp.integration.spec.ts`; validações unitárias ficam em
`src/gamificacao/gamificacao.spec.ts`.
