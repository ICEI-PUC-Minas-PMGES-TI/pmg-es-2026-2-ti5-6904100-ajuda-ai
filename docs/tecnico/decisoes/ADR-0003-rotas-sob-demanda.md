# ADR-0003 — Rotas sob demanda

Estado: aceito.

## Contexto

Pré-calcular todos os pares multiplica armazenamento e trabalho por versão do
grafo. Também permite que resultados persistidos fiquem incompatíveis com mudanças
no critério de custo. O campus pode ser atendido por cálculo em memória.

## Decisão

- Preservar o grafo dirigido, com distância, tempo de caminhada e acessibilidade.
- Calcular sob demanda com Dijkstra em TypeScript no backend.
- Minimizar tempo total, depois distância, com desempate determinístico.
  Custos de encaixe da origem e do destino participam da escolha.
- Carregar e compartilhar o grafo por versão ativa, sem tabela de rotas,
  fila de pré-cálculo ou extensão pgRouting no runtime.
- Manter snapping de coordenadas e múltiplas entradas dos prédios.

## Consequências

Armazenamos o grafo, sem o produto de todos os pares. Uma alteração da versão ativa
invalida a carga em memória. Um crescimento que comprometa latência precisa de
medição antes de justificar outro algoritmo ou execução no banco.

A implementação não usa A*: uma heurística admissível depende de limites coerentes
com o tempo das arestas; não se deve presumir distância/velocidade constante.
As referências históricas de tempo e distância permanecem distintas nos testes de
paridade, pois a origem mudou de critério sem recalcular os resultados persistidos.

Algoritmo, limitações e reprodução das comparações:
[mapa/rotas.md](../mapa/rotas.md).
