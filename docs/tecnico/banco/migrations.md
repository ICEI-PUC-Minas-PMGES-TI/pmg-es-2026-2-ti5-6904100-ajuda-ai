# Migrations — baseline, PostGIS e schema `mapa`

> Estado: ATUAL (Tarefa 7). Baseline, PostGIS e schema `mapa` implementados e
> aplicados no banco local e no **Supabase** (17/10/2026, com backup validado;
> ver [Supabase](#supabase)).

## Estado encontrado (auditoria de 17/10/2026)

| Item | Supabase (`feed`) | Local (docker, `feed`) |
|---|---|---|
| PostgreSQL | 17.6 | 16.13 (`postgres:16-alpine`) |
| Tabelas | `avisos`, `comentarios`, `curtidas`, `formularios`, `participacoes`, `programas`, `publicacoes`, `usuarios` + `migrations` | as mesmas 8, sem `migrations` (+ schema `teste_telas`) |
| Origem das tabelas | 7 por `synchronize`; `usuarios` e `programas.requisitos_padrinho` pela migration | todas por `synchronize` |
| `feed.migrations` | 1 linha: `UsuariosERequisitosPadrinho1791944105933` | não existe |
| Dados | 6 usuários, 2 programas, 6 participações | vazio |
| Extensões | `pgcrypto`, `uuid-ossp`, `pg_stat_statements` em `extensions`; PostGIS 3.3.7, pgRouting 3.4.1 e unaccent 1.1 **disponíveis, não instalados** | nenhuma; PostGIS indisponível na imagem |
| `search_path` do papel `postgres` | `"$user", public, extensions` | `"$user", public` |

- Estrutura de `feed` idêntica nos dois (nomes de PK/FK/índices gerados pelo
  TypeORM); só muda a ordem de duas colunas de `participacoes`.
- `public` do Supabase tem tabelas de outro sistema (`Aluno`, `Totem`, …). Nada
  desta tarefa lê ou altera `public`.
- TypeORM 1.1.1. Migrations em `src/migrations`, tabela `feed.migrations`
  (`data-source.ts`, schema `DB_SCHEMA`, `synchronize: false`).

**Conclusão:** uma baseline “completa” colidiria com a migration incremental
(ela também cria `usuarios` e altera `programas`); e, no banco local, a própria
incremental falharia, porque `usuarios` já existe e não há registro dela.

## Estratégia escolhida

Combinação de A + C (alternativas da tarefa), sem registro manual na tabela de
migrations:

1. **Baseline com timestamp anterior à incremental** —
   `1791900000000-BaselineFeed`: o schema `feed` como era ANTES da incremental
   (7 tabelas, sem `usuarios` e sem `requisitos_padrinho`), copiado do Supabase.
2. **Reconhecimento pelo estado real** (não por flag):
   - nenhuma das 7 tabelas → cria tudo (banco novo);
   - as 7 tabelas com todas as colunas da baseline → não altera nada; o TypeORM
     só a registra como executada (Supabase, banco local);
   - qualquer outra coisa → falha sem tocar no banco.
3. **Proteção na incremental** — `UsuariosERequisitosPadrinho` pula quando
   `usuarios` (com todas as colunas) e `programas.requisitos_padrinho` já
   existem; estado parcial falha. Não muda nada onde ela já rodou (Supabase).
4. O TypeORM 1.1 executa pendentes mesmo com timestamp anterior à última
   executada (conferido em `MigrationExecutor`; a checagem está comentada no
   código da biblioteca). No Supabase a baseline roda depois da incremental.

Por que não `IF NOT EXISTS` em cada comando: esconderia estruturas divergentes.
Por que não marcar a baseline à mão em `feed.migrations`: a própria migration
verifica o estado e se registra, sem passo manual nem SQL fora do controle.

### Ordem das migrations

| # | Migration | Efeito |
|---|---|---|
| 1 | `1791900000000-BaselineFeed` | 7 tabelas de `feed` (ou reconhecimento) |
| 2 | `1791944105933-UsuariosERequisitosPadrinho` | `usuarios` + `programas.requisitos_padrinho` (ou reconhecimento) |
| 3 | `1792263378656-HabilitaPostgisESchemaMapa` | schema `extensions`, `postgis`, `unaccent`, schema `mapa` |
| 4 | `1792263378657-CriaTabelasMapa` | 6 tabelas de `mapa` (ver [dados-geo.md](../mapa/dados-geo.md)) |

### Rollback

| Migration | `down` |
|---|---|
| BaselineFeed | **recusa sempre**: num banco existente ela não criou nada; num banco novo, recriar o banco é mais seguro que derrubar `feed` |
| UsuariosERequisitosPadrinho | inalterado: recusa se houver usuários/requisitos (salvo `MIGRATION_DOWN_DESCARTAR_DADOS=true`) |
| HabilitaPostgisESchemaMapa | remove só o schema `mapa` vazio (`RESTRICT`); extensões ficam (podem ser anteriores ou usadas por outros schemas) |
| CriaTabelasMapa | recusa se houver versão importada (salvo `MIGRATION_DOWN_DESCARTAR_DADOS=true`) |

## Como aplicar

### Banco novo (vazio)

```sql
CREATE SCHEMA IF NOT EXISTS feed;  -- único passo manual
```

```powershell
cd code\back\api
npm run migration:run
```

O passo manual existe porque o TypeORM cria `feed.migrations` antes de rodar a
primeira migration e não cria o schema. As 4 migrations executam; o resultado
bate com as entidades (teste A).

### Banco existente criado por `synchronize` (ex.: local)

Só `npm run migration:run` (com `DB_*` apontando para o banco certo). Baseline e
incremental são reconhecidas; dados preservados (teste B). Feito no banco local
em 17/10/2026: 4 executadas, `feed` intacto (9 tabelas = 8 + `migrations`),
`teste_telas` intacto.

### Supabase

> APLICADO E VALIDADO em 17/10/2026, depois de preflight somente leitura e de
> revisão humana. Nenhuma divergência em nenhuma etapa.

**Preflight (somente leitura).** Sessão com `default_transaction_read_only=on`
(o servidor recusaria qualquer escrita). As migrations pendentes foram rodadas
contra um QueryRunner que encaminhava só SELECTs e registrava o resto: a
baseline gerou 0 comandos; as duas migrations do mapa, 21 comandos, todos
`CREATE` em `extensions`/`mapa`, nada em `feed` ou `public`.

**Backup.** O host direto do Supabase é só IPv6 e o Docker local não tem IPv6;
o backup usou o **Session pooler** (IPv4, porta 5432) com `pg_dump` 17 em
container, TLS `verify-full` com `certs/supabase-ca.crt`. A URL do pooler fica
no `.env` local (`SUPABASE_POOLER_URL`, fora do Git) e é passada ao container
por variável de ambiente, sem aparecer em comando ou log.

| Arquivo | Conteúdo | Tamanho |
|---|---|---|
| `feed.dump` (`pg_dump -n feed -Fc`) | estrutura + dados de `feed` | 27.580 B |
| `estrutura-completa.sql` (`pg_dump --schema-only`) | estrutura do banco inteiro | 335.151 B |

Guardados fora do repositório (contêm e-mails de usuários). Validação:
`pg_restore` de `feed.dump` num PostgreSQL 17 descartável; contagem e md5 do
conteúdo das 9 tabelas iguais aos do preflight.

**Aplicação.**

| # | Passo | Resultado |
|---|---|---|
| 1 | `npm run migration:show` | igual ao preflight: só a incremental executada |
| 2 | `npm run migration:run` | 3 migrations em uma transação (`COMMIT`): 21 `CREATE` + 3 `INSERT` em `feed.migrations`; nenhum `ALTER`/`DROP`/`TRUNCATE` |
| 3 | verificações pós-migration | 4 migrations executadas; `postgis` 3.3.7 e `unaccent` 1.1 em `extensions`; sem pgRouting; 6 tabelas vazias em `mapa`; 7 colunas geométricas em SRID 4326 |
| 4 | `npm run mapa:importar -- scripts/mapa/dados/pucmaps-12.json --ativar --confirmar-remoto` | importada e ativa |
| 5 | repetição da importação | “já importada (mesmo hash; nada reescrito)” |
| 6 | `npm run mapa:importar -- --relatorio` | zero inconsistências (ver [dados-geo.md](../mapa/dados-geo.md#resultado-da-importação)) |

Ordem final em `feed.migrations`: 1 `UsuariosERequisitosPadrinho`, 2
`BaselineFeed` (no-op), 3 `HabilitaPostgisESchemaMapa`, 4 `CriaTabelasMapa`.

**Dados preservados.** Contagem e md5 do conteúdo de `feed` medidos antes, depois
da migration, depois da importação e depois da reimportação: idênticos (6
usuários, 2 programas, 6 participações; demais tabelas vazias). A única mudança
em `feed` são as 3 linhas novas de `feed.migrations` (a linha `id=1` não mudou).
`public` (33 objetos do outro sistema) com o mesmo hash antes e depois.

**Segurança.** Schema `mapa` criado por `postgres` sem ACL: `anon` e
`authenticated` não têm `USAGE`, e nenhum privilégio padrão do Supabase se
aplica a ele; fica fora da API pública do Supabase, como `feed`. A tabela
`spatial_ref_sys` do PostGIS ficou em `extensions`.

**Se precisar desfazer** (não foi necessário):

1. Só os dados do mapa: `MIGRATION_DOWN_DESCARTAR_DADOS=true npm run migration:revert`
   (reimportáveis do snapshot).
2. O schema `mapa` vazio: mais um `npm run migration:revert`.
3. A baseline não é revertida (recusa); como não criou nada, basta apagar a sua
   linha de `feed.migrations`.
4. Extensões: `DROP EXTENSION unaccent; DROP EXTENSION postgis;` (sem CASCADE),
   se desejado.
5. `feed`: o backup só seria usado se algum md5 de `feed` divergisse.

## PostGIS

- **Supabase:** PostGIS 3.3.7 e unaccent 1.1 instalados pela migration no
  schema `extensions` (17/10/2026). pgRouting disponível (3.4.1), **não**
  instalado.
- **Local:** imagem trocada de `postgres:16-alpine` para
  `postgis/postgis:16-3.5-alpine` (PostgreSQL 16.15, PostGIS 3.5.7). Mesma base
  Alpine/musl: o volume existente (`ajuda-ai_postgres-data`) é reaproveitado sem
  risco de colação diferente. Porta (5433), env e volume iguais.
- `code/postgres-init/` substitui o init da imagem, que num volume novo
  instalaria `postgis`, `postgis_topology` e `postgis_tiger_geocoder` em
  `public`. Assim o local fica como o Supabase: extensões só pela migration,
  em `extensions`.
- `search_path`: o compose passa `-c search_path="$user", public, extensions`
  (o mesmo do papel `postgres` no Supabase).
- As migrations e o importador **não dependem** do `search_path`: descobrem o
  schema real do PostGIS (`pg_extension`) e qualificam tipos e funções
  (`extensions.geometry(Polygon, 4326)`). Se o PostGIS já existir em outro
  schema (ex.: `public`), é usado onde está (teste E).
- Leitura de geometria pelo TypeORM (`ST_AsGeoJSON` sem schema) **depende** do
  `search_path` incluir o schema do PostGIS — verdade no Supabase e no compose.
- `installExtensions: false` no `data-source.ts` e no importador: por padrão o
  TypeORM roda `CREATE EXTENSION postgis` ao conectar quando há entidade com
  geometria, o que instalaria o PostGIS em `public` no Supabase antes da
  migration. O `AppModule` ainda não registra entidades de `mapa`; quando
  registrar (Tarefa 8), precisa da mesma opção.

### Trocar a imagem no ambiente local (sem perder dados)

```powershell
docker exec ajuda-ai-postgres pg_dump -U ajudaai -d ajudaai > backup.sql   # opcional
cd code
docker compose -p ajuda-ai up -d postgres   # recria o container; o volume fica
```

Nunca usar `docker compose down -v` (apaga o volume). O projeto compose se chama
`ajuda-ai` (nome do container/volume); sem `-p ajuda-ai` o Compose tenta criar
outro container com o mesmo nome e falha.

## Testes

- `src/migrations/migrations.spec.ts` (sem banco): baseline em banco novo,
  existente e parcial; recusa de rollback; proteção da incremental.
- `test/mapa-banco.integration.spec.ts` (PostGIS real e descartável; pulado sem
  `MAPA_TEST_DB_URL`):

```powershell
docker run -d --name mapa-teste -p 55432:5432 -e POSTGRES_PASSWORD=teste postgis/postgis:16-3.5-alpine -c 'search_path="$user", public, extensions'
$env:MAPA_TEST_DB_URL='postgres://postgres:teste@localhost:55432/postgres'; npx vitest run test/mapa-banco
```

| Cenário | Verifica |
|---|---|
| A — banco vazio | 4 migrations; PostGIS em `extensions`; sem pgRouting; schema igual às entidades (`createSchemaBuilder().log()` vazio) |
| B — `synchronize` sem `migrations` | 4 executadas sem alterar `feed`; dado preservado; schema igual às entidades |
| C — estado do Supabase | só baseline + mapa; 2ª execução sem pendentes; rollback para na baseline; dado preservado |
| D — `feed` parcial | baseline recusa; nada criado |
| E — PostGIS já em `public` | usa o existente; colunas `geometry(Polygon,4326)` |

Único falso positivo conhecido na comparação entidades × banco: default de
array de `publicacoes.imagens` (já registrado na incremental).
