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

- `GET /me/xp`: `{saldo, atualizadoEm}`; sem movimentação, 0/null.
  Leitura não cria carteira.
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

## Lojinha (F27)

O cadastro de recompensas fica em `/coordenacao/recompensas`
(`src/gamificacao/recompensas/`). Cada recompensa tem custo em XP, condições
de retirada, estoque limitado ou ilimitado, público, programa e vigência.
Editar nome, descrição, imagem, custo ou condições cria nova linha em
`recompensa_versoes`; o resgate (F28) deve gravar a versão vista pelo aluno.
O resgate debita com `tipo = 'RECOMPENSA'`, `referencia_tipo = 'RECOMPENSA'`
e `referencia_id` = id da recompensa, travando a linha da recompensa e
somando em `estoque_comprometido` na mesma transação. Recompensa com
movimentações ou unidades comprometidas não é excluída: é arquivada.

Concorrência e consistência são verificadas em
`test/pucstops-xp.integration.spec.ts`; validações unitárias ficam em
`src/gamificacao/gamificacao.spec.ts`.
