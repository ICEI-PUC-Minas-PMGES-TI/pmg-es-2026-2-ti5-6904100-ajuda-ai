# XP — gamificação central

> Estado: ATUAL (Tarefa 10). XP global por usuário, com ledger auditável.
> Migration **aplicada no Supabase em 18/10/2026** (tabelas vazias; ver
> [banco/migrations.md](../banco/migrations.md#aplicação-no-supabase-18102026)).

## Auditoria do que existia

- **Ajuda-aí**: nenhum backend de XP. Só valores de exemplo: `_xpAtual = 1430`
  na home do app e campos `xp`/`meta`/`nivel` na base demo (`dados/dados.ts`,
  usados só na exibição do coordenador mockado). Nenhuma loja/recompensa no
  backend; a tela "Resgatar" do app é estática (sem itens).
- **PUCMaps**: `user_stats` (total + nível `floor(xp/100)+1`) e `xp_log`, sem
  FK para usuário e sem transação com o claim. Não portados (ADR-0002).

## Modelo

XP é **global por usuário** (`usuarios.id`), não por `participacoes`: o mapa e
os PucStops existem fora de um ciclo do programa.

Schema próprio `gamificacao` (fora de `feed` e de `mapa`), só SQL (sem
entidades TypeORM, então o `synchronize` local nunca cria/altera essas
tabelas):

| Tabela | Papel | Restrições |
|---|---|---|
| `xp_movimentacoes` | **Ledger, fonte de verdade.** Uma linha por evento: `usuario_id`, `quantidade`, `tipo`, `referencia_tipo`/`referencia_id`, `descricao`, `chave_idempotencia`, `saldo_apos`, `criado_em` | `quantidade <> 0`; `tipo IN ('PUCSTOP_CLAIM','RECOMPENSA','AJUSTE_ADMIN')`; `PUCSTOP_CLAIM` só positivo; referência toda ou nada; `UNIQUE (chave_idempotencia)`; FK `usuarios` RESTRICT; **somente inserção** (trigger recusa UPDATE/DELETE/TRUNCATE) |
| `xp_carteiras` | Saldo materializado (= soma do ledger) e ponto de trava por usuário | PK `usuario_id`; `saldo >= 0`; FK RESTRICT |
| `pucstop_coletas` | Coleta de PucStop (PucStop + usuário + data + movimentação) | `UNIQUE (usuario_id, pucstop_id)`; `UNIQUE (movimentacao_id)`; FKs RESTRICT; somente inserção; **sem coordenada** |

- **Débito futuro** (troca por item): o ledger aceita quantidade negativa
  (`RECOMPENSA`), e o saldo nunca fica negativo (CHECK + `SaldoInsuficienteError`
  na função de registro). A loja **não** foi implementada.
- **Consistência**: toda movimentação passa por `registrarMovimentacao`
  (`src/gamificacao/gamificacao.ts`), que trava a carteira (`FOR UPDATE`), grava
  o ledger com `saldo_apos` e atualiza o saldo na mesma transação do chamador.
  Testado: `saldo == sum(quantidade)` para todos os usuários, `saldo_apos` em
  sequência mesmo com coletas simultâneas.
- **Correção de XP**: nova movimentação (`AJUSTE_ADMIN`), nunca edição.
- **Níveis**: não implementados (o Ajuda-aí ainda não tem regra; a do PUCMaps
  não foi adotada). A barra da home usa uma meta visual fixa.

## Identidade

- Usuário = JWT `sub` → `usuarios.id`; o e-mail do token precisa ser o da
  linha. Isso barra o coordenador mockado, que assina `sub` = id da base demo
  (`"3"`) — no banco, `usuarios.id = 3` é outra pessoa. Sem cadastro → 403.
- Nunca e-mail como FK, nunca id do PUCMaps, nunca usuário vindo do corpo.

## Endpoints

| Rota | Auth | Resposta |
|---|---|---|
| `GET /me/xp` | JWT | `{ saldo, atualizadoEm }` (0/null sem movimentação; leitura não cria carteira) |
| `GET /me/xp/movimentacoes?limite=1..100&antes=<id>` | JWT | movimentações do próprio usuário, mais recente primeiro, paginadas por cursor |

Origem de XP hoje: só PucStops cadastrados pela coordenação ([mapa/pucstops.md](../mapa/pucstops.md)). Editar o XP de um PucStop vale só para novas coletas: movimentações antigas nunca são recalculadas.

## App

- `SessaoUsuario.xp` (`ValueNotifier<int?>`), lido de `GET /me/xp`
  (`XpApi`) e atualizado com o `xpTotal` devolvido por uma coleta (o cliente
  nunca soma XP).
- Perfil: indicador "★ N XP" para qualquer aluno com sessão (some sem sessão
  ou para a coordenação). Home (participante ativo): o card "Seus pontos" e a
  tela "Resgatar" usam o saldo real em vez do 1.430 fixo.

## Integração futura

Qualquer outra funcionalidade que conceda ou debite XP usa
`registrarMovimentacao` com um `tipo` novo (exige migration para a CHECK) e uma
`chave_idempotencia` própria do evento.
