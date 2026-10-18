# API pública do mapa

> Estado: ATUAL (Tarefas 8, 9 e 10). Somente leitura da versão ativa: dados,
> busca e rotas a pé (`POST /mapa/rotas`, que calcula sem gravar nada).
> PucStops (Tarefa 10) ficam no `GamificacaoModule`: leitura pública em
> `/mapa/pucstops` e a única escrita ligada ao mapa, a coleta autenticada
> (`POST /mapa/pucstops/:id/claim`). Criar/editar/desativar PucStops é só da
> coordenação, em `/coordenacao/pucstops` (fora de `/mapa`). Ver
> [pucstops.md](pucstops.md#endpoints).

Módulo `code/back/api/src/mapa/` (`MapaModule`, `MapaController`,
`MapaService`, `dto/mapa.dto.ts`), registrado no `AppModule`. Sem prefixo
global (como o resto da API). Dados: schema `mapa`, versão `ativa`
(`pucmaps-12`); ver [dados-geo.md](dados-geo.md).

## Decisões

- **Público, sem login**, como `GET /avisos`: são dados abertos do campus.
  Nenhum guard global foi alterado.
- **Só leitura.** GET para dados; o único POST (`/mapa/rotas`) calcula em
  memória e não grava. Nada de escrita, publicação, exclusão ou administração.
- **Sempre a versão ativa.** Toda leitura usa a subconsulta
  `(SELECT id FROM mapa.versoes WHERE status = 'ativa')`; versões arquivadas
  nunca aparecem (testado com uma versão arquivada alterada).
- **DTOs próprios**: o cliente não recebe entidade TypeORM, UUID da versão,
  hash, metadados de importação nem `id_origem` do PUCMaps.
- **Chave estável**: `id` de prédio é a mesma do footprint 2D, dos GLBs e da
  busca local (`P01_R4751608`, `GATE_8878373451`). Áreas e salas usam o UUID da
  origem.
- **SQL parametrizado** via `DataSource.query` (não Repository): precisa de
  funções PostGIS e `unaccent` qualificadas pelo schema real (descoberto em
  `pg_extension`), sem depender do `search_path`. A entrada do usuário só vai
  como parâmetro (`$1`, `$2`).
- **Entidades não registradas no TypeORM do runtime**: o `synchronize` local
  nunca toca em `mapa`. Mesmo assim o `AppModule` passou a usar
  `installExtensions: false` (o TypeORM não instala PostGIS sozinho).
- Sem Swagger (o projeto não usa), sem cache, sem Redis.

## Endpoints

| Método e rota | Resposta | Erros |
|---|---|---|
| `GET /mapa/versao` | `VersaoMapaDto` | 503 sem versão ativa |
| `GET /mapa/predios` | `PredioResumoDto[]` (101, ordem por `id`) | 503 |
| `GET /mapa/predios/:id` | `PredioDto` | 404 inexistente na versão ativa; 503 |
| `GET /mapa/areas` | `AreaDto[]` (12, ordem por nome) | 503 |
| `GET /mapa/salas` | `SalaDto[]` (hoje `[]`: a origem não tem salas) | 503 |
| `GET /mapa/busca?q=&limit=` | `ResultadoBuscaDto[]` | 400 `limit` fora de 1..20, `q` > 100 caracteres ou parâmetro desconhecido; 503 |
| `POST /mapa/rotas` | `RotaDto` (200) | 400 corpo inválido; 404 prédio inexistente; 422 sem rota (`motivo`); 503 |
| `GET /mapa/pucstops` | `PucStopDto[]` (ativos) | — |
| `GET /mapa/pucstops/:id` | `PucStopDto` | 404 |
| `POST /mapa/pucstops/:id/claim` (JWT) | `ColetaPucStopDto` (201) | 400; 401; 403; 404; 409 `ja-coletado`; 422 `fora-do-alcance`/`inativo`/`precisao-insuficiente` |
| `GET /me/xp`, `GET /me/xp/movimentacoes`, `GET /me/pucstops` (JWT) | XP e coletas do próprio usuário | 400; 401; 403 |

503: `{"message": "Mapa indisponível: nenhuma versão ativa.", ...}`. Erros
seguem o formato padrão do Nest (`message`, `error`, `statusCode`).

## Contratos

Coordenadas WGS84 (SRID 4326). `categoria` é o tipo da origem (`ACADEMIC`,
`LIBRARY`, `GATE`, `PARK`, `PARKING_LOT`...), nulo quando a origem não tem.

```jsonc
// GET /mapa/versao
{ "codigo": "pucmaps-12", "status": "ativa", "versaoAssets": "2026-09-30-r2",
  "origem": { "projeto": "PUCMaps", "versao": 12, "atualizadaEm": "2026-09-29T18:07:12.378Z" },
  "ativadaEm": "2026-10-17T19:35:40.634Z",
  "contagens": { "predios": 101, "areas": 12, "salas": 0 } }

// GET /mapa/predios (item)
{ "id": "P26", "nome": "Biblioteca Padre Alberto Antoniazzi - P. 26", "codigo": "26",
  "categoria": "LIBRARY", "altura": 9, "latitude": -19.92…, "longitude": -43.99… }

// GET /mapa/predios/:id = item acima +
{ "osmId": "88527117", "alturaBase": 0, "entradas": [{ "id", "name", "level", "latitude", "longitude" }],
  "geometria": { "type": "Polygon", "coordinates": [[[lon, lat], …]] } }   // null em portões

// GET /mapa/areas (item)
{ "id": "<uuid>", "nome": "Jardim Dom Cabral", "categoria": "PARK",
  "latitude": …, "longitude": …, "geometria": { "type": "Polygon", … } }

// GET /mapa/busca (item)
{ "id": "P26", "tipo": "predio", "nome": "…", "codigo": "26",
  "categoria": "LIBRARY", "latitude": …, "longitude": … }   // tipo: predio | area | sala
```

**Centro do prédio**: centro do bbox do polígono — exatamente o `center` do
snapshot do app (diferença 0 m nos 82 footprints, testado com 9 casas
decimais), então o foco remoto e o local caem no mesmo ponto. Portões (sem
polígono) usam o ponto da origem. A `localizacao` do PUCMaps não é usada como
centro: difere até 15 m e cai fora do polígono em 3 prédios.

Listagem sem polígono (14.958 B para 101 prédios); geometria só no detalhe e
nas áreas (7.637 B para 12 áreas).

## Busca

Mesmo comportamento do `LocalCampusPlaceRepository` (ver
[busca-localizacao.md](busca-localizacao.md#busca-e-modelo)):

- **Normalização no Postgres**: `unaccent` (dicionário qualificado
  `extensions.unaccent`) + `lower` + espaços consecutivos → um + `btrim`, na
  consulta e nos campos.
- **Ranking**: 0 código exato, 1 nome exato, 2 nome começa, 3 código começa,
  4 nome contém. Empate: prédio, área, sala; depois nome, código e id
  normalizados (determinístico).
- `starts_with`/`strpos`, sem `LIKE`: `%`, `_` e `\` da entrada são texto.
- `q` ausente, vazio ou só espaços → `[]` sem ir ao banco. Não lista tudo.
- `limit` padrão 8, máximo 20.
- Candidatos: prédios com nome ou código (5 sem nenhum dos dois ficam fora,
  como no app), as 12 áreas e salas (nenhuma hoje). Portões entram (nome
  “Portão”/“Portaria N”); no snapshot local eles não existem.
- Teste de compatibilidade: 15 consultas reais comparadas com uma porta direta
  do algoritmo do app sobre os mesmos dados — ordem idêntica.

## Rotas

Algoritmo, encaixe, validação e medições em [rotas.md](rotas.md). Público
como o resto do mapa; `POST` porque a origem pode ser a posição do usuário,
que vai no corpo (fora da URL e de logs de acesso) e não é gravada.

```jsonc
// POST /mapa/rotas — origem: { "id" } OU { "latitude", "longitude" };
// destino: { "id" } de prédio; acessivel opcional (padrão false)
{ "origem": { "latitude": -19.92255, "longitude": -43.99165 },
  "destino": { "id": "P26" }, "acessivel": false }

// 200
{ "versao": "pucmaps-12", "acessivel": false,
  "origem":  { "tipo": "coordenada", "id": null, "nome": null, "conexao": "caminho",
               "latitude": -19.92255, "longitude": -43.99165 },
  "destino": { "tipo": "predio", "id": "P26", "nome": "Biblioteca …", "conexao": "entrada",
               "latitude": …, "longitude": … },          // centro do prédio
  "distanciaMetros": 468.4, "tempoSegundos": 337, "nos": 10, "arestas": 9,
  "geometria": { "type": "LineString", "coordinates": [[lon, lat], …] } }
// geometria orientada: começa na origem e termina na entrada do destino

// 422
{ "message": "A origem está a mais de 30 m de um caminho do campus.",
  "motivo": "origem-fora", "statusCode": 422 }
```

- `conexao`: `entrada` (nós do prédio), `caminho` (encaixe numa aresta até
  30 m), `proximidade` (prédio sem nó próprio: nó mais próximo até 50 m).
- `motivo` (422): `origem-fora`, `mesmo-local`, `sem-caminho`,
  `predio-sem-conexao`.
- 400: `id` e coordenada juntos ou nenhum; coordenada incompleta, fora de
  ±90/±180 ou em texto; `id` fora de `[A-Za-z0-9_]{1,64}`; destino por
  coordenada; `acessivel` não booleano; campo desconhecido.

## Cliente Flutter

- O `campus_map` continua **sem HTTP e sem URL**. Novo:
  `CampusMapView(remotePlaceRepository: ...)` e
  `FallbackCampusPlaceRepository(primary, fallback)`.
- O app implementa `MapaApiPlaceRepository` (`lib/services/mapa_api.dart`) com
  a pilha HTTP existente (`package:http`, `apiBaseUrl`/`API_BASE_URL`,
  `executarRequisicao`, `ApiException`, `ApiIndisponivelException`); timeout
  de 3 s. A `MapaPage` cria uma instância por tela e a injeta.
- **Fallback**: busca remota com sucesso → resultado remoto (lista vazia é
  resposta válida). Falha de rede, servidor ou resposta inválida → snapshot
  local, sem mensagem técnica. Remoto e local falhando → a mensagem já
  existente “Não foi possível buscar locais. Tente novamente.”.
- **Foco**: o `findById` usa primeiro os lugares da última busca (o foco não
  depende de uma segunda ida à rede; funciona também para áreas, que não estão
  no snapshot), depois `GET /mapa/predios/:id`, depois o snapshot.
- Log (debug/profile), só quando a origem muda e sem o texto buscado:
  `[campus_map] map search source=remote|local-fallback`.
- Rotas: `MapaApiRouteService` (mesmo arquivo), timeout de 8 s, sem fallback
  local; ver [rotas.md](rotas.md#cliente-flutter).
- `GET /mapa/versao` não é consultado pelo app nesta fase: não há bloqueio por
  versão divergente. Possibilidade futura: comparar `versaoAssets` com o
  manifesto 3D e avisar no diagnóstico.

## Medições (17/10/2026)

API local (`node dist/main`) lendo o Supabase, 7 requisições por rota,
mediana, via `127.0.0.1` (no Windows, `localhost` tenta IPv6 antes e soma
~200 ms que não são da API):

| Rota | Mediana | Tamanho |
|---|---|---|
| `GET /mapa/busca?q=` (sem banco) | 2 ms | 2 B |
| `GET /mapa/versao` | 14 ms | 244 B |
| `GET /mapa/predios` | 14 ms | 14.958 B |
| `GET /mapa/areas` | 14 ms | 7.637 B |
| `GET /mapa/predios/P26` | 14 ms | 545 B |
| `GET /mapa/busca?q=Biblioteca` | 19 ms | 167 B |
| `GET /mapa/busca?q=planetario` | 18 ms | 165 B |
| `GET /mapa/busca?q=26` | 18 ms | 366 B |

Uma ida ao banco por requisição (a versão ativa é subconsulta), sem N+1.

`POST /mapa/rotas` (grafo em cache): 14–15 ms de mediana, 0,7–1,9 KB; a
primeira rota depois de subir a API carrega o grafo (255–359 ms). Detalhes
em [rotas.md](rotas.md#medições-17102026).

## Testes

- `src/mapa/mapa.service.spec.ts` (sem banco): busca vazia sem consulta;
  entrada só como parâmetro; schema do catálogo; sem `LIKE`; limites; 503/404;
  filtro pela versão ativa.
- `test/mapa-api.integration.spec.ts` (PostGIS + unaccent reais, mesmo
  container de [banco/migrations.md](../banco/migrations.md#testes)): versão,
  101 prédios com centro igual ao do app, detalhe, portão sem polígono, 404,
  áreas, salas, busca vazia, código/nome exato, prefixo, contém, caixa, acento,
  espaços, ranking igual ao do app, limites, 400, entradas maliciosas, versão
  arquivada invisível, 503 sem versão ativa.
- Rotas: ver [rotas.md](rotas.md#testes); o mesmo
  `test/mapa-api.integration.spec.ts` cobre `POST /mapa/rotas` com o grafo
  lido do banco.
- Flutter: `campus_fallback_place_repository_test.dart` (pacote) e
  `test/mapa_api_test.dart` (app, `MockClient`), incluindo API fora do ar →
  snapshot com as mesmas chaves e o contrato de `POST /mapa/rotas`.

## Limitações

- O grafo não é exposto; rotas só até prédio; sem ETA dinâmico nem pgRouting
  (ver [rotas.md](rotas.md#limitações)).
- Sem salas reais; `/mapa/salas` existe para estabilizar o contrato.
- A busca dispara a cada tecla (como antes); sem debounce. Com ~18 ms por busca
  local isso não pesa; em rede móvel pode valer um debounce na UI.
- Sem cache HTTP (`Cache-Control`) nem ETag.
- O app não consulta `/mapa/versao`; versões divergentes entre dados e assets
  não são detectadas.
