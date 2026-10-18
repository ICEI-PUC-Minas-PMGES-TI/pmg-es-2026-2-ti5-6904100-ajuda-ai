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
Não há override de brilho das janelas dos GLBs. Os limites da câmera são
descritos em [busca e localização](busca-localizacao.md#limites-da-câmera).

## LOD (níveis de detalhe)

- **LOD2:** extrusão pelas alturas e bases das footprints.
- **LOD1:** grupos GLB para distância intermediária.
- **LOD0:** chunks GLB detalhados, selecionados pela interseção com a vista
  expandida e ordenados por proximidade.

LOD1/LOD0 têm pré-carga antes de sua faixa visível. Chunks são espaçados para
distribuir trabalho de carregamento. As faixas de zoom evitam sobreposição
normal entre os LODs.

As transições permanecem em 16,5 (LOD2 → LOD1) e 17,8 (LOD1 → LOD0).

Extrusões pendentes cobrem modelos ainda não pedidos ou falhos.
A remoção após o pedido usa um atraso heurístico, **não** uma confirmação de
upload à GPU. Falha da source LOD1 afeta o conjunto de grupos daquela source;
na degradação, modelos carregados e extrusão podem coincidir.

## Posicionamento e materiais

O ID estável do footprint une 2D, extrusão e modelos, sem associação por nome.
Âncora `[longitude, latitude]`, orientação, escala e unidades vêm do manifesto.
A base da extrusão é `minHeight`; não se acrescenta volume abaixo do solo.

Materiais dos GLBs são preservados, sem cor por zoom ou categoria.
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
Não há picking de prédios 3D ou iluminação personalizada; seleção de prédios
usa busca, enquanto conteúdo/PucStops têm camadas de toque próprias.
