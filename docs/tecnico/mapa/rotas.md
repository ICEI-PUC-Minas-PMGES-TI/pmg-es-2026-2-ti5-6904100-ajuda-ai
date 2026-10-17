# Rotas e navegação

> Estado: PLANEJADO (nenhum código de rota implementado). Os DADOS do grafo já
> estão no banco (`mapa.nos_grafo`, `mapa.arestas_grafo`, Tarefa 7).

## Objetivo

Permitir que o usuário solicite uma rota a pé entre dois pontos do campus (dois prédios, uma localização atual e um prédio, etc.), incluindo a opção de rota acessível, sem depender de rotas pré-calculadas armazenadas em banco. A decisão e a justificativa completa estão em [ADR-0003 — Rotas sob demanda](../decisoes/ADR-0003-rotas-sob-demanda.md).

## Grafo

O grafo de navegação (nós e arestas, ver [dados-geo.md](dados-geo.md)) é a estrutura de dados sobre a qual as rotas são calculadas. No projeto de origem, o grafo é construído a partir de dados do OpenStreetMap, com nós carregados em memória e pesos de aresta considerando tipo de via, escadas e superfície.

## Grafo no banco (ATUAL, Tarefa 7)

Versão `pucmaps-12` (ACTIVE no PUCMaps), importada e ativa no banco local e no
Supabase. Detalhes em [dados-geo.md](dados-geo.md#banco-geográfico-schema-mapa).

| Item | Valor |
|---|---|
| Nós | 653 (147 ligados a prédios, 19 deles a portões) |
| Arestas | 1.654 dirigidas (827 trechos, cada um nos dois sentidos) |
| Acessíveis | 1.516; 138 marcadas como não acessíveis na origem |
| Geradas (conectores) | 114 |
| Comprimento zero | 32 (conectores entre nós no mesmo ponto; `geometria` nula) |
| Arestas paralelas | 20 pares (mesmos nós, caminhos e distâncias diferentes) |
| Níveis / camadas | `nivel` -1…1 (decimal); `camada` -2…1 |
| Custos | `distancia_m` ≥ 0 (difere de `ST_Length` da linha em < 1 m), `tempo_caminhada_s` ≥ 0 (velocidade implícita média ~1,29 m/s) |

O que a rota futura precisa e já está garantido pelo banco: nenhuma aresta aponta
para nó inexistente ou de outra versão (FK composta), sem laços, geometria
válida em SRID 4326 e índice GIST em `nos_grafo.localizacao` para snapping.
Nada de Dijkstra, A*, snapping, ETA ou endpoint foi implementado.

## Origem do grafo

> LEGADO (PUCMaps): o grafo do campus usado como referência foi construído a partir de dados OpenStreetMap processados por um pipeline específico do projeto de origem (identificação de tipos de via, inserção de conectores entre pontos próximos, simplificação do grafo). Esse processo de construção é candidato a ser portado como script offline de importação, não como funcionalidade do backend em produção — ver [dados-geo.md](dados-geo.md#importação-futura).

## Algoritmo: Dijkstra / A*

- Cálculo sob demanda, em memória, no backend.
- Dijkstra é a referência mais simples; A* é uma otimização possível, desde que a heurística usada seja de fato admissível (distância em linha reta entre os pontos, por exemplo) — isso deve ser verificado explicitamente na implementação, não presumido.
- Cache do grafo carregado por versão do mapa (`mapVersionId`), para evitar recarregar a cada requisição.

## Snapping

"Snapping" é o ajuste do ponto informado pelo usuário (origem ou destino) ao grafo de navegação: encontrar a aresta mais próxima, ou a entrada de um prédio/área, para iniciar o cálculo de rota a partir de um ponto que de fato pertence ao grafo. Essa lógica é preservada como funcionalidade necessária, tanto do lado do backend (ajustar o ponto de partida ao grafo) quanto do lado do cliente (ajustar a posição do usuário à linha da rota exibida).

## Rota acessível

> PLANEJADO: o grafo de origem marca arestas como acessíveis ou não (por exemplo, por causa de escadas). A rota acessível é calculada considerando apenas arestas acessíveis. A qualidade dessa modelagem (incluindo navegação entre andares) depende dos dados importados e deve ser avaliada quando a importação for feita — não presumir que a modelagem é completa.

## Estratégia sob demanda

Ver [ADR-0003](../decisoes/ADR-0003-rotas-sob-demanda.md). Resumo: sem `precalculated_routes`, cálculo em memória, cache por versão.

## Motivo da remoção de `precalculated_routes`

Volume do projeto de origem: aproximadamente 770 mil rotas por versão ativa, cerca de 7,5 GB por versão. Incompatível com o ambiente de banco deste projeto. Ver [ADR-0003](../decisoes/ADR-0003-rotas-sob-demanda.md) para detalhes.

## pgRouting

Opcional e futuro. A extensão está **disponível** no Supabase (pgRouting 3.4.1,
confirmado em 17/10/2026), mas **não foi instalada**. O `routingId` inteiro do
PUCMaps não foi portado; se o pgRouting for adotado, ids inteiros podem ser
derivados. Só com benchmark que justifique o uso frente ao cálculo em memória.

## Benchmark

> PLANEJADO: nenhum benchmark foi executado neste projeto. Quando a implementação de rota sob demanda existir, um benchmark de tempo de resposta deve ser registrado aqui, com a configuração usada (tamanho do grafo, hardware, se aplicável).

## Visualizador de grafo / debug

> LEGADO (PUCMaps): existe, no admin Angular do projeto de origem, um visualizador que desenha o grafo (nós e arestas) sobre o mapa, útil para depuração. Essa ferramenta não é migrada como aplicação (ver [ADR-0007](../decisoes/ADR-0007-admin-pucmaps.md)); é candidata a virar um modo de debug dentro do próprio pacote `campus_map` ou uma figura estática de documentação, a decidir durante a fase de administração (ver [administracao.md](administracao.md)).
