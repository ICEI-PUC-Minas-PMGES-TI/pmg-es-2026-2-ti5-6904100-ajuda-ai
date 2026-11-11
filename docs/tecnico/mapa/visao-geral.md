# Mapa do campus

O pacote Flutter `campus_map` encapsula a experiência cartográfica do Ajuda-aí.
`MapaPage`, no app principal, injeta configuração e serviços HTTP. Renderização,
dados geográficos e conteúdo administrativo têm ciclos de vida diferentes:

- Footprints e manifesto do pacote sustentam o 2D e a resolução dos GLBs.
- A API lê a versão geográfica ativa e mantém o grafo em memória por versão.
- Eventos, restaurantes, cardápios e PucStops são conteúdo editável da coordenação,
  independente da publicação de uma versão geográfica.
- XP pertence ao usuário e usa um ledger central, separado do domínio de mapa.

A [arquitetura](../arquitetura.md) mostra componentes e fronteiras.
Para configurar ou investigar o mapa, consulte:

- [Setup mobile](setup-mobile.md), [renderização e diagnóstico 3D](renderizacao-3d.md).
- [Assets e publicação](assets-pipeline.md), [dados e importação](dados-geo.md).
- [Busca/localização](busca-localizacao.md), [API](api.md), [rotas](rotas.md).
- [PucStops](pucstops.md), [XP](../gamificacao/xp.md), [conteúdo](eventos-cantinas.md).
- [Administração](administracao.md), [visualização do grafo](grafos/README.md).

A origem dos dados/assets e seus créditos estão em [origem-pucmaps.md](../origem-pucmaps.md).
