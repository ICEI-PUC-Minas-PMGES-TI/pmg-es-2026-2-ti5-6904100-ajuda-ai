# Renderização 3D do campus

> Estado: ATUAL (prédios LOD0/LOD1/LOD2 — Tarefa 4; vegetação, props e diagnóstico — Tarefa 5) + PLANEJADO (PucStops, picking, iluminação)

Implementação em `code/mobile/packages/campus_map/lib/src/three_d/`, adaptada do
`Campus3dController` do PUCMaps. Decisões: [ADR-0004](../decisoes/ADR-0004-campus-map-package.md),
[ADR-0006](../decisoes/ADR-0006-assets-3d.md) (ver observação em
[assets-pipeline.md](assets-pipeline.md#decisão-atual-de-hospedagem)).

## Arquitetura do renderer

| Componente | Responsabilidade |
|---|---|
| `MapaPage` | Só fornece configuração (`MAP_ASSETS_BASE_URL`, `enable3d: true`). |
| `CampusMapView` | Ciclo de vida: style pronto → 2D → 3D; câmera; erros de source. |
| `CampusMapRenderer` | 2D (fill, contorno, rótulos, recorte do basemap). Com 3D, o recorte inclui `model`. |
| `CampusModelManifest` | Lê e valida `assets/data/campus_models.json` (bundle do package). |
| `CampusAssetResolver` | `base HTTPS + campus/versions/<versão>/ + caminho relativo`. Não conhece Azure. |
| `Campus3dLayers` / `Campus3dLod` | IDs, limiares, definição das extrusões e seleção de chunks. |
| `Campus3dController` | Extrusões, `ModelSource`/`ModelLayer`, LOD por câmera, fallback, idempotência. |
| `CampusEnvironmentSet` | Lê e valida as seções `vegetation` e `props` do manifesto (Tarefa 5). |
| `CampusEnvironmentController` | Uma instância por seção: source GeoJSON de pontos + modelos do style + uma `ModelLayer` por tipo. |
| `Campus3dDiagnostics` | Só com `diagnostics=true`: métricas do Mapbox, downloads, marcos de tempo, A/B. |

Fluxo: style carregado → footprints 2D (source compartilhada) → manifesto local →
resolver → `install()` (3 camadas de extrusão) → vegetação → props → câmera
parada por 250 ms → `onCameraIdle()` pede LOD1/LOD0 conforme o zoom.

O PUCMaps disparava o LOD pelo `onMapIdle`. Na validação, com um GLB indisponível
o Mapbox **não voltou a emitir idle**, e o LOD0 nunca era pedido. O gatilho
passou a ser `onCameraChangeListener` com debounce (`Campus3dLod.cameraSettle`).

## LOD (níveis de detalhe)

Confirmado no código de origem e mantido:

| LOD | Zoom | Fonte | Observação |
|---|---|---|---|
| LOD2 | `< 16.5` | `fill-extrusion` das footprints (`height`/`minHeight`) | Sem GLB. |
| LOD1 | `16.5 – 17.8` | 4 grupos GLB (`g0..g3`) em uma `ModelSource` | Sombra projetada desligada (como na origem). |
| LOD0 | `≥ 17.8` | 12 chunks GLB (`c00..c11`), uma `ModelSource` cada | Sombra projetada ligada (como na origem). |

Pré-carga: LOD0 a partir de `16.8` (valor da origem), só chunks que cruzam a vista
+ 25% de margem, do mais próximo ao mais distante, um por frame, sem descarregar.
LOD1 a partir de `15.5` — **mudança**: no PUCMaps o LOD1 baixava ao abrir o mapa;
aqui segue a mesma antecedência de 1 nível do LOD0 para não baixar 1,1 MB na
visão geral. Todos os valores ficam em `Campus3dLod`.

Transição: os limites `minzoom`/`maxzoom` do Mapbox trocam os LODs sem
sobreposição. As camadas "pendentes" (`pending-lod1`, `pending-lod0`) mantêm a
extrusão dos prédios cujo GLB ainda não foi pedido, ou falhou, e são removidas
300 ms depois do pedido (técnica da origem). Sem histerese própria.

## GLBs e posicionamento

- 16 GLBs de prédios: 12 LOD0 (3.970.300 B) + 4 LOD1 (1.134.592 B) = 5.104.892 B.
- Cada GLB é um chunk/grupo com vários prédios; 82 prédios, cada um em exatamente
  um chunk e um grupo. O vínculo 2D↔3D usa o `id` estável do footprint
  (ex.: `P01_R4751608`), nunca o nome.
- Posição: `ModelSourceModel.position = anchor [lon, lat]` do manifesto.
- Orientação `[0, 0, 0]`, escala `[1, 1, 1]`, unidade metros — convenção
  `placement` do `campus_chunks.json`, lida do manifesto, sem normalização.
- Altitude: nenhum offset. Base das extrusões = `minHeight` (0 em todos os 82).
- URI `https://...` direto na `ModelSource` (suportado pelo Mapbox 2.31.0:
  `http:`, `https:`, `mapbox://`). O antigo truque de prefixo `asset://` foi removido.

Materiais preservados: nenhum `model-color`, `model-color-mix-intensity`,
`model-emissive-strength` ou `materialOverrideNames`. A extrusão usa a cor de
parede do pipeline por prédio (4 tons neutros: `#d1d1d0`, `#e7dac8`, `#eae7e2`,
`#f6f6f3`), fixa por `id` — não por zoom nem por categoria.

## Comportamentos antigos removidos

| Comportamento | Situação |
|---|---|
| Ground skirt / volume abaixo do solo | Já recusado na origem (`AGENTS.md`); não portado. Base = `minHeight`. |
| Azul/roxo por zoom | Vinha da extrusão genérica da API e do preenchimento azul (`#3388ff`) do `map_renderer.dart` antigo; não portado. Teste garante ausência. |
| Cores de debug (magenta/ciano/verde) | Do painel de diagnóstico; não portado. |
| Janelas acesas (`PUC_Window_Emissive`, `#ffe1ac`) | Não portado nesta fase. |
| Picking (`tapLayer`, `logical`, camada 0,01) | Não portado; flag `CAMPUS_BUILDING_PICKING_ENABLED` não existe aqui. |
| `asset://` + camada-sonda | Removido (GLBs remotos). |

## Vegetação e props (Tarefa 5)

Origem: `campus_vegetation_controller.dart` e `campus_props_controller.dart` do
PUCMaps, que usavam o mesmo padrão. Ele foi mantido e os dois viraram duas
instâncias de `CampusEnvironmentController` (uma por seção do manifesto), sem
`rootBundle`, sem camada-sonda `asset://`, sem toggles de debug e sem dependência
de GetIt, sessão, Navigator ou backend.

| Seção | Modelos | Instâncias | Bytes | Camada / zoom mínimo |
|---|---|---|---|---|
| `vegetation` | `tree_round`, `tree_round_b`, `tree_cone`, `tree_cone_b` | 16 árvores (Jardim Dom Cabral) | 58.688 | `campus-map-3d-vegetation-tree`, 16,8 |
| `props`, tipo `sports` | `campus_sports` (quadras, piscina, campo, pista) | 1 | 58.724 | `campus-map-3d-props-sports`, 15,5 |
| `props`, tipo `vehicle` | 7 carros (sedã/hatch × cores) | 84 vagas (15% de ocupação) | 34.312 | `campus-map-3d-props-vehicle`, 17,0 |

- Uma source GeoJSON de pontos por seção; cada ponto diz qual modelo usar
  (`model`), `scale3` e `rot3` (mesma convenção do PUCMaps: giro em graus no eixo
  vertical, escala uniforme). O Mapbox desenha o mesmo modelo do style em todos
  os pontos que o usam.
- `addStyleModel` com a URL HTTPS da versão (prefixo `campus-map-3d-<seção>-`,
  sem colisão com os modelos do Standard). O download acontece ao instalar,
  inclusive na visão geral (151.724 B no total; medido abaixo).
- Camadas no slot `middle`, sem sombra projetada, recebem sombra, emissão 0 e
  nenhum `model-color`: materiais do GLB preservados. Prédios não foram alterados.
- Limiares em `Campus3dLod` (`vegetationMinZoom`, `sportsMinZoom`,
  `vehicleMinZoom`), valores da origem. Limiares dos prédios inalterados.
- O recorte do basemap (`clip`, escopo `basemap`) não atinge essas camadas.
- Posicionamento: as posições vêm do pipeline externo do PUCMaps
  (`place_trees.py`: dentro do jardim, longe de caminhos, prédios e totens;
  `place_cars.py`: vagas ao longo dos corredores de estacionamento do OSM).
  Nada é gerado aqui. Conferido na geração do manifesto: nenhuma árvore ou carro
  dentro de um dos 82 footprints.

### Falhas

- Cada seção é instalada depois dos prédios, com tratamento de erro próprio: uma
  falha marca só aquela seção como desativada; prédios, 2D e a outra seção seguem.
- Seção ausente ou inválida no manifesto vira `null` no parse; os prédios
  continuam válidos (manifesto r1, sem as seções, também é aceito).
- Validado no emulador com dois caminhos inexistentes (404): só aquelas variantes
  sumiram; demais árvores, carros, prédios e mapa seguiram, sem aviso na tela.
  O Mapbox **não** emitiu `onMapLoadError` para modelo do style indisponível
  (só o evento de recurso, visto pelo diagnóstico); o tratamento por
  `CampusEnvironmentController.owns()` fica como defesa.

### Lifecycle

Mesmo contrato dos prédios: um controller por style; `install()` concorrente
compartilha a mesma instalação; se as camadas da seção já existem no style, nada
é recriado (o Mapbox não expõe consulta de modelo do style, então a camada é o
marco). Troca de style ou de tela descarta os controllers. Perfil → Mapa →
Perfil → Mapa: uma instalação por entrada, sem duplicação.

## Iluminação

Não implementada. O Mapbox Standard aplica a luz padrão do style.

## Performance observada

Emulador `emulator-5554` (Android 15 / API 35, x64, GPU do PC), build **debug**
com `CAMPUS_MAP_DIAGNOSTICS=true`, 17/10/2026. Não representa aparelho físico.
O build `--profile` compilou, mas esconde o login de teste (só em `kDebugMode`) e
o login Microsoft real não foi usado; os números abaixo vêm do motor nativo do
Mapbox, menos afetado pelo modo do Flutter. O FPS do Dart não foi medido.

Classificação: **MEDIDO** (Mapbox ou app), **ESTIMADO**, **NÃO DISPONÍVEL**.

| Métrica | Valor | Origem |
|---|---|---|
| Style carregado | 1,4–1,6 s frio; 0,4 s com cache; 0,13–0,24 s na reentrada | MEDIDO (marcos desde a criação do `MapWidget`) |
| 2D pronto | 1,6–1,9 s frio; 1,0 s com cache; 0,6 s na reentrada | MEDIDO |
| Extrusões (LOD2) | +25–60 ms após o 2D | MEDIDO |
| Vegetação e props instalados | +35–85 ms após as extrusões | MEDIDO |
| Downloads ambientais completos | 2,0–2,3 s frio (12 arquivos, 82–205 ms cada) | MEDIDO (`onResourceRequest`) |
| Primeiro frame completo do mapa | 2,2–2,3 s frio; 1,5 s com cache; ~1,0 s na reentrada | MEDIDO (`renderMode FULL`) |
| LOD1 (4 GLBs) | ~0,15–0,3 s do pedido ao último download (frio) | MEDIDO |
| LOD0 (12 GLBs) | ~0,45 s entre o primeiro e o último chunk (frio) | MEDIDO |
| Total baixado (frio, campus inteiro) | 28 arquivos, **5.256.616 B** (5.104.892 prédios + 151.724 ambiente), cada arquivo uma vez | MEDIDO |
| Total baixado (cache quente / reentrada) | 0 B; 28 respostas do cache | MEDIDO |
| FPS do mapa | 55–60 durante pan/zoom; 0 parado (o Mapbox não redesenha) | ESTIMADO (frames renderizados por segundo) |
| Tempo de render | mediana 3,3–7,7 ms; máx. até ~280 ms no primeiro frame, ≤ 36 ms depois | MEDIDO (`PerformanceStatistics`) |
| Draw calls do frame | 121–232 (inclui o basemap Standard) | MEDIDO |
| Memória GPU do Mapbox | vértices 11,7–28,2 MB; texturas 18,8–35,3 MB | MEDIDO |
| RSS do processo | 568–641 MB (debug) | MEDIDO |
| Modelos ambientais na tela | contagem por `queryRenderedFeatures` (aproximada para modelos) | ESTIMADO |
| Tempo de GPU por frame, FPS do Dart | — | NÃO DISPONÍVEL nesta medição |

### Draw calls (gargalo histórico do PUCMaps)

A/B com a mesma câmera (zoom 18,2, inclinado, Jardim Dom Cabral), camadas ligadas
× desligadas:

| Conjunto | Δ draw calls | Mediana de render ON / OFF |
|---|---|---|
| Prédios GLB (LOD1 + LOD0 pedidos) | +45 / +46 | 3,5–3,9 / 3,1 ms |
| Ambiente inteiro | +38 / +50 / +62 (três rodadas) | 3,3–3,8 / 3,3–4,1 ms |
| Só vegetação | +21 / +26 | 3,8–4,6 / 3,9–4,4 ms |
| Só props | +18 / +36 | 3,8–4,4 / 3,7–3,9 ms |

- O LOD0 continua agrupado em chunks (~45 draw calls dos prédios nesse
  enquadramento); sem regressão em relação à Tarefa 4.
- **O ambiente praticamente dobra os draw calls de modelos de perto**, mas no
  emulador a mediana de render não mudou de forma mensurável. O custo segue
  variantes × materiais (4 árvores × 2, 7 carros × 2, área esportiva 6), não o
  número de instâncias.
- Hipótese testada e **descartada**: reduzir o `maxzoom` da source GeoJSON para
  16 (menos tiles) não reduziu (Δ 62 contra 38); revertido. Há variação de
  ±10–20 draw calls entre rodadas.
- Oportunidade sem refatorar o app: menos variantes/materiais no pipeline (ex.:
  carros em um GLB com cores por vértice). Depende do pipeline externo; não feito.
  Se o aparelho físico mostrar custo, `vegetation`/`props` podem ser desligados
  por flag sem tocar nos prédios.

## Diagnóstico

Logs `[campus3d]` (debug/profile): extrusões prontas, seções ambientais, LOD1 e
chunks pedidos, falhas por source.

Com `CampusMapFeatures.diagnostics` (no app:
`--dart-define=CAMPUS_MAP_DIAGNOSTICS=true`), `Campus3dDiagnostics` (adaptado de
`campus_3d_diagnostics.dart`) mostra um painel no topo do mapa (logo e
atribuição do Mapbox continuam visíveis) e registra `[campus3d] diag ...`:

- `PerformanceStatistics` (API experimental do Mapbox, amostra de 2 s): draw
  calls, render mediana/máx., memória de vértices/texturas, camadas mais caras.
  Só chega quando o mapa renderiza; parado não há amostra.
- FPS aproximado (frames que o Mapbox terminou no último segundo) e RSS.
- Downloads dos assets da versão (`onResourceRequest`): arquivos, bytes, cache,
  erros, mais lento. Consulta ao cache local sem resultado e cancelamentos não
  contam como erro; o evento repetido do ResourceLoader é ignorado.
- Marcos de tempo (style, 2D, extrusões, LOD1, chunks, seções, downloads,
  primeiro frame completo); o botão “Marcos” imprime todos no log.
- Botões “A/B ambiente” (total e por seção) e “A/B prédios”: draw calls e render
  com a mesma câmera, pedindo repintura enquanto amostra.

Não portados da origem: cores de debug, sombras, presets de luz, isolamento de
grupos, variantes `ss_`/`nowin_`, GLBs individuais, trace e teste de culling com
câmera própria (dependiam de assets descartados ou de iluminação). Sem a flag
nada disso é criado: nenhum listener por frame, nenhum painel, nenhum log `diag`.

## Validação em aparelho

Feita só em emulador (ver [setup-mobile.md](setup-mobile.md#validação-desta-execução)).
Aparelho físico pendente; o protocolo do PUCMaps continua aplicável, agora com o
painel `diagnostics` no lugar do `CAMPUS_3D_DEBUG`.

## Riscos conhecidos

- Sem rede ou com o host indisponível: extrusões continuam; GLBs não aparecem.
- Falha da `ModelSource` do LOD1 é reportada para o source inteiro: todos os
  prédios voltam à extrusão na faixa LOD1, mesmo que 3 dos 4 grupos tenham
  carregado (extrusão e GLB podem coincidir nessa situação degradada).
- LOD0 é carregado inteiro na primeira aproximação inclinada; não há descarga.
- Cache: `Cache-Control: public, max-age=31536000, immutable` nos blobs. Medido
  no emulador: na segunda abertura e na reentrada os 28 arquivos vieram do cache
  do Mapbox (0 B de rede).
- Vegetação e props baixam ao abrir o mapa, mesmo na visão geral (151.724 B).
- O ambiente dobra os draw calls de modelos de perto (ver acima); impacto em
  aparelho intermediário não medido.
