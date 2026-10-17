# ADR-0005 — Schema `mapa` + PostGIS

> Estado: IMPLEMENTADO no banco local e no Supabase (Tarefa 7, 17/10/2026). Ver
> [banco/migrations.md](../banco/migrations.md).

## Contexto

O banco do Ajuda-aí (Postgres via Supabase) usava só o schema `feed`, sem
PostGIS; o ambiente local rodava `postgres:16-alpine`, também sem PostGIS. O
domínio de mapa (prédios, áreas, salas, grafo de navegação) precisa de tipos e
operações geoespaciais. Havia ainda uma dívida de baseline: só uma migration
incremental, com o resto de `feed` criado por `synchronize`.

## Decisão

- Tabelas do domínio de mapa no **schema separado `mapa`**; nada de `feed` é
  movido ou renomeado.
- **Baseline antes de qualquer tabela nova**: `BaselineFeed1791900000000`,
  anterior à incremental e que reconhece bancos existentes pelo estado real
  (detalhes em [banco/migrations.md](../banco/migrations.md)).
- **PostGIS por migration**, no schema `extensions` (padrão do Supabase). Se já
  existir em outro schema, é usado onde está; migrations e importador
  qualificam tipos/funções com o schema real. `unaccent` também, para a futura
  busca. **pgRouting não é instalado** (rotas em memória, ADR-0003).
- Local: `postgis/postgis:16-3.5-alpine`, mesma base Alpine do volume existente,
  `search_path` igual ao do Supabase e sem o init automático da imagem.
- `installExtensions: false` no DataSource do CLI e do importador: o TypeORM não
  instala extensões sozinho ao conectar.
- Modelo no padrão do banco do Ajuda-aí (português, snake_case):

| PUCMaps | Ajuda-aí | Chave |
|---|---|---|
| `map_versions` | `mapa.versoes` | `id` uuid; `codigo` único (ex.: `pucmaps-12`) |
| `buildings` | `mapa.predios` | (`versao_id`, `id` estável do footprint / `GATE_<código>`) |
| `rooms` | `mapa.salas` | (`versao_id`, `id`) |
| `areas` | `mapa.areas` | (`versao_id`, `id`) |
| `graph_nodes` | `mapa.nos_grafo` | (`versao_id`, `id`) |
| `graph_edges` | `mapa.arestas_grafo` | (`versao_id`, `id`) |

- Geometria PostGIS real, **SRID 4326**, tipo fixo por coluna (`Point`,
  `Polygon`, `LineString`) e `CHECK ST_IsValid`; GeoJSON textual não é fonte.
- FKs compostas com `versao_id`: nó, aresta, sala e prédio sempre da mesma
  versão. **Nenhuma cascata** (`ON DELETE RESTRICT`): versão é histórico.
- **Uma única versão `ativa`** (índice único parcial). Versão importada é
  imutável: reimportar o mesmo código exige o mesmo hash de conteúdo.
- Estrutura por migration; dados por script idempotente a partir de um snapshot
  versionado no Git (não por seed dentro de migration).

## Consequências

- Mapa visual (Flutter) continua sem depender do banco; a Tarefa 8 pode expor a
  versão ativa por API sem mudar o schema.
- Um banco totalmente novo precisa de `CREATE SCHEMA feed` antes da primeira
  migration (limitação do TypeORM ao criar `feed.migrations`).
- O reconhecimento automático da baseline depende de as 7 tabelas terem todas as
  colunas esperadas; um `feed` divergente exige análise manual (falha segura).
- Leituras de geometria pelo TypeORM dependem do `search_path` incluir o schema
  do PostGIS (garantido no Supabase e no compose).
- Supabase: PostGIS 3.3.7 e unaccent 1.1 instalados em `extensions`; pgRouting
  3.4.1 disponível e não instalado. Migrations aplicadas e `pucmaps-12`
  importada e ativa, sem alterar `feed` (exceto o registro das migrations) nem
  `public`; backup prévio validado por restauração.

## Histórico

| Data | Decisão |
|---|---|
| 2026-10-17 (Fase 0) | Schema `mapa` separado; PostGIS antes das tabelas geo; baseline antes da primeira migration de `mapa`. |
| 2026-10-17 (Tarefa 7) | Baseline anterior à incremental com reconhecimento por estado; PostGIS/unaccent em `extensions`; 6 tabelas em português com chave por versão, FKs compostas sem cascata, SRID 4326; snapshot `pucmaps-12` importado no banco local. |
| 2026-10-17 (Tarefa 7, aplicação) | Aplicado no Supabase após preflight somente leitura e revisão humana: 3 migrations em uma transação, `pucmaps-12` ativa, zero inconsistências, `feed`/`public` preservados. |
