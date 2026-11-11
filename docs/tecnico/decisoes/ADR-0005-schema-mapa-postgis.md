# ADR-0005 — Schema `mapa` e PostGIS

Estado: aceito.

## Contexto

Geografia precisa de tipos, índices e operações espaciais, mas compartilha banco
e identidade com o Ajuda-aí. Bancos criados por `synchronize` também precisam
convergir para migrations sem perder dados.

## Decisão

- Schema separado `mapa`; o domínio de programa permanece em `feed`.
- Baseline anterior à incremental, reconhecida pelo estado real das tabelas.
  Estado parcial/divergente falha sem tentar ocultar diferenças com `IF NOT EXISTS`.
- PostGIS e `unaccent` por migration, preferencialmente em `extensions`.
  Se a extensão já existir em outro schema, usá-la onde está.
- Geometrias tipadas em SRID 4326, validade checada e índices espaciais.
- Dados geográficos imutáveis por versão; chaves e FKs compostas com `versao_id`.
  Exclusão com `RESTRICT`; no máximo uma versão ativa.
- Dados por importador idempotente com hash, separados da migration de estrutura.
- `installExtensions: false` impede o TypeORM de instalar extensões ao conectar.
  O runtime usa SQL qualificado e não registra as entidades de mapa para sincronização.
- PostGIS local via `postgis/postgis:16-3.5-alpine`; init automático da imagem
  substituído para que a instalação das extensões pertença às migrations.

## Consequências

O banco pode conter outros schemas sem que a importação os reestruture.
Leituras TypeORM de geometrias em ferramentas precisam do schema da extensão no
`search_path`; SQL dos serviços/importador qualifica as funções pelo catálogo.

O CLI precisa que o schema configurado exista antes de criar sua tabela de
migrations. Baseline e rollback têm proteções próprias, descritas em
[banco/migrations.md](../banco/migrations.md).
Modelo e importação: [mapa/dados-geo.md](../mapa/dados-geo.md).
