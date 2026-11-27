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
- `1795100000000-PublicacaoMissoes`: `publicada_em` (primeira publicação) e
  o CHECK `ck_missoes_publicada` (missão ativa sempre tem `publicada_em`).
- `1795200000000-CicloDeVidaMissoes`: `publico` (`TODOS`, `PADRINHOS`,
  `APADRINHADOS`), `instrucoes`, `pucstops` (lista de pontos da exploração,
  até 20) e `codigo_liberado_ate` (até quando o código vale). O `alvo_id` de PucStop vira lista de um ponto; `alvo_id` fica só
  para o evento. Missão desativada que já tinha conclusões ganha
  `publicada_em` (é arquivada, não rascunho). O rollback se recusa a rodar se
  alguma missão perderia público, instruções ou pontos.

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

- `GET /`: missões publicadas e vigentes do ciclo para o público do aluno
  (veja Público), com `status` (`disponivel`, `limitada`, `concluida`),
  `xpPrevisto`, `instrucoes`, uso dos tetos (`limites.ciclo`,
  `limites.semanal`) e, na exploração com roteiro, `pontos` (`id`, `nome`,
  `coletado`, `ativo`, coordenadas) na ordem da coordenação; o `alvo` é o
  primeiro ponto ativo que falta. Em `CODIGO` e `EVENTO`, `codigoLiberadoAte`
  diz até quando o código vale (null: fechado).
- `POST /:id/concluir`: corpo com `latitude`, `longitude` e `accuracy`
  (`EVENTO`) e `codigo` (`EVENTO` e `CODIGO`); os outros requisitos vão com
  corpo vazio. 201 com `xp`, `moedas`, `limitado`, `teto`, `saldoMoedas`,
  `xpAcumulado`, `nivel` e `subiuDeNivel`. 404 se não existe, está inativa ou
  é de outro ciclo; 409 `ja-concluida`; 422 `fora-do-periodo`,
  `requisito-pendente`, `codigo-fechado`, `codigo-incorreto`,
  `codigo-repetido` ou uma recusa do check-in; 400 `codigo-obrigatorio` ou `localizacao-obrigatoria`; 429
  `muitas-tentativas`.

## Requisitos

O XP só sai de `concluir()`, que confere o requisito nos dados reais dentro da
transação (`requisitos.ts`). O `pronta` da listagem é só informativo.

| Requisito | Como o servidor comprova |
|---|---|
| `PUCSTOPS` | N totens quaisquer coletados no semestre, ou todos os pontos do roteiro (`pucstops`; a meta é o número de pontos). Ponto desativado que o aluno não coletou sai da meta. Sempre `UNICA` |
| `EVENTO` | Check-in a até 60 m do local do evento, de 30 min antes até o fim, com precisão de até 100 m, mais o código mostrado no evento, enquanto a coordenação deixa liberado. A coordenada não é gravada |
| `FEED_COMENTARIOS` | Comentários com 10+ caracteres em N posts diferentes de colegas: vários no mesmo post contam um (o próprio post não conta) |
| `FEED_CURTIDAS` | N posts de colegas curtidos (o próprio post não conta). Na semanal, só posts publicados na semana |
| `FEED_PUBLICACOES` | N publicações (só aparece para padrinho com dupla) |
| `CHAT_MENSAGENS` | N mensagens com 10+ caracteres no chat da dupla (só aparece para quem tem dupla) |
| `CODIGO` | Código mostrado na atividade presencial, só enquanto a coordenação deixa liberado. Na semanal, o mesmo código não vale duas vezes para o mesmo aluno |

- Janela: só contam ações feitas depois da primeira publicação
  (`publicada_em`) e do `inicio`, e antes do `fim`; nas semanais, só as da
  semana (`GREATEST` ignora o `inicio` nulo). Rascunho nunca publicado não
  conta nada: sem `publicada_em`, a janela fica vazia. A exceção é
  `PUCSTOPS`, que conta as coletas do semestre inteiro: cada totem só é
  coletado uma vez por semestre, então um aluno que já tinha passado pelo
  totem nunca conseguiria cumprir a missão.
- Código semanal: a conclusão guarda em `evidencia.codigoUsado` uma
  impressão do código (SHA-256 de `missão:código`, 32 caracteres), nunca o
  código. Se o aluno manda na semana seguinte o código que já usou, recebe 422
  `codigo-repetido` (a tentativa não conta como erro): a coordenação troca o
  código toda semana.
- Janela do código: o código só vale até `codigo_liberado_ate`, que a
  coordenação abre na hora da atividade (`POST /coordenacao/missoes/:id/codigo`,
  1 a 120 minutos) e pode fechar antes. Fora dela, 422 `codigo-fechado`, sem
  conferir o código e sem contar tentativa: repassar o código depois da
  atividade não adianta, e a resposta não revela se o código estava certo.
  Arquivar fecha a janela. O `pronta` não depende dela (a lista do app pode
  estar velha); quem decide é o servidor na conclusão.
- Ponto desativado: um PucStop do roteiro desativado depois da publicação
  deixa de contar para quem ainda não o coletou, e a meta cai junto
  (`metaEfetiva`: no mínimo 1). Quem já tinha coletado continua com ele. Na
  missão de N totens quaisquer, a meta também cai se não sobrarem totens
  ativos suficientes para o aluno. Assim a missão nunca fica impossível.
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

- `GET /` (`?status=ativa|inativa&ciclo=`), `GET /:id`. Cada missão vem com
  `estado` (`rascunho`, `publicada`, `arquivada`), `publicadaEm`, `publico`,
  `instrucoes`, `pontos` (`id`, `nome`, `ativo`) e `codigoLiberadoAte`.
- `POST /`: `titulo`, `descricao`, `instrucoes` (opcional, até 1000),
  `tipo` (`UNICA`/`SEMANAL`), `xp`, `publico` (padrão `TODOS`), `requisito`,
  `quantidade`, `alvoId` (evento), `alvoIds` (PucStops do roteiro, 1 a 20,
  sem repetição; com roteiro, `quantidade` = número de pontos), `codigo`,
  `inicio` e `fim` opcionais (ISO com fuso) e `ativar`. O `alvoId` de PucStop
  do cliente antigo ainda vale e vira roteiro de um ponto; mandar um ponto em
  `alvoId` e outros em `alvoIds` dá 400. A missão entra no ciclo atual, que
  precisa estar aberto em Programas (senão 400).
- `PATCH /:id`: com o `atualizadoEm` que a tela mostrava (409
  `missao-alterada` se outra pessoa editou antes). Depois da primeira
  publicação só mudam título, descrição, instruções e código, e o `fim` só
  prorroga (data futura e depois da atual) ou sai; o resto, ou encurtar o
  prazo, responde 409 `missao-publicada` com a lista `campos`. Veja Ciclo
  de vida.
- `POST /:id/ativar` (publicar) e `POST /:id/desativar` (arquivar):
  idempotentes. Publicar não notifica na hora: o aviso sai quando a missão
  fica visível para o aluno (veja abaixo).
- `DELETE /:id`: 204. Só rascunho nunca publicado e sem conclusões; missão
  publicada ou arquivada responde 409 `missao-publicada` (arquive).
- `POST /:id/codigo` com `{ minutos }` (1 a 120): libera o código por esse
  tempo, recomeçando a contagem; 422 `sem-codigo` (requisito sem código),
  `missao-nao-publicada` ou `fora-do-periodo`. `DELETE /:id/codigo` fecha na
  hora. Os dois devolvem a missão e não mudam o `atualizadoEm`.

## Ciclo de vida

O estado sai de `ativa` e `publicada_em` (`estadoDaMissao`):

| Estado | `ativa` | `publicada_em` | O que dá para fazer |
|---|---|---|---|
| `rascunho` | não | vazio | Editar tudo, publicar, excluir |
| `publicada` | sim | primeira publicação | Editar título, descrição, instruções e código; prorrogar o prazo; arquivar |
| `arquivada` | não | primeira publicação | As mesmas edições; publicar de novo, com a mesma regra e recompensa |

- Congelados depois da primeira publicação: `tipo`, `xp`, `publico`,
  `requisito`, `quantidade`, `alvoId`, `alvoIds` e `inicio`. A versão que o
  aluno viu (e as conclusões já gravadas) fica com o mesmo XP e os mesmos
  critérios. Para mudar, arquive e crie outra missão.
- O `fim` só prorroga: data depois da atual, ou sem prazo. Encurtar, ou criar
  prazo numa missão que não tinha, tiraria tempo de quem já está fazendo
  (409 `missao-publicada`, `campos: ['fim']`). Para encerrar antes, arquive.
- `publicada_em` nunca é sobrescrito: republicar uma arquivada mantém a
  primeira publicação e a janela de progresso.
- A primeira publicação exige todos os pontos do roteiro ativos (422
  `alvo-invalido`). Republicar uma arquivada exige só um: os desativados
  saem da meta de quem não os coletou (veja Requisitos).
- Exceção: missão antiga sem requisito (de antes dos requisitos, invisível
  para o aluno) pode receber o primeiro requisito, com meta e pontos. Se já
  tinha sido publicada, continua publicada ou arquivada, com XP, tipo,
  público e início congelados, e a janela recomeça (`publicada_em` vira
  agora). Se nunca foi publicada, continua rascunho.

## Público

`publico` diz quem vê a missão: `TODOS` (qualquer participante do ciclo),
`PADRINHOS` ou `APADRINHADOS` (só quem tem esse papel no ciclo). O filtro
(`sqlMissaoAlcancavel`) vale na listagem, na conclusão (404 para quem não é do
público) e no aviso de missão nova. `APADRINHADOS` com `FEED_PUBLICACOES` é
recusado (400 e CHECK `ck_missoes_publico_requisito`): só padrinho com dupla
publica no feed.

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
| Missão visível para o aluno (publicada, no período, do público dele, aluno participante do ciclo) e aberta depois que ele entrou no ciclo; gerada quando ele consulta o sino | `MISSAO_NOVA` | `missao-nova:<id>` |
| Subida de nível (missão ou totem) | `NIVEL_SUBIU` | `nivel:<numero>` |
| Resgate entregue / cancelado | `RESGATE_ENTREGUE` / `RESGATE_CANCELADO` | `resgate-entregue:<id>` / `resgate-cancelado:<id>` |
| Coordenação aprova, recusa ou revoga a aprovação da candidatura (a revogação chega como "Aprovação revogada"); gerada depois do commit da decisão | `CANDIDATURA_APROVADA` / `CANDIDATURA_NAO_APROVADA` | `candidatura:<ciclo>:<data da decisão>` |
| Novo par no ciclo (padrinho ganhou apadrinhado, apadrinhado ganhou ou trocou de padrinho); gerada quando ele consulta o sino | `VINCULO_CONFIRMADO` | `vinculo:<ciclo>:<participação do par>` |

Os textos ficam em `src/notificacoes/notificacoes.ts`. O aviso de resgate
depende da entrega e do cancelamento da lojinha (F29). O de candidatura sai
do `CoordenacaoService` (`criarParaEmail`); uma nova decisão gera um novo
aviso, a mesma decisão não repete. O de vínculo sai uma vez por par, pela
sincronização do sino, para não acoplar o matching (#73) às notificações: o
primeiro do ciclo dá as boas-vindas ("Seu padrinho foi definido!", "Seu
apadrinhamento começou!"), e trocar de padrinho ou ganhar outro apadrinhado
no mesmo ciclo gera um novo aviso ("Você tem um novo padrinho!", "Você tem um
novo apadrinhado!"). Os pares vêm dos vínculos ativos do matching, com o
grupo antigo como reserva.

Links: `/missoes`, `/perfil`, `/lojinha/resgates/<id>`, `/candidatura` e
`/dupla`. Na web, `/candidatura` abre `/aluno/candidatura` e `/dupla` abre
`/aluno/padrinho`; no app, `/candidatura` abre o acompanhamento da candidatura
e `/dupla` abre a tela do padrinho (apadrinhado) ou o Início, onde o padrinho
vê os apadrinhados.

Encontros e convites ainda não geram aviso: dependem da agenda de encontros
(F30, #49) e da confirmação de presença (F31, #50). Quando esses eventos
existirem, entram como novos tipos com chave por encontro, sem migration.

Não há push nem websocket: web e app consultam ao abrir, ao focar a tela e ao
abrir o painel do sino. A preferência de alertas fica no cliente
(`notificacoesApp` na web, `notificacoesAvisos` no app) e só esconde o badge.

## Telas

- App (aluno): aba Missões (`tela_missoes.dart`) para quem participa do ciclo,
  com ou sem par, com limites da semana e do ciclo, filtros, detalhe e o aviso
  de ganho limitado; a lista recarrega ao voltar para a aba e ao reabrir o
  app. O detalhe mostra as instruções da coordenação, até quando o código
  vale e, na exploração com roteiro, os pontos coletados, os que faltam e os
  desativados (que não contam). Sino da Home com a contagem
  real (`CentralNotificacoes`, `painel_notificacoes.dart`); tocar numa
  notificação marca como lida e abre a tela dela (Missões, Perfil, Meus
  resgates, acompanhamento da candidatura ou dupla). O cartão local "Seu
  padrinho foi definido!" some quando o aviso `VINCULO_CONFIRMADO` já está na
  lista.
- Web (aluno): painel do sino em `AlunoLayout.jsx`, com notificações e
  comunicados.
- Web (coordenação): `MissoesPage.jsx`, com métricas, busca, abas por
  estado (publicadas, rascunhos, arquivadas), criar/editar com público,
  instruções e roteiro de PucStops, publicar/arquivar (também em lote) e
  excluir rascunho. Depois da publicação, os campos congelados ficam
  travados no formulário. "Liberar código" (menu da missão publicada de
  `CODIGO` ou `EVENTO`) mostra o código, libera por 5 a 60 minutos com
  contagem regressiva e encerra antes; a lista marca "Código até HH:MM".
