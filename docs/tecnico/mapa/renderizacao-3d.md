# Renderização 3D do campus

> Estado: ATUAL (prédios LOD0/LOD1/LOD2 com GLBs remotos — Tarefa 4) + PLANEJADO (vegetação, props, PucStops, picking, iluminação, diagnóstico)

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

Fluxo: style carregado → footprints 2D (source compartilhada) → manifesto local →
resolver → `install()` (3 camadas de extrusão) → câmera parada por 250 ms →
`onCameraIdle()` pede LOD1/LOD0 conforme o zoom.

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

## Vegetação e props

Não migrados (ver [assets-pipeline.md](assets-pipeline.md)). No PUCMaps são
controllers separados (`campus_vegetation_controller.dart`,
`campus_props_controller.dart`) com 4 árvores, 7 carros e a área esportiva, e
dependem de `trees_pilot.geojson`, `cars.geojson` e `campus_sports.json`.

## Iluminação

Não implementada. O Mapbox Standard aplica a luz padrão do style.

## Performance observada

Medições desta etapa (emulador x64, Android 15, debug — **não** representam aparelho):

- Download: LOD1 1,1 MB ao passar do zoom 15,5; LOD0 até 3,97 MB.
- Com pitch 45° e zoom ~17,2, a vista + margem cobre quase o campus inteiro e os
  **12 chunks** foram pedidos em ~0,3 s. Na prática o LOD0 inteiro é baixado na
  primeira aproximação. Mesmo comportamento da origem (pitch 65°).
- Instalação das extrusões: 18–66 ms após o style pronto (logs `[campus3d]`).
- Modelos visíveis no screenshot ~6 s após o zoom (incluindo downloads).
- FPS, draw calls e memória **não medidos**.

Números de referência da origem (manifesto `campus_chunks.json`, não medidos aqui):
LOD0 72.211 triângulos e 85 draw calls; LOD1 20.583 triângulos e 34 draw calls;
13 materiais. `docs/campus-3d-validacao.md` do PUCMaps cita 67.929 triângulos,
81/29 draw calls e 4,6 MB — números anteriores ao manifesto atual.

## Diagnóstico

Logs `[campus3d]` (debug/profile): extrusões prontas, LOD1/chunks pedidos, falhas
por source. O painel `campus_3d_diagnostics.dart` (FPS, draw calls, GPU, botão
"Testar 3D") **não foi portado**; candidato a ficar atrás de
`CampusMapFeatures.diagnostics`, sem UI normal.

## Validação em aparelho

Feita só em emulador (ver [setup-mobile.md](setup-mobile.md#campus-3d-remoto--tarefa-4)).
Aparelho físico pendente; o protocolo do PUCMaps continua aplicável.

## Riscos conhecidos

- Sem rede ou com o host indisponível: extrusões continuam; GLBs não aparecem.
- Falha da `ModelSource` do LOD1 é reportada para o source inteiro: todos os
  prédios voltam à extrusão na faixa LOD1, mesmo que 3 dos 4 grupos tenham
  carregado (extrusão e GLB podem coincidir nessa situação degradada).
- LOD0 é carregado inteiro na primeira aproximação inclinada; não há descarga.
- Cache: `Cache-Control: public, max-age=31536000, immutable` nos blobs; o
  aproveitamento pelo cache do Mapbox não foi medido.
