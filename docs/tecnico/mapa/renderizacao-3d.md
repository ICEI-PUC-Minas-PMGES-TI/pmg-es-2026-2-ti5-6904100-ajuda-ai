# Renderização 3D do campus

> Estado: PLANEJADO (estrutura do documento; conteúdo a preencher durante a migração)

Este documento reúne o conhecimento técnico sobre a renderização 3D do campus, herdado do PUCMaps, para orientar a portabilidade para o pacote `campus_map` (ver [ADR-0004](../decisoes/ADR-0004-campus-map-package.md) e [ADR-0006](../decisoes/ADR-0006-assets-3d.md)).

## Arquitetura do renderer

> A preencher quando o renderer for portado. No PUCMaps de origem, a renderização 2D/3D é feita por um componente dedicado que adiciona camadas ao mapa (preenchimento, extrusão, rótulos, linha de rota) e um controlador específico para o campus 3D, responsável por carregar modelos GLB via `ModelSource`/`ModelLayer` do Mapbox.

## LOD (níveis de detalhe)

> LEGADO (PUCMaps): o campus era dividido em chunks de LOD0 (maior detalhe, modelos GLB), grupos de LOD1 (GLB simplificado) e LOD2 (extrusão de contorno a partir do footprint do prédio, sem GLB). Esta estratégia de LOD é candidata a ser preservada; a confirmação de que foi efetivamente portada deve atualizar este documento para `ATUAL`.

## GLBs

> Ver [assets-pipeline.md](assets-pipeline.md) para origem e geração. Os GLBs úteis ao produto (campus LOD0/LOD1, vegetação, props, modelo do PucStop) são candidatos a preservação; assets de debug/teste não são migrados (ver [ADR-0006](../decisoes/ADR-0006-assets-3d.md)).

## Vegetação e props

> A preencher. No projeto de origem, vegetação e props tinham controladores próprios, separados do controlador principal do campus 3D.

## Iluminação

> A preencher quando confirmado em código portado.

## Performance e draw calls

> LEGADO (PUCMaps): existem números de referência do projeto de origem (contagem de draw calls por LOD, contagem de triângulos, tamanho total dos assets). Esses números **não foram medidos no Ajuda-aí** e não devem ser citados como se fossem válidos aqui sem nova medição. Quando uma medição for feita neste projeto, ela deve ser registrada com a data e o dispositivo usado.

## Diagnóstico

> PLANEJADO: o PUCMaps possui um painel de diagnóstico 3D (ativado por flag de build) que exibe métricas de performance em tempo real (quadros por segundo, tempo de render, número de draw calls, uso de memória de GPU, estado de LOD) e inclui um teste automatizado de performance. Este painel é candidato a preservação como ferramenta de debug dentro do pacote `campus_map`, não como funcionalidade visível ao usuário final.

## Validação em aparelho

> PLANEJADO: existe, no projeto de origem, um protocolo de validação manual em dispositivo físico para a renderização 3D. Esse protocolo é candidato a adaptação para o Ajuda-aí; os resultados de validação, quando existirem, devem ser registrados aqui com data e aparelho usado — nunca inventados.

## Pipeline dos assets

> Ver [assets-pipeline.md](assets-pipeline.md).

## Riscos conhecidos

- A resolução de caminho de asset (`asset://...`) usada pelo Mapbox para carregar os GLBs foi escrita assumindo que o asset pertence diretamente ao app; ao mover os GLBs para dentro de um pacote Flutter, essa resolução precisa ser revalidada (caminho `packages/campus_map/assets/...`).
- Os GLBs do projeto de origem não estavam versionados com Git LFS; se o volume de assets crescer, isso deve ser reavaliado para o Ajuda-aí.
- Nenhum número de performance deste documento deve ser tratado como válido para o Ajuda-aí até ser medido neste projeto.
