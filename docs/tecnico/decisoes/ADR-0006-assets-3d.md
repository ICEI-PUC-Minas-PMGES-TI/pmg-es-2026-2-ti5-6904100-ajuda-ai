# ADR-0006 — Assets 3D

> Estado: PLANEJADO (nenhum asset copiado ainda)

## Contexto

O PUCMaps renderiza o campus em 3D usando modelos GLB carregados via Mapbox (`ModelSource`/`ModelLayer`), organizados em níveis de detalhe (LOD0, LOD1, LOD2 — este último como extrusão de contorno, não GLB), além de vegetação, props e um modelo de totem.

Os GLBs do PUCMaps somam cerca de 10,7 MB, divididos entre chunks de LOD0/LOD1, uma pasta de debug (não faz parte do produto final), o modelo do totem, e modelos pequenos de vegetação/veículos/esportes. Eles são embutidos no app (bundled), sem CDN.

A origem desses arquivos é um pipeline externo ao repositório do PUCMaps (fora do controle de versão do projeto), que gera os GLBs a partir de um processo de modelagem e exportação.

## Decisão

- Os assets 3D **úteis ao produto final** (LOD0, LOD1, vegetação, props, modelo do totem/PucStop) são preservados e, quando portados, ficam embutidos no pacote `campus_map` (ver [ADR-0004](ADR-0004-campus-map-package.md)).
- A pasta de debug e qualquer asset identificado como temporário/teste não são migrados.
- A resolução de caminho de asset (`asset://...`) usada pelo Mapbox precisa ser revalidada no contexto de um pacote Flutter (caminho `packages/campus_map/assets/...`), já que o cálculo original foi feito assumindo que o asset pertence diretamente ao app.
- O Azure Blob Storage (container público `map-assets`, já existente no Ajuda-aí) é uma evolução **futura** para hospedar os GLBs fora do bundle do app, não um requisito da primeira etapa.
- O pipeline de geração dos GLBs, por estar fora do repositório de origem, é documentado como processo externo não reproduzível a partir do repositório atual (ver [mapa/assets-pipeline.md](../mapa/assets-pipeline.md)), sem inventar passos que não estejam confirmados.

## Consequências

- O tamanho do app aumenta em alguns megabytes pelos assets embutidos; isso é aceitável para a primeira etapa.
- Preocupações de desempenho (LOD, draw calls, uso de GPU/memória) existentes no PUCMaps são preservadas como referência técnica em [mapa/renderizacao-3d.md](../mapa/renderizacao-3d.md), mas não há medição nova feita nesta etapa — qualquer número citado é identificado como vindo do projeto de origem, não medido no Ajuda-aí.
- Se o pipeline de geração de assets precisar ser usado novamente (por exemplo, para adicionar um novo prédio), isso exigirá acesso ao processo externo, hoje fora deste repositório.
