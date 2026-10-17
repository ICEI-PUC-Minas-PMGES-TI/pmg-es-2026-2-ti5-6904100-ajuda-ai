# Migrations — estado atual e dívida de baseline

> Estado: ATUAL (descrição do estado real) + PLANEJADO (seção "O que precisa acontecer antes do schema `mapa`")

## Estado real confirmado em código

- O backend usa TypeORM com `synchronize` controlado por `src/config/seguranca.ts`. Esse controle só permite `synchronize` (e seed de dados de demonstração) quando o host do banco é local e o ambiente não é produção.
- A pasta de migrations (`code/back/api/src/migrations/`) contém **uma única migration**, incremental: ela cria a tabela `usuarios` e adiciona a coluna `requisitos_padrinho` em `programas`.
- Todo o restante do schema `feed` (demais tabelas: `participacoes`, `programas`, `formularios`, `avisos`, `publicacoes`, `curtidas`, `comentarios`, etc.) foi criado historicamente por `synchronize`, não por migration.
- O `data-source.ts` (usado pelo CLI de migrations) aponta para `schema: DB_SCHEMA ?? 'feed'`, `synchronize: false`, `migrationsRun: false`.
- O ambiente de produção/Supabase usado pelo projeto está configurado com `DB_SYNCHRONIZE=false`, ou seja, depende das migrations para qualquer alteração de schema — mas a maior parte do schema atual não tem migration correspondente.
- O ambiente local (`docker-compose.yml`) usa a imagem `postgres:16-alpine`, sem PostGIS.

## Dívida de baseline

Não existe uma migration de "baseline" que recrie, do zero, o schema `feed` como ele existe hoje. Isso significa:

- Um banco novo, criado só rodando as migrations existentes, **não chega ao estado atual** — falta todo o schema que veio de `synchronize`.
- Qualquer migration nova que dependa de tabelas criadas por `synchronize` (por exemplo, uma FK para `participacoes`) assume que essas tabelas já existem, o que só é verdade em bancos que passaram pelo `synchronize` em algum momento.

### Risco de colisão

Uma baseline gerada automaticamente a partir do schema atual (`schema:drop` + `schema:sync` + diff, ou equivalente) entraria em conflito com a migration incremental já existente (`UsuariosERequisitosPadrinho`), porque essa migration também cria `usuarios` e altera `programas`. Resolver isso exige uma de duas abordagens, a decidir antes de escrever a baseline:

1. Gerar a baseline com um timestamp **anterior** ao da migration existente, representando o estado do schema *antes* dela — e validar que a sequência completa (baseline → migration incremental) resulta no schema atual.
2. Escrever a baseline com guardas (`IF NOT EXISTS` ou equivalente) e, em bancos que já têm o schema atual (como o Supabase em uso), registrar manualmente a baseline como já executada na tabela de controle de migrations do TypeORM, sem rodá-la de fato.

Nenhuma dessas abordagens foi executada. Esta seção apenas registra o problema e as opções conhecidas.

## O que precisa acontecer antes do schema `mapa`

Conforme [ADR-0005](../decisoes/ADR-0005-schema-mapa-postgis.md):

1. Resolver a dívida de baseline do schema `feed` (uma das duas abordagens acima, ou outra equivalente).
2. Confirmar se o PostGIS pode ser habilitado no projeto Supabase usado (verificação ainda não feita) e, em paralelo, trocar a imagem Postgres local por uma com PostGIS (ex.: `postgis/postgis:16-3.4`).
3. Só então escrever a primeira migration do schema `mapa`.

**Nenhuma migration é criada por esta documentação.** Esta página descreve o estado e o plano; a execução é uma etapa de código separada.

## PostGIS

Não está habilitado em nenhum ambiente hoje (nem Supabase, nem local). É pré-requisito apenas para as tabelas geoespaciais do schema `mapa` (prédios, áreas, salas, grafo), não para o mapa visual inicial, que pode ser servido por um snapshot estático.
