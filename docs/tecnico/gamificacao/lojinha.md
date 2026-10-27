# Lojinha de recompensas (primeira etapa)

A migration `1792800000000-LojinhaResgates` cria o catálogo e os resgates no
schema `gamificacao`. Execute as migrations da API antes de usar os endpoints.
Recompensas começam despublicadas. `estoque: null` representa estoque
ilimitado; um número representa unidades restantes.

## API

- `POST /coordenacao/recompensas`: cria recompensa com `nome`, `descricao`,
  `custoXp`, `estoque` (opcional) e `condicoesRetirada`.
- `GET /coordenacao/recompensas`: lista todas, inclusive despublicadas.
- `PATCH /coordenacao/recompensas/:id/publicacao`: recebe `{ "publicada": true }`
  ou `false`.
- `GET /me/lojinha`: lista recompensas publicadas.
- `POST /me/lojinha/:id/resgatar`: recebe uma UUID v4 em `chaveIdempotencia`.
  Repetir a mesma chave para o mesmo aluno e recompensa devolve o mesmo resgate.
  A resposta inclui `saldoApos` do resgate e `saldoAtual` da carteira.
- `GET /me/lojinha/resgates`: histórico do aluno, com nome, descrição, custo
  e condições preservados no momento da troca.

Todas as rotas exigem JWT. As rotas de coordenação exigem perfil
`coordenador`; as rotas do aluno aceitam `padrinho` e `apadrinhado`.

O resgate trava a carteira e a recompensa, valida saldo e estoque e grava
movimentação, baixa de estoque e comprovante na mesma transação. O débito
também aparece em `GET /me/xp/movimentacoes`.

## Ainda pendente

Esta etapa não inclui tela administrativa, edição de recompensas, imagem,
reposição auditada de estoque, público específico, vigência, limites por
aluno nem regras de retirada. Também falta um teste de concorrência em
PostgreSQL real para o caso da última unidade.
