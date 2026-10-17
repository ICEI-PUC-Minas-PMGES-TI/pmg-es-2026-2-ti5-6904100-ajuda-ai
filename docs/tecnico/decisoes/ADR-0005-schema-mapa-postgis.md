# ADR-0005 — Schema `mapa` + PostGIS

> Estado: PLANEJADO (nenhuma tabela criada, nenhuma migration executada)

## Contexto

O banco atual do Ajuda-aí (Postgres via Supabase) usa o schema `feed` para todas as tabelas existentes, sem a extensão PostGIS habilitada. O ambiente local (`docker-compose.yml`) roda `postgres:16-alpine`, também sem PostGIS.

O domínio de mapa (prédios, áreas, salas, grafo de navegação) precisa de tipos geoespaciais (pontos, polígonos, linhas) e de operações geoespaciais (contenção em polígono, distância, interseção), que exigem a extensão PostGIS.

O Ajuda-aí também tem uma dívida de "baseline" de migrations: hoje existe apenas uma migration incremental, e o restante do schema `feed` foi criado historicamente por `synchronize`. Essa dívida é detalhada em [banco/migrations.md](../banco/migrations.md).

## Decisão

- As tabelas do domínio de mapa ficam em um **schema separado, `mapa`**, não dentro de `feed`. Isso isola o domínio novo do legado e evita colisão de nomes.
- O PostGIS é habilitado **antes das tabelas que dependem dele** (prédios, áreas, salas, grafo), não antes do mapa visual. O mapa visual (renderização, busca por um snapshot estático, navegação no app) não depende de PostGIS nem do schema `mapa`.
- A dívida de baseline de migrations do schema `feed` precisa ser resolvida (ver [banco/migrations.md](../banco/migrations.md)) antes que a primeira migration do schema `mapa` seja escrita, para evitar que a baseline futura colida com a migration incremental já existente.
- Nenhuma migration é criada nesta etapa de documentação.

## Consequências

- O mapa visual (fases 1 a 3 da integração) pode avançar sem qualquer alteração de banco.
- A fase de dados geo (fase 4) depende de duas coisas resolvidas antes dela: a baseline de `feed` e a habilitação do PostGIS (local e no Supabase).
- É preciso confirmar, antes da fase 4, se o projeto Supabase usado permite habilitar a extensão `postgis` (e, se aplicável, `pgrouting`) — essa confirmação ainda não foi feita e fica registrada como pendência em [banco/migrations.md](../banco/migrations.md).
