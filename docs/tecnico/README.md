# Documentação técnica — Ajuda-aí

> Estado: ATUAL

## Objetivo

Esta árvore reúne a documentação **técnica** do Ajuda-aí: arquitetura, decisões de engenharia (ADRs), estado do banco de dados e, a partir daqui, a integração do projeto PUCMaps ao domínio de mapa do Ajuda-aí.

Ela é diferente da documentação em `docs/1..8.*.md`, que é a documentação **acadêmica** da disciplina (apresentação, requisitos, modelagem, wireframes, avaliação). A documentação acadêmica não é alterada por esta árvore; quando um documento acadêmico ficar desatualizado pela integração, isso é registrado aqui e a atualização do documento acadêmico em si fica como tarefa separada.

## Como esta documentação funciona

- Cada documento declara seu estado no topo: `ATUAL`, `PLANEJADO`, `LEGADO` ou `EM MIGRAÇÃO`.
- `ATUAL` descreve o que existe hoje no repositório, verificado em código.
- `PLANEJADO` descreve uma decisão já tomada, mas ainda não implementada.
- `LEGADO` descreve algo do projeto PUCMaps de origem, mantido como referência histórica.
- `EM MIGRAÇÃO` descreve algo que está sendo portado e ainda tem as duas versões coexistindo.
- Nenhum documento afirma que algo foi testado, medido ou implementado sem que isso esteja confirmado no código ou em evidência registrada.

## Arquitetura

- [arquitetura.md](arquitetura.md) — visão técnica atual do Ajuda-aí e arquitetura-alvo da integração com o mapa.
- [origem-pucmaps.md](origem-pucmaps.md) — rastreabilidade completa: o que vem do PUCMaps, o que é preservado, adaptado, reescrito ou descartado, e a atribuição de origem.

## Decisões arquiteturais (ADRs)

- [ADR-0001 — Identidade central](decisoes/ADR-0001-identidade-central.md)
- [ADR-0002 — XP central](decisoes/ADR-0002-xp-central.md)
- [ADR-0003 — Rotas sob demanda](decisoes/ADR-0003-rotas-sob-demanda.md)
- [ADR-0004 — Pacote campus_map](decisoes/ADR-0004-campus-map-package.md)
- [ADR-0005 — Schema `mapa` + PostGIS](decisoes/ADR-0005-schema-mapa-postgis.md)
- [ADR-0006 — Assets 3D](decisoes/ADR-0006-assets-3d.md)
- [ADR-0007 — Admin do PUCMaps](decisoes/ADR-0007-admin-pucmaps.md)

## Banco de dados

- [banco/migrations.md](banco/migrations.md) — estado real das migrations, dívida de baseline, risco de colisão com o schema `mapa`.

## Mapa (integração PUCMaps)

- [mapa/visao-geral.md](mapa/visao-geral.md)
- [mapa/renderizacao-3d.md](mapa/renderizacao-3d.md)
- [mapa/dados-geo.md](mapa/dados-geo.md)
- [mapa/rotas.md](mapa/rotas.md)
- [mapa/pucstops.md](mapa/pucstops.md)
- [mapa/eventos-cantinas.md](mapa/eventos-cantinas.md)
- [mapa/assets-pipeline.md](mapa/assets-pipeline.md)
- [mapa/setup-mobile.md](mapa/setup-mobile.md)
- [mapa/busca-localizacao.md](mapa/busca-localizacao.md)
- [mapa/administracao.md](mapa/administracao.md)

## Gamificação

- [gamificacao/xp.md](gamificacao/xp.md)

## Diagramas

- [diagramas/README.md](diagramas/README.md)

## Estado da integração PUCMaps

| Fase | Descrição | Estado |
|---|---|---|
| 0 | Decisões e documentação | CONCLUÍDA |
| 1 | Pacote Flutter `campus_map` + Mapbox base | IMPLEMENTADA E VALIDADA VISUALMENTE NO ANDROID |
| 2 | Renderização 2D/3D + assets | 2D, 3D DE PRÉDIOS, VEGETAÇÃO, PROPS E DIAGNÓSTICO IMPLEMENTADOS E VALIDADOS NO EMULADOR ANDROID; APARELHO FÍSICO PENDENTE |
| 3 | Busca e localização (snapshot local) | IMPLEMENTADA; EVIDÊNCIAS E LIMITES EM busca-localizacao.md |
| 4 | Banco geo (schema `mapa`) + PostGIS | NÃO INICIADO |
| 5 | API de mapa no backend | NÃO INICIADO |
| 6 | Rotas (grafo + Dijkstra/A* sob demanda) | NÃO INICIADO |
| 7 | XP central + PucStops | NÃO INICIADO |
| 8 | Ferramentas administrativas (inventário do admin Angular) | NÃO INICIADO |

Esta tabela é atualizada conforme cada fase avança. Ela não substitui o changelog do repositório nem o histórico de commits.

A fase 1 cria `code/mobile/packages/campus_map`, consumido por path pela `MapaPage`,
com `mapbox_maps_flutter` 2.31.0, câmera inicial do campus, token externo
(`MAPBOX_ACCESS_TOKEN`) e estilo externo opcional (`MAPBOX_STYLE_URI`, fallback
Mapbox Standard).
A etapa 2D agora inclui snapshot local de 82 footprints reais do PUCMaps
(47.032 bytes), renderer de preenchimento/contorno/rótulos e câmera centrada no
bbox dessas construções. Não inclui áreas abertas sem fonte geométrica confirmada,
salas, busca, localização, GLBs, extrusão ou recursos de backend.
Fonte e transformações: [dados-geo.md](mapa/dados-geo.md).
A etapa 3D adiciona LOD2 (extrusão), LOD1 e LOD0 com 16 GLBs de prédios servidos
por HTTPS do container público `map-assets` (versão imutável `2026-09-30-r1`),
configurados por `MAP_ASSETS_BASE_URL`; nenhum GLB fica no Git ou no APK.
A etapa ambiental (Tarefa 5) adiciona 16 árvores, a área esportiva e 84 carros
(12 GLBs, 151.724 B) na nova versão imutável `2026-09-30-r2` (a r1 foi
preservada) e um painel técnico de medição atrás de `diagnostics`.
Detalhes: [renderizacao-3d.md](mapa/renderizacao-3d.md) e
[assets-pipeline.md](mapa/assets-pipeline.md).
Comandos, evidências de validação e limitações: [setup-mobile.md](mapa/setup-mobile.md).

A Tarefa 6 adiciona busca em 77 lugares reais, foco por ID e localização
Android sob demanda com puck nativo, sem persistência ou backend.
Detalhes: [busca-localizacao.md](mapa/busca-localizacao.md).
