# ADR-0002 — XP central

> Estado: ACEITO E IMPLEMENTADO (Tarefa 10; migration aplicada no Supabase em 18/10/2026)

## Contexto

O PUCMaps possuía um sistema de XP próprio: tabela `user_stats` (XP total e nível por usuário) e `xp_log` (histórico de eventos de XP), sem foreign key real para a tabela de usuários, e sem qualquer integração com outros domínios.

O Ajuda-aí hoje não tem backend de XP. O único traço de XP existente é um valor fixo no app mobile (`_xpAtual = 1430`, comentado como exemplo), sem correspondência com dados reais.

A integração do mapa traz funcionalidades que naturalmente geram XP (PucStops), e o produto já prevê gamificação (XP, níveis, conquistas) como requisito desejável, não restrito ao mapa.

## Decisão

- O sistema antigo de XP do PUCMaps **não é migrado diretamente**. `user_stats`, `xp_log` e o módulo `gamification` do PUCMaps não são portados como estão.
- O Ajuda-aí terá um domínio de XP **central**, não restrito ao mapa, usado por qualquer funcionalidade que conceda XP.
- Modelo conceitual (ainda não implementado):
  - uma carteira por usuário (total acumulado, nível derivado);
  - um registro de movimentações, com origem tipada (ex.: `puc_stop_claim`) e uma chave que garanta idempotência (não creditar duas vezes o mesmo evento);
  - claim e crédito de XP devem ocorrer na mesma transação, quando a origem for uma ação como um PucStop.
- Preferência atual: **carteira global**, não vinculada a um ciclo/programa de apadrinhamento, porque o mapa e os PucStops podem ser usados por qualquer usuário autenticado, inclusive fora de uma participação ativa. Esta preferência pode ser revista quando o desenho de XP for aprofundado.

## Implementação (Tarefa 10)

- Carteira **global** confirmada: `gamificacao.xp_carteiras` (saldo
  materializado) por `usuarios.id`, sem vínculo com `participacoes`.
- Movimentações: `gamificacao.xp_movimentacoes`, ledger somente inserção e
  fonte de verdade (`saldo == sum(quantidade)`), com `tipo`, referência,
  `chave_idempotencia` única e `saldo_apos`. Aceita débito futuro; saldo nunca
  negativo.
- Coleta de PucStop e crédito na mesma transação, com a carteira travada por
  linha; coleta única por `(usuario_id, pucstop_id)` (regra real do PUCMaps,
  sem cooldown).
- Schema próprio `gamificacao` (nem `feed`, nem `mapa`), só SQL: o
  `synchronize` local não toca nessas tabelas.
- Detalhes: [gamificacao/xp.md](../gamificacao/xp.md) e
  [mapa/pucstops.md](../mapa/pucstops.md).

## Consequências

- O módulo de XP (`src/gamificacao/`) é desacoplado do mapa: o mapa é um dos
  consumidores (via PucStops), não o dono do domínio.
- A home e o perfil do app mostram o saldo real de `GET /me/xp`.
- Níveis continuam sem regra definida (não foram herdados do PUCMaps).
