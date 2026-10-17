# Mapa do campus — visão geral

> Estado: ATUAL (mapa base, renderer 2D com snapshot e campus 3D remoto) + PLANEJADO (demais funcionalidades)

## Objetivo da integração

Trazer o mapa do campus desenvolvido no projeto PUCMaps para dentro do Ajuda-aí, como uma funcionalidade integrada ao aplicativo principal, sem manter um segundo aplicativo, um segundo login ou um segundo backend.

A estratégia geral está detalhada em [origem-pucmaps.md](../origem-pucmaps.md) e nos ADRs em [decisoes/](../decisoes/). Este documento resume o que será aproveitado, o que será adaptado, e a sequência geral planejada.

## Implementação atual — fase 1

- Pacote Flutter interno `code/mobile/packages/campus_map`, consumido por path.
- API pública: `CampusMapConfig`, `CampusMapFeatures`, `CampusMapDefaults` e
  `CampusMapView(config: ...)`. As seis feature flags são apenas contrato futuro,
  todas desligadas por padrão; não ativam implementações nesta fase.
- `MapaPage` (`code/mobile/lib/tela_mapa.dart`) substitui o placeholder pelo mapa
  ocupando o corpo da tela em `SafeArea`, preservando a navegação inferior existente.
- Mapbox Maps Flutter 2.31.0, token público externo por `MAPBOX_ACCESS_TOKEN`,
  estilo opcional por `MAPBOX_STYLE_URI` e fallback `MapboxStyles.STANDARD`.
- Câmera atual: latitude `-19.92252415`, longitude `-43.9927295`, zoom `15.2`,
  pitch `0`, bearing `0`. Centro calculado a partir do bbox dos footprints reais;
  substitui o enquadramento aproximado da primeira integração.
- Token ausente/inválido apresenta mensagem controlada sem criar `MapWidget`.
  Erros de carregamento exibem aviso genérico, sem detalhes do SDK; o mapa permanece
  montado e o aviso desaparece quando o SDK sinaliza carregamento completo.
- Attribution e logo mantidos nos padrões do SDK, sem desativação ou sobreposição
  por controles do aplicativo. Não há localização do usuário.
- O mapa base é anônimo: `apiBaseUrl` e `accessTokenProvider` são `null` na integração.
  Não há GLB, extrusão, busca, rotas ou backend de mapa.

## Implementação atual — campus 2D (Tarefa 3)

- Um único asset GeoJSON embutido em
  `code/mobile/packages/campus_map/assets/data/campus_footprints.geojson`, com
  82 polígonos reais de construções, 77 nomes e 74 vínculos à API de origem.
  A API antiga não é acessada em runtime. Ver [dados-geo.md](dados-geo.md).
- API mínima adicional: `CampusDataSource.load()` → `CampusSnapshot`,
  `LocalCampusDataSource`, `CampusFeature` e `CampusBounds`. A fonte é injetável
  em `CampusMapView(dataSource: ...)`; o padrão usa o bundle do package.
  Nenhuma implementação remota foi criada.
- `CampusMapRenderer` adapta apenas a parte plana de `map_renderer.dart` e a
  abreviação de `BuildingLabel.mapText` do PUCMaps. Duas sources (polígonos e
  pontos de rótulo), quatro layers (`fill`, `line`, `clip`, `symbol`), IDs em
  `CampusMapLayerIds`. Cores discretas constantes, sem alternância por zoom.
- O recorte remove somente símbolos do basemap dentro das pegadas reais,
  para reduzir duplicação de rótulos. Não usa o retângulo de campus do stub,
  não recorta modelos e não altera globalmente o Mapbox Standard. Rótulos próprios
  começam no zoom 15.2, têm halo e respeitam colisão; cinco features sem nome
  permanecem sem rótulo inventado.
- Carregamento/parsing centralizados, uma vez por tela, depois do style pronto.
  Sources/layers existentes não são registradas novamente; callbacks de telas
  descartadas ou styles substituídos são ignorados. Falha no asset/renderer
  mostra estado controlado sem derrubar o mapa base.
- `MapaPage`, navegação, autenticação e backend permanecem sem alterações.
  Zoom, arraste e Perfil → Mapa → Perfil → Mapa foram validados no emulador.

Limitações: nenhuma geometria estática confiável de áreas abertas, salas ou limite
administrativo foi encontrada nos arquivos auditados. O snapshot não inventa esses
dados nem categorias ausentes. A distinção plana de `PARK`, `PARKING_LOT` e
`CONSTRUCTION` está preparada no renderer para uma futura fonte que as contenha;
não há volumes, mesmo que a feature possua altura.

## Implementação atual — campus 3D remoto (Tarefa 4)

- `MapaPage` liga `CampusMapFeatures(enable3d: true)` e passa `MAP_ASSETS_BASE_URL`.
- 82 prédios em três LODs: extrusão (LOD2, zoom < 16,5), 4 grupos GLB (LOD1) e
  12 chunks GLB (LOD0, zoom ≥ 17,8), baixados por HTTPS do Azure `map-assets`,
  versão imutável `2026-09-30-r1`. Nenhum GLB no Git do Ajuda-aí nem no APK.
- Manifesto `assets/data/campus_models.json` no package; vínculo 2D↔3D pelo `id`
  estável do footprint. Materiais dos GLBs preservados; sem cor por zoom.
- Câmera inicial com pitch 45° quando o 3D está ligado.
- Sem base URL, ou com GLB indisponível, o 2D/extrusão continuam.
- Vegetação, props, PucStops, picking, iluminação e diagnóstico: não migrados.
  Ver [renderizacao-3d.md](renderizacao-3d.md) e [assets-pipeline.md](assets-pipeline.md).

O status dos testes, do APK e da validação visual está em
[setup-mobile.md](setup-mobile.md#validação-desta-execução).

## O que será aproveitado

- Renderização de mapa via Mapbox, incluindo o estilo visual do campus.
- Renderização do campus em 2D (contornos, rótulos) e 3D (LOD0/LOD1/LOD2, vegetação, props).
- Busca de locais (prédios, salas, áreas).
- Modelo de dados geoespacial: versões do mapa, prédios, salas, áreas, grafo de navegação (nós e arestas).
- Cálculo de rotas, incluindo rota acessível, com snapping do ponto de origem/destino ao grafo.
- Conceito de eventos e cantinas/cardápios, inicialmente como leitura.
- Conceito de totens, reescrito como PucStops integrados ao XP central do Ajuda-aí.
- Ferramentas de diagnóstico relevantes (ex.: painel de performance 3D), quando tiverem valor contínuo.

## O que será adaptado ou reescrito

- Autenticação e identidade: o PUCMaps não terá login próprio; usa a identidade do Ajuda-aí (ver [ADR-0001](../decisoes/ADR-0001-identidade-central.md)).
- XP: não é portado do PUCMaps; é um domínio central novo do Ajuda-aí (ver [ADR-0002](../decisoes/ADR-0002-xp-central.md)).
- Rotas: deixam de ser pré-calculadas e passam a ser calculadas sob demanda (ver [ADR-0003](../decisoes/ADR-0003-rotas-sob-demanda.md)).
- Estrutura do app Flutter: o mapa entra como pacote interno `campus_map`, não como código solto no app principal (ver [ADR-0004](../decisoes/ADR-0004-campus-map-package.md)).
- Dados geoespaciais: migram para um schema `mapa` próprio, com PostGIS, introduzido só quando necessário (ver [ADR-0005](../decisoes/ADR-0005-schema-mapa-postgis.md)).
- Assets 3D: GLBs de prédios publicados como versão imutável no Azure `map-assets` e carregados por HTTPS (Tarefa 4; revisa a [ADR-0006](../decisoes/ADR-0006-assets-3d.md), ver [assets-pipeline.md](assets-pipeline.md#decisão-atual-de-hospedagem)).
- Administração: a aplicação Angular do PUCMaps não é migrada como aplicação; suas funcionalidades úteis são inventariadas e, quando fizer sentido, reimplementadas na coordenação em React do Ajuda-aí (ver [ADR-0007](../decisoes/ADR-0007-admin-pucmaps.md) e [administracao.md](administracao.md)).

## O que não é trazido

Infraestrutura específica da arquitetura antiga do PUCMaps que não tem justificativa para existir no Ajuda-aí: autenticação e `users` próprios, Redis (refresh token), SQS/fila de cálculo, gRPC, serviço de streaming de progresso, OpenTelemetry/Zipkin, uso de AWS SDK específico da infraestrutura antiga, Lambdas/Terraform do pipeline de tiles, rotas pré-calculadas, mocks registrados em service locator, e a aplicação Angular como produto. Detalhado em [origem-pucmaps.md](../origem-pucmaps.md).

## Sequência geral planejada

Ver a tabela de fases em [../README.md](../README.md#estado-da-integração-pucmaps). Em resumo: documentação → pacote Flutter + Mapbox base → renderização 2D/3D/assets → busca/localização com snapshot local → banco geo/PostGIS → API de mapa → rotas → XP/PucStops → ferramentas administrativas.

As primeiras três fases (pacote, renderização, busca com snapshot local) não exigem banco, PostGIS, backend novo, nem alteração de autenticação ou XP.
