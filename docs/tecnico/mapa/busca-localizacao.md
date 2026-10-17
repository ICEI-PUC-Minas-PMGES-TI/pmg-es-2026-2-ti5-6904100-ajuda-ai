# Busca local e localização no campus

> Estado: ATUAL — implementação Android; evidências e limites ao final. Desde a
> Tarefa 8 a busca é remota pela [API do mapa](api.md), com este snapshot local
> como fallback.

## Auditoria e escopo

Tarefa 6, branch `feat/integracao-mapa`. O package já tinha
`CampusDataSource.load()`, snapshot WGS84, renderer 2D, labels e controllers
3D/ambiente. Não havia controller público, busca ou biblioteca de localização.
A `MapaPage` mantém `pushReplacement` entre Perfil e Mapa. A documentação do
PUCMaps preserva a direção snapshot → API e a referência ao `geolocator`;
os dados atuais bastam, sem consultar API ou banco antigos.

Android: `br.pucminas.ajuda_ai`, Flutter 3.47.0 / Dart 3.13.0,
minSdk 24, compileSdk/targetSdk 36 (defaults do Flutter instalado),
AGP 9.1.0 e Kotlin integrado já configurados. Gradle não precisou mudar.
Não foi criada pasta iOS; Android é o alvo desta entrega.

## Busca e modelo

`CampusPlaceRepository` expõe `search(query)` e `findById(id)` assíncronos.
`LocalCampusPlaceRepository` implementa o contrato com o snapshot existente.
O controller criado pela view compartilha carregamento/parsing com o renderer.
O índice normalizado é construído uma vez por tela; falhas permitem retry.

`CampusPlace`: `id`, `name?`, `code?`, `type?`, `apiId?` e `center` imutável
em `[longitude, latitude]`. Não copia polígonos. ID/centro são validados;
`apiId` preserva o vínculo opcional com o backend sem confundi-lo com o ID
estável do footprint. Tipo ausente permanece nulo, sem categorias inferidas.

São **77 lugares pesquisáveis** dos 82 footprints. Os cinco sem nome nem código
ficam fora. O contrato também aceita lugar só com código e o usa como título.
Polígonos com código compartilhado continuam separados por seus IDs estáveis.

Campos indexados: **nome e código** existentes. Exemplos: `Biblioteca`,
`Planetário`, `PROGRAD`, `26`, `34`. Código é numérico: `26` é código;
`P26` é ID e não é alias de busca. Inconsistências da origem permanecem,
como nome `Prédio 31` com código `18`; não se corrigem dados por inferência.
Tipo e `apiId` são metadados, não termos de busca. Sem aliases inventados.

Normalização: lowercase, trim, espaços consecutivos convertidos em um espaço,
remoção de diacríticos latinos do português e marcas combinantes Unicode
U+0300–U+036F. Números/pontuação são preservados. Sem dependência adicional,
fuzzy matching ou consulta remota.

Ranking:

1. Código exato.
2. Nome exato.
3. Nome começa com consulta.
4. Código começa com consulta.
5. Nome contém consulta.

Desempate: nome normalizado, código normalizado e ID estável.
Limite: `LocalCampusPlaceRepository.resultLimit = 8`.
Consulta vazia retorna `[]` sem carregar o índice. Sem favoritos/histórico.

A UI ignora respostas atrasadas de consultas anteriores.

### Fonte remota com fallback (Tarefa 8)

`CampusMapView(remotePlaceRepository: ...)` liga a busca composta
`FallbackCampusPlaceRepository`: a fonte injetada pelo app (`GET /mapa/busca`,
`MapaApiPlaceRepository`) responde primeiro e, se falhar, este
`LocalCampusPlaceRepository` responde. O pacote continua sem HTTP e sem URL.
O backend aplica a mesma normalização e o mesmo ranking (com `unaccent` no
Postgres) e devolve as mesmas chaves estáveis, então foco e resultado não
dependem da origem. Áreas (12) entram na busca remota; salas, quando existirem
na versão ativa. Detalhes, contrato e medições: [api.md](api.md).

## Controller e interface

`CampusMapController`: `search`, `focusPlace(placeId)` e `moveToUser`.
`CampusMapCamera` separa operações da engine para testes. A view conecta a
câmera após o renderer 2D e desconecta ao sair/trocar style. Controller criado
pela view é descartado por ela; controller externo pertence ao chamador.
Operações pendentes são invalidadas ao desconectar. Sem estado global.

`CampusMapControls` é overlay separado: digitação não reconstrói `MapWidget`.
Campo no topo, resultados roláveis limitados a 30% da altura, limpar e botão
Minha localização de 48 × 48. Cores do tema, labels/tooltips e `ListTile`.
Rodapé reservado para logo/attribution nativos. Diagnóstico continua atrás
da flag, abaixo do campo.

Estados: vazio sem lista; digitando; resultados; `Nenhum local encontrado.`;
selecionado com nome no campo e lista recolhida; erro controlado da fonte.
Sem spinner para busca local. Selecionar esconde teclado/lista; tocar fora
também. Limpar mantém a câmera onde está.

`focusPlace` resolve o ID e usa `flyTo` de 900 ms, zoom 18 e pitch 45° no 3D
ou 0° no 2D. `moveToUser`: zoom 17,5 e pitch 35° no 3D (0° no 2D).
Bearing preservado. Valores em `CampusMapDefaults`. Sem mudança de limiar LOD,
manifesto, GLB, source ou controller 3D. Sem marker de lugar, destaque/picking
ou acompanhamento contínuo da câmera; pan continua livre.

## Localização e permissões

Dependência: [geolocator 13.0.4](https://pub.dev/packages/geolocator/versions/13.0.4),
Android 4.6.2 no lock do app. Escolha por compatibilidade: a cadeia Linux de
14.0.2 traz `package_info_plus` 9 incompatível com AGP 9/Kotlin integrado;
14.1.1 exige `package_info_plus` 10 / win32 6, incompatível com `file_picker` 11.
Sem atualizar seletor de arquivos, Gradle ou introduzir dependency override.

`CampusLocationService` isola localização e abertura de configurações.
`GeolocatorCampusLocationService` aceita plataforma injetável para testes:

1. Verifica serviço ligado.
2. Verifica permissão; solicita somente se negada.
3. Trata negativa, negativa permanente e estado indeterminado.
4. Obtém posição atual com accuracy e timeout de 15 segundos.
5. Valida coordenadas/precisão; retorna resultado tipado, sem propagar erro.

Somente o toque em **Minha localização**, com mapa pronto, inicia o fluxo.
Enquanto pendente, botão desabilitado e chamadas concorrentes compartilham
a operação. Nenhum prompt na abertura do app/mapa.

Serviço desligado: mensagem e ação para configurações de localização.
Negada: explica uso e permite tentar pelo botão novamente.
Negada permanentemente: mensagem e ação para configurações do aplicativo.
Erro/timeout/posição inválida: mensagem para tentar novamente. Falhas ao abrir
configurações também são controladas. Mapa e busca continuam disponíveis.

Permissões declaradas: `INTERNET`, `ACCESS_COARSE_LOCATION`,
`ACCESS_FINE_LOCATION`. Sem background, Bluetooth, always ou permissão de
serviço foreground. Não há configuração de notificação/foreground service
nem stream Geolocator. O plugin declara seu serviço interno vinculado no
Manifest, mas esta feature não o inicia como serviço foreground.

Após sucesso, `LocationComponentSettings` ativa o **puck 2D nativo padrão do
Mapbox**, com anel de precisão e bearing desabilitado. O SDK usa seu provedor
nativo para atualizar o puck enquanto o mapa está ativo; Geolocator fornece
a leitura pontual da câmera. Sem puck de navegação ou marcador manual.
Puck desligado ao sair, trocar style ou colocar app em segundo plano.
Ao retornar do segundo plano, novo toque reativa. `inactive` do diálogo de
permissão não cancela a própria solicitação.

Posição/accuracy apenas em memória durante a operação: sem persistência,
logs de coordenadas, backend, associação à conta, geofence ou PucStop.
Uma leitura já iniciada pode terminar até o timeout após sair, mas o resultado
é descartado; não há stream próprio em segundo plano. Fora do campus continua
válido, sem clamp ao bbox ou afirmar que o usuário está dentro do campus.

## Testes e reprodução

`campus_search_test.dart`, `campus_location_test.dart`, `campus_controls_test.dart`:
normalização, ranking, prefixo/contains, limite, IDs/centros reais, ordem com
fonte invertida, cache/retry, nome ausente; permissões, serviço desligado,
timeout/erro, posição inválida/fora do campus; UI/teclado/seleção, resposta
atrasada, reentrada e descarte durante solicitação. Sem GPS/engine nativos.

Reprodução manual:

1. Executar app com token Mapbox local e base pública existente, conforme
   [setup](setup-mobile.md). Conta demo existente → Perfil → Mapa.
2. Buscar `Biblioteca`, `Planetário`, `PROGRAD` e `26`; selecionar e conferir
   câmera, labels, GLBs, árvores e props.
3. Simular ponto público no campus pelos controles do emulador ou
   `adb emu geo fix <longitude> <latitude>` (nunca colocar posição fake no source).
4. Tocar Minha localização e conceder durante uso; conferir puck e câmera.
5. Repetir com negativa, permanente e serviço desligado, resetando permissões
   só do app de teste, sem apagar dados de conta/AVD.
6. Simular ponto público fora do campus; conferir posição livre.
7. Perfil → Mapa → pesquisar → Perfil → Mapa e localização → sair → voltar.

## Limites e próxima fase

Sem salas, departamentos inferidos, favoritos, histórico, rotas, grafo,
snapping, botão Ir ou ETA. Aparelho físico e iOS fora da validação atual.
Banco geográfico (Tarefa 7) e busca remota com fallback (Tarefa 8) já existem;
rotas continuam em tarefa própria.

## Evidências da execução — 17/10/2026

- `flutter pub get` no app e package: sucesso; Mapbox permanece 2.31.0.
- `flutter analyze` no package: sem problemas (exit 0).
- `flutter analyze` no app: somente o info preexistente `unnecessary_import`
  em `test/historico_test.dart:3` (exit 1), sem novos erros/avisos.
- `flutter test` no package: **92 passaram**; no app: **147 passaram**.
  Reexecutados após resolver a versão final do Geolocator.
- `flutter build apk --debug` com token público apenas em memória e base de
  assets existente: **sucesso**, assembleDebug em 28,9 s. APK em
  `code/mobile/build/app/outputs/flutter-apk/app-debug.apk` (ignorado no Git).
  Avisos de KGP dos plugins existentes e Java 8 do plugin não impediram build.
- `aapt dump permissions` no APK confirma INTERNET, COARSE e FINE, sem
  ACCESS_BACKGROUND_LOCATION, FOREGROUND_SERVICE ou FOREGROUND_SERVICE_LOCATION.
  Permissões de rede/Wi-Fi e receiver interno de dependências também aparecem.
  `aapt dump badging`: minSdk 24, target/compileSdk 36, applicationId esperado.
- Emulador `emulator-5554`, Android 15 / API 35 / x64. Token local não foi
  copiado para source/docs ou exibido em saída. Nenhum asset publicado/alterado.
- Conta demo existente → Perfil → Mapa. A API local estava parada e foi
  iniciada a partir do `dist` já compilado, com seed/synchronize desativados,
  apenas para o fluxo de entrada existente. Nenhum arquivo de backend mudou.
  Essa instância temporária foi encerrada após a validação.
- Busca visual: `Biblioteca`, `Planetario` sem acento, `PROGRAD` e código `26`
  retornaram lugares reais. Seleções focaram suas âncoras, recolheram a lista
  e esconderam teclado. Código `26` listou a Biblioteca em primeiro lugar.
  Consulta inexistente mostrou `Nenhum local encontrado.`.
- Labels/GLBs de prédios, árvores, carros e área esportiva continuaram visíveis
  nos focos correspondentes, com logo/attribution preservados. Nenhum reset do
  renderer ao digitar ou alternar busca/localização foi observado.
- Permissão solicitada só pelo botão. Primeira negativa mostrou mensagem
  controlada; segunda negativa do Android resultou em bloqueio permanente com
  ação Configurações. Flags só dessas permissões foram resetados via ADB,
  sem limpar dados do app/AVD; a concessão durante uso foi validada no diálogo.
- Puck nativo visível no ponto público simulado do campus, câmera centralizada
  com pitch moderado. A primeira leitura após concessão ainda usou o cache
  padrão do AVD (Googleplex); atualizar o GPS simulado e tocar novamente
  corrigiu a leitura. Nenhuma posição foi fixada no código para contornar isso.
- Outro ponto simulado fora do campus: puck e centralização corretos, sem
  restrição ao bbox e sem crash. Serviço desligado: aviso do app para ativar
  localização; Android também apresentou seu diálogo nativo de resolução.
  Serviço foi restaurado e posição simulada voltou ao campus depois do teste.
- Perfil → Mapa → pesquisar → Perfil → Mapa e localização → Perfil → Mapa
  realizados. Campo limpo na reentrada e busca novamente funcional. Testes
  automatizados também cobrem descarte de operações e controles pendentes.
- `dumpsys activity services`: serviço interno vinculado do Geolocator com
  `startForegroundCount:0`; nenhum serviço foreground iniciado pela feature.
- Logs filtrados de Flutter/AndroidRuntime: sem FATAL EXCEPTION, exceção Flutter
  não tratada ou duplicação de source/layer durante as interações verificadas.
- Diagnóstico continua atrás da flag; suíte 3D existente passou. O painel com
  flag habilitada não foi revalidado visualmente nesta execução.
- `git diff --check`: limpo. Diff restrito ao package, Manifest, lock do app e
  documentação técnica. Sem backend, React, migration, Azure ou assets alterados.
  Nenhum commit ou push foi feito.
- Revisão dos 19 arquivos modificados/novos: sem token Mapbox, chave Azure,
  SAS ou JWT. Arquivos novos também sem whitespace residual/conflitos.

Capturas locais da sessão foram guardadas fora do repositório (busca, puck no
campus e puck fora do campus). Não representam validação em aparelho físico.

## Evidências da busca remota — Tarefa 8 (17/10/2026)

`emulator-5554` (Android 15), API local (`node dist/main`, lendo o Supabase),
app debug com `API_BASE_URL` padrão (`http://10.0.2.2:3000`):

- “Biblioteca” → Biblioteca Padre Alberto Antoniazzi - P. 26 (código 26), log
  `map search source=remote`; selecionar focou a câmera no prédio (3D/LOD0).
- “planetario” (sem acento) → Planetário PUC Minas; “65” → Prédio 65; ambos
  remotos.
- API desligada: “Biblioteca” respondeu pelo snapshot
  (`source=local-fallback`), sem mensagem de erro; o foco caiu exatamente no
  mesmo enquadramento do remoto.
- API religada: a busca seguinte voltou a `source=remote`, sem reiniciar o app.
- Botão de localização, puck, árvores, carros, prédios 3D e atribuição do
  Mapbox continuaram iguais; nenhum crash no logcat.
