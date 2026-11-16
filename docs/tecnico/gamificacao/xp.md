# XP — gamificação central

XP é global por `usuarios.id`, independente do ciclo de apadrinhamento.
O ledger é a fonte de verdade; a carteira materializa seu saldo.
[Decisão arquitetural](../decisoes/ADR-0002-xp-central.md).

## BL-50 — XP, moedas, níveis e tetos

Decisões DP-24 (opção B) e DP-25. Regras em `src/gamificacao/economia.ts` (fonte única; os apps só exibem).

- **XP acumulado** (`xp_carteiras.xp_acumulado`): experiência; define o nível. Só sobe com atividades; desce apenas por correção administrativa (`AJUSTE_ADMIN`, ±200, auditável). Mantido pelo gatilho `gamificacao.acumular_xp` a cada INSERT no ledger — vale também para versões antigas do backend.
- **Moedas** (`xp_carteiras.saldo`, nome histórico; `saldo` na API): saldo da lojinha. Ganham 1:1 com o XP; resgates (`RECOMPENSA` negativo) e estornos (`RECOMPENSA` positivo, formato da branch `Arthur_gv`) mexem **só** nas moedas. Nunca negativas.
- **Ledger**: `xp_movimentacoes.quantidade` = efeito nas moedas; `xp_quantidade` = efeito no XP (NULL nas linhas antigas: vale a regra do tipo — `RECOMPENSA` 0, demais = quantidade); `ciclo` = semestre do ganho. Tipos: `PUCSTOP_CLAIM`, `RECOMPENSA`, `AJUSTE_ADMIN`, `MISSAO`.
- **Níveis** (10): 0, 50, 150, 300, 500, 750, 1050, 1400, 1950, 2600 — Primeiro passo … Lenda da PUC. `GET /gamificacao/niveis` (público). O nível é conquista, não papel.
- **Totens**: recompensa 10/20/30/40/50 XP (+ moedas 1:1), padrão 30 (CHECK no banco e validação na API). Uma coleta por usuário, totem e **ciclo** (`uq_pucstop_coletas_usuario_pucstop_ciclo`); o mapa mostra como coletadas só as do ciclo atual. `pucstop_coletas.xp` = creditado; `xp_configurado` = valor do totem na hora.
- **Tetos** (sob a trava da carteira, sem corrida): 400 XP de totens e 1.500 XP de atividades por aluno e ciclo; missão até 100 XP; missões recorrentes até 60 XP/semana. Acima do teto o ganho é parcial ou zero (a coleta fica registrada, sem movimentação).
- **API**: `GET /me/xp` → `saldo` (moedas, compatível), `moedas`, `xpAcumulado`, `nivel{numero,nome,xpMinimo,proximoXp,proximoNome,xpNoNivel,xpDoNivel,xpRestante,progresso,maximo}`, `ciclo`, `limites{totens,ciclo}`. Coleta devolve `xpGanho` (efetivo), `moedasGanhas`, `xpConfigurado`, `limiteAtingido`, `xpAcumulado`, `nivel`, `subiuDeNivel`, `ciclo` (e `xpTotal` = moedas, compatível). `GET /coordenacao/pucstops/orcamento` mostra o XP potencial dos totens frente ao teto.
- **Missões**: a base (`creditarGanho` com fonte `MISSAO`, tetos e tipo no ledger) está pronta; o catálogo e os gatilhos são o BL-12.
- **Migration** `1794000000000-GamificacaoNiveisMoedasCiclos`: reconstrói o XP do ledger (não copia o saldo), classifica coletas antigas pelo semestre da data (fuso de Brasília), normaliza totens para a opção mais próxima (meio para cima, 10–50) e recusa migrar se algum histórico resultar em XP negativo.

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

A lojinha (cadastro e resgate com XP) está em [lojinha](lojinha.md).

Concorrência e consistência são verificadas em
`test/pucstops-xp.integration.spec.ts`; validações unitárias ficam em
`src/gamificacao/gamificacao.spec.ts`.
