# Mapa do campus — visão geral

> Estado: ATUAL (mapa base da fase 1) + PLANEJADO (funcionalidades das fases 2+)

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
- Câmera aproximada: latitude `-19.924266`, longitude `-43.991491`, zoom `15.5`,
  pitch `0`, bearing `0`. Referência pública da região de entrada do campus:
  [Wikimedia Commons](https://commons.wikimedia.org/wiki/File:Entradapucminas.jpg).
  É somente um enquadramento inicial a refinar na portabilidade do renderer;
  não representa geometria nem localização exata de prédios/salas.
- Token ausente/inválido apresenta mensagem controlada sem criar `MapWidget`.
  Erros de carregamento exibem aviso genérico, sem detalhes do SDK; o mapa permanece
  montado e o aviso desaparece quando o SDK sinaliza carregamento completo.
- Attribution e logo mantidos nos padrões do SDK, sem desativação ou sobreposição
  por controles do aplicativo. Não há localização do usuário.
- O mapa base é anônimo: `apiBaseUrl` e `accessTokenProvider` são `null` na integração.
  Não há GeoJSON, snapshot, GLB, renderer próprio, busca, rotas ou backend de mapa.

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
- Assets 3D: ficam embutidos no pacote inicialmente, sem a infraestrutura de CDN do projeto original (ver [ADR-0006](../decisoes/ADR-0006-assets-3d.md)).
- Administração: a aplicação Angular do PUCMaps não é migrada como aplicação; suas funcionalidades úteis são inventariadas e, quando fizer sentido, reimplementadas na coordenação em React do Ajuda-aí (ver [ADR-0007](../decisoes/ADR-0007-admin-pucmaps.md) e [administracao.md](administracao.md)).

## O que não é trazido

Infraestrutura específica da arquitetura antiga do PUCMaps que não tem justificativa para existir no Ajuda-aí: autenticação e `users` próprios, Redis (refresh token), SQS/fila de cálculo, gRPC, serviço de streaming de progresso, OpenTelemetry/Zipkin, uso de AWS SDK específico da infraestrutura antiga, Lambdas/Terraform do pipeline de tiles, rotas pré-calculadas, mocks registrados em service locator, e a aplicação Angular como produto. Detalhado em [origem-pucmaps.md](../origem-pucmaps.md).

## Sequência geral planejada

Ver a tabela de fases em [../README.md](../README.md#estado-da-integração-pucmaps). Em resumo: documentação → pacote Flutter + Mapbox base → renderização 2D/3D/assets → busca/localização com snapshot local → banco geo/PostGIS → API de mapa → rotas → XP/PucStops → ferramentas administrativas.

As primeiras três fases (pacote, renderização, busca com snapshot local) não exigem banco, PostGIS, backend novo, nem alteração de autenticação ou XP.
