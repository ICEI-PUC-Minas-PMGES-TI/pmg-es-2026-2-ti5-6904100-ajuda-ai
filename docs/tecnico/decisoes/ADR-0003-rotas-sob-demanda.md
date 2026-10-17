# ADR-0003 — Rotas sob demanda

> Estado: ATUAL (decisão implementada na Tarefa 9; ver [mapa/rotas.md](../mapa/rotas.md))

## Contexto

O PUCMaps calculava rotas de forma pré-computada: para cada versão do mapa, o sistema gerava e armazenava todas as rotas possíveis (todos-para-todos) usando `pgr_dijkstra`/`pgr_aStar` sobre o grafo do campus, guardando o resultado na tabela `precalculated_routes`.

O volume medido nesse modelo, segundo a auditoria técnica do PUCMaps, é de aproximadamente **770 mil rotas por versão ativa** e **cerca de 7,5 GB** de armazenamento por versão, crescendo a cada nova versão do mapa. Esse volume é incompatível com o ambiente de banco deste projeto (Supabase/Postgres compartilhado, sem a mesma capacidade de armazenamento da infraestrutura original do PUCMaps).

Rotas **não são um requisito descartável**: a navegação pelo campus (incluindo rota acessível) permanece no escopo do produto.

## Decisão

- O grafo do campus (nós e arestas, com atributos de distância, tempo de caminhada e acessibilidade) é preservado.
- As rotas deixam de ser pré-calculadas e passam a ser **calculadas sob demanda**, a partir do grafo carregado em memória no backend.
- Algoritmo inicial: Dijkstra ou A* implementado em memória no backend (TypeScript), com cache por versão do mapa (`mapVersionId`) para evitar recarregar o grafo a cada requisição.
- `pgRouting` (`pgr_dijkstra`/`pgr_aStar` no próprio Postgres) é uma opção **futura e opcional**, condicionada à disponibilidade da extensão no ambiente de banco usado e a um benchmark que justifique a complexidade adicional frente ao cálculo em memória.
- `precalculated_routes` não é portada para o Ajuda-aí.
- O "snapping" (ajustar o ponto de origem/destino informado ao grafo — ponto mais próximo em uma aresta, ou entrada de um prédio/área) é preservado como funcionalidade, pois é necessário tanto no cálculo sob demanda quanto no pré-calculado.

## Consequências

- Armazenamento muito menor: apenas o grafo (nós e arestas), não o produto cartesiano de rotas.
- Menor complexidade operacional: não é preciso recalcular e armazenar rotas a cada nova versão do mapa.
- É necessário validar, por benchmark, que o cálculo sob demanda responde em tempo aceitável para o tamanho do grafo do campus (a referência do PUCMaps é da ordem de ~650 nós por versão).
- A decisão de usar ou não `pgRouting` fica em aberto e deve ser registrada como atualização deste ADR quando tomada, não presumida.
- O visualizador de grafo (ferramenta de debug existente no admin Angular do PUCMaps) é tratado separadamente em [ADR-0007](ADR-0007-admin-pucmaps.md) e em [mapa/rotas.md](../mapa/rotas.md).

## Atualização — implementação (Tarefa 9, 17/10/2026)

- **Dijkstra** dirigido em memória (TypeScript), custo tempo de caminhada com
  desempate por distância, várias entradas na origem e no destino. **Sem A\***:
  o A* do PUCMaps usava heurística 0 (equivalente a Dijkstra) e uma heurística
  admissível em tempo quase não poda neste grafo.
- Cache do grafo **por versão ativa** (id da versão em `mapa.versoes`), com
  recarga quando a versão ativa muda.
- **pgRouting não adotado**: o cálculo em memória dá o mesmo ótimo do
  `pgr_dijkstra` nos 770 302 pares da versão 12 e responde em menos de 5 ms
  (14–15 ms de HTTP com o Supabase). Benchmark e validação em
  [mapa/rotas.md](../mapa/rotas.md#validação-contra-o-pucmaps).
- Achado da validação: as `precalculated_routes` do PUCMaps estavam
  desatualizadas em relação ao próprio código (custo distância × tempo); o
  cálculo sob demanda elimina essa classe de problema.
