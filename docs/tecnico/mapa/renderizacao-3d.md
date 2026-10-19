# Renderização 3D do campus

O renderer usa footprints locais para o 2D/extrusão e resolve GLBs por
manifesto versionado. Código em
`code/mobile/packages/campus_map/lib/src/three_d/`.
[Assets e publicação](assets-pipeline.md), [setup](setup-mobile.md).

## Componentes e ciclo de vida

`CampusMapView` coordena style, câmera e descarte. `CampusMapRenderer`
instala footprints, contornos, labels e clipping restrito ao basemap nas pegadas.
`Campus3dController` instala extrusões e modelos; `CampusEnvironmentController`
tem uma instância por seção ambiental e style.

Instalações concorrentes compartilham a mesma operação e não duplicam IDs.
Trocar style/tela descarta controllers e invalida callbacks pendentes.
Modelos pedidos permanecem no style até seu descarte; não há descarga por zoom.

A atualização de LOD usa câmera estável com debounce, em vez de depender de
`onMapIdle`: um GLB indisponível pode impedir esse evento no SDK.
Limiares e atrasos têm fonte única em `Campus3dLod`.

## Iluminação e contexto externo

O Mapbox Standard recebe `lightPreset` pelo import `basemap`, usando o relógio
local do aparelho: `dawn` de 05:30 a 09:00, `day` de 09:00 a 15:00, `dusk`
de 15:00 a 18:40 e `night` nos demais horários. São as faixas do PUCMaps,
não um cálculo de nascer/pôr do sol. `CampusMapLighting` reaplica ao retomar
o app e verifica a próxima transição, com intervalo máximo de um minuto para
perceber mudanças de relógio/fuso. O timer para ao pausar ou descartar o style.
Styles sem o import Standard continuam utilizáveis sem essa configuração.

`show3dObjects=false` remove o volume externo do Standard e mantém o contexto
2D. GLBs/extrusões próprios do campus, materiais, token e atribuição não mudam.
As janelas marcadas no GLB usam override de material em runtime. Os limites da câmera são
descritos em [busca e localização](busca-localizacao.md#limites-da-câmera).

## LOD (níveis de detalhe)

- **LOD2:** extrusão pelas alturas e bases das footprints.
- **LOD1:** grupos GLB para distância intermediária.
- **LOD0:** chunks GLB detalhados, selecionados pela interseção com a vista
  expandida e ordenados por proximidade.

LOD1/LOD0 têm pré-carga antes de sua faixa visível. Chunks são espaçados para
distribuir trabalho de carregamento. As faixas de zoom evitam sobreposição
normal entre os LODs. A 16,8 ou mais, os chunks próximos visíveis têm
prioridade sobre os quatro grupos LOD1. Mudanças de câmera invalidam apenas
os chunks ainda não iniciados; os já entregues ao SDK permanecem em cache.
Callbacks repetidos compartilham uma atualização de câmera pendente.

Os 16 ms entre pedidos espaçam as mutações do style, mas não significam um
upload por frame nem um limite de downloads concorrentes. Download, parse
e upload são assíncronos no SDK. URLs versionadas permitem reaproveitar o
cache nativo; não há cache persistente próprio nem expulsão de chunks fora
da viewport. Reentrar recria sources/layers da tela e pode usar esse cache.

As transições permanecem em 16,5 (LOD2 → LOD1) e 17,8 (LOD1 → LOD0).

Extrusões pendentes cobrem modelos ainda sem bytes disponíveis ou falhos.
Eventos de recurso bem-sucedidos (rede/cache) liberam cada chunk LOD0; LOD1
espera seus quatro grupos. Só então começa o settle de 300 ms. Esse timer
não bloqueia a fila de carregamento e é cancelado ao descartar o controller.
Eventos duplicados e URLs alheias não geram novas mutações. O evento confirma
I/O, **não** upload à GPU; os 300 ms ainda são uma margem heurística. Falha da source LOD1 afeta o conjunto de grupos daquela source;
na degradação, modelos carregados e extrusão podem coincidir.

## Posicionamento e materiais

O ID estável do footprint une 2D, extrusão e modelos, sem associação por nome.
Âncora `[longitude, latitude]`, orientação, escala e unidades vêm do manifesto.
A base da extrusão é `minHeight`; não se acrescenta volume abaixo do solo.

Materiais dos GLBs são preservados, sem cor por zoom ou categoria. A exceção
intencional é `PUC_Window_Emissive`, selecionado em `materialOverrideNames`
das sources LOD1/LOD0. As expressões `match [get part]` aplicam a cor quente
`#ffe1ac`, `model-color-mix-intensity` e `model-emissive-strength` somente a
esse material: day = 0, dawn/dusk = 0,35, night = 1. Os outros materiais
recebem intensidade zero e preservam suas cores. As janelas acesas já são
definidas na modelagem; não há sorteio, modelos extras ou layers por janela.

A inspeção do manifesto `2026-09-30-r3` contra os GLBs locais e originais
confirmou SHA-256 idêntico nos 12 chunks LOD0 e 4 grupos LOD1. LOD0 tem 85
materiais no total, incluindo 12 materiais/primitivas de janela; LOD1 tem
34, incluindo 4 de janela. Não há emissiveTexture nem emissiveFactor aceso
nesses materiais: `materials.py`/`build_chunks.py` removem emissão gravada
para permitir desligá-la de dia. O PUCMaps já aplicava a emissão em runtime;
essa configuração faltava na integração. Nenhum GLB ou manifesto foi alterado,
e não é necessária publicação de assets.

`CampusMapLighting` atualiza os ModelLayers existentes; novos chunks recebem
o brilho do horário atual. Atualizações compartilham a fila de instalação,
param em background/dispose e são reaplicadas no resume. LOD2 segue sem
janelas. Limiares, debounce e quantidade de modelos são preservados.
Extrusão usa `wallColor` por prédio. O clipping do basemap não remove
as camadas próprias de vegetação/props/conteúdo.

## Ambiente e PucStops

Vegetação/props usam uma source GeoJSON de pontos por seção, modelos do style
e `ModelLayer` por tipo. Cada ponto referencia modelo, escala e giro;
instâncias não duplicam a malha. O custo de desenho depende também de variantes
e materiais, não apenas da quantidade de pontos.

Seções inválidas/falhas são isoladas e não derrubam prédios ou 2D.
A camada existente serve de marco de instalação, pois o SDK não oferece
consulta equivalente para modelos do style.

PucStops usam modelo próprio e posições vindas da API. Ponto e toque 2D continuam
quando o GLB falha. A camada do totem é recriada ao atualizar os dados para evitar
resíduos translúcidos no Mapbox 2.31; o modelo permanece em cache no style.
[Regras de PucStops](pucstops.md).

## Diagnóstico e medição

`--dart-define=CAMPUS_MAP_DIAGNOSTICS=true` ativa o painel
`Campus3dDiagnostics`. Mantê-lo desligado em builds distribuídos.
Sem a flag, não há painel, listener de diagnóstico por frame ou log `diag`.

- `PerformanceStatistics` (API experimental Mapbox): draw calls, render
  mediana/máximo e memória de vértices/texturas.
- `onResourceRequest`: downloads sob a URL da versão, bytes, cache e erros,
  sem registrar URLs do SDK que possam conter tokens.
- Marcos desde a criação do mapa: style, 2D, extrusões, modelos e frame completo.
- FPS aproximado: frames Mapbox concluídos por segundo. Zero com mapa parado
  não indica travamento; o SDK não redesenha continuamente.
- A/B por seção com a mesma câmera; a primeira janela pode misturar estados.

Para comparar desempenho, manter dispositivo, build, câmera e estado de cache
equivalentes. Comparar abertura fria, reentrada e seções ligadas/desligadas.
Resultados de emulador/debug não estimam desempenho de aparelho físico.

## Limites

GLBs e basemap dependem de rede/cache; não há pacote offline integral.
Ambiente é decorativo e pode ser desligado pelas flags sem alterar prédios.
Não há picking de prédios 3D ou shader personalizado; seleção de prédios
usa busca, enquanto conteúdo/PucStops têm camadas de toque próprias.

## Validação local da correção de janelas (18/10/2026)

O relógio injetado percorreu day/dusk/night no emulador Android. A leitura
das propriedades nativas confirmou emissão 0/0,35/1 em LOD1 e no chunk LOD0
c09, sempre restrita ao material de janela. Zoom 18,6 e centro explorado
foram preservados após rotação e background; a abertura ficou em 16,5 e o
zoom out para 14,86 continuou permitido nessa viewport.

Foram capturados abertura em retrato, visão geral noturna, zoom médio, LOD0
noturno e dusk. A cena permaneceu cinzenta/incompleta, sem labels. A mesma
falha ocorreu em um MapWidget Standard puro, com zero layers do campus.
Assim, os valores e o lifecycle foram verificados, mas a perceptibilidade
das janelas, as cores finais e a legibilidade dos labels ainda precisam de
validação visual em aparelho/ambiente com renderização Standard íntegra.
Nenhum ajuste de LOD foi feito com base nessa limitação.

Checks finais: analyze do pacote e do app sem issues; 276 testes do pacote
e 182 do app aprovados; APK debug normal gerado; git diff --check limpo.
A validação usou modelos locais idênticos aos SHA-256 do manifesto; não
verificou os bytes baixados do Azure real. Não houve publicação. Harness,
certificado HTTPS, defines e AVD temporários foram removidos.
