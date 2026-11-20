# Lojinha de recompensas

Migrations no schema `gamificacao`:

- `1792800000000-LojinhaResgates`: catálogo mínimo e `resgates` (comprovante
  imutável de cada troca).
- `1792900000000-LojinhaRecompensas` (F27): cadastro completo. Converte o
  catálogo mínimo (`publicada` → `status`; `estoque` restante → `estoque_total`
  + `estoque_comprometido`), cria `recompensa_versoes` e
  `recompensa_estoque_ajustes` e liga cada resgate à versão resgatada
  (`resgates.versao`; os antigos ficam na v1).
- `1793500000000-CodigoResgates` (F28): `resgates.codigo`, código curto e
  único do comprovante (10 caracteres hexadecimais em maiúsculas).
- `1794100000000-ProgramaRecompensasFk`: `recompensas.programa_codigo`
  passa a ser FK de `programas.codigo` (RESTRICT). Excluir um programa com
  recompensas restritas a ele dá 409; recompensas órfãs fazem a migration
  recusar e listar os códigos.
- `1794200000000-EntregaResgatesEAjustesXp` (F29/F26): `resgate_desfechos`
  (entrega ou cancelamento, no máximo um por resgate) e `xp_ajustes`.

As duas últimas eram `1793700000000` e `1793600000000` na branch
`Arthur_gv`, os mesmos timestamps de duas migrations da Sprint-6, e foram
renomeadas para rodar depois de `1794000000000-GamificacaoNiveisMoedasCiclos`. Num banco que já as aplicou com o nome antigo,
elas detectam a estrutura existente e não fazem nada.

Execute as migrations da API antes de usar os endpoints.

## Cadastro pela coordenação (F27)

Rotas em `/coordenacao/recompensas` (perfil `coordenador`; tela "Lojinha" do
painel web). Código em `src/gamificacao/recompensas/`.

- `GET /` (`?status=`), `GET /:id` (com versões e ajustes de estoque).
- `POST /`: `nome`, `descricao`, `custoXp`, `condicoesRetirada`,
  `estoqueIlimitado` e `estoqueInicial` (se limitado); opcionais `imagemUrl`
  (https), `limitePorAluno`, `publico` (`todos`, `padrinhos`, `apadrinhados`),
  `programaCodigo`, `disponivelDe`/`disponivelAte` (ISO com fuso) e `publicar`.
- `PATCH /:id`: mudar nome, descrição, imagem, custo ou condições cria nova
  versão; resgates anteriores mantêm a sua.
- `POST /:id/estoque`: `{ tipo: reposicao | correcao | limitado | ilimitado,
  quantidade?, motivo }`, com responsável. O total nunca fica abaixo do
  comprometido (API e CHECK).
- `PATCH /:id` e `POST /:id/estoque` exigem o `atualizadoEm` que a tela
  mostrava. Se outra pessoa da coordenação alterou a recompensa depois disso,
  respondem 409 `recompensa-alterada` sem gravar nada. Resgates de alunos não
  mudam `atualizadoEm`, então não invalidam um formulário aberto.
- `POST /:id/publicar`, `/desativar`, `/arquivar`; `DELETE /:id` só sem
  resgates (com resgates: 409 `recompensa-com-transacoes`, arquive).

Status: `rascunho` → `publicada` ⇄ `inativa`; `arquivada` é só leitura.

## Consulta e resgate pelo aluno

Rotas em `/me/lojinha` (perfis `padrinho` e `apadrinhado`). Código em
`src/gamificacao/lojinha/`.

Lista, detalhe e resgate exigem participação ativa: status `aprovado` ou
`em_andamento` no papel do token (para padrinho, candidatura aprovada também
conta). Sem isso, 403 com `motivo: 'sem-participacao'`. Histórico e
comprovante continuam abertos depois do fim do semestre.

- `GET /me/lojinha`: recompensas publicadas, dentro da vigência, do público
  do aluno e, quando restritas a um programa, só para quem participa
  ativamente dele. `estoque` é o disponível agora (`null` = ilimitado);
  inclui `limitePorAluno` e `resgatesFeitos`. O saldo vem de `GET /me/xp`.
- `GET /me/lojinha/:id`: detalhe com as mesmas regras (404 quando não é
  visível ao aluno).
- `POST /me/lojinha/:id/resgatar`: recebe uma UUID v4 em `chaveIdempotencia`
  e a `versao` e o `custoXp` que o aluno viu na revisão. Repetir a mesma chave
  devolve o mesmo resgate. Respostas: 404 indisponível, 409 esgotada, limite
  por aluno atingido ou recompensa alterada desde a revisão
  (`motivo: 'recompensa-alterada'`, com a versão e o custo atuais; nada é
  debitado), 422 saldo insuficiente. A
  resposta inclui `codigo`, `versao`, `saldoApos` e `saldoAtual`.
- `GET /me/lojinha/resgates`: histórico do aluno, com `codigo`, nome,
  descrição, custo, condições e versão preservados no momento da troca, mais
  a `imagemUrl` atual da recompensa.
- `GET /me/lojinha/resgates/:id`: comprovante de um resgate do próprio aluno
  (404 para resgate de outra pessoa).
- O débito aparece no extrato em `GET /me/xp/movimentacoes`.

O resgate trava a carteira, confere a chave, confere a participação ativa,
trava a recompensa, valida visibilidade,
estoque, limite e saldo e grava o débito no ledger (`tipo = 'RECOMPENSA'`,
`referencia_tipo = 'RESGATE'`), `estoque_comprometido + 1` e o comprovante na
mesma transação. Concorrência na última unidade é coberta por
`test/recompensas.integration.spec.ts`.

## App (F28)

`tela_resgatar.dart`: lojinha com saldo, itens e a situação de cada um
(estoque, esgotado, limite atingido ou XP que falta), detalhe e revisão da
troca. Ao confirmar, o detalhe é trocado pelo comprovante e voltar leva à
lista atualizada. `tela_resgates.dart`: comprovante com o código, "Meus
resgates" e extrato de XP paginado. Condições de retirada com várias linhas
aparecem em tópicos.

Com a F29, o comprovante e "Meus resgates" mostram a situação: **aguardando
retirada** (com o aviso para apresentar o código), **entregue** (com a data)
ou **cancelado** (com o motivo e a devolução das moedas). Resposta antiga sem
`situacao` conta como aguardando. Testes em `test/resgate_situacao_test.dart`.

## Entrega e cancelamento (F29)

Rotas em `/coordenacao/resgates` (perfil `coordenador`). Código em
`src/gamificacao/resgates/`.

- `GET /`: até 200 resgates, mais recentes primeiro, com participante,
  recompensa (e programa), custo, data, situação, datas de entrega ou
  cancelamento, motivo e responsável. Filtros: `situacao`
  (`aguardando_entrega`, `entregue`, `cancelado`), `programa`,
  `recompensaId` e `busca` (nome, e-mail ou código do comprovante).
- `GET /:id`: o mesmo item.
- `POST /:id/entregar`: grava a entrega com o responsável do token e a data.
  A unidade continua comprometida (saiu do estoque).
- `POST /:id/cancelar`: `{ motivo }` (3 a 300 caracteres). Na mesma
  transação: devolve as moedas (movimentação `RECOMPENSA` positiva, chave
  `estorno:<id>`, referência `RESGATE`), devolve a unidade
  (`estoque_comprometido - 1`) e grava o desfecho com motivo e responsável.

Resgate já entregue ou cancelado: 409 (`resgate-entregue` ou
`resgate-cancelado`). O UNIQUE de `resgate_desfechos.resgate_id` e a chave
do estorno impedem dupla entrega, duplo estorno e dupla devolução mesmo sob
concorrência (o cancelamento trava carteira, resgate e recompensa nessa
ordem, a mesma do resgate do aluno). Desfechos são só de inserção; o resgate
original nunca muda.

O aluno vê `situacao`, `entregueEm`, `canceladoEm` e `motivoCancelamento` no
histórico e no comprovante (`/me/lojinha/resgates`), só dos próprios
resgates. Testes em `test/resgates-xp.integration.spec.ts`.

Contrato completo das rotas (parâmetros, respostas e erros), para o app da
coordenação: [api-coordenacao-lojinha](api-coordenacao-lojinha.md).

## Telas da coordenação (web)

- **Resgates** (`/coordenacao/resgates`, `ResgatesPage.jsx`): lista com
  filtro por programa (na API) e por situação e busca (nome, e-mail ou
  código, na própria tela). Ações "Entregar" e "Cancelar"; o cancelamento pede
  o motivo e avisa que as moedas e a unidade voltam e que o XP não muda. Em
  409, a tela recarrega o item. O filtro `recompensaId` da API não é usado
  na web.
- **XP e moedas** (`/coordenacao/xp`, `XpPage.jsx`): busca de participantes
  com moedas, XP acumulado e nível; extrato paginado; histórico de ajustes e
  formulário de ajuste (±200, motivo obrigatório). A chave de idempotência é
  gerada com o formulário e só é trocada depois de um ajuste gravado, então
  um reenvio após erro de rede não lança duas vezes.

Testes em `code/front/test/resgates-xp.test.mjs`.

## Moedas, XP e estorno

- O resgate debita **moedas** (`custoXp` é o nome histórico do custo); o XP
  acumulado e o nível não caem.
- O estorno (cancelamento pela coordenação) devolve as mesmas moedas, como
  movimentação `RECOMPENSA` positiva com `xp = 0`, e a unidade volta ao
  estoque. É lançamento novo no ledger: o débito original continua lá.
- A entrega não mexe em saldo nem em estoque (a unidade já estava
  comprometida desde o resgate).
- Um resgate cancelado **continua contando** no `limitePorAluno` (decisão em
  aberto, abaixo).

## Encerramento do programa (DP-07)

Quando a participação termina, o ex-participante mantém XP, nível e moedas e
continua consultando o histórico e os comprovantes, mas não lista nem
resgata recompensas (`podeUsarLojinha = false` → 403 `sem-participacao`).
Resgates aguardando retirada continuam válidos para a coordenação entregar
ou cancelar. XP e moedas não expiram. Se o grupo decidir por expiração, ela
deve entrar no ledger como movimentação própria, sem apagar linhas.

## Ainda pendente

- Decisões do grupo (F29): prazo de retirada, cancelamento pelo próprio aluno,
  recompensas digitais e se um resgate cancelado volta a liberar o
  `limitePorAluno` (hoje continua contando).
- Telas de entrega/cancelamento e ajustes no app mobile da coordenação
  (contrato pronto em [api-coordenacao-lojinha](api-coordenacao-lojinha.md)).
- Upload de imagem (hoje é URL https).
