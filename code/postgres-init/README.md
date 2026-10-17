# postgres-init

Montada em `/docker-entrypoint-initdb.d` pelo `docker-compose.yml`, no lugar do
script da imagem `postgis/postgis` (que, num volume novo, instalaria `postgis`,
`postgis_topology` e `postgis_tiger_geocoder` em `public`).

Fica vazia de propósito: o PostgreSQL ignora este README. O PostGIS e o
`unaccent` são instalados pela migration `HabilitaPostgisESchemaMapa`, no schema
`extensions`, igual ao Supabase. Ver `docs/tecnico/banco/migrations.md`.
