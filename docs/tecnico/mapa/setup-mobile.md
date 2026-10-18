# Setup mobile — `campus_map`

O mapa é um pacote interno em `code/mobile/packages/campus_map`, consumido
por path pelo app. Requisitos de Flutter/Dart e versões de plugins têm fonte nos
`pubspec.yaml` do app e do pacote. Para a engine nativa, usar Android com
SDK, emulador/aparelho e acesso à internet.

## Configuração

A `MapaPage` lê dart-defines e fornece `CampusMapConfig`:

- `MAPBOX_ACCESS_TOKEN`: token público `pk.` de runtime. Prefixo válido
  não comprova permissões/validade remotas. Nunca usar token secreto `sk.`.
- `MAPBOX_STYLE_URI`: opcional; vazio usa Mapbox Standard. Estilo customizado
  precisa ser acessível pelo token. Falha não troca silenciosamente o estilo.
- `MAP_ASSETS_BASE_URL`: HTTPS público, sem query/SAS, fragmento ou credencial.
  Exemplo: `https://<conta>.blob.core.windows.net/map-assets`.
- `CAMPUS_MAP_DIAGNOSTICS`: padrão false; true ativa painel técnico e logs
  de medição. Não distribuir esse modo a usuários.
- `API_BASE_URL`: configuração do app para adaptadores de busca, rotas,
  conteúdo e PucStops. [Conexão e login do app](../../../code/mobile/README.md).

O Flutter não lê o `.env` do backend. Tokens de runtime, URL pública de
assets e JWT são configurações diferentes; connection string/chave Azure
e SAS de escrita nunca entram no cliente.

`apiBaseUrl`/`accessTokenProvider` de `CampusMapConfig` são campos
reservados, sem consumo no pacote. A integração HTTP/JWT usa os serviços
injetados por `MapaPage`, não esses campos.

`CampusMapFeatures` controla 3D, vegetação, props, PucStops, eventos,
restaurantes e diagnóstico. Conteúdo/PucStops exigem serviços injetados.
A flag `routes` é reservada e não altera comportamento; rotas dependem de
`routeService`. Sem 3D, o manifesto não é carregado.

## Executar

Em `code/mobile`, com as variáveis da sessão preenchidas sem imprimir tokens:

```powershell
flutter pub get
flutter devices
flutter run -d <device-id> --dart-define="MAPBOX_ACCESS_TOKEN=$env:MAPBOX_ACCESS_TOKEN" --dart-define="MAP_ASSETS_BASE_URL=$env:MAP_ASSETS_BASE_URL"
```

Estilo customizado pode ser passado por
`--dart-define="MAPBOX_STYLE_URI=$env:MAPBOX_STYLE_URI"`.
Também é possível usar `--dart-define-from-file=<arquivo-local.json>`;
guardar esse arquivo fora do Git.
Alterar dart-defines exige nova execução/build; hot reload não os atualiza.

O pacote inicializa o token por `MapboxOptions.setAccessToken` antes do
`MapWidget`. Mudança de token/estilo recria o mapa. Logo e atribuição
permanecem habilitados.

## Plataformas e permissões

A integração nativa usa Mapbox Maps Flutter; Web/desktop exibem estado controlado,
sem engine. O projeto não contém alvo iOS configurado.

No Android, versões de SDK/Gradle são as declaradas nos arquivos de build e
defaults do Flutter utilizado. O pacote solicita localização somente em ação
explícita; [permissões e ciclo de vida](busca-localizacao.md#localização-e-permissões).

Token público de runtime não é credencial de download Maven. Não introduzir
segredo no app para contornar falhas de conectividade.

## Validar localmente

No app:

```powershell
flutter analyze
flutter test
flutter build apk --debug
```

No pacote:

```powershell
flutter pub get
flutter analyze
flutter test
```

Testes de configuração, assets, controllers e widgets usam fakes e não comprovam
download/renderização nativos. Em aparelho/emulador, conferir abertura,
reentrada, zoom/LOD, seleção, localização e degradação sem API/GLBs.
Não usar contagem de testes ou tempos de uma máquina como contrato.

## Diagnóstico

- **Sem mapa:** conferir token, estilo, conectividade/DNS e suporte da plataforma.
  Basemap não exige API; mensagens não devem expor URLs/erros do SDK.
- **Basemap sem footprints:** conferir declaração de assets no pubspec e
  caminho `packages/campus_map/assets/data/campus_footprints.geojson`.
- **3D indisponível:** conferir base HTTPS e versão/caminhos do manifesto.
  Modelos faltantes mantêm 2D/extrusão; [renderer](renderizacao-3d.md).
- **Busca/rota/conteúdo:** conferir `API_BASE_URL` e conectividade com a API.
  Em Android Emulator, `localhost` é o Android; [README mobile](../../../code/mobile/README.md#api-no-android-emulator).
- **Coleta:** conferir sessão e GPS; a geofence é decidida no servidor.
