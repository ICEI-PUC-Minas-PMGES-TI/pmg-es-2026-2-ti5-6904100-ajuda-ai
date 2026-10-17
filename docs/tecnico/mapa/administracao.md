# Administração do mapa — inventário

> Estado: PLANEJADO (inventário inicial; nenhuma reimplementação realizada)

Este documento é o inventário vivo das funcionalidades administrativas existentes na aplicação Angular do projeto PUCMaps, conforme a decisão registrada em [ADR-0007 — Admin do PUCMaps](../decisoes/ADR-0007-admin-pucmaps.md). Cada funcionalidade é avaliada individualmente; nenhuma é descartada por padrão só por ter sido implementada em Angular.

## Inventário

| Funcionalidade | Implementação antiga | Valor no Ajuda-aí | Decisão | Destino futuro |
|---|---|---|---|---|
| Gestão de versões do mapa (criar, processar, promover) | Tela Angular + backend próprio, com gate de publicação ligado a processamento de tiles raster | Alto — é como novos dados geoespaciais entram no sistema | AINDA AVALIAR | Provavelmente reimplementar como fluxo simplificado no React da coordenação, sem o gate de tiles (que não será portado) |
| Importação de dados geoespaciais (prédios, áreas, grafo) | Scripts e tela de upload específicos da infraestrutura antiga | Alto — necessário para popular o schema `mapa` | AINDA AVALIAR | Provavelmente script de importação idempotente (ver [dados-geo.md](dados-geo.md#importação-futura)), não necessariamente uma tela |
| Visualização de grafo (nós e arestas sobre o mapa) | Tela Angular, overlay sobre o mapa | Médio — ferramenta de depuração técnica, não funcionalidade de produto para o usuário final | MANTER APENAS COMO DIAGNÓSTICO | Modo de debug dentro do pacote `campus_map`, ou figura estática de documentação |
| Administração de prédios/áreas/salas | CRUD Angular | Médio/Alto — necessário se o cadastro for feito pelo produto, não só por importação | AINDA AVALIAR | Depende da decisão sobre importação vs. cadastro manual |
| Administração de PucStops/totens | CRUD Angular + geolocalização do ponto | Alto — necessário para cadastrar novos PucStops | AINDA AVALIAR | Provavelmente reimplementar no React da coordenação |
| Administração de eventos | CRUD Angular | Médio — depende de quem vai cadastrar eventos no Ajuda-aí | AINDA AVALIAR | A decidir junto com [eventos-cantinas.md](eventos-cantinas.md) |
| Administração de cantinas/cardápios/ofertas | CRUD Angular | Médio — mesma consideração acima | AINDA AVALIAR | A decidir junto com [eventos-cantinas.md](eventos-cantinas.md) |
| Editor/preview de estilo de mapa | Tela Angular, depende de infraestrutura de tiles (MapLibre + pipeline de tiles) | Baixo no curto prazo — o Ajuda-aí usa um estilo Mapbox hospedado, não um pipeline de tiles próprio | DESCARTAR | Não portar; o estilo é gerenciado diretamente na plataforma do Mapbox |
| Progresso de processamento de versão (barra de progresso via streaming) | Depende de Redis pub/sub + gRPC + serviço de streaming dedicado | Baixo — acoplado a infraestrutura que não será trazida | DESCARTAR | Se necessário um indicador de progresso futuro, usar um mecanismo simples compatível com a infraestrutura do Ajuda-aí, não o streaming antigo |
| Diagnóstico de totens/3D (quando existente na web) | Tela Angular | Baixo/Médio | AINDA AVALIAR | Possível sobreposição com o diagnóstico 3D do próprio pacote mobile |

## Como usar esta tabela

Cada linha marcada como "AINDA AVALIAR" deve ser revisitada quando a funcionalidade correspondente entrar em discussão de implementação, e a tabela atualizada com a decisão final e a justificativa. Nenhuma funcionalidade útil deve ser perdida silenciosamente apenas por não ter sido reavaliada a tempo.
