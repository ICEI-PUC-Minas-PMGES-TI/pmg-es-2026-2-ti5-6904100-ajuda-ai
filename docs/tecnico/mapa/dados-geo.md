# Dados geoespaciais

> Estado: ATUAL (snapshot local 2D / WGS84) + PLANEJADO (banco geográfico; nenhuma tabela criada)

Este documento descreve o snapshot local já implementado e o domínio de banco
planejado para o mapa do campus. O schema `mapa` (ver [ADR-0005](../decisoes/ADR-0005-schema-mapa-postgis.md))
só será criado quando o PostGIS estiver disponível e a dívida de baseline de
migrations estiver resolvida (ver [banco/migrations.md](../banco/migrations.md)).

**Nenhum schema final está definido ainda.** As entidades abaixo são as candidatas identificadas no projeto de origem (PUCMaps), não uma especificação fechada. O desenho final deve ser revisado durante a implementação da fase 4 (banco geo/PostGIS).

## Entidades candidatas

- **map_versions** — versão publicada do mapa do campus (permite atualizar dados geoespaciais sem afetar quem está usando a versão anterior).
- **buildings** — prédios do campus: identificação, nome, geometria (localização pontual e/ou polígono de contorno), entradas.
- **rooms** — salas, vinculadas a um prédio, com andar e identificação.
- **areas** — áreas abertas do campus (praças, quadras, estacionamentos), com geometria própria.
- **graph_nodes** — nós do grafo de navegação, vinculados opcionalmente a um prédio ou sala, com nível/andar.
- **graph_edges** — arestas do grafo, ligando dois nós, com distância, tempo de caminhada estimado e indicação de acessibilidade.

Qualquer outra entidade (eventos, cantinas, PucStops) é tratada em documentos específicos ([eventos-cantinas.md](eventos-cantinas.md), [pucstops.md](pucstops.md)).

## SRID

O snapshot usa coordenadas GeoJSON em WGS84, equivalentes ao SRID 4326, na ordem
`[longitude, latitude]`. Todas as coordenadas dos footprints foram preservadas,
sem reprojeção, simplificação, mudança de anéis ou criação de geometria.
A declaração de SRID no banco permanece futura.

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

Áreas, salas e categorias específicas continuam dependentes de uma fonte real
exportada/confirmada. A presença de um nome como “Canteiro em Obras” no manifesto
de construções não foi usada para inventar categoria `CONSTRUCTION`.
Busca ainda não foi implementada. A renderização 3D (Tarefa 4) reutiliza a mesma
source de footprints: a extrusão usa `height`/`minHeight` e os GLBs se ligam às
features pelo `id`, via `assets/data/campus_models.json` (não duplica geometria;
ver [assets-pipeline.md](assets-pipeline.md#manifesto)). O `color` removido do
snapshot na Tarefa 3 voltou só como `wallColor` no manifesto 3D, para a extrusão.

## Importação futura

> PLANEJADO: quando o schema `mapa` existir, os dados da versão ativa do mapa no projeto de origem (PUCMaps) devem ser exportados e importados por um script de importação idempotente, não por cópia manual de linhas de banco. Este script ainda não existe neste repositório.

## Schema `mapa`

Ver [ADR-0005](../decisoes/ADR-0005-schema-mapa-postgis.md).

## PostGIS

Ver [banco/migrations.md](../banco/migrations.md) para o estado de disponibilidade e o plano de habilitação.

## Versionamento

> PLANEJADO: o conceito de "versão do mapa" (permitir publicar uma atualização dos dados geoespaciais sem quebrar quem está usando a versão anterior) é preservado do projeto de origem como conceito, mas o mecanismo de publicação (incluindo qualquer gate ligado a processamento de tiles) não é portado — ver [ADR-0007](../decisoes/ADR-0007-admin-pucmaps.md) e [administracao.md](administracao.md).

## Origem dos dados

Os dados geoespaciais do campus (localização de prédios, áreas e o grafo de navegação) têm origem no projeto PUCMaps, construídos a partir de dados do OpenStreetMap processados por um pipeline específico. Ver [origem-pucmaps.md](../origem-pucmaps.md) para a rastreabilidade completa.
