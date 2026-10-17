# Dados geoespaciais

> Estado: ATUAL (snapshot local 2D / WGS84 no app; banco geográfico `mapa` com a
> versão `pucmaps-12` importada e ativa no banco local e no Supabase — Tarefa 7).

Este documento descreve o snapshot usado pelo app Flutter e o banco geográfico
do backend (schema `mapa`, [ADR-0005](../decisoes/ADR-0005-schema-mapa-postgis.md)).
Migrations, PostGIS e procedimentos por ambiente:
[banco/migrations.md](../banco/migrations.md). O app **continua** lendo o snapshot
local; nenhuma API de mapa existe ainda.

## Banco geográfico (schema `mapa`)

```mermaid
erDiagram
    versoes ||--o{ predios : "versao_id"
    versoes ||--o{ areas : "versao_id"
    versoes ||--o{ nos_grafo : "versao_id"
    versoes ||--o{ arestas_grafo : "versao_id"
    predios ||--o{ salas : "(versao_id, predio_id)"
    predios |o--o{ nos_grafo : "(versao_id, predio_id)"
    salas |o--o{ nos_grafo : "(versao_id, sala_id)"
    nos_grafo ||--o{ arestas_grafo : "origem (versao_id, no_origem_id)"
    nos_grafo ||--o{ arestas_grafo : "destino (versao_id, no_destino_id)"

    versoes {
        uuid id PK
        varchar codigo UK "pucmaps-12"
        varchar status "pronta | ativa | arquivada"
        jsonb origem
        char hash_dados
        varchar versao_assets "2026-09-30-r2"
        jsonb metadados
        timestamptz criado_em
        timestamptz ativada_em
    }
    predios {
        uuid versao_id PK
        varchar id PK "chave estável"
        uuid id_origem
        varchar osm_id
        varchar codigo
        varchar nome
        varchar tipo
        float altura
        float altura_base
        jsonb entradas
        geometry localizacao "Point 4326"
        geometry poligono "Polygon 4326"
    }
    salas {
        uuid versao_id PK
        uuid id PK
        varchar predio_id FK
        varchar nome
        int andar
        int capacidade
        varchar tipo
        geometry localizacao "Point 4326"
    }
    areas {
        uuid versao_id PK
        uuid id PK
        varchar nome
        varchar tipo
        jsonb entradas
        geometry localizacao "Point 4326"
        geometry poligono "Polygon 4326"
    }
    nos_grafo {
        uuid versao_id PK
        uuid id PK
        varchar predio_id FK
        uuid sala_id FK
        numeric nivel
        int camada
        geometry localizacao "Point 4326"
    }
    arestas_grafo {
        uuid versao_id PK
        uuid id PK
        uuid no_origem_id FK
        uuid no_destino_id FK
        float distancia_m
        int tempo_caminhada_s
        bool acessivel
        bool gerada
        int camada
        geometry geometria "LineString 4326"
    }
```

Entidades TypeORM em `code/back/api/src/mapa/entities/` (sem módulo HTTP), com
tipos GeoJSON do próprio TypeORM (`Point`, `Polygon`, `LineString`).

### Regras

- **Identidade:** toda linha pertence a uma versão; chave (`versao_id`, `id`).
  O mesmo nó/prédio pode existir em várias versões sem colisão.
- **Prédio:** `id` = id do footprint do app e dos GLBs (`P01_R4751608`,
  `OSM_325598969`), portanto a junção 2D/3D ↔ banco é direta. Portões (só ponto
  na origem) usam `GATE_<código OSM>`. `id_origem` é o UUID do PUCMaps naquela
  versão (muda a cada versão lá; não é chave). `codigo` não é único (há Prédio 1
  e a agência no Prédio 1).
- **Área:** `id` = UUID da origem; o PUCMaps não tem outra identidade estável
  para áreas (nomes repetem: três “Banquinho”).
- **Grafo:** ids de nós e arestas da origem (UUIDs estáveis entre versões do
  PUCMaps). Arestas **dirigidas**, como na origem: cada trecho aparece nos dois
  sentidos. `nivel` (andar, decimal), `camada`, `acessivel`, `gerada`
  (conector criado pelo processador) e `tempo_caminhada_s` preservados.
  `routingId` (pgRouting) não foi portado.
- **Geometria:** SRID 4326, tipo fixo por coluna, `CHECK ST_IsValid` em polígonos
  e linhas. Índices GIST em `predios.poligono`, `predios.localizacao`,
  `areas.poligono`, `nos_grafo.localizacao`, `arestas_grafo.geometria`.
- **Outros índices:** `predios (versao_id, codigo)`, `salas (versao_id, predio_id)`,
  `nos_grafo (versao_id, predio_id)` parcial, `arestas_grafo` por origem e destino.
- **Integridade:** FKs compostas (nada aponta para outra versão), `ON DELETE
  RESTRICT` em todas; distância/tempo ≥ 0; sem laço (origem ≠ destino).
- **Versão ativa:** status `pronta`, `ativa` ou `arquivada`; índice único parcial
  garante no máximo uma `ativa` (e `ativa` exige `ativada_em`).
- **Relação com os assets 3D:** `versoes.versao_assets` = `2026-09-30-r2`, a
  versão dos GLBs no Azure coerente com estes prédios (mesmas chaves). São
  versões independentes: os assets podem ganhar revisões sem mudar os dados.

## Snapshot importado: `pucmaps-12`

Arquivo versionado: `code/back/api/scripts/mapa/dados/pucmaps-12.json`
(787.941 B; um registro por linha). Gerado por
`scripts/mapa/exportar-pucmaps.mjs` a partir de:

- banco local do PUCMaps (container `pucmaps-postgres`, somente leitura),
  **versão 12, status ACTIVE** (`c8eaec70-bbfa-4380-8abd-52a9b600e65b`,
  atualizada em 2026-09-29), repositório de origem no commit `776e113`;
- footprints do app (`campus_footprints.geojson`, sha256 `aab7359a…568e`).

| Origem (v12) | Importado | Observação |
|---|---|---|
| 93 buildings | **101 prédios** | 74 com footprint (polígono `ST_Equals` ao da origem) + 19 portões `GATE`; + 8 footprints sem registro na origem (`P93`, `OSM_*`), com dados só do footprint |
| 0 rooms | **0 salas** | tabela criada, vazia; nada inventado |
| 12 areas | **12 áreas** | 7 `PARK`, 5 `PARKING_LOT` (reais, do OSM) |
| 653 graph_nodes | **653 nós** | 147 ligados a prédios (19 a portões); níveis -1…1, camadas -2…1 |
| 1.654 graph_edges | **1.654 arestas** | 1.516 acessíveis, 114 geradas; 20 pares de arestas paralelas (caminhos diferentes, ids diferentes) |

Todas as 12 versões do PUCMaps local têm as mesmas contagens; a importada é a
ACTIVE. Os “~653 nós” da auditoria anterior se confirmaram.

### Transformações

- Prédio com footprint: geometria do footprint (a que o app desenha); nome,
  código, tipo, entradas e localização da origem; altura/altura base e `osm_id`
  do footprint.
- **32 arestas de comprimento zero** (16 pares de conectores entre nós no mesmo
  ponto) têm, na origem, uma linha com dois pontos iguais — inválida no PostGIS.
  Importadas com `geometria` nula (distância 0, tempo 1 s, mantidas). O
  exportador falha se uma linha inválida tiver distância > 0.
- Nada de salas, áreas, categorias ou descrições inferidas. `description` e
  `images` (vazios em toda a origem) não foram criados.

### Resultado da importação

`npm run mapa:importar -- --relatorio`, em 17/10/2026 (mesmo resultado nos dois
bancos):

| Verificação | Banco local e Supabase |
|---|---|
| versões / ativas | 1 / 1 (`pucmaps-12`) |
| prédios / salas / áreas / nós / arestas | 101 / 0 / 12 / 653 / 1.654 |
| geometrias inválidas | 0 |
| SRID ≠ 4326 | 0 |
| arestas penduradas | 0 |
| nós com prédio inexistente | 0 |

Checagens PostGIS no Supabase (PostGIS 3.3): `ST_GeomFromGeoJSON`/`ST_AsText`
corretos; distância Prédio 1 ↔ Prédio 2 = 90,2 m (igual ao local); o ponto do
Prédio 1 cai no polígono `P01_R4751608` (`ST_Intersects`); diferença geodésica
máxima entre `ST_Length` da linha e `distancia_m` = 0,636 m; nenhum nó ligado a
prédio a mais de 30 m dele; 0 chaves duplicadas. Reimportação: “já importada
(mesmo hash; nada reescrito)”. Versão ativa `pucmaps-12`, `hash_dados`
`530d8d25…5067`, `versao_assets` `2026-09-30-r2`.

## Importador

`npm run mapa:importar -- <snapshot.json> [--ativar] [--confirmar-remoto]` e
`npm run mapa:importar -- --relatorio` (em `code/back/api`; usa `DB_*` do
ambiente, que têm precedência sobre o `.env`).

- Valida o arquivo inteiro antes de conectar (`validarSnapshot`): formato, ids
  únicos, referências (nó, prédio, sala), custos não negativos, geometria
  GeoJSON, coordenadas WGS84 e `hashDados` (SHA-256 do conteúdo).
- Uma transação; `LOCK` de `mapa.versoes` contra importações concorrentes;
  insere por `jsonb_to_recordset` com funções PostGIS qualificadas.
- **Idempotente por código:** código novo → importa; mesmo código e mesmo hash →
  não escreve nada e confere as contagens; mesmo código e outro hash → recusa
  (versão imutável; gere outro código).
- `--ativar`: a versão vira a única `ativa`; a anterior fica `arquivada`.
- Banco remoto exige `--confirmar-remoto`; o alvo (host/banco) é impresso antes,
  sem senha. Não roda migrations nem `synchronize`.
- Testes: `src/mapa/importacao/snapshot.spec.ts` (arquivo inválido, nó ausente,
  aresta inválida, geometria malformada, hash divergente, ids repetidos) e
  `test/mapa-banco.integration.spec.ts` (1ª/2ª importação, mesmo código com
  outro conteúdo, polígono auto-intersectante barrado pelo PostGIS com rollback,
  ativação, FKs, PostGIS).

## SRID

O snapshot usa coordenadas GeoJSON em WGS84, equivalentes ao SRID 4326, na ordem
`[longitude, latitude]`. Todas as coordenadas dos footprints foram preservadas,
sem reprojeção, simplificação, mudança de anéis ou criação de geometria.
No banco, todas as colunas geométricas são declaradas com SRID 4326
(`geometry(Point|Polygon|LineString, 4326)`).

## Snapshot local

### Fonte canônica desta etapa

**Geometria: `code/mobile/assets/campus/campus_footprints.geojson` do PUCMaps.**
**Complemento de identidade/rótulo: `buildings[]` de `campus_chunks.json`.**
Arquivos auditados no commit de origem `776e11391439b6c7ee6b85438613d0d74d652362`.

- Footprints: 82 `Polygon`, 42.055 bytes na origem; SHA-256
  `d49b5f5c4424d4251d33d2e089d4d602fe93a619d5bbc8f35928f14cd8df70c5`.
- Manifesto: SHA-256
  `3a1d0bf0f4b1cc9bfd94fc547ca38b6c77f57a8dd3e1654731b80527f0cffd77`.
  Só são usados seus metadados de origem e campos de cada construção;
  o manifesto completo e os GLBs não foram copiados.
- `assets/local/campus-view.json` foi descartado: é um stub não utilizado,
  contendo apenas um retângulo de campus e configuração de raster externo.
  Não contém os footprints nem representa limite administrativo confirmado.
- O `campus-view.json` publicado pelo pipeline antigo reúne prédios/áreas/salas,
  conforme `GeoJsonPresenter` e `ExtractCampusViewUseCase`. Esse arquivo publicado
  não existe como snapshot completo nos arquivos locais auditados. Não foi
  introduzida dependência de bucket, endpoint, banco ou stack antigos.

### Asset entregue e transformação

Destino único: `code/mobile/packages/campus_map/assets/data/campus_footprints.geojson`.
Tamanho: **47.032 bytes (45,93 KiB)**; 82 features / 82 footprints de construções,
**0 áreas abertas confirmadas**, 77 nomes, cinco nomes nulos, 74 vínculos `apiId`.
Há 71 códigos distintos não nulos; múltiplos polígonos podem compartilhar código
de prédio, portanto a contagem de features não é uma contagem de códigos únicos.

- Mantidos exatamente: `id` no nível Feature e properties, `name` (inclusive
  nulos e grafia original), `code`, `height`, `minHeight` e toda a geometria.
- Acrescentados por junção **exata pelo ID** do footprint com o manifesto:
  `osmId`, `apiId` (nulo quando não há vínculo), `center` a partir da âncora
  `[lon, lat]` já existente. Não houve associação por proximidade ou nome.
- Metadados preservados: origem PUCMaps, provedor OpenStreetMap, licença ODbL 1.0,
  atribuição e timestamp OSM `2026-09-30T17:10:14Z`.
- Descartados do footprint: `chunk`, `group` (organização de LOD/GLBs) e `color`
  (paleta antiga não usada no 2D neutro). IDs permitem nova junção futura com
  assets 3D sem embutir o manifesto completo agora.
- Não copiados do manifesto: caminhos `models`, materiais, chunks/grupos, métricas
  de GLB, gerador, URL Overpass e dados auxiliares de correspondência com a API.
- Não adicionados por inferência: categoria funcional, tipos de área, salas,
  descrição, limite administrativo ou geometria ausente.

### Carregamento e modelos

`LocalCampusDataSource` centraliza `rootBundle.loadString` no caminho
`packages/campus_map/assets/data/campus_footprints.geojson`; aceita `AssetBundle`
injetável. `CampusDataSource` expõe apenas `Future<CampusSnapshot> load()` para
permitir outra fonte no futuro. Não há implementação remota ou requisição HTTP.

`CampusSnapshot` / `CampusFeature` preservam properties e geometria GeoJSON,
validam IDs únicos, identidade, anéis fechados e coordenadas WGS84 finitas.
Listas geométricas e propriedades do snapshot entregue são imutáveis.
O parser aceita Polygon/MultiPolygon; o asset atual tem somente Polygon.

O bbox calculado das construções é
`[-43.9959851, -19.9265038, -43.9894739, -19.9185445]`.
Ele orienta a câmera (`-43.9927295`, `-19.92252415`, zoom 15.2) e não deve ser
tratado como polígono do limite do campus. Os rótulos usam as âncoras da origem,
sem geometria derivada de salas/prédios inventados.

### Métricas e limites

A Tarefa 6 consome este snapshot em `LocalCampusPlaceRepository`: 77 lugares
com nome/código e centro, sem copiar geometria. Cinco footprints anônimos
são omitidos; código é literal (ex.: `26`, não `P26`). Sem salas/aliases
inferidos. Modelo e regras: [busca-localizacao.md](busca-localizacao.md).

Duas sources e quatro layers 2D. Uma leitura de arquivo + parsing no host Windows
(Dart 3.13.0, execução única nesta tarefa) levou aproximadamente **42,2 ms**.
Esse valor não mede carregamento no Android nem constitui benchmark de FPS.
No emulador, zoom/arraste responderam e a reentrada na tela foi validada; não houve
medição formal de fluidez ou tempo até o primeiro frame.

No app, áreas, salas e categorias continuam ausentes do snapshot. A fonte real
foi confirmada na Tarefa 7: o banco `mapa` tem as 12 áreas e os tipos de prédio
da origem (e 0 salas, porque a origem não tem nenhuma); levá-los ao app é tarefa
da API (Tarefa 8). A presença de um nome como “Canteiro em Obras” no manifesto
de construções não foi usada para inventar categoria `CONSTRUCTION`.
Busca ainda não foi implementada. A renderização 3D (Tarefa 4) reutiliza a mesma
source de footprints: a extrusão usa `height`/`minHeight` e os GLBs se ligam às
features pelo `id`, via `assets/data/campus_models.json` (não duplica geometria;
ver [assets-pipeline.md](assets-pipeline.md#manifesto)). O `color` removido do
snapshot na Tarefa 3 voltou só como `wallColor` no manifesto 3D, para a extrusão.

## Versionamento

Uma linha em `mapa.versoes` por versão importada. O conceito vem do PUCMaps;
o gate de tiles/rotas pré-calculadas e o fluxo de publicação do admin antigo não
foram portados ([ADR-0007](../decisoes/ADR-0007-admin-pucmaps.md)). Publicar
dados novos = gerar outro snapshot com outro código e importar com `--ativar`.

## Origem dos dados

Os dados geoespaciais do campus (localização de prédios, áreas e o grafo de navegação) têm origem no projeto PUCMaps, construídos a partir de dados do OpenStreetMap processados por um pipeline específico. Ver [origem-pucmaps.md](../origem-pucmaps.md) para a rastreabilidade completa.
