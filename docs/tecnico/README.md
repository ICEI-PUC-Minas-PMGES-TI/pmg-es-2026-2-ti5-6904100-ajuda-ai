# Documentação técnica — Ajuda-aí

Referência de manutenção da arquitetura, dos contratos e das operações do sistema.
A documentação acadêmica da disciplina permanece em `docs/1..8.*.md`.

## Arquitetura e decisões

- [Arquitetura](arquitetura.md): componentes, fronteiras e fluxo de dados.
- [Origem e atribuição PUCMaps](origem-pucmaps.md): proveniência, licença e transformações.
- ADRs: [identidade](decisoes/ADR-0001-identidade-central.md),
  [XP](decisoes/ADR-0002-xp-central.md), [rotas](decisoes/ADR-0003-rotas-sob-demanda.md),
  [pacote Flutter](decisoes/ADR-0004-campus-map-package.md),
  [PostGIS](decisoes/ADR-0005-schema-mapa-postgis.md),
  [assets](decisoes/ADR-0006-assets-3d.md) e
  [administração](decisoes/ADR-0007-admin-pucmaps.md).

## Manutenção e operação

- [Banco e migrations](banco/migrations.md).
- [Fronteiras de infraestrutura](infraestrutura/evolucao.md).
- [Mapa: pontos de entrada](mapa/visao-geral.md).
- [Setup mobile](mapa/setup-mobile.md).
- [Renderização 3D e diagnóstico](mapa/renderizacao-3d.md).
- [Assets e publicação](mapa/assets-pipeline.md).
- [Dados geoespaciais e importação](mapa/dados-geo.md).
- [Busca e localização](mapa/busca-localizacao.md).
- [API do mapa](mapa/api.md).
- [Grafo e rotas](mapa/rotas.md), [geração de visualizações](mapa/grafos/README.md).
- [PucStops](mapa/pucstops.md) e [XP](gamificacao/xp.md).
- [Eventos, restaurantes e cardápios](mapa/eventos-cantinas.md).
- [Administração](mapa/administracao.md).

- [Feed em tempo real: arquitetura, configuração e demonstração](feed.md)
