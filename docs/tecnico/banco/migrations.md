# Banco e migrations

Estrutura por migrations em `code/back/api/src/migrations/`; importação de
dados geográficos é separada. O CLI usa `DB_*` e o arquivo `code/back/api/.env`.
`DB_SCHEMA` configura o schema do programa e da tabela de controle de migrations
(padrão `feed`).

## Baseline e bancos existentes

`BaselineFeed1791900000000` representa as tabelas anteriores à incremental
`UsuariosERequisitosPadrinho1791944105933`:

- Nenhuma tabela da baseline: cria a estrutura.
- Todas as tabelas/colunas esperadas: reconhece a estrutura sem reescrevê-la.
- Estado parcial: falha sem prosseguir.

A incremental também reconhece as duas mudanças já existentes
(`usuarios` e `programas.requisitos_padrinho`) e recusa estado parcial.
Isso permite convergir bancos locais criados por `synchronize` sem marcar
migrations manualmente ou ocultar divergências com `IF NOT EXISTS`.
A baseline pode estar pendente mesmo com uma incremental posterior registrada;
conferir o plano completo com o CLI.

## Aplicação

Em banco vazio, criar antes o schema configurado, pois o TypeORM cria sua tabela
de migrations antes de executar a baseline:

```sql
CREATE SCHEMA IF NOT EXISTS feed;
```

Em `code/back/api`:

```powershell
npm run migration:show
npm run migration:run
```

Os scripts compilam o backend antes de chamar o CLI.
Não usar `DB_SYNCHRONIZE=true` nem seed automático em banco compartilhado.
Migrations não publicam GLBs nem importam conteúdo administrativo.

## Organização

- `BaselineFeed`: estrutura/reconhecimento do domínio de programa.
- `UsuariosERequisitosPadrinho`: usuários e requisitos de programa.
- `HabilitaPostgisESchemaMapa`: PostGIS, unaccent e schema `mapa`.
- `CriaTabelasMapa`: versões, prédios, salas, áreas e grafo.
- `PucStopsEXpGlobal`: PucStops e schema `gamificacao`.
- `EventosRestaurantesCardapios`: conteúdo administrativo do campus.
- `VersoesEEncerramentoFormularios`: `formularios.versao` (publicados viram
  versão 1) e `formularios.encerrado_em`. Reconhece bancos de `synchronize`,
  recusa estado parcial e recusa `down` se houver versões ou encerramentos.
- `MatchingF11F12`: configurações versionadas, execuções, sugestões/decisões,
  vínculos canônicos N:N e outbox recuperável de chat. Reconhece a estrutura
  completa criada por `synchronize`, recusa estado parcial e converte os
  grupos legados válidos em pares ativos sem alterar `participacoes.grupo`.
  A unicidade parcial impede duplicar um par ativo; FKs apontam para programa,
  participações, execução e configuração. O rollback recusa dados sem
  `MIGRATION_DOWN_DESCARTAR_DADOS=true`.
- `VerificacaoAcademicaParticipacoes`: `participacoes.verificacao` (jsonb)
  com a conferência acadêmica da F09 (itens conferidos, resultado,
  observações, responsável, data e histórico). Fica fora de `respostas` para
  não voltar ao aluno. Reconhece bancos de `synchronize` e recusa `down` se
  houver conferências registradas.
- `LojinhaResgates`: catálogo mínimo da lojinha e `gamificacao.resgates`
  (comprovante imutável de cada troca, ligado ao ledger de XP).
- `LojinhaRecompensas`: cadastro completo (F27). Converte o catálogo mínimo
  (`publicada` → `status`; estoque restante → total + comprometido), cria
  `recompensa_versoes` e `recompensa_estoque_ajustes` (só INSERT) e liga cada
  resgate à versão resgatada. CHECK impede total abaixo do comprometido.
  Rollback só sem histórico novo (versões, ajustes ou status inativa/arquivada).
- `ProgramaRecompensasFk` (`1794100000000`): FK `recompensas.programa_codigo`
  → `programas.codigo` (RESTRICT). Recusa se houver recompensas órfãs e lista
  os códigos.
- `EntregaResgatesEAjustesXp` (`1794200000000`, F29/F26):
  `resgate_desfechos` (entrega ou cancelamento, UNIQUE por resgate, estorno
  ligado ao ledger) e `xp_ajustes` (motivo, responsável e movimentação
  `AJUSTE_ADMIN`). As duas tabelas são só de inserção. O rollback é
  recusado se já houver entregas, cancelamentos ou ajustes gravados.
- `ResgatesProgramaDaTroca` (`1794300000000`, F29): `resgates.programa_codigo`
  (programa da troca, gravado pela lojinha na inserção e nunca recalculado) e
  `programa_inferido`. Preenche os resgates antigos com a melhor evidência
  (programa da recompensa restrita; senão a participação do aluno anterior à
  troca, preferindo a do semestre dela; senão NULL) e os marca como inferidos.
  FK para `programas` (RESTRICT) e índices da fila (`criado_em DESC, id DESC`).
  O rollback é recusado se houver resgates com programa gravado na troca.
- `CelebracoesNivel` (`1795500000000`): `gamificacao.celebracoes_nivel`
  (último nível já celebrado por usuário; estado de interface, fora do
  ledger) com backfill do nível atual. Foi criada como `1794100000000`, o
  mesmo timestamp de `ProgramaRecompensasFk`, e renomeada para depois da
  Sprint-6. Num banco que já a aplicou com o nome antigo, adota a tabela só se
  a estrutura for idêntica (mesma conferência de `EntregaResgatesEAjustesXp`)
  e não refaz o backfill; o `down` mantém a tabela adotada.
- `ReivindicacaoCelebracoesNivel` (`1795600000000`): duas colunas anuláveis em
  `gamificacao.celebracoes_nivel` (`reivindicado_por`, `reivindicado_ate`) para
  a reserva atômica da vez de exibir a celebração entre aparelhos. Sem default
  nem reescrita de linhas; `IF NOT EXISTS` a torna repetível. Roda depois de
  `CelebracoesNivel` (rode com `migration:run`; o script `celebracoes:aplicar`
  aplica só a anterior). Antes dela, a reivindicação responde 503 e a
  animação não aparece (continua pendente no servidor). Validar com PostgreSQL
  antes de produção (`test/celebracoes.integration.spec.ts`).

`ProgramaRecompensasFk` e `EntregaResgatesEAjustesXp` foram criadas como
`1793700000000` e `1793600000000`, os mesmos timestamps de
`RestaurantesOficiaisCampus` e `InformacoesImagensLocais` da Sprint-6. Foram
renomeadas para rodar depois de `1794000000000-GamificacaoNiveisMoedasCiclos`.
Num banco que já as aplicou com o nome antigo:

- **Adoção só com estrutura idêntica.** `EntregaResgatesEAjustesXp` recria a
  estrutura esperada, com a mesma DDL, num schema temporário (desfeito por
  SAVEPOINT) e compara pelo catálogo colunas (tipo, nulidade, default),
  constraints (PK/UNIQUE/FK/CHECK com definição e validação), índices e
  gatilhos (inclusive desabilitados). `ProgramaRecompensasFk` confere a FK
  atributo por atributo (tabela, colunas, alvo, ON UPDATE/DELETE, MATCH,
  NOT VALID) e o índice (colunas, unicidade, predicado). Qualquer diferença, ou
  só uma das duas tabelas, aborta **antes de alterar algo**, listando o que
  falta ou sobra. O que faltar sem conflito (ex.: só o índice) é criado.
- **O `down` só remove o que a migration criou.** Objetos criados por ela
  levam a marca `ajuda-ai: criado por <migration>` no COMMENT. Sem marca, só
  são removidos se o nome antigo nunca foi registrado; estrutura adotada da
  versão antiga fica.
- **Recompensas órfãs** (programa inexistente) impedem a FK: a migration
  recusa sem mudar nada e lista cada código com as recompensas. Cadastre o
  programa ou ajuste `programa_codigo` e rode de novo.

Cenários cobertos com fixtures de banco novo, legado completo, legado parcial
e dados legados em `test/migrations-gamificacao.integration.spec.ts`.

Modelos e regras têm fonte em [dados geoespaciais](../mapa/dados-geo.md),
[PucStops](../mapa/pucstops.md), [XP](../gamificacao/xp.md) e
[conteúdo](../mapa/eventos-cantinas.md).

## PostGIS e ambiente local

O Compose em `code/` usa `postgis/postgis:16-3.5-alpine`, projeto
`ajuda-ai`, volume persistente e porta padrão 5433 no host.

```powershell
cd code
docker compose -p ajuda-ai up -d postgres
```

`postgres-init/` substitui o init da imagem para não instalar extensões
automaticamente em `public`. PostGIS e unaccent são instalados por migration
em `extensions`; se já existirem em outro schema, permanecem onde estão.

Migrations, importador e SQL de runtime descobrem o schema real da extensão
em `pg_extension` e qualificam funções/tipos. Ferramentas que leem geometria
por TypeORM precisam incluir esse schema no `search_path`.
`installExtensions: false` impede instalação implícita ao conectar.
pgRouting não é requisito: [rotas](../mapa/rotas.md) são calculadas em memória.

Preservar o volume ao recriar o container; `docker compose down -v` o apaga.
Uma troca de versão/base da imagem exige backup e validação de compatibilidade,
não apenas manter o mesmo nome de volume.

## Banco compartilhado e backup

Antes de executar migrations, conferir alvo, pendências, SQL e backup restaurável.
Não inferir o estado remoto a partir desta documentação ou de uma execução anterior.
Verificar privilégios de `feed`, `mapa` e `gamificacao`: acesso público deve
passar pela API NestJS, sem grants acidentais para papéis clientes do provedor.

Para backup Supabase com host direto IPv6 indisponível, usar Session pooler
IPv4 em modo de sessão (porta 5432), com `pg_dump` compatível com o servidor
e TLS `verify-full`/CA do provedor. `SUPABASE_POOLER_URL` é configuração
administrativa, não substitui as variáveis da API. Passar credenciais por ambiente
seguro, nunca imprimir a URL em logs.

Incluir os schemas afetados (`feed`, `mapa`, `gamificacao`) e um dump de
estrutura. Guardar fora do Git: backups contêm dados de usuários. Restaurar em
PostgreSQL/PostGIS descartável e comparar estrutura, constraints, índices,
triggers e conteúdo antes de confiar no arquivo.

Na comparação entre servidores, fixar ordenação e `extra_float_digits` iguais:
a representação textual de `double precision` pode gerar hashes diferentes
para o mesmo valor. Casts equivalentes em CHECKs de arrays também podem ser
normalizados pelo `pg_restore`; conferir semântica além do texto.

## Rollback e compatibilidade

`npm run migration:revert` reverte a última migration registrada, não uma
selecionada por domínio. Conferir a ordem antes de executar.

- A baseline sempre recusa `down`, pois pode ter apenas reconhecido estrutura.
- A incremental e migrations de domínio recusam descarte quando há dados.
- `MIGRATION_DOWN_DESCARTAR_DADOS=true` libera descarte explícito; não é
  procedimento normal de atualização de banco compartilhado.
- A migration de extensões remove apenas o schema `mapa` vazio; preserva
  extensões que podem ser usadas por outros schemas.
- Rollback de cardápios não apaga arquivos no storage.

Há instalações locais antigas que podem ter registrado uma versão anterior de
`PucStopsEXpGlobal1792279161187` com IDs texto. O CLI não detecta mudança de
conteúdo de uma migration já registrada. Conferir UUID, constraints e função
antes de assumir compatibilidade; qualquer reconstrução local precisa considerar
os dados e o backup, sem aplicar descarte automático em ambiente compartilhado.

## Testes

Testes de catálogo e baseline: `src/migrations/migrations.spec.ts`.
Os testes unitários do fluxo capacitado ficam em
`src/matching/matching.algorithm.spec.ts`. A suíte PostgreSQL existente é
opcional e depende de `MAPA_TEST_DB_URL`; quando a variável não está presente,
constraints, locks e a conversão SQL são verificadas por build/testes de
catálogo, mas não por uma instância PostgreSQL real.
Integração cria e remove bancos próprios no servidor indicado por
`MAPA_TEST_DB_URL`; usar exclusivamente PostgreSQL/PostGIS descartável.

Em `code/back/api`, com servidor local de teste:

```powershell
$env:MAPA_TEST_DB_URL='postgres://postgres:teste@localhost:55432/postgres'
npx vitest run test/mapa-banco.integration.spec.ts test/mapa-api.integration.spec.ts test/pucstops-xp.integration.spec.ts test/campus.integration.spec.ts
```

Sem a variável, essas suítes são puladas. Storage é substituído em memória.
Não carregar credenciais de produção para executá-las.
