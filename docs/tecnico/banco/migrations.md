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
| 5 | `1792279161187-PucStopsEXpGlobal` | `mapa.pucstops` + schema `gamificacao` (carteiras, ledger, coletas). Ver [PucStops e XP](#pucstops-e-xp-tarefa-10) |

### Rollback

| Migration | `down` |
|---|---|
| BaselineFeed | **recusa sempre**: num banco existente ela não criou nada; num banco novo, recriar o banco é mais seguro que derrubar `feed` |
| UsuariosERequisitosPadrinho | inalterado: recusa se houver usuários/requisitos (salvo `MIGRATION_DOWN_DESCARTAR_DADOS=true`) |
| HabilitaPostgisESchemaMapa | remove só o schema `mapa` vazio (`RESTRICT`); extensões ficam (podem ser anteriores ou usadas por outros schemas) |
| CriaTabelasMapa | recusa se houver versão importada (salvo `MIGRATION_DOWN_DESCARTAR_DADOS=true`) |
| PucStopsEXpGlobal | recusa se houver movimentação de XP ou PucStop (salvo `MIGRATION_DOWN_DESCARTAR_DADOS=true`); remove `gamificacao` (RESTRICT) e `mapa.pucstops`; o resto de `mapa` fica |

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

## PucStops e XP (Tarefa 10)

> Estado: **APLICADA NO SUPABASE em 18/10/2026** (versão do CRUD da
> coordenação), depois de preflight somente leitura, backup validado e revisão
> humana; ver [Aplicação no Supabase](#aplicação-no-supabase-18102026). Banco
> local Docker alinhado à mesma versão no mesmo dia
> ([Banco local](#banco-local-versão-anterior-substituída-18102026)). Nenhum
> PucStop importado: produção começa com zero e a coordenação cadastra pelo CRUD.

Migration `1792279161187-PucStopsEXpGlobal` (só `CREATE`, nada em `feed` além de
FKs que **apontam** para `usuarios`):

| Objeto | Conteúdo |
|---|---|
| `mapa.pucstops` | `id uuid DEFAULT gen_random_uuid()`, `nome` (CHECK não vazio), `localizacao geometry(Point,4326)` (GIST; válida, não vazia, lon/lat no intervalo), `raio_metros` 10..200, `xp` 1..1000, `ativo` (padrão true), `criado_por` → `usuarios.id` (nula, RESTRICT), `criado_em`, `atualizado_em`. Sem `versao_id`, `descricao` nem `origem`: conteúdo da coordenação, nada importado |
| schema `gamificacao` | criado pela migration, sem ACL (como `mapa`) |
| `gamificacao.xp_carteiras` | PK/FK `usuario_id` → `usuarios.id` RESTRICT; `saldo >= 0` |
| `gamificacao.xp_movimentacoes` | identity; FK RESTRICT; CHECKs de tipo/quantidade/referência/saldo; `UNIQUE (chave_idempotencia)`; índice `(usuario_id, id DESC)` |
| `gamificacao.pucstop_coletas` | identity; `pucstop_id uuid`; FKs RESTRICT (usuário, PucStop, movimentação); `UNIQUE (usuario_id, pucstop_id)`; `UNIQUE (movimentacao_id)`; `xp` concedido na coleta (editar o PucStop não muda) |
| `gamificacao.somente_insercao()` | triggers: ledger e coletas recusam UPDATE/DELETE/TRUNCATE |

Sem `synchronize`: não há entidades TypeORM para `gamificacao`/`pucstops`; o
schema de `usuarios` vem de `DB_SCHEMA` como nas outras migrations.

Testes (`test/pucstops-xp.integration.spec.ts` e cenários A–C de
`mapa-banco.integration.spec.ts`, PostGIS real):

| Cenário | Resultado |
|---|---|
| Banco vazio | 5 migrations; schema igual às entidades; `down` + `up` de novo OK |
| Banco de `synchronize` (local) | 5 executadas, dados preservados |
| Estado do Supabase (incremental registrada) | baseline + mapa + PucStops/XP; 2ª execução sem pendentes; rollback até a baseline |
| Com dados | `down` recusado |
| Banco local real (`ajuda-ai-postgres`) | versão anterior revertida e versão definitiva aplicada (18/10/2026); ver abaixo |
| CRUD e histórico (PostGIS de teste, `pucmaps-12` ativa) | 34 testes: CRUD, autorização, limite do campus, edição sem afetar coletas/ledger, desativação sem apagar histórico, 503 sem versão ativa |

### Banco local: versão anterior substituída (18/10/2026)

O `ajuda-ai-postgres` tinha rodado a versão antiga de
`PucStopsEXpGlobal1792279161187` (ids texto, `descricao`/`origem`, função sem
`search_path`), com só dados locais de teste: 10 PucStops legados (snapshot
`pucmaps-totens-1`), 4 movimentações e 4 coletas de XP (usuárias demo), 2
carteiras. Como o nome é o mesmo, `migration:run` não aplicaria a versão nova.

Feito com o CLI rodando de uma pasta **sem `.env`** e com as variáveis do banco
local explícitas (`localhost:5433/ajudaai`), para não haver como conectar ao
Supabase:

| Passo | Resultado |
|---|---|
| `migration:show` | 5 executadas (inclusive a versão antiga) |
| `pg_dump` dos objetos legados | guardado fora do repositório (descartável) |
| `MIGRATION_DOWN_DESCARTAR_DADOS=true migration:revert` | uma transação: 6 `DROP` (3 tabelas de `gamificacao`, função, schema, `mapa.pucstops`) + remoção do registro; `COMMIT`. O `down` atual é compatível com o schema antigo (mesmos nomes) |
| `migration:run` | versão definitiva: 12 `CREATE` + registro; `COMMIT` |
| Schema | `id uuid DEFAULT gen_random_uuid()`, `criado_por` nulo com FK, CHECKs de nome/raio/XP/geometria, função com `search_path=""`, 4 triggers; tudo vazio |
| `feed`, `mapa` (resto) e `public` | contagem + md5 iguais antes e depois |
| `GET /mapa/pucstops` (API local) | 200 `[]` |

Para repetir em outro banco local com a versão antiga, com o `.env` apontando
para o banco **local**:

```bash
MIGRATION_DOWN_DESCARTAR_DADOS=true npm run migration:revert
npm run migration:run
```

### Preflight somente leitura no Supabase (revisão final, 17/10/2026)

Sessão com `default_transaction_read_only=on` (confirmado no início e no fim);
a migration rodou contra um QueryRunner que só encaminha `SELECT` de catálogo.

| Item | Resultado |
|---|---|
| PostgreSQL | 17.6; PostGIS 3.3.7 e unaccent 1.1 em `extensions` |
| `feed.migrations` | 4 executadas (`UsuariosERequisitosPadrinho`, `BaselineFeed`, `HabilitaPostgisESchemaMapa`, `CriaTabelasMapa`); pendente só `PucStopsEXpGlobal1792279161187` (revalidado com a versão do CRUD) |
| Já existe? | `mapa.pucstops` não; schema `gamificacao` não |
| `feed.usuarios.id` | `integer` com PK (alvo das FKs, inclusive `criado_por`) |
| `gen_random_uuid()` | em `pg_catalog` (PostgreSQL 17; resolve sem depender do `search_path`) |
| Versão ativa do mapa | `pucmaps-12` (define o limite do campus para criar PucStops) |
| Limite do campus que a API vai usar | envoltória + 30 m: lon −43,99630..−43,98840, lat −19,92677..−19,91753, ~0,51 km² |
| SQL gerado | 12 comandos, todos `CREATE`: 1 schema, 4 tabelas, 2 índices, 1 função, 4 triggers |
| Destrutivo | nenhum `DROP`, `DELETE`, `UPDATE`, `ALTER` ou `CASCADE`; `TRUNCATE` só no texto dos 2 triggers `BEFORE TRUNCATE` que o **bloqueiam** |
| Tabelas existentes alteradas | nenhuma. `feed.usuarios` só passa a ser **referenciada** por 4 FKs (`criado_por`, carteira, ledger, coletas; lock `SHARE ROW EXCLUSIVE` momentâneo na criação; 6 linhas) |
| `mapa` | ganha só `mapa.pucstops` (+ índice GIST); nenhuma tabela de `mapa` alterada |
| Privilégios | `pg_default_acl` tem 24 linhas, todas de outros schemas (`auth`, `extensions`, `graphql*`, `public`, `realtime`, `storage`); nenhuma global nem para `mapa`/`gamificacao`: os objetos novos nascem sem acesso para `anon`/`authenticated`, como `feed` e `mapa` |
| Event triggers do Supabase | `pgrst_ddl_watch` e `issue_pg_*_access` disparam em DDL (recarga do PostgREST/permissões de extensões); não alteram objetos desta migration |

Ordem do SQL conceitual: (1) `CREATE TABLE mapa.pucstops` (PK uuid com
`gen_random_uuid()`, FK `criado_por`, CHECKs de nome, raio 10..200, XP 1..1000
e geometria; defaults `ativo true`, datas `now()`); (2) `CREATE INDEX … USING GIST (localizacao)`; (3) `CREATE
SCHEMA gamificacao`; (4) `xp_carteiras` (PK/FK `usuario_id`, `saldo >= 0`,
default 0); (5) `xp_movimentacoes` (identity, UNIQUE `chave_idempotencia`, FK,
CHECKs de quantidade/tipo/positivo para PucStop/referência/`saldo_apos`); (6)
índice `(usuario_id, id DESC)`; (7) `pucstop_coletas` (identity, `pucstop_id uuid`, UNIQUE
`(usuario_id, pucstop_id)`, UNIQUE `movimentacao_id`, 3 FKs RESTRICT, `xp > 0`);
(8) função `somente_insercao()` com `SET search_path = ''`; (9–12) triggers
BEFORE UPDATE/DELETE (linha) e BEFORE TRUNCATE (comando) no ledger e nas coletas.

Ajuste feito na revisão: a função de trigger passou a fixar `search_path`
(aviso `function_search_path_mutable` do Supabase). O banco local Docker foi
migrado antes do ajuste: lá a função ainda não tem `search_path` (sem efeito
prático; igualar com `ALTER FUNCTION gamificacao.somente_insercao() SET
search_path = ''` se desejado).

Assinaturas antes da aplicação, refeitas no preflight de 17/10/2026 (CRUD)
com `count(*)` e `md5(string_agg(t::text, '' ORDER BY t::text))`. Só
`mapa.versoes` (1 linha) bate com a tabela anterior; as demais diferem por
ordenação do cálculo anterior, então vale esta como referência:

| Tabela | Linhas | md5 |
|---|---|---|
| `feed.migrations` | 4 | `c5f53b9d2c85fc03cbd712afe3237e47` |
| `feed.usuarios` | 6 | `7a27f7d28807d52cc99cba05a527f338` |
| `feed.participacoes` | 6 | `9441ace1537f0542861ee7fb7beffe68` |
| `feed.programas` | 2 | `2ee945be7861831f0b687fccb72af3e8` |
| `mapa.versoes` | 1 | `afe1bd13baae07d6ee318b0e84495c02` |
| `mapa.predios` | 101 | `3e3a4dff7395c8c48c3caaee4f34b0d2` |
| `mapa.areas` | 12 | `1af6e626dd9a303aef7767237f36499a` |
| `mapa.nos_grafo` | 653 | `4116b86ba90b75b4a0458b7ef31d77ab` |
| `mapa.arestas_grafo` | 1654 | `8e0fb9df3403f9343736b04e4bc2a895` |
| `mapa.salas` | 0 | vazio |

Assinaturas do preflight anterior (outro cálculo de ordenação):

| Tabela | Linhas | md5 |
|---|---|---|
| `feed.avisos`, `comentarios`, `curtidas`, `formularios`, `publicacoes` | 0 | `d41d8cd9…427e` (vazio) |
| `feed.migrations` | 4 | `3beb69e7c5695e85d491098a9dde2bd3` |
| `feed.participacoes` | 6 | `816040f87ac262f559f713a4ed5a510e` |
| `feed.programas` | 2 | `2f283a3664c876720964ae3962b661cd` |
| `feed.usuarios` | 6 (3 aprovados, 2 pendentes, 1 rejeitado) | `e57a6aa36dee8a626b682376e6a00bc6` |
| `mapa.versoes` | 1 (`pucmaps-12` ativa, assets r2) | `afe1bd13baae07d6ee318b0e84495c02` |
| `mapa.predios` | 101 | `23110fb30c0380b3965b9df963c820be` |
| `mapa.areas` | 12 | `524589c0450f8a872ea70b37f6ea4fcb` |
| `mapa.nos_grafo` | 653 | `565f6efbdd23bc35754fd74f4c8aa76e` |
| `mapa.arestas_grafo` | 1654 | `ff6d3b372af3d6ad6d9823aaa1bde912` |
| `mapa.salas` | 0 | vazio |
| `public` (catálogo) | 33 objetos | `17724f40a18dc469e8da56f8150602c8` |

Depois da aplicação, só `feed.migrations` pode mudar (+1 linha).

`versao_assets` da versão ativa continua `2026-09-30-r2` (o app usa o
manifesto empacotado, r3; a coluna é informativa). Atualizar exige decisão
própria, fora desta migration.

### Backup antes de aplicar

Mesma estratégia da Tarefa 7:

1. `SUPABASE_POOLER_URL` (Session pooler, porta 5432) no `.env` local; passar
   ao container por variável de ambiente, nunca na linha de comando.
2. `pg_dump` 17 em container, TLS `verify-full` com `certs/supabase-ca.crt`:
   `-n feed -n mapa -Fc` (dados) e `--schema-only` (banco inteiro).
3. Guardar fora do repositório (contém e-mails).
4. Validar: `pg_restore` num PostgreSQL 17 + PostGIS descartável; comparar
   contagens e md5 com a tabela acima.
5. Só então `npm run migration:show` (deve listar só a pendente) e
   `npm run migration:run`; repetir as assinaturas.
6. Nenhuma importação de PucStops: a coordenação cadastra pela web depois
   da migration ([pucstops.md](../mapa/pucstops.md#regra-atual-cadastro-pela-coordenação)).

### Antes de aplicar no Supabase (checklist para revisão humana — executado em 18/10/2026)

1. Revisar o SQL da migration (12 comandos: 1 schema, 4 tabelas, 2 índices,
   1 função e 4 triggers — ver o preflight acima; nenhum
   `ALTER`/`DROP` fora do `down`).
2. Preflight somente leitura como na Tarefa 7 (`default_transaction_read_only`).
3. Backup de `feed` e `mapa` (Session pooler + `pg_dump`, fora do Git).
4. `npm run migration:show` → só `PucStopsEXpGlobal` pendente.
5. `npm run migration:run`.
6. Conferir: schema `gamificacao` sem `USAGE` para `anon`/`authenticated`;
   `feed`/`public` com o mesmo md5 de antes.
7. Conferir `GET /mapa/pucstops` → `[]` (nenhum PucStop herdado) e cadastrar
   os PucStops reais pela web da coordenação.
8. Só depois publicar um app que chame os endpoints novos contra o Supabase.

### Aplicação no Supabase (18/10/2026)

Nenhum importador de PucStops foi executado (não existe dataset inicial).

| # | Passo | Resultado |
|---|---|---|
| 1 | Preflight somente leitura (`default_transaction_read_only=on` no início e no fim) | 4 migrations executadas; pendente só `PucStopsEXpGlobal1792279161187`; `mapa.pucstops`, schema `gamificacao`, função `somente_insercao` e qualquer relação `*pucstop*`/`xp_*` inexistentes (nenhuma versão antiga aplicada); SQL gerado: 12 `CREATE` (4 tabelas, 2 índices, 1 schema, 1 função, 4 triggers); `TRUNCATE` só no texto dos triggers que o bloqueiam |
| 2 | Backup pelo Session pooler (`pg_dump` 17.11 em container, TLS `verify-full` com `certs/supabase-ca.crt`; URL só por variável de ambiente) | `feed-mapa.dump` (`-n feed -n mapa -Fc`, 272.480 B) e `estrutura-completa.sql` (`--schema-only`, 532.494 B), fora do repositório (contêm e-mails) |
| 3 | Restauração em PostgreSQL 17.11 + PostGIS 3.5 descartável | `pg_restore --no-owner --no-acl` sem erro; 15 tabelas de `feed`/`mapa` com contagem e md5 iguais aos do Supabase; catálogo e colunas de `feed` e `mapa` iguais; container removido |
| 4 | `npm run migration:show` | igual ao preflight |
| 5 | `npm run migration:run` | uma transação: 12 `CREATE` + 1 `INSERT` em `feed.migrations`; `COMMIT`; nenhum `DROP`/`ALTER`/`DELETE`/`UPDATE`/`TRUNCATE` |
| 6 | Verificação pós-migration (somente leitura) | ver abaixo |

Pós-migration:

- `feed.migrations`: 5 executadas.
- `mapa.pucstops` vazio (`id uuid DEFAULT gen_random_uuid()`, `geometry(Point,4326)`,
  `criado_por integer` nulo com FK RESTRICT para `feed.usuarios`), CHECKs de
  nome, raio 10..200, XP 1..1000 e geometria; índices `pk_pucstops` e GIST.
- `gamificacao.xp_carteiras`, `xp_movimentacoes` e `pucstop_coletas` vazias,
  com PKs, UNIQUEs, CHECKs e FKs RESTRICT; 4 triggers de imutabilidade
  (`BEFORE UPDATE OR DELETE` por linha e `BEFORE TRUNCATE` no ledger e nas
  coletas) chamando `gamificacao.somente_insercao()`, com
  `search_path=""` e sem `SECURITY DEFINER`.
- Acesso: `anon`, `authenticated` e `service_role` **sem `USAGE`** em `feed`,
  `mapa` e `gamificacao`; nenhum grant de tabela para eles nesses schemas
  (como antes). RLS desligado nas tabelas novas, como nas existentes de
  `feed`/`mapa` (schemas fora do PostgREST). `EXECUTE` da função para
  `PUBLIC` é o padrão do PostgreSQL e não tem efeito: sem `USAGE` no schema e
  função de trigger não é chamável diretamente.
- `GET /mapa/pucstops` (controller real, conexão somente leitura): 200 `[]`;
  detalhe de UUID inexistente: 404.

Assinaturas (contagem · md5 do conteúdo ordenado, com
`extra_float_digits = 1` nas duas pontas):

| Objeto | Antes | Depois |
|---|---|---|
| `feed.migrations` | 4 · `c5f53b9d…3e47` | 5 · `106e1b93…e664` (única mudança esperada) |
| `feed.usuarios` | 6 · `7a27f7d28807d52cc99cba05a527f338` | igual |
| `feed.participacoes` | 6 · `9441ace1537f0542861ee7fb7beffe68` | igual |
| `feed.programas` | 2 · `2ee945be7861831f0b687fccb72af3e8` | igual |
| `feed.avisos`, `comentarios`, `curtidas`, `formularios`, `publicacoes` | 0 | igual |
| `mapa.versoes` | 1 · `afe1bd13baae07d6ee318b0e84495c02` | igual |
| `mapa.predios` | 101 · `3e3a4dff7395c8c48c3caaee4f34b0d2` | igual |
| `mapa.areas` | 12 · `1af6e626dd9a303aef7767237f36499a` | igual |
| `mapa.nos_grafo` | 653 · `4116b86ba90b75b4a0458b7ef31d77ab` | igual |
| `mapa.arestas_grafo` | 1654 · `04194016e71f3b25f2b50c4cfbae778f` | igual |
| `mapa.salas` | 0 | igual |
| `public.*` (13 tabelas legadas, todas vazias) | 0 | iguais |
| catálogo `feed` / `public` | 33 / 33 relações | iguais |
| colunas `feed` / `public` | — | iguais |
| catálogo `mapa` | 25 relações | 28 (+ `pucstops`, `pk_pucstops`, `idx_pucstops_localizacao`) |
| `gamificacao` | não existia | 12 relações |

**Nota de medição:** pela conexão do Supabase, `double precision` sai com 15
dígitos (`27.7613907988024`); no PostgreSQL local, com a forma exata mais
curta (`27.761390798802424`). Com o padrão de cada lado, o md5 de
`mapa.arestas_grafo` (coluna `distancia_m`) difere sem que os dados difiram;
fixando `extra_float_digits = 1` nas duas sessões, os hashes ficam iguais
(conferido linha a linha: 1.536 linhas, só `distancia_m`, mesmo valor). Por
isso a tabela acima usa `extra_float_digits = 1`; o md5 `8e0fb9df…` registrado
no preflight de 17/10 é o mesmo conteúdo medido com o padrão do Supabase.

Azure: nenhuma operação de escrita. Conferência só por download público
(`publicar-assets-mapa.mjs --verificar`, sem credencial): r2 29/29 e r3 30/30
(8.385.811 B) com tamanho e SHA-256 iguais aos manifestos.

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
