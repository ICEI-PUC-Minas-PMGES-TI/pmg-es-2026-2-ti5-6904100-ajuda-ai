# Missões e notificações

Migrations:

- `1794300000000-CriaMissoes` (schema `gamificacao`): `missoes` e
  `missoes_conclusoes`. A conclusão é só de inserção (trigger
  `somente_insercao`) e tem índice único por (missão, usuário, ciclo) nas
  missões `UNICA` e por (missão, usuário, semana) nas `SEMANAL`.
- `1794400000000-CriaNotificacoes` (schema `DB_SCHEMA`, padrão `feed`):
  `notificacoes`, com UNIQUE (`usuario_id`, `chave`) para o mesmo evento não
  notificar duas vezes.

## Economia

Toda recompensa de missão passa por `creditarGanho()` (`ganhos.ts`), com
`fonte: 'MISSAO'`, dentro da transação e com a carteira travada. Não há SQL
próprio de saldo. Tetos de `LIMITES` (`economia.ts`):

| Teto | Valor | Onde |
|---|---|---|
| Por missão | 100 XP | DTO, service e CHECK `ck_missoes_xp` |
| Missões semanais | 60 XP por semana | `recorrenteSemanal` + `referencia_tipo = 'MISSAO_SEMANAL'`; CHECK `ck_missoes_xp_semanal` |
| Geral do ciclo | 1500 XP | `creditarGanho()` |

Moedas = XP (1:1). A conclusão é gravada mesmo quando o teto zera o ganho
(`xp_creditado = 0`), para o aluno não tentar de novo e a coordenação ver a
contagem real. A chave de idempotência é montada no servidor:
`missao:<id>:<usuario>:<ciclo>` ou `missao:<id>:<usuario>:<semana>`, em que a
semana é a segunda-feira em Brasília.

## Rotas do aluno: `/me/missoes`

Exigem JWT e participação no ciclo (`podeColetarTotens`; sem participação, 403
`sem-participacao-no-ciclo`).

- `GET /`: missões ativas e vigentes do ciclo, com `status` (`disponivel`,
  `limitada`, `concluida`), `xpPrevisto` e uso dos tetos (`limites.ciclo`,
  `limites.semanal`).
- `POST /:id/concluir` (corpo vazio): 201 com `xp`, `moedas`, `limitado`,
  `teto`, `saldoMoedas`, `xpAcumulado`, `nivel` e `subiuDeNivel`. 404 se não
  existe, está inativa ou é de outro ciclo; 409 `ja-concluida`; 422
  `fora-do-periodo`.

## Rotas da coordenação: `/coordenacao/missoes`

Perfil `coordenador` (aluno recebe 403). Tela "Missões" do painel web
(`MissoesPage.jsx`).

- `GET /` (`?status=ativa|inativa&ciclo=`), `GET /:id`.
- `POST /`: `titulo`, `descricao`, `tipo` (`UNICA`/`SEMANAL`), `xp`, `inicio`
  e `fim` opcionais (ISO com fuso) e `ativar`.
- `PATCH /:id`: qualquer campo, com o `atualizadoEm` que a tela mostrava (409
  `missao-alterada` se outra pessoa editou antes). O tipo não muda depois da
  primeira conclusão (409 `missao-com-conclusoes`). Mudar o XP vale só para
  conclusões futuras.
- `POST /:id/ativar` e `POST /:id/desativar`: idempotentes. Desativar é o
  "excluir": conclusões e ledger ficam.

## Notificações: `/me/notificacoes`

Exigem JWT de usuário cadastrado (não exigem participação: o ex-participante
também recebe aviso de resgate).

- `GET /?limite=1..50` (padrão 20): `{ naoLidas, itens }`, mais recentes
  primeiro.
- `PATCH /:id/lida`: idempotente, mantém o `lidaEm` original. Notificação de
  outro usuário responde 404.
- `PATCH /lidas`: marca todas.

Geração (`NotificacoesService.criar` e `criarParaParticipantes`), sempre
depois do commit da operação principal. Uma falha ao notificar só gera log.

| Evento | Tipo | Chave |
|---|---|---|
| Primeira ativação de missão | `MISSAO_NOVA` (participantes ativos do ciclo) | `missao-nova:<id>` |
| Subida de nível (missão ou totem) | `NIVEL_SUBIU` | `nivel:<numero>` |
| Resgate entregue / cancelado | `RESGATE_ENTREGUE` / `RESGATE_CANCELADO` | `resgate-entregue:<id>` / `resgate-cancelado:<id>` |

Os textos ficam em `src/notificacoes/notificacoes.ts`. O aviso de resgate
depende da entrega e do cancelamento da lojinha (F29).

Não há push nem websocket: web e app consultam ao abrir, ao focar a tela e ao
abrir o painel do sino. A preferência de alertas fica no cliente
(`notificacoesApp` na web, `notificacoesAvisos` no app) e só esconde o badge.

## Telas

- App (aluno): aba Missões (`tela_missoes.dart`) com limites da semana e do
  ciclo, filtros, detalhe e o aviso de ganho limitado; sino da Home com a
  contagem real (`CentralNotificacoes`, `painel_notificacoes.dart`).
- Web (aluno): painel do sino em `AlunoLayout.jsx`, com notificações e
  comunicados.
- Web (coordenação): `MissoesPage.jsx`, com métricas, busca, filtros,
  criar/editar e ativar/desativar.
