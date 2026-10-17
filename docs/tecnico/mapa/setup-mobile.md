# Setup mobile — pacote campus_map

> Estado: ATUAL para o mapa base da fase 1. Recursos de campus das fases 2+ continuam PLANEJADOS.

## Requisitos e escopo

- Flutter 3.47.0 / Dart 3.13.0, detectados nesta execução e compatíveis com o app.
- Android SDK e emulador/aparelho Android com acesso à internet.
- Token público Mapbox fornecido externamente; nunca colocar credenciais no source,
  testes, documentação, logs ou arquivos versionados.
- `campus_map` é um package Flutter interno em `code/mobile/packages/campus_map`,
  consumido por path. Encapsula `mapbox_maps_flutter: 2.31.0` (versão exata).
- O mapa base não depende de Docker, API local, sessão, banco ou login próprio.
  Para chegar à aba Mapa pelo app, permanece o fluxo de entrada já existente.

Não há dados próprios do campus nesta fase: nenhum snapshot, GeoJSON, footprint,
GLB, LOD, vegetação, props, picking, busca, localização, rota, PucStop ou backend.
O snapshot local descrito em outros documentos pertence às etapas futuras.

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
- `CampusMapFeatures`: `enable3d`, `routes`, `pucStops`, `events`, `canteens` e
  `diagnostics`, todos `false`; ainda não ativam recursos.

O pacote inicializa pelo mecanismo oficial `MapboxOptions.setAccessToken`, antes
de montar `MapWidget`, sem repetir a chamada a cada rebuild. Mudança de token ou
estilo recria o mapa; não existe armazenamento global adicional do token no pacote.
Logo e attribution permanecem habilitados com os padrões do SDK.

## Execução

Em PowerShell, a partir de `code/mobile`, com `MAPBOX_ACCESS_TOKEN` já definido
no ambiente local da sessão (seu valor não deve ser impresso):

```powershell
flutter pub get
flutter run -d emulator-5554 --dart-define="MAPBOX_ACCESS_TOKEN=$env:MAPBOX_ACCESS_TOKEN"
```

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
- Nenhuma permissão de localização adicionada.
- Nenhuma mudança em `API_BASE_URL`, `10.0.2.2`, cleartext ou network security.
- Nenhuma alteração nativa foi necessária: o plugin configura seu repositório
  Maven de releases e o APK compilou. Nenhum secret/download token foi configurado
  nesta execução; não houve erro de download que exigisse credencial extra.

A referência oficial da versão é
[Mapbox Maps Flutter 2.31.0](https://pub.dev/packages/mapbox_maps_flutter/versions/2.31.0).
Não usar o token público de runtime como credencial de download.

## Câmera e plataformas

`CampusMapDefaults` concentra a câmera aproximada: latitude `-19.924266`,
longitude `-43.991491`, zoom `15.5`, pitch `0`, bearing `0`. A referência é a
[localização pública de uma fotografia da entrada do campus](https://commons.wikimedia.org/wiki/File:Entradapucminas.jpg).
O enquadramento deve ser refinado ao portar o renderer PUCMaps. Não são dados
geográficos de prédios ou salas.

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
com a tela e navegação existente. Eles não comprovam carregamento remoto de tiles.

## Validação desta execução

Execução de 17/10/2026, branch `feat/integracao-mapa`.

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

## Diagnóstico

Token ausente ou inválido: conferir o dart-define de runtime e recompilar. Nunca
usar secret token no app. Erro de carregamento: conferir conexão, acesso do token
à conta/estilo e URI escolhida. A UI mostra mensagem genérica sem dados do SDK.
Nenhum erro exige iniciar backend de mapa nesta fase.

Sem prédios customizados do campus: comportamento esperado; os assets e dados
próprios só entram nas próximas fases. O Mapbox Standard pode exibir conteúdo
cartográfico próprio, independente das flags futuras de campus 3D.
