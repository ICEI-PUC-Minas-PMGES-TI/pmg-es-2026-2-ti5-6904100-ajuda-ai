# Setup mobile — pacote campus_map

> Estado: ATUAL para mapa base, campus 2D/3D, vegetação/props/diagnóstico, busca/localização (Tarefa 6), busca remota (Tarefa 8) e rotas (Tarefa 9). Demais recursos continuam PLANEJADOS.

## Requisitos e escopo

- Flutter 3.47.0 / Dart 3.13.0, detectados nesta execução e compatíveis com o app.
- Android SDK e emulador/aparelho Android com acesso à internet.
- Token público Mapbox fornecido externamente; nunca colocar credenciais no source,
  testes, documentação, logs ou arquivos versionados.
- `campus_map` é um package Flutter interno em `code/mobile/packages/campus_map`,
  consumido por path. Encapsula `mapbox_maps_flutter: 2.31.0` (versão exata).
- O mapa base não depende de Docker, API local, sessão, banco ou login próprio.
  Para chegar à aba Mapa pelo app, permanece o fluxo de entrada já existente.

O pacote contém um snapshot local de 82 footprints reais do PUCMaps em
`assets/data/campus_footprints.geojson`, sem requisição a backend antigo/novo.
O renderer adiciona preenchimento, contornos e rótulos depois que o style está
pronto. Com `enable3d`, o campus 3D usa extrusão (LOD2) e 16 GLBs de prédios
(LOD1/LOD0) baixados por HTTPS do container público `map-assets`, mais 16
árvores, a área esportiva e 84 carros (12 GLBs pequenos da mesma versão); nenhum
GLB é empacotado no app. A Tarefa 6 adiciona busca local por nome/código e
localização Android sob demanda. A busca usa a API do mapa com fallback local
(Tarefa 8) e a rota a pé vem de `POST /mapa/rotas` (Tarefa 9,
[rotas.md](rotas.md)); sem a API não há rota. Não há picking nem PucStop. Não
há geometria confirmada de áreas abertas/salas.
Fluxo, permissões e testes: [busca-localizacao.md](busca-localizacao.md).
Detalhes: [renderizacao-3d.md](renderizacao-3d.md) e
[assets-pipeline.md](assets-pipeline.md).

## Configuração

A `MapaPage` lê `String.fromEnvironment` no app principal e fornece
`CampusMapConfig` ao `CampusMapView`:

- `MAPBOX_ACCESS_TOKEN`: obrigatório para carregar o mapa, deve ser token público
  de runtime com prefixo `pk.`. Token vazio ou com outro prefixo gera estado
  controlado e não monta o renderer. A validação local do prefixo não comprova
  validade, permissões ou expiração na conta Mapbox.
- `MAPBOX_STYLE_URI`: opcional. Ausente, vazio ou só com espaços usa
  `CampusMapDefaults.styleUri`, que referencia `MapboxStyles.STANDARD`
  (`mapbox://styles/mapbox/standard`). URI personalizada precisa ser acessível pelo
  token fornecido. Falha remota de estilo gera aviso; não há retry próprio nem
  troca silenciosa de estilo depois de uma falha remota.
- `apiBaseUrl` e `accessTokenProvider`: `null`; reservados no contrato para uma
  futura API autenticada do Ajuda-aí. Não são o token Mapbox.
- `MAP_ASSETS_BASE_URL`: URL HTTPS pública do container de assets do mapa, sem
  SAS/query (ex.: `https://<conta>.blob.core.windows.net/map-assets`). O pacote
  monta `<base>/campus/versions/<versão do manifesto>/<caminho relativo>`.
  Ausente, vazia, `http:`, com query/fragment ou credencial: o 2D continua e a
  tela mostra “Prédios 3D indisponíveis neste ambiente.”. O app recebe só essa
  URL pública; connection string, chave de conta e SAS nunca entram no Flutter.
- `CampusMapFeatures`: `enable3d`, `vegetation`, `props`, `routes`, `pucStops`,
  `events`, `canteens` e `diagnostics`. Têm efeito: `enable3d` (padrão `false`;
  a `MapaPage` liga), `vegetation` e `props` (padrão `true`, só valem com
  `enable3d`; servem para rollback/medição sem tocar nos prédios) e
  `diagnostics` (padrão `false`), e `pucStops` (padrão `false`; a `MapaPage`
  liga junto com um `CampusPucStopService`; ver [pucstops.md](pucstops.md)).
  Com `enable3d: false`, manifesto 3D não é lido
  e nenhuma camada 3D é criada.
- `CAMPUS_MAP_DIAGNOSTICS`: opcional, padrão `false`. Com `true` a `MapaPage` liga
  `diagnostics`: painel técnico no topo do mapa e logs `[campus3d] diag`. Só para
  build de medição; nunca em build distribuído a usuários.

O pacote inicializa pelo mecanismo oficial `MapboxOptions.setAccessToken`, antes
de montar `MapWidget`, sem repetir a chamada a cada rebuild. Mudança de token ou
estilo recria o mapa; não existe armazenamento global adicional do token no pacote.
Logo e attribution permanecem habilitados com os padrões do SDK.

`CampusMapView` usa `LocalCampusDataSource` por padrão, com caminho de bundle
`packages/campus_map/assets/data/campus_footprints.geojson`. A leitura é centralizada,
sem dependência HTTP, e pode receber outra `CampusDataSource` no futuro.
São duas sources e quatro layers 2D, com instalação idempotente, proteção contra
callbacks antigos e parsing uma vez por tela. Falha de dados/style do campus gera
mensagem controlada; não expõe exceções ou URLs.

## Execução

Em PowerShell, a partir de `code/mobile`, com `MAPBOX_ACCESS_TOKEN` já definido
no ambiente local da sessão (seu valor não deve ser impresso):

```powershell
flutter pub get
flutter run -d emulator-5554 --dart-define="MAPBOX_ACCESS_TOKEN=$env:MAPBOX_ACCESS_TOKEN" --dart-define="MAP_ASSETS_BASE_URL=$env:MAP_ASSETS_BASE_URL"
```

`MAP_ASSETS_BASE_URL` não é segredo (o container é público), mas também fica fora
do código para permitir trocar host/CDN sem alterar o renderer.

Estilo customizado opcional, também definido no ambiente local:

```powershell
flutter run -d emulator-5554 --dart-define="MAPBOX_ACCESS_TOKEN=$env:MAPBOX_ACCESS_TOKEN" --dart-define="MAPBOX_STYLE_URI=$env:MAPBOX_STYLE_URI"
```

Alternativamente, use `flutter run --dart-define-from-file=<caminho-local.json>`
com as mesmas chaves em um arquivo **fora do repositório**. Não versione esse
arquivo. Não existe script auxiliar de leitura de `.env` nesta implementação.
Escolha o ID efetivamente listado por `flutter devices` caso seja diferente.
Depois de entrar pelo fluxo normal do Ajuda-aí, abra a aba Mapa.

Sem os defines, o app compila e a tela informa:
“Mapa indisponível neste ambiente. Configure MAPBOX_ACCESS_TOKEN para carregar o mapa.”
Alterar dart-defines exige nova execução/build; hot reload não atualiza os defines.

## Android

Inspecionado: `android/app/build.gradle.kts`, `android/build.gradle.kts`,
`android/settings.gradle.kts`, `android/gradle.properties` e manifests.

- `applicationId` / namespace: `br.pucminas.ajuda_ai`.
- `minSdk = flutter.minSdkVersion`: 24 no SDK Flutter detectado.
- `compileSdk` / `targetSdk`: 36, herdados do mesmo Flutter.
- AGP 9.1.0, Gradle 9.4.1, Kotlin declarado 2.4.0, Java/JVM target 17.
- `INTERNET` já existia no manifest principal; não foi duplicado.
- Tarefa 6: `ACCESS_COARSE_LOCATION` e `ACCESS_FINE_LOCATION`, somente durante
  uso do mapa e com solicitação explícita pelo botão. Sem background location
  ou permissão de serviço foreground. Detalhes em [busca-localizacao.md](busca-localizacao.md).
- Nenhuma mudança em `API_BASE_URL`, `10.0.2.2`, cleartext ou network security.
  Os GLBs vêm por HTTPS; nenhuma configuração nativa foi necessária para o
  `ModelSource` remoto (Tarefa 4).
- Nenhuma alteração nativa foi necessária: o plugin configura seu repositório
  Maven de releases e o APK compilou. Nenhum secret/download token foi configurado
  nesta execução; não houve erro de download que exigisse credencial extra.

A referência oficial da versão é
[Mapbox Maps Flutter 2.31.0](https://pub.dev/packages/mapbox_maps_flutter/versions/2.31.0).
Não usar o token público de runtime como credencial de download.

## Câmera e plataformas

`CampusMapDefaults` concentra a câmera atual: latitude `-19.92252415`,
longitude `-43.9927295`, zoom `15.2`, pitch `0`, bearing `0`. Com `enable3d`, a
inclinação inicial é `pitch3d = 45` (o PUCMaps usava 65°); zoom, centro e
gestos permanecem os mesmos. É o centro do bbox
dos footprints reais, substituindo a câmera aproximada da primeira integração.
Esse bbox é a extensão das construções do snapshot, não um limite administrativo.
Ver [dados-geo.md](dados-geo.md) para origem, coordenadas e transformações.

A versão 2.31.0 do plugin suporta Android/iOS, sem Web/desktop. O widget mostra
estado controlado nessas outras plataformas. O Ajuda-aí não possui pasta iOS;
iOS não foi compilado ou validado nesta etapa.

## Verificação local

No app (`code/mobile`):

```powershell
flutter analyze
flutter test
flutter build apk --debug
```

No pacote (`code/mobile/packages/campus_map`):

```powershell
flutter pub get
flutter analyze
flutter test
```

Os widget tests com token ausente/inválido não inicializam o renderer nativo.
Os testes cobrem flags, configuração, fallback, estados sem token e integração
com a tela e navegação existente. A Tarefa 3 acrescenta validação do asset real,
parsing, identidade/geometria, bbox, imutabilidade, bundle do app, labels e
instalação idempotente/interrupção do renderer, sem inicializar Mapbox nativo.
Eles não comprovam carregamento remoto de tiles.

A Tarefa 4 acrescenta `campus_model_manifest_test.dart`,
`campus_asset_resolver_test.dart` e `campus_3d_test.dart`: manifesto real,
ids/caminhos relativos, vínculo footprint↔modelo, ausência de debug/PucStop/
vegetação/props, montagem de URL com/sem barra, recusa de `http`/SAS/`..`,
decisão `enable3d`, faixas de LOD, ausência de cor por zoom/paleta antiga,
instalação idempotente, fallback por falha de GLB e controller inativo. Usam
fakes de `StyleManager`/`MapboxMap`; não executam o motor nativo.

## Validação desta execução

Execução de 17/10/2026, branch `feat/integracao-mapa`.

### Mapa base — registro da validação anterior

- Dependências por path resolvidas no app e no pacote com Mapbox 2.31.0, sem upgrade
  amplo ou adaptação da versão solicitada.
- `flutter analyze` do pacote: sem problemas.
- `flutter analyze` do app: nenhum erro/aviso novo; permanece apenas o info
  preexistente `unnecessary_import` em `test/historico_test.dart:3` (exit code 1).
- `flutter test` do pacote: 6 testes passaram.
- `flutter test` do app: 146 testes passaram, incluindo a integração da MapaPage.
- `flutter build apk --debug`: sucesso, exit code 0, Gradle `assembleDebug` em
  91,9 segundos. APK em `code/mobile/build/app/outputs/flutter-apk/app-debug.apk`.
  Nenhuma mudança de Gradle, Manifest, Maven, minSdk ou Kotlin foi necessária.
- Aviso do build: Flutter identifica uso de Kotlin Gradle Plugin em `file_picker`
  e `mapbox_maps_flutter` e alerta sobre compatibilidade com versões futuras do
  Flutter. Não impediu o build atual e não motivou upgrade fora do escopo.
- Emulador detectado: `emulator-5554`, Android 15 / API 35, x64.
- Na primeira execução sem token, `flutter run -d emulator-5554 --debug
  --no-resident` instalou e abriu o app. Na validação visual subsequente foi usado
  um token público fornecido pelo `.env` local autorizado do PUCMaps, lendo
  `MAPBOX_PUBLIC_TOKEN` e passando seu valor em memória como `MAPBOX_ACCESS_TOKEN`.
  Nenhum valor foi copiado para source, logs, documentação ou Git.
- `MAPBOX_STYLE_URI` foi omitido. Mapbox Standard carregou visualmente na
  `MapaPage`, com rótulos da PUC Minas Coração Eucarístico e região do campus,
  sem tela branca/preta persistente. Logo visível e botão de attribution testado:
  abriu o menu oficial com créditos Mapbox e OpenStreetMap.
- Fluxo normal preservado: conta demo existente → Perfil → Mapa → Perfil → Mapa.
  O mapa carregou novamente após recriação da tela; processo permaneceu ativo,
  sem exceção fatal nos logs AndroidRuntime/Flutter verificados.
- A primeira tentativa com token falhou por timeout de 60 segundos no estilo.
  O mesmo token recebeu HTTP 200 ao consultar Standard pelo computador, enquanto
  o emulador não resolvia `api.mapbox.com`. O problema de conectividade foi
  resolvido reiniciando o mesmo AVD com cold boot e DNS explícito
  (`-no-snapshot-load -dns-server 8.8.8.8,1.1.1.1`), preservando os dados do AVD.
  Depois, resolução DNS e acesso ao Mapbox funcionaram. Nenhuma correção de código,
  arquitetura ou configuração Android do projeto foi necessária.
- Após remover o diagnóstico temporário: análise dos arquivos relevantes
  (`flutter analyze lib/tela_mapa.dart test/mapa_test.dart packages/campus_map`)
  sem problemas; os sete testes relacionados passaram novamente.
- `git diff --check`: sem erros de whitespace. Busca no diff e nos arquivos novos
  por `pk.`, `sk.`, `token`, `secret` e `password`: somente nomes, prefixos e
  referências de configuração; nenhum segredo real introduzido.

### Campus 2D — Tarefa 3

- `flutter pub get` no app e package: sucesso, nenhuma dependência nova ou upgrade.
- `flutter analyze` do pacote: sem problemas. No app permanece somente o info
  preexistente `unnecessary_import` em `test/historico_test.dart:3`, saída 1.
- `flutter test` no pacote: **18 testes passaram**. No app: **147 testes passaram**,
  incluindo resolução do asset do package pelo `LocalCampusDataSource` padrão.
- `flutter build apk --debug`: sucesso, saída 0, `assembleDebug` em **22,6 s**.
  Nenhuma alteração Android ou em `MapaPage` foi necessária. Permanece o aviso
  de compatibilidade futura Kotlin dos plugins já registrado acima.
- App recompilado/executado com o token público local autorizado, somente por
  dart-define em memória, sem `MAPBOX_STYLE_URI`: **Mapbox Standard**.
- No `emulator-5554` (Android 15, API 35, x64), footprints alinhados ao basemap,
  preenchimento/contornos neutros e labels próprios visíveis, inclusive Biblioteca
  e números de prédio ao aproximar. Cores permaneceram constantes no zoom.
- Zoom e arraste responderam; não foi realizado benchmark de FPS. Fluxo normal
  Perfil → Mapa → Perfil → Mapa passou, reabrindo no enquadramento inicial e sem
  duplicação visível de labels/camadas ou aviso de erro. Processo permaneceu ativo
  e os logs AndroidRuntime/Flutter/Mapbox de erro verificados não indicaram crash.
- Logo e botão de attribution permaneceram visíveis. Nenhum GLB/modelo/extrusão
  foi adicionado. O recorte de labels do basemap usa somente os footprints reais.
- Asset de **47.032 bytes**, **82 polígonos**, **77 labels possíveis** (sujeitos a
  colisão/zoom). Dados e limitações: [dados-geo.md](dados-geo.md).
- Renderer validado visualmente com Standard; estilos customizados não foram
  testados nesta execução. `git diff --check` limpo e busca nos arquivos novos/
  alterados sem token real, URL privada, e-mail ou caminho local no asset.

### Campus 3D remoto — Tarefa 4

Execução de 17/10/2026, branch `feat/integracao-mapa`, `emulator-5554`
(Android 15 / API 35, x64), token público local passado só em memória.

- Pacote: `flutter analyze` sem problemas; `flutter test` **40 testes passaram**.
- App: `flutter analyze` mantém só o info preexistente de `historico_test.dart`;
  `flutter test` **147 testes passaram**; `flutter build apk --debug` saída 0
  (`assembleDebug` 20,7 s). O APK contém o manifesto (16.039 B) e os footprints,
  e **nenhum `.glb`**.
- Prova com um GLB: só `models/lod0/c09.glb` publicado → Prédio 1/PROGRAD,
  Prédio 84 e vizinhos renderizados do Azure, alinhados ao footprint, escala e
  rotação corretas, base no solo, materiais originais. Os outros 15 GLBs (404
  naquele momento) caíram no fallback de extrusão, sem crash.
- Depois da publicação completa: zoom 15,2 (LOD2/extrusão), ~17,2 (LOD1) e ~18,2+
  (LOD0) conferidos por screenshot. Sem cores por zoom, sem tint, sem subsolo;
  3D do Standard recortado dentro das pegadas e mantido fora do campus.
- Perfil → Mapa → Perfil → Mapa (duas vezes): uma instalação por entrada, sem
  source/layer duplicada, processo ativo.
- Sem `MAP_ASSETS_BASE_URL`: footprints/rótulos 2D e aviso controlado.
- Não validado: zoom out por gesto via adb (o gesto de quick-zoom virou pan);
  FPS/draw calls/memória (o painel de diagnóstico não foi portado); aparelho físico.

### Ambiente 3D e diagnóstico — Tarefa 5

Execução de 17/10/2026, branch `feat/integracao-mapa`, `emulator-5554`
(Android 15 / API 35, x64), token público local passado só em memória.

```powershell
flutter run -d emulator-5554 --debug `
  --dart-define="MAPBOX_ACCESS_TOKEN=$env:MAPBOX_ACCESS_TOKEN" `
  --dart-define="MAP_ASSETS_BASE_URL=$env:MAP_ASSETS_BASE_URL" `
  --dart-define=CAMPUS_MAP_DIAGNOSTICS=true
```

- Pacote: `flutter analyze` sem problemas; `flutter test` **61 testes passaram**
  (20 novos em `test/campus_environment_test.dart` e 1 em
  `campus_model_manifest_test.dart`).
- App: `flutter analyze` mantém só o info preexistente de `historico_test.dart`;
  `flutter test` **147 testes passaram**; `flutter build apk --debug` saída 0
  (21 s). O APK contém o manifesto r2 (32.465 B) e **nenhum `.glb`**.
- Backend: só o script de publicação mudou; `npx vitest run` **200 testes
  passaram** (12 do script). A API local foi iniciada apenas para o login de
  teste e encerrada depois; nada do runtime do backend foi alterado.
- Visual (screenshots no emulador): árvores no Jardim Dom Cabral em pé, fora dos
  caminhos e prédios, escalas e giros variados, sem cobrir rótulos; carros
  perpendiculares aos corredores dos estacionamentos; área esportiva alinhada ao
  basemap (pista, campo, quadras, piscina). Prédios LOD1/LOD0 e footprints iguais
  à Tarefa 4; materiais e cores sem mudança; sem flicker grave nas trocas de zoom.
- Árvores somem abaixo de 16,8, carros abaixo de 17,0 e a área esportiva abaixo
  de 15,5 (camadas por `minzoom`).
- Perfil → Mapa → Perfil → Mapa (duas vezes): uma instalação por entrada,
  downloads do cache, sem erros nem duplicação.
- Falha simulada (dois caminhos inexistentes no manifesto, revertidos depois):
  só aquelas variantes sumiram; prédios, demais árvores/carros e mapa seguiram,
  sem aviso ao usuário e sem crash.
- Sem `CAMPUS_MAP_DIAGNOSTICS`: nenhum painel e nenhum log `diag`; árvores e
  props continuam.
- `--profile` compila, mas o login de teste não existe nesse modo; as medições
  foram feitas em debug (ver [renderizacao-3d.md](renderizacao-3d.md#performance-observada)).
- Não validado: aparelho físico; FPS do Dart/GPU; zoom out por gesto via adb.

## Diagnóstico

Token ausente ou inválido: conferir o dart-define de runtime e recompilar. Nunca
usar secret token no app. Erro de carregamento: conferir conexão, acesso do token
à conta/estilo e URI escolhida. A UI mostra mensagem genérica sem dados do SDK.
Nenhum erro exige iniciar backend de mapa nesta fase.

Sem footprints/labels próprios, mas com basemap carregado: conferir declaração do
asset no pubspec do package e resolução do caminho `packages/campus_map/...`.
Geometria de áreas abertas/salas e volumes 3D ainda não fazem parte do snapshot.
O Mapbox Standard pode exibir conteúdo cartográfico próprio fora das pegadas
do campus.

Aviso “Prédios 3D indisponíveis neste ambiente.”: conferir `MAP_ASSETS_BASE_URL`
(HTTPS, sem query). Prédios em extrusão simples mesmo com zoom alto: os GLBs da
versão não responderam; conferir no navegador
`<base>/campus/versions/<versão>/models/lod0/c00.glb` (HTTP 200,
`model/gltf-binary`). Uma falha de GLB não aciona o aviso geral de mapa: a região
volta à extrusão. Logs `[campus3d]` (debug/profile) mostram pedidos e falhas.
