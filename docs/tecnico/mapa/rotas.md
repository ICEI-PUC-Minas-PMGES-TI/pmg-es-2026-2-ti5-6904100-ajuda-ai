# Rotas e navegação

`POST /mapa/rotas` calcula uma rota a pé, normal ou acessível, sem persistir
o percurso. Origem e destino podem ser prédio por ID ou coordenada WGS84.
[Contrato HTTP](api.md#rotas). Decisão: [ADR-0003](../decisoes/ADR-0003-rotas-sob-demanda.md).

## Grafo e custo

Implementação em `code/back/api/src/mapa/rotas/`:

- `grafo.ts` monta uma lista de adjacência dirigida e recusa custos negativos
  ou referências a nós inexistentes.
- `dijkstra.ts` usa heap mínimo, múltiplas origens e destinos. Minimiza
  **tempo total**, desempata por distância e depois por ordem estável.
- `rota.ts` conecta as pontas ao grafo e monta a geometria orientada.

O custo total inclui o encaixe da origem, as arestas e o trecho final até o
destino. Custos finais participam da escolha do nó de chegada; não se encerra
a busca no primeiro nó de destino quando esses custos diferem.
O chamador soma o trecho final à resposta uma única vez.
O atalho entre duas projeções na mesma aresta também é comparado com alternativas
pelo grafo: proximidade geométrica não garante menor tempo.

`tempo_caminhada_s` é o custo das arestas, incluindo penalidades de superfície
e escadas da origem. Não se deve recalculá-lo apenas por distância/velocidade.
Para trechos fora do grafo, usa-se 1,4 m/s.
Conectores de distância zero com geometria nula ligam nós coincidentes:
mantêm seu custo de tempo e não desenham segmento.

## Encaixe (snapping)

- **Prédio com nós:** todas as suas entradas são candidatas, com custo inicial
  zero; vence o conjunto de menor tempo, não o par de menor distância.
- **Prédio sem nó:** nó com saída mais próximo do contorno, até 50 m, com custo
  do trecho reto até ele. Não se inventam entradas indoor.
- **Coordenada:** projeção na aresta com geometria mais próxima, até 30 m.
  O trecho proporcional e o afastamento até o caminho entram no total.
  Origem e destino respeitam a direção, inclusive ao usar a aresta reversa.
- Sem aresta próxima, coordenada dentro de prédio com nós usa suas entradas;
  fora de prédio resulta em `origem-fora` ou `destino-fora`.

A projeção usa plano equirretangular local, adequado à escala do campus.
A linha começa no usuário e termina na entrada do prédio ou coordenada de destino;
pontos consecutivos repetidos são removidos. Destino no prédio de origem ou
coordenadas a menos de 10 m produzem `mesmo-local`.

## Acessibilidade e limites

O modo acessível filtra arestas e snapping por `acessivel = true`.
Não certifica condições físicas do campus, rampas/elevadores internos ou
acessibilidade entre andares. Não há rota entre componentes desconectados.

Áreas/salas são destinos por ponto, não polígonos de chegada ou navegação indoor.
Não há turn-by-turn, recálculo ao andar, ETA dinâmico ou acompanhamento contínuo.
A precisão do GPS não altera o raio de snapping.

## Cache e privacidade

`RotasService` consulta a versão ativa e carrega o grafo em memória por versão.
Requisições simultâneas compartilham a promessa de carga; falha descarta o cache.
Sem versão ativa retorna 503; sem caminho retorna 422.

A posição vai no corpo do POST, nunca na URL. O snapping ocorre em memória:
a posição não entra em SQL, não é persistida, associada a conta nem registrada em
log. Logs resumem versão, destino por prédio ou tipo coordenada, modo e custo.

## Cliente Flutter

`CampusRouteService` é contrato do pacote, implementado por
`MapaApiRouteService` no app. O serviço é injetado na `MapaPage`; a flag
`CampusMapFeatures.routes` não habilita/desabilita rotas.

O card permite traçar, alternar acessibilidade e limpar a rota. Trocar seleção,
fechar o card ou sair invalida respostas pendentes. Sem API não há cálculo local.
A linha usa GeoJSON com casing, emissividade e oclusão configuradas; a câmera
reserva espaço para os controles e a altura medida do card.
Limpar a linha solicita repintura para que o mapa parado reflita a remoção.

## Verificação reproduzível

Na API (`code/back/api`):

```powershell
npx vitest run src/mapa/rotas test/mapa-rotas.real.spec.ts test/mapa-rotas.pucmaps.spec.ts
```

Grafos sintéticos cobrem direção, acessibilidade, múltiplas entradas, empates,
snapping e desconexões. `destino-coordenada.spec.ts` verifica o custo final
assimétrico e a comparação do atalho com o grafo.
`test/mapa-rotas.real.spec.ts` verifica o snapshot versionado e sua geometria.

### Referências PUCMaps

A fixture `test/fixtures/mapa-rotas-pucmaps-12.json` mantém referências
separadas de **tempo** e **distância**: o código da origem mudou para tempo,
mas as rotas persistidas conservaram o critério de distância.
Essa distinção é necessária para interpretar os testes, não uma regra do runtime.

A amostra versionada roda sem banco de origem. A comparação integral opcional
precisa de CSVs exportados pelos scripts
`scripts/mapa/rotas-pucmaps-tempo.sql` e
`scripts/mapa/rotas-pucmaps-distancia.sql`, somente leitura no banco local
PUCMaps com pgRouting. Os comentários dos SQLs trazem os comandos de exportação.

```powershell
$env:PUCMAPS_ROTAS_TEMPO_CSV='<caminho>/pgr_tempo.csv'
$env:PUCMAPS_ROTAS_DISTANCIA_CSV='<caminho>/precalc.csv'
npx vitest run test/mapa-rotas.pucmaps.spec.ts
```

Sem os CSVs, apenas a comparação integral é pulada. Não usar
`PUCMAPS_ROTAS_FIXTURE=1` numa validação comum: essa opção regrava a amostra.

### Medição e inspeção

Após `npm run build` na API, o benchmark local imprime JSON na saída padrão:

```powershell
node --expose-gc scripts/mapa/medir-rotas.mjs
```

Ele usa o snapshot local, aquece e mede um par fixo de prédios nos modos normal
e acessível. Não mede HTTP, banco, aplicativo ou dispositivo físico.
O delta de heap pode incluir efeitos do GC e não equivale ao tamanho do grafo.
Guarde comparações de máquinas/versões no ambiente da medição, sem tratar uma
execução como garantia de latência.

[Gerador de visualizações do grafo](grafos/README.md).
