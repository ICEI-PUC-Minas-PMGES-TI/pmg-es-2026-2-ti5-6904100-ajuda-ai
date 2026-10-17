# ADR-0004 — Pacote Flutter `campus_map`

> Estado: PLANEJADO (pacote ainda não criado)

## Contexto

O PUCMaps mobile é um app Flutter próprio, com dependências e arquitetura diferentes do app do Ajuda-aí: usa `provider` para estado, `get_it` como service locator global, `go_router` para navegação, `dio` como cliente HTTP, além de dependências específicas de mapa (`mapbox_maps_flutter`, `geolocator`).

O app Flutter do Ajuda-aí não usa nenhuma dessas dependências: estado é um singleton com `ValueNotifier`, navegação é imperativa (`Navigator`/`MaterialPageRoute`), e o cliente HTTP é `http` puro.

Copiar o código do PUCMaps diretamente para dentro do app do Ajuda-aí contaminaria o app principal com uma arquitetura e um conjunto de dependências incompatíveis, além de mocks e acoplamentos específicos do PUCMaps (service locator global, rotas próprias).

## Decisão

- O mapa entra no Ajuda-aí como um **pacote Flutter interno**, em `code/mobile/packages/campus_map`, referenciado pelo app principal por dependência de path no `pubspec.yaml`.
- O pacote encapsula internamente suas próprias dependências (Mapbox, estado interno, cliente HTTP interno) — essas dependências não vazam para o `pubspec.yaml` do app principal além da própria referência ao pacote.
- O pacote não usa `get_it` global do app nem registra rotas via `go_router` no app principal; ele expõe widgets e um controller que o app principal integra na navegação existente (`lib/widgets/navegacao_app.dart`, substituindo o placeholder atual de `MapaPage`).
- A interface do pacote deve suportar inicialmente uma fonte de dados local/estática (snapshot), permitindo validar a renderização sem depender do backend, e depois trocar para uma fonte de dados remota (API do Ajuda-aí) sem exigir reescrever a tela que o consome.
- Mocks e dados de exemplo registrados no service locator do PUCMaps não são portados.

## Consequências

- O app principal do Ajuda-aí não precisa adotar `provider`/`get_it`/`go_router` para ganhar o mapa.
- É possível testar o pacote isoladamente (com um app de exemplo dentro do próprio pacote, se necessário).
- A resolução de assets embutidos no pacote (caminho `packages/campus_map/assets/...`) precisa ser validada especificamente para os GLBs usados em `ModelSource`/`ModelLayer` do Mapbox, que no PUCMaps resolviam o asset por um caminho `asset://` calculado a partir do próprio app — esse cálculo precisa ser revisto no contexto de um pacote.
- O pacote não implementa login; identidade e autenticação são responsabilidade do app principal, conforme [ADR-0001](ADR-0001-identidade-central.md).
