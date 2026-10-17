# Setup mobile — pacote campus_map

> Estado: PLANEJADO, salvo onde marcado ATUAL. O pacote `campus_map` ainda não existe neste repositório — este documento descreve como o setup deve funcionar quando ele existir, já incorporando o conhecimento operacional obtido no projeto de origem (PUCMaps) em `RODANDO_MAPA_MOBILE_LOCAL.md`.
>
> Este documento existe porque, no projeto de origem, fazer o mapa rodar localmente outra vez (depois que a infraestrutura de produção foi desligada) exigiu um trabalho operacional considerável. Esse conhecimento é preservado aqui, adaptado ao que de fato se aplica à arquitetura do Ajuda-aí — não copiado cegamente.

## O que muda em relação ao PUCMaps de origem

No projeto de origem, o mapa completo dependia de um backend próprio (NestJS + Postgres + Redis + Ministack/S3 local) que gerava e publicava um arquivo `campus-view.json` (GeoJSON do campus) consumido pelo app, além de um admin web em Angular para disparar esse processamento.

Na arquitetura-alvo do Ajuda-aí, a primeira fase do mapa **não tem esse pipeline**: os dados de prédios/áreas/salas são servidos por um **snapshot estático embutido no pacote `campus_map`** (ver [dados-geo.md](dados-geo.md#snapshot-local)), sem backend de mapa, sem Ministack, sem Redis, sem admin Angular. Por isso, boa parte do setup operacional do documento original (subir múltiplos containers, popular/promover uma versão de mapa, lidar com o bucket do Ministack perdendo o arquivo a cada reinício) é **LEGADO**: válida como relato do que o PUCMaps precisava, mas **não se aplica** a esta fase do Ajuda-aí. Essa parte volta a ser relevante, de forma adaptada, só quando uma fonte de dados remota (API do Ajuda-aí) for implementada — ver [dados-geo.md](dados-geo.md).

## Requisitos

- Flutter compatível com o mínimo já exigido pelo app do Ajuda-aí (`>=3.47.0`, conforme `code/mobile/pubspec.lock`). **Estado: ATUAL** (confirmado no repositório).
- Android como plataforma inicial. **Estado: ATUAL** — o repositório do Ajuda-aí não possui pasta `ios/` hoje; suporte a iOS é decisão futura, fora do escopo desta etapa.
- Emulador Android configurado (qualquer AVD compatível; o projeto de origem usava um AVD com nome próprio, que não é reaproveitado aqui).
- Docker, apenas para o `postgres:16-alpine` já usado pelo backend do Ajuda-aí — **não** é necessário nenhum serviço adicional (Redis, bucket local, admin web) para esta fase do mapa, ao contrário do que o PUCMaps exigia.

## Rede local no emulador Android: `10.0.2.2`

**Estado: ATUAL.** O emulador Android não enxerga `localhost` do computador host — `localhost`, dentro do emulador, é o próprio emulador. Para o app alcançar um backend rodando no computador (ex.: a API do Ajuda-aí em desenvolvimento), a URL precisa usar `10.0.2.2` em vez de `localhost`.

Isso já é o padrão usado pelo próprio Ajuda-aí: `code/mobile/lib/services/api_config.dart` usa `10.0.2.2:3000` como default no Android (e `localhost` na Web). O pacote `campus_map`, quando tiver uma fonte de dados remota, deve seguir o mesmo padrão — não introduzir uma convenção de rede diferente da que o app principal já usa.

Em aparelho físico via USB, `10.0.2.2` não existe; o caminho é redirecionar a porta do computador para o aparelho com `adb reverse` e usar `localhost` no app (ver seção "Aparelho físico via USB" abaixo).

## Token do Mapbox

- O token de acesso público do Mapbox (`pk.`) **nunca** é hardcoded no código-fonte nem commitado.
- Ele deve ser fornecido por configuração externa, via `--dart-define` (ex.: `MAPBOX_ACCESS_TOKEN`), seguindo o mesmo padrão já usado pelo app do Ajuda-aí para outras credenciais de configuração (como as variáveis do login Microsoft).
- Nunca usar um token `sk.` (secreto) no app mobile, e nunca colar o token em documentação, logs ou commits. Esta regra, herdada do projeto de origem, continua válida sem alteração.
- É esperado que o Ajuda-aí crie, quando o pacote existir, um script auxiliar equivalente ao `run_local.ps1` do projeto de origem (que lê o token de um `.env` local, sem imprimi-lo, e monta os `--dart-define` do `flutter run`). Esse script ainda **não existe** neste repositório — é um item planejado, não uma ferramenta já disponível.

## Style URI

- A URL do estilo do Mapbox também é configurável externamente (ex.: `MAPBOX_STYLE_URI`), não fixa no código.
- A conta Mapbox usada para hospedar o estilo não deve ser uma conta pessoal tratada como definitiva — isso é uma pendência de decisão de projeto, registrada em [origem-pucmaps.md](../origem-pucmaps.md#9-limitações-herdadas).

## Cleartext HTTP no Android (a confirmar)

> PLANEJADO / A VERIFICAR: enquanto o backend local do Ajuda-aí for servido por HTTP simples (sem HTTPS) durante o desenvolvimento, o Android em modo debug precisa de uma configuração de segurança de rede permitindo tráfego não criptografado para `localhost`, `10.0.2.2` e `127.0.0.1` (equivalente ao arquivo `network_security_config.xml` usado pelo PUCMaps). **Não está confirmado neste documento se o app do Ajuda-aí já possui esse arquivo** — isso deve ser verificado no código do app (`code/mobile/android/app/src/debug/res/xml/`) antes de assumir que a conexão HTTP local funciona sem ajuste.

## Permissões de localização (futuras)

> PLANEJADO: quando a funcionalidade de localização do usuário no mapa for implementada, o Android precisará das permissões de localização (`ACCESS_FINE_LOCATION`/`ACCESS_COARSE_LOCATION`) no `AndroidManifest.xml` do app, que hoje declara apenas `INTERNET`. Essa alteração não foi feita nesta etapa.

## Execução do pacote (fluxo esperado)

> PLANEJADO — a confirmar exatamente quando o pacote existir, mas o fluxo esperado, adaptado do projeto de origem, é:

1. Abrir o emulador Android (`emulator -avd <nome-do-avd>` ou o Android Studio) e confirmar que o `adb devices` o reconhece como `device` (se aparecer `offline`, aguardar alguns segundos e tentar de novo).
2. Rodar o app com os `--dart-define` necessários — no mínimo o token e o estilo do Mapbox; se o pacote já tiver uma fonte de dados remota configurada, também a URL base da API, usando `10.0.2.2` no Android.
3. Se o instalador falhar por espaço insuficiente no emulador (`INSTALL_FAILED_INSUFFICIENT_STORAGE` — o APK de debug do Flutter costuma ser grande, da ordem de centenas de MB), rodar em modo `--profile` (menor) ou liberar espaço no AVD.

Este documento não copia um script pronto do PUCMaps porque o script do projeto de origem (`run_local.ps1`) depende de variáveis e caminhos específicos daquele repositório; quando o pacote existir, um script equivalente deve ser escrito para o Ajuda-aí, não adaptado linha a linha do script antigo.

## Limpando cache do app no emulador

Técnica genérica, válida independentemente do projeto: se uma alteração de estilo/dados não aparecer, o Mapbox pode estar reaproveitando cache local.

Fechar o app:

```powershell
adb shell am force-stop br.pucminas.ajuda_ai
```

Limpar dados/cache:

```powershell
adb shell pm clear br.pucminas.ajuda_ai
```

Depois, rodar o `flutter run` novamente. (`br.pucminas.ajuda_ai` é o `applicationId` já confirmado em `code/mobile/android/app/build.gradle.kts`; o projeto de origem usava `com.example.mobile`, que não se aplica aqui.)

## Aparelho físico via USB

> PLANEJADO: técnica genérica preservada do projeto de origem, útil quando um emulador não é suficiente (por exemplo, para medir performance real do 3D). Em um aparelho físico, `localhost` é o próprio aparelho e `10.0.2.2` não existe; o caminho é redirecionar a porta do computador para o aparelho com `adb reverse <porta> <porta>` e então usar `localhost` no app. Requer depuração USB ativa e o aparelho reconhecido como `device` em `adb devices`. O redirecionamento feito por `adb reverse` se perde quando o cabo é desconectado e precisa ser refeito. Se o aparelho já tiver uma build instalada de outra máquina, o Flutter pode reportar `INSTALL_FAILED_UPDATE_INCOMPATIBLE` e desinstalar a build anterior automaticamente (os dados do app anterior são apagados nesse processo) — isso é esperado, não um erro a investigar.

Para medir desempenho, usar sempre o modo `--profile` (o modo debug distorce métricas de FPS e memória).

## Flags de build do campus 3D (planejadas)

> PLANEJADO: o projeto de origem usava flags de build (`--dart-define`) para ligar funcionalidades de debug do campus 3D, todas desligadas por padrão. A tabela abaixo registra essas flags como candidatas a preservar no pacote `campus_map`; nenhuma delas existe ainda neste repositório.

| Flag | Efeito pretendido | Observação |
|---|---|---|
| `CAMPUS_3D_DEBUG=true` | Ativa um painel de diagnóstico (FPS, tempo de render, draw calls, memória de GPU/RAM, LOD carregado) e logs identificáveis no logcat | Ver [renderizacao-3d.md](renderizacao-3d.md#diagnóstico) |
| `CAMPUS_BUILDING_PICKING_ENABLED=true` | Habilitaria seleção de prédios no mapa 3D | **Conhecido como experimental e problemático no projeto de origem** (causava artefatos visuais nos prédios) — não deve ser reativado sem antes corrigir essa causa |
| `CAMPUS_BUILDING_COLORS_ENABLED=true` | Coloriria por tipo os prédios renderizados por extrusão (sem modelo 3D próprio) | — |

Quando o painel de diagnóstico existir, seus logs podem ser filtrados no Android com:

```powershell
adb logcat | Select-String campus3d
```

## Diagnóstico (adaptado)

As categorias abaixo são preservadas como estrutura de troubleshooting útil; as causas específicas do pipeline antigo (bucket do Ministack, `campus-view.json`) são removidas ou marcadas como não aplicáveis a esta fase.

### App não conecta à API local

- Confirmar que o backend do Ajuda-aí está rodando e respondendo (usar o endpoint de saúde/health já existente no backend do Ajuda-aí, não um endpoint do PUCMaps).
- Confirmar que a URL usada pelo app está usando `10.0.2.2` no emulador Android, não `localhost`.

### Mapa aparece preto ou em branco

Causas possíveis, adaptadas do projeto de origem (apenas as genéricas, válidas independentemente do pipeline de dados):

- App rodando sem o `--dart-define` do token/estilo do Mapbox.
- Emulador tentando acessar `localhost` em vez de `10.0.2.2` (quando já houver fonte remota).
- Cache antigo do Mapbox no app — limpar com `adb shell pm clear br.pucminas.ajuda_ai` e rodar novamente.

> Removido do original: a causa "tiles/sprites não existem ou apontam para host errado" dependia do pipeline de tiles do Ministack, que não existe nesta fase do Ajuda-aí (o mapa usa o estilo hospedado diretamente no Mapbox, sem pipeline de tiles próprio).

### Mapa aparece sem prédios/dados do campus

> LEGADO / NÃO SE APLICA AINDA: no projeto de origem, esse sintoma geralmente indicava que o mapa não tinha sido gerado/promovido no pipeline do Ministack. Nesta fase do Ajuda-aí, os dados de prédios vêm de um snapshot estático embutido no pacote, então esse sintoma indicaria um problema no próprio snapshot (arquivo ausente ou mal formado), não um pipeline de geração. Quando uma fonte remota (API) existir, esta seção deve ser reescrita para refletir esse novo cenário.

### ADB não reconhece o emulador

```powershell
adb devices
```

Se vier vazio, abrir o emulador novamente e aguardar. Se aparecer `offline`, aguardar alguns segundos e tentar de novo. Técnica genérica, sem mudança em relação ao projeto de origem.

## O que foi deixado de fora intencionalmente (LEGADO/OBSOLETO)

Para que este documento não seja confundido com um guia do PUCMaps, fica registrado explicitamente o que **não** foi trazido do documento original, por não se aplicar à arquitetura desta fase do Ajuda-aí:

- Subir múltiplos serviços via `docker compose` (API própria, admin web Angular, progress streamer, Ministack/S3, Redis) — essa infraestrutura não é trazida (ver [ADR-0007](../decisoes/ADR-0007-admin-pucmaps.md) e [origem-pucmaps.md](../origem-pucmaps.md#6-componentes-descartados)).
- Login padrão de um admin web e qualquer credencial de exemplo associada a ele.
- Geração/promoção de uma "versão de mapa" via admin web ou script administrativo, e o comportamento do bucket local não persistir o `campus-view.json` entre reinícios — específico da infraestrutura antiga.
- Hosts de produção do projeto de origem (desligados) e as tentativas alternativas de basemap (OSM direto, CARTO, Esri) usadas só enquanto aquela produção estava fora do ar.
- Avisos de erro "esperado, mas não é erro" específicos do projeto de origem (ex.: inicialização do Firebase falhando, uma falha de teste específica daquele projeto) — não se aplicam ao código do Ajuda-aí, que não tem essas mesmas dependências.
- Qualquer caminho de sistema de arquivos pessoal, nome de dispositivo físico específico, ou nome de pessoa.

Essas informações continuam preservadas, para fins de referência histórica, no documento de origem do projeto PUCMaps — não são reproduzidas aqui por não se aplicarem a esta fase da integração.
