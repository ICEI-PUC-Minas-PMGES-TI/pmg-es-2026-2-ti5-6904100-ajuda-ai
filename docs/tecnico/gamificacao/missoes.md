# Missões e notificações

Migrations:

- `1794700000000-CriaMissoes` (schema `gamificacao`): `missoes` e
  `missoes_conclusoes`. `missoes.ciclo` referencia `programas.codigo`
  (`fk_missoes_ciclo`, RESTRICT): um programa com missões não é excluído
  (409, encerre o programa). A conclusão é só de inserção (trigger
  `somente_insercao`) e tem índice único por (missão, usuário, ciclo) nas
  missões `UNICA` e por (missão, usuário, semana) nas `SEMANAL`.
- `1794800000000-CriaNotificacoes` (schema `DB_SCHEMA`, padrão `feed`):
  `notificacoes`, com UNIQUE (`usuario_id`, `chave`) para o mesmo evento não
  notificar duas vezes. O `tipo` é validado no código (sem CHECK no banco):
  um tipo novo não exige migration nem falha calado em banco antigo.
- `1794900000000-ConclusoesMissaoSemTruncate`: bloqueia `TRUNCATE` nas
  conclusões.
- `1795000000000-RequisitosMissoes`: `requisito`, `quantidade`, `alvo_id` e
  `codigo` em `missoes` (com CHECK por requisito), `evidencia` nas conclusões
  e a tabela `missoes_tentativas_codigo`.

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
- `POST /:id/concluir`: corpo com `latitude`, `longitude` e `accuracy`
  (`EVENTO`) e `codigo` (`EVENTO` e `CODIGO`); os outros requisitos vão com
  corpo vazio. 201 com `xp`, `moedas`, `limitado`, `teto`, `saldoMoedas`,
  `xpAcumulado`, `nivel` e `subiuDeNivel`. 404 se não existe, está inativa ou
  é de outro ciclo; 409 `ja-concluida`; 422 `fora-do-periodo`,
  `requisito-pendente`, `codigo-incorreto` ou uma recusa do check-in; 400
  `codigo-obrigatorio` ou `localizacao-obrigatoria`; 429 `muitas-tentativas`.

## Requisitos

O XP só sai de `concluir()`, que confere o requisito nos dados reais dentro da
transação (`requisitos.ts`). O `pronta` da listagem é só informativo.

| Requisito | Como o servidor comprova |
|---|---|
| `PUCSTOPS` | N totens coletados no semestre, ou um totem específico (`alvo_id`). Sempre `UNICA` |
| `EVENTO` | Check-in a até 60 m do local do evento, de 30 min antes até o fim, com precisão de até 100 m, mais o código mostrado no evento. A coordenada não é gravada |
| `FEED_COMENTARIOS` | N comentários com 10+ caracteres em posts de colegas (o próprio post não conta) |
| `FEED_CURTIDAS` | N posts de colegas curtidos (o próprio post não conta) |
| `FEED_PUBLICACOES` | N publicações (só aparece para padrinho com dupla) |
| `CHAT_MENSAGENS` | N mensagens com 10+ caracteres no chat da dupla (só aparece para quem tem dupla) |
| `CODIGO` | Código mostrado na atividade presencial |

- Janela: só contam ações feitas depois que a missão abriu (`inicio`, ou a
  criação) e antes do `fim`; nas semanais, só as da semana. A exceção é
  `PUCSTOPS`, que conta as coletas do semestre inteiro: cada totem só é
  coletado uma vez por semestre, então um aluno que já tinha passado pelo
  totem nunca conseguiria cumprir a missão.
- Código: comparação em tempo constante, sem diferenciar maiúsculas nem
  espaços. Cinco erros em uma hora, na mesma missão, bloqueiam o aluno (429).
  Os erros ficam em `missoes_tentativas_codigo`; o
  `LimpezaTentativasService` apaga os que já saíram da janela de uma hora ao
  subir a API e depois a cada hora.
- GPS: latitude, longitude e precisão vêm do celular e podem ser forjadas por
  quem chama a API direto. Por isso o `EVENTO` também exige o código mostrado
  no local: ele é a prova de presença, e o GPS só barra quem tenta de longe
  sem forjar a posição.

## Rotas da coordenação: `/coordenacao/missoes`

Perfil `coordenador` (aluno recebe 403). Tela "Missões" do painel web
(`MissoesPage.jsx`).

- `GET /` (`?status=ativa|inativa&ciclo=`), `GET /:id`.
- `POST /`: `titulo`, `descricao`, `tipo` (`UNICA`/`SEMANAL`), `xp`, `inicio`
  e `fim` opcionais (ISO com fuso) e `ativar`. A missão entra no ciclo atual,
  que precisa estar aberto em Programas (senão 400).
- `PATCH /:id`: qualquer campo, com o `atualizadoEm` que a tela mostrava (409
  `missao-alterada` se outra pessoa editou antes). O tipo não muda depois da
  primeira conclusão (409 `missao-com-conclusoes`). Mudar o XP vale só para
  conclusões futuras.
- `POST /:id/ativar` e `POST /:id/desativar`: idempotentes. Desativar é o
  "excluir": conclusões e ledger ficam. Ativar não notifica na hora: o aviso
  sai quando a missão fica visível para o aluno (veja abaixo).

## Notificações: `/me/notificacoes`

Exigem JWT de usuário cadastrado (não exigem participação: o ex-participante
também recebe aviso de resgate).

- `GET /?limite=1..50` (padrão 20): `{ naoLidas, itens }`, mais recentes
  primeiro. Para quem participa do ciclo, antes de listar, cria num único
  `INSERT` o aviso das missões que ele já pode ver e ainda não recebeu. Só
  entram missões que ficaram disponíveis depois que o aluno entrou no ciclo
  (criação da participação): quem chega no meio do semestre vê as missões
  antigas na aba Missões, sem uma enxurrada de avisos no sino.
- `PATCH /:id/lida`: idempotente, mantém o `lidaEm` original. Notificação de
  outro usuário responde 404.
- `PATCH /lidas`: marca todas.

Geração (`NotificacoesService.criar` e `sincronizarMissoes`), sempre depois
do commit da operação principal. Uma falha ao notificar só gera log.

| Evento | Tipo | Chave |
|---|---|---|
| Missão visível para o aluno (ativa, no período, aluno participante do ciclo) e aberta depois que ele entrou no ciclo; gerada quando ele consulta o sino | `MISSAO_NOVA` | `missao-nova:<id>` |
| Subida de nível (missão ou totem) | `NIVEL_SUBIU` | `nivel:<numero>` |
| Resgate entregue / cancelado | `RESGATE_ENTREGUE` / `RESGATE_CANCELADO` | `resgate-entregue:<id>` / `resgate-cancelado:<id>` |

Os textos ficam em `src/notificacoes/notificacoes.ts`. O aviso de resgate
depende da entrega e do cancelamento da lojinha (F29).

Não há push nem websocket: web e app consultam ao abrir, ao focar a tela e ao
abrir o painel do sino. A preferência de alertas fica no cliente
(`notificacoesApp` na web, `notificacoesAvisos` no app) e só esconde o badge.

## Telas

- App (aluno): aba Missões (`tela_missoes.dart`) para quem participa do ciclo,
  com ou sem par, com limites da semana e do ciclo, filtros, detalhe e o aviso
  de ganho limitado; a lista recarrega ao voltar para a aba e ao reabrir o
  app. Sino da Home com a contagem real (`CentralNotificacoes`,
  `painel_notificacoes.dart`); tocar numa notificação marca como lida e abre a
  tela dela (Missões, Perfil ou Meus resgates).
- Web (aluno): painel do sino em `AlunoLayout.jsx`, com notificações e
  comunicados.
- Web (coordenação): `MissoesPage.jsx`, com métricas, busca, filtros,
  criar/editar e ativar/desativar.
