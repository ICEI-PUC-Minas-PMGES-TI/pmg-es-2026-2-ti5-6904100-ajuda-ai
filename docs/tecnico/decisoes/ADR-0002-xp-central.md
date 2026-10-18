# ADR-0002 — XP central

Estado: aceito.

## Contexto

PucStops concedem XP, mas a pontuação pertence ao usuário e pode ser consumida
por outros domínios. Vincular o saldo ao mapa ou a um ciclo fragmentaria a identidade
e a consistência das movimentações.

## Decisão

- Carteira global por `usuarios.id`, independente de participações.
- Ledger somente inserção como fonte de verdade; carteira materializa seu saldo.
- Cada evento de crédito/débito tem chave de idempotência única.
- Coleta e crédito ocorrem na mesma transação; a carteira é travada por usuário.
- Schema próprio `gamificacao`, separado de `feed` e de `mapa`.
- O modelo de XP/nível do PUCMaps não é usado como regra do Ajuda-aí.

## Consequências

O mapa é consumidor de XP, não seu proprietário. Correções geram novas
movimentações, sem editar o passado. A função de registro exige uma transação
do chamador e impede saldo negativo. Níveis e loja precisam de regras próprias;
não se deduzem do saldo nem da fórmula usada na origem.

Modelo, contratos e extensão do ledger: [gamificacao/xp.md](../gamificacao/xp.md).
