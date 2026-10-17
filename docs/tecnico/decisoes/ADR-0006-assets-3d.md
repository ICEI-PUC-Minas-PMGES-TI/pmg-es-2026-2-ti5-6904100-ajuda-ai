# ADR-0006 — Assets 3D

> Estado: IMPLEMENTADO (Tarefa 4). Substitui a decisão inicial de embutir os GLBs no pacote, registrada abaixo como histórico.

## Contexto

O PUCMaps renderiza o campus em 3D com modelos GLB carregados pelo Mapbox
(`ModelSource`/`ModelLayer`), em níveis de detalhe: LOD0 e LOD1 em GLB e LOD2
como extrusão das footprints. No projeto de origem os GLBs eram **locais**,
embutidos no app (cerca de 10,7 MB entre prédios, debug, vegetação, props e o
totem), sem CDN. Eles são gerados por um pipeline externo ao repositório.

A primeira versão desta ADR previa embutir os GLBs úteis no pacote `campus_map`
e tratar o Azure Blob Storage como evolução futura. Durante a integração (Tarefa 4)
foi validado que o Mapbox Maps Flutter 2.31.0 carrega GLB diretamente por `https:`
na `ModelSource`, e o Ajuda-aí já tinha o container público `map-assets`. A
decisão passou a ser hospedar os assets pesados no Azure.

## Decisão

- Os GLBs de produção ficam no **Azure Blob Storage**, container público
  `map-assets`, organizados por versão do mapa.
- O manifesto usa **caminhos relativos** à versão (`models/lod0/c00.glb`).
- A URL base é configurável: `CampusMapConfig.mapAssetsBaseUrl`, que a `MapaPage`
  lê de `MAP_ASSETS_BASE_URL`. O pacote monta
  `<base>/campus/versions/<versão>/<caminho relativo>`.
- O pacote **não depende de SDK do Azure**: o cliente só faz leitura HTTPS pública.
- O GeoJSON pequeno das footprints e o manifesto (16 KB) continuam locais no
  pacote, porque são dados necessários para o 2D e para resolver os modelos.
- O campus **não é duplicado** no APK e no storage: nenhum `.glb` é versionado no
  Git do Ajuda-aí nem empacotado no app.
- Assets de debug e órfãos não são migrados. Vegetação e props seguem a mesma
  regra de hospedagem desde a Tarefa 5; PucStop fica para fase própria.
- Cada versão publicada é **imutável**: alterar um arquivo exige nova versão.

### Estrutura atual

- Container: `map-assets`.
- Versão técnica atual: `2026-09-30-r2` (data do snapshot OSM + revisão). A
  `2026-09-30-r1` continua publicada e intacta.
- Estrutura:
  - `campus/versions/{version}/models/lod0/`
  - `campus/versions/{version}/models/lod1/`
  - `campus/versions/{version}/models/vegetation/` (desde r2)
  - `campus/versions/{version}/models/props/` (desde r2)
  - `campus/versions/{version}/manifests/`

A publicação é feita pelo script versionado
`code/back/api/scripts/publicar-assets-mapa.mjs` (ver
[mapa/assets-pipeline.md](../mapa/assets-pipeline.md)).

## Consequências

Positivas:

- APK menor (nenhum GLB no bundle).
- Modelos versionados independentemente do app.
- Sem binários grandes no Git.
- Atualização futura por nova versão, sem alterar o renderer.
- Estrutura pronta para um futuro `map_versions` no banco.
- Host trocável (CDN ou outro storage) apenas mudando a URL base.

Trade-offs:

- O 3D depende de rede. Por isso há fallback: o 2D e a extrusão (LOD2/pendente)
  continuam quando a URL falta ou um GLB não carrega.
- A publicação precisa ser controlada (script com bloqueio de sobrescrita).
- Cache e versionamento precisam ser imutáveis
  (`Cache-Control: public, max-age=31536000, immutable`).
- A URL de assets precisa estar configurada no build (`MAP_ASSETS_BASE_URL`).

## Segurança

- Connection string, account key e SAS de escrita **nunca** vão para o Flutter.
- O app recebe somente a URL pública de leitura; o resolver recusa URL com
  query (SAS), credencial, fragmento ou esquema diferente de `https`.
- Credenciais de escrita ficam só no ambiente local de quem publica
  (`AZURE_STORAGE_CONNECTION_STRING`, mesmo nome usado pelo backend).

## Status

Implementado e validado (HTTP 200, tamanho e SHA-256 dos 17 objetos publicados;
renderização no emulador Android). GLBs embutidos no pacote **não são mais
arquitetura-alvo**.

## Histórico

| Data | Decisão |
|---|---|
| 2026-10-17 (Fase 0) | GLBs úteis embutidos no pacote `campus_map`; Azure `map-assets` como evolução futura; resolução de `asset://` a revalidar. **Substituída.** |
| 2026-10-17 (Tarefa 4) | GLBs no Azure `map-assets`, versão imutável `2026-09-30-r1`, manifesto relativo no pacote, URL base configurável. O problema de `asset://` deixou de existir. |
| 2026-10-17 (Tarefa 5) | Vegetação e props na mesma hospedagem; como mudam o manifesto, entram na nova versão `2026-09-30-r2` (autocontida, prédios repetidos com bytes idênticos), sem tocar na r1. |

Continuam válidas da versão anterior: o pipeline de geração é externo e não
reproduzível a partir deste repositório, e os números de desempenho do PUCMaps
são só referência até serem medidos no Ajuda-aí (ver
[mapa/renderizacao-3d.md](../mapa/renderizacao-3d.md)).
