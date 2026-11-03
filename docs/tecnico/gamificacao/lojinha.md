# Lojinha de recompensas

Duas migrations no schema `gamificacao`:

- `1792800000000-LojinhaResgates`: catálogo mínimo e `resgates` (comprovante
  imutável de cada troca).
- `1792900000000-LojinhaRecompensas` (F27): cadastro completo. Converte o
  catálogo mínimo (`publicada` → `status`; `estoque` restante → `estoque_total`
  + `estoque_comprometido`), cria `recompensa_versoes` e
  `recompensa_estoque_ajustes` e liga cada resgate à versão resgatada
  (`resgates.versao`; os antigos ficam na v1).

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

- `GET /me/lojinha`: recompensas publicadas, dentro da vigência, do público
  do aluno e, quando restritas a um programa, só para quem participa dele.
  `estoque` é o disponível agora (`null` = ilimitado); inclui
  `limitePorAluno` e `resgatesFeitos`.
- `POST /me/lojinha/:id/resgatar`: recebe uma UUID v4 em `chaveIdempotencia`.
  Repetir a mesma chave devolve o mesmo resgate. Respostas: 404 indisponível,
  409 esgotada ou limite por aluno atingido, 422 saldo insuficiente. A
  resposta inclui `versao`, `saldoApos` e `saldoAtual`.
- `GET /me/lojinha/resgates`: histórico do aluno, com nome, descrição, custo,
  condições e versão preservados no momento da troca.

O resgate trava a carteira e depois a recompensa, valida visibilidade,
estoque, limite e saldo e grava o débito no ledger (`tipo = 'RECOMPENSA'`,
`referencia_tipo = 'RESGATE'`), `estoque_comprometido + 1` e o comprovante na
mesma transação. Concorrência na última unidade é coberta por
`test/recompensas.integration.spec.ts`.

## Ainda pendente

Entrega e cancelamento de resgates (F29): devolver XP e unidade
comprometida. Upload de imagem (hoje é URL https).
