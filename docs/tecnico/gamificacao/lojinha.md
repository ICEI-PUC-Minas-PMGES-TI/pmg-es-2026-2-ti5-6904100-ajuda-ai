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

## Ainda pendente

Entrega e cancelamento de resgates (F29): devolver XP e unidade
comprometida. Upload de imagem (hoje é URL https).
