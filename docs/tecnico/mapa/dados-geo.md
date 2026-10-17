# Dados geoespaciais

> Estado: PLANEJADO (nenhuma tabela criada)

Este documento descreve o domínio de dados geoespaciais planejado para o mapa do campus, a ser criado no schema `mapa` (ver [ADR-0005](../decisoes/ADR-0005-schema-mapa-postgis.md)) somente quando o PostGIS estiver disponível e a dívida de baseline de migrations estiver resolvida (ver [banco/migrations.md](../banco/migrations.md)).

**Nenhum schema final está definido ainda.** As entidades abaixo são as candidatas identificadas no projeto de origem (PUCMaps), não uma especificação fechada. O desenho final deve ser revisado durante a implementação da fase 4 (banco geo/PostGIS).

## Entidades candidatas

- **map_versions** — versão publicada do mapa do campus (permite atualizar dados geoespaciais sem afetar quem está usando a versão anterior).
- **buildings** — prédios do campus: identificação, nome, geometria (localização pontual e/ou polígono de contorno), entradas.
- **rooms** — salas, vinculadas a um prédio, com andar e identificação.
- **areas** — áreas abertas do campus (praças, quadras, estacionamentos), com geometria própria.
- **graph_nodes** — nós do grafo de navegação, vinculados opcionalmente a um prédio ou sala, com nível/andar.
- **graph_edges** — arestas do grafo, ligando dois nós, com distância, tempo de caminhada estimado e indicação de acessibilidade.

Qualquer outra entidade (eventos, cantinas, PucStops) é tratada em documentos específicos ([eventos-cantinas.md](eventos-cantinas.md), [pucstops.md](pucstops.md)).

## SRID

> PLANEJADO: o sistema de referência espacial a ser usado é WGS 84 (SRID 4326), por ser o padrão para coordenadas de GPS e o usado no projeto de origem. Esta escolha deve ser confirmada quando a primeira migration geoespacial for escrita.

## Snapshot local

Para a primeira etapa de integração (fases 1 a 3), os dados de prédios/áreas/salas são servidos a partir de um **snapshot estático** (arquivo de dados embutido no pacote `campus_map` ou carregado localmente), sem depender de backend nem de PostGIS. Isso permite validar a renderização e a busca antes de qualquer alteração de banco.

## Importação futura

> PLANEJADO: quando o schema `mapa` existir, os dados da versão ativa do mapa no projeto de origem (PUCMaps) devem ser exportados e importados por um script de importação idempotente, não por cópia manual de linhas de banco. Este script ainda não existe neste repositório.

## Schema `mapa`

Ver [ADR-0005](../decisoes/ADR-0005-schema-mapa-postgis.md).

## PostGIS

Ver [banco/migrations.md](../banco/migrations.md) para o estado de disponibilidade e o plano de habilitação.

## Versionamento

> PLANEJADO: o conceito de "versão do mapa" (permitir publicar uma atualização dos dados geoespaciais sem quebrar quem está usando a versão anterior) é preservado do projeto de origem como conceito, mas o mecanismo de publicação (incluindo qualquer gate ligado a processamento de tiles) não é portado — ver [ADR-0007](../decisoes/ADR-0007-admin-pucmaps.md) e [administracao.md](administracao.md).

## Origem dos dados

Os dados geoespaciais do campus (localização de prédios, áreas e o grafo de navegação) têm origem no projeto PUCMaps, construídos a partir de dados do OpenStreetMap processados por um pipeline específico. Ver [origem-pucmaps.md](../origem-pucmaps.md) para a rastreabilidade completa.
