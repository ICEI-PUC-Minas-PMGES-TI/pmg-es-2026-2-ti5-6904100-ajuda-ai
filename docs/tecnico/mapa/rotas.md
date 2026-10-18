# Rotas e navegação

> Estado: ATUAL (Tarefa 9). Rota a pé sob demanda, normal ou acessível, da
> posição do usuário (ou de um prédio) até um prédio. Sem navegação
> turn-by-turn, sem pgRouting, sem rota pré-calculada, sem migration.

Decisão de fundo: [ADR-0003 — Rotas sob demanda](../decisoes/ADR-0003-rotas-sob-demanda.md).

## Visão geral

```text
App (MapaPage) ── CampusMapView(routeService) ── card "Traçar rota"
   │  CampusLocationService.locate()  (uma leitura, sob demanda)
   ▼
MapaApiRouteService ── POST /mapa/rotas { origem, destino, acessivel }
   ▼
RotasService ── grafo da versão ativa em memória (cache por versão)
   ├─ encaixe (snapping) da origem e do destino
   ├─ Dijkstra dirigido (tempo, depois distância)
   └─ LineString orientada usuário → entrada do destino
```

Código: `code/back/api/src/mapa/rotas/` (`geo.ts`, `grafo.ts`, `dijkstra.ts`,
`rota.ts`, `rotas.service.ts`, `rotas.controller.ts`, `rotas.dto.ts`), no
`MapaModule`. Contrato HTTP em [api.md](api.md#rotas).

## Grafo no banco (Tarefa 7)

Versão `pucmaps-12`, ativa no banco local e no Supabase. Detalhes em
[dados-geo.md](dados-geo.md#banco-geográfico-schema-mapa).

| Item | Valor |
|---|---|
| Nós | 653 (147 ligados a prédios, 19 deles a portões); 13 sem nenhuma aresta |
| Arestas | 1.654 dirigidas (827 trechos, cada um nos dois sentidos) |
| Acessíveis | 1.516; 138 marcadas como não acessíveis na origem (escadas etc.) |
| Geradas (conectores) | 114 |
| Comprimento zero | 32 (entrada do prédio sobre um nó de caminho; 1 s; `geometria` nula) |
| Arestas paralelas | 20 pares (mesmos nós, caminhos e distâncias diferentes) |
| Componentes | 5: um de 632 nós e quatro de 2 nós (fora dos prédios) |
| Prédios | 93 com nós (68 com 1, 25 com vários, até 9); 8 footprints sem nó |
| Custos | `distancia_m` (haversine, R = 6 371 km); `tempo_caminhada_s` inteiro, ≥ 1 s |

`tempo_caminhada_s` vem do `path-processor` do PUCMaps:
`max(1, round(distância / 1,4 m/s × multiplicadores))`, com escadas 3× e
superfícies ruins mais lentas. Velocidade implícita: mediana 1,394 m/s nas
acessíveis e 0,561 m/s nas não acessíveis (faixa 0,278–2,098 m/s).

## Auditoria do grafo real (antes de implementar)

Feita contra o código (`dijkstra.strategy.ts`, `astar.strategy.ts`,
`typeorm-route-query.service.ts`, `path-processor.util.ts`, commit `776e113`)
e os dados do PUCMaps (docker `pucmaps-postgres`, versão 12), em leitura.

- **Direção**: o PUCMaps usa `pgr_dijkstra(..., directed := true)`. Toda
  geometria de aresta vai da origem para o destino (1.622 de 1.622 verificadas;
  também é teste em `test/mapa-rotas.real.spec.ts`).
- **A\***: o `astar.strategy.ts` do PUCMaps usa `heuristic := 0`, ou seja, é
  Dijkstra. Uma heurística admissível em tempo teria de dividir a distância em
  linha reta pela maior velocidade do grafo (2,098 m/s, um artefato de
  arredondamento), e quase não poda nada. Com ~0,15 ms por rota não há o que
  ganhar: **só Dijkstra**.
- **Arestas de comprimento zero**: são as únicas ligações de 16 nós de prédio
  ao resto do grafo; tirá-las desconectaria esses prédios. **Entram** no cálculo
  (custo 1 s, como na origem) e não desenham nada.
- **Entradas**: as 107 entradas de prédio da origem são nós do próprio prédio
  (`nos_grafo.predio_id`). Só 3 áreas têm entrada.

### Ambiguidades encontradas e como foram resolvidas

| # | Ambiguidade | Evidência | Decisão |
|---|---|---|---|
| 1 | O código do PUCMaps otimiza por **tempo** (`cost = walkingTimeSeconds`), mas `precalculated_routes` da v12 tem tempo = `round(distância / 1,4)` em 100% das 770 302 linhas | o commit `69b2de0` (01/10) trocou o custo de `distanceMeters` para `walkingTimeSeconds`; a tabela foi gravada em 24/09 e nunca recalculada | seguir o **código atual (tempo)**, que tem teste próprio (`route-cost.e2e-spec.ts`: escada 3× deve perder). Validado contra as duas referências (abaixo). Em 228 485 pares o caminho de menor tempo é diferente do de menor distância |
| 2 | Prédio → prédio: o PUCMaps calcula nó → nó por tempo, mas escolhe o par de nós (entradas) por **menor distância** (`ORDER BY distanceMeters LIMIT 1`) | `typeorm-route-query.service.ts` | Dijkstra **multi-origem/multi-destino por tempo**. Em 111 de 17 112 pares de prédios o novo é mais rápido (média 10 s, máx. 41 s, até 48 m mais longo); nunca mais lento (testado em todos) |
| 3 | Coordenada: o PUCMaps desenhava o trecho do usuário até o grafo, mas não somava distância nem tempo | mesmo arquivo | o trecho entra no total: afastamento a 1,4 m/s + fração proporcional da aresta encaixada |
| 4 | Empate de tempo | `pgr_dijkstra` escolhe qualquer um | desempate pela menor distância, depois pelo id (determinístico). Em 90 951 pares o novo é mais curto com o mesmo tempo |
| 5 | 8 footprints sem nó (não existiam no PUCMaps) | snapshot `pucmaps-12` | nó com saída mais próximo do contorno, até 50 m (`conexao: "proximidade"`); os 8 ficam a menos de 50 m |
| 6 | Áreas como destino | só 3 de 12 têm entrada | fora desta fase (destino é sempre prédio) |

## Algoritmo

- `menorCaminho` (`dijkstra.ts`): Dijkstra dirigido sobre lista de adjacência,
  heap binário próprio, custo lexicográfico **(tempo, distância)**, várias
  origens com custo inicial e vários destinos (para no primeiro destino
  fechado). Com `acessivel`, ignora arestas `acessivel = false`.
- Custos negativos e arestas para nó inexistente são recusados ao montar o
  grafo (`construirGrafo`).
- Sem caminho → `null` (422 `sem-caminho` na API).

## Encaixe (snapping)

| Ponta | Regra | `conexao` |
|---|---|---|
| Prédio com nós | todos os nós do prédio, custo 0; o Dijkstra escolhe a melhor entrada | `entrada` |
| Prédio sem nó | nó com saída mais próximo do contorno, até **50 m**, a 1,4 m/s | `proximidade` |
| Coordenada | aresta com geometria mais próxima até **30 m** (o raio do PUCMaps); no modo acessível, só arestas acessíveis. Segue para o fim da aresta e, se existir a aresta contrária, também para o início, com custo proporcional | `caminho` |
| Coordenada sem caminho a 30 m, mas dentro de um prédio com nós | as entradas desse prédio | `entrada` |
| Coordenada sem caminho a 30 m e fora de prédio | erro 422 `origem-fora` (ou `destino-fora`) | — |

Destino por coordenada (Tarefa 11, eventos/restaurantes/áreas) usa o mesmo
encaixe, invertido: chega a um extremo da aresta e anda por ela até a
projeção e daí ao ponto, respeitando o sentido (o extremo final só vale se
existir a aresta contrária). Destino dentro do prédio de origem ou a menos de
10 m da origem: 422 `mesmo-local`. Origem e destino encaixados na **mesma
aresta**: a rota anda direto entre as duas projeções (sem ir até um nó e
voltar); no sentido contrário só se a aresta de volta existir.

Projeção do ponto na aresta em plano equirretangular local (erro desprezível
na escala do campus). A geometria da resposta começa no ponto do usuário,
desce ao caminho e termina na entrada do destino; pontos repetidos são
removidos.

## Rota acessível

Só arestas `acessivel = true`, inclusive no encaixe da origem. Todos os 93
prédios com nó têm rota acessível entre si; a rota acessível fica igual ou
mais lenta (ex.: do Prédio 14 ao Prédio 6, 79 m normal e 204 m acessível).
A qualidade depende da marcação da origem (OSM): rampas e elevadores dentro
dos prédios não estão modelados.

## Cache e carregamento

- Por requisição, uma consulta pequena à versão ativa (`id`, `codigo`).
- Grafo (nós, arestas com `ST_AsGeoJSON`, prédios com polígono e centro do
  bbox) carregado **uma vez por versão**; requisições simultâneas compartilham
  a mesma promessa. Trocou a versão ativa → recarrega. Falha de carga não fica
  no cache.
- Sem versão ativa → 503. Nenhuma escrita no banco (só `SELECT`; testado).

## Privacidade

- A coordenada vai no corpo do `POST`, nunca na URL.
- Não é gravada, não entra em SQL (nem como parâmetro: o encaixe é em
  memória), não é associada a conta e não aparece em log. O log registra só
  versão, prédio de destino, modo, metros, segundos, nós visitados e ms.
- O app lê a posição só ao tocar em "Traçar rota" (uma leitura, sem stream).

## Validação contra o PUCMaps

`test/mapa-rotas.pucmaps.spec.ts`, no grafo do snapshot:

| Referência | Pares | Resultado |
|---|---|---|
| TEMPO: `pgr_dijkstra` com o custo do código atual ([`scripts/mapa/rotas-pucmaps-tempo.sql`](../../../code/back/api/scripts/mapa/rotas-pucmaps-tempo.sql)) | 770 302 (371 502 acessíveis) | mesmo tempo ótimo em **todos**; distância ≤ |
| DISTÂNCIA: `precalculated_routes` gravadas ([`scripts/mapa/rotas-pucmaps-distancia.sql`](../../../code/back/api/scripts/mapa/rotas-pucmaps-distancia.sql)) | 770 302 | com custo = distância, mesma distância ótima em **todos** (< 1e-6 m) |
| Alcance | 81 210 pares sem caminho | idêntico (0 divergências) |
| Prédio → prédio | 17 112 | nunca mais lento; 111 mais rápidos |

A comparação completa leva ~4 min e precisa dos CSVs exportados do
`pucmaps-postgres`:

```bash
PUCMAPS_ROTAS_TEMPO_CSV=/tmp/pgr_tempo.csv PUCMAPS_ROTAS_DISTANCIA_CSV=/tmp/precalc.csv npx vitest run test/mapa-rotas.pucmaps.spec.ts
```

Sem os CSVs, o teste roda sobre uma amostra fixa versionada
(`test/fixtures/mapa-rotas-pucmaps-12.json`: 320 pares por tempo, 120 por
distância, 40 sem caminho e 200 prédio → prédio).

## Medições (17/10/2026)

API local (`node dist/main`) lendo o Supabase, via `127.0.0.1`:

| Item | Valor |
|---|---|
| Carga do grafo (3 consultas em paralelo) | 221–320 ms, uma vez por versão |
| Primeira rota após subir a API | 255–359 ms (inclui a carga) |
| Rota com grafo em cache (mediana de 7) | 14–15 ms HTTP; 0,2–4,6 ms de cálculo |
| Cálculo puro (todos os pares, em memória) | 0,15 ms nó → nó; 0,13 ms prédio → prédio |
| Resposta | 0,7–1,9 KB |

O tempo HTTP é dominado pela consulta da versão ativa ao Supabase.

## Cliente Flutter

- Pacote `campus_map` (sem HTTP): `CampusRouteService`, `CampusRoute`,
  `CampusRouteFailure`, `CampusMapController.routeTo/clearRoute`,
  `CampusMapCamera.showRoute/clearRoute`, `CampusRouteLayer`.
- Card depois de escolher um resultado da busca: nome, "Rota acessível",
  "Traçar rota" e fechar ("Limpar rota"). Com rota: "N min a pé · M m".
  Trocar o modo com uma rota na tela recalcula; escolher outro prédio, limpar
  a busca ou fechar o card apaga a linha.
- Linha: source GeoJSON `campus-map-route` + camadas `campus-map-route-casing`
  (branca) e `campus-map-route-line` (azul), slot `middle`,
  `line-emissive-strength` 1 e `line-occlusion-opacity` (a rota continua
  visível, mais fraca, atrás dos prédios 3D). Se o style recarregar, a rota
  em exibição é redesenhada.
- Câmera: `cameraForCoordinatesPadding` com a inclinação e o rumo atuais,
  margens para a busca e o card, zoom máximo 18,5.
- App: `MapaApiRouteService` (`lib/services/mapa_api.dart`, timeout 8 s),
  injetado pela `MapaPage`. **Sem rota local**: API fora do ar, lenta ou com
  resposta inválida → "Não foi possível calcular a rota agora." e nada é
  desenhado.

| Situação | Mensagem |
|---|---|
| API indisponível / erro 5xx / timeout | Não foi possível calcular a rota agora. |
| 422 `origem-fora` | Você está longe dos caminhos do campus. Aproxime-se para traçar a rota. |
| 422 `mesmo-local` | Você já está neste local. |
| 422 `sem-caminho` | Não há rota até este local. / Não há rota acessível até este local. |
| 404 ou 422 `predio-sem-conexao` | Este local ainda não tem rota disponível. |
| Localização negada/desligada | as mensagens já existentes de "Minha localização" |

Pedidos são cancelados por um pedido novo, por limpar ou por sair da tela: uma
resposta atrasada nunca desenha.

## Testes

- `src/mapa/rotas/rotas.spec.ts` (grafos sintéticos): caminho único, dois
  caminhos (vence o menor tempo), empate → menor distância, desconectado,
  direção, acessível × não acessível, ciclo, aresta zero, origem = destino,
  multi-origem/destino, determinismo, heap, geometria, encaixe (aresta, mão
  única, 30 m, dentro do prédio, prédio sem nó, inexistente).
- `src/mapa/rotas/rotas.service.spec.ts`: cache (inclusive simultâneo), troca
  de versão, falha de carga, 503/404/422/400, log sem coordenada, DTO no
  `ValidationPipe` global.
- `test/mapa-rotas.real.spec.ts`: grafo real (contagens, orientação, P01 → P02,
  Biblioteca → ICEI normal e acessível, todos os pares de prédios, coordenada,
  fora do campus, prédios sem nó, determinismo, desempenho).
- `test/mapa-rotas.pucmaps.spec.ts`: equivalência com o PUCMaps (acima).
- `test/mapa-api.integration.spec.ts`: `POST /mapa/rotas` com PostGIS real
  (grafo lido do banco = grafo do snapshot, só `SELECT`, erros, 503).
- Flutter: `packages/campus_map/test/campus_route_test.dart` e
  `test/mapa_api_test.dart`.

## pgRouting

Não instalado (disponível no Supabase, pgRouting 3.4.1). O cálculo em memória
dá o mesmo resultado do `pgr_dijkstra` em todos os pares e responde em menos
de 5 ms; não há bloqueador que o justifique. O `routingId` inteiro do PUCMaps
não foi portado.

## Motivo da remoção de `precalculated_routes`

Cerca de 770 mil rotas por versão (~7,5 GB) no PUCMaps, incompatível com o
banco deste projeto, e já desatualizadas em relação ao próprio código de lá
(ambiguidade 1). Ver [ADR-0003](../decisoes/ADR-0003-rotas-sob-demanda.md).

## Limitações

- Destino prédio (por id) ou coordenada (eventos, restaurantes, áreas e
  salas pela posição); origem: posição atual (no app) ou prédio (na API).
  Área como polígono de chegada (entrar pela borda mais próxima) não é
  modelada: usa-se o ponto da área.
- Sem navegação passo a passo, recálculo ao andar, ETA dinâmico ou seguir o
  usuário.
- Andares e acessibilidade interna dos prédios não modelados.
- O raio de 30 m vale para o ponto do GPS; com precisão ruim a origem pode
  cair no caminho errado (a precisão não é usada).

## Visualizador de grafo / debug

> LEGADO (PUCMaps): existe, no admin Angular do projeto de origem, um visualizador que desenha o grafo (nós e arestas) sobre o mapa, útil para depuração. Essa ferramenta não é migrada como aplicação (ver [ADR-0007](../decisoes/ADR-0007-admin-pucmaps.md)); é candidata a virar um modo de debug dentro do próprio pacote `campus_map` ou uma figura estática de documentação, a decidir durante a fase de administração (ver [administracao.md](administracao.md)).
