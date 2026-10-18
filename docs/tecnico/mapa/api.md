# API do mapa

`MapaModule`, em `code/back/api/src/mapa/`, expõe leitura geográfica,
busca e cálculo de rota, públicos e sem login.
Conteúdo e PucStops têm contratos próprios:
[eventos/restaurantes/cardápios](eventos-cantinas.md#api),
[PucStops](pucstops.md#endpoints) e [XP](../gamificacao/xp.md#api-e-app).

## Fronteiras

A leitura geográfica usa somente a versão ativa. Sem versão ativa retorna 503;
recursos inexistentes retornam 404. O cliente recebe DTOs, sem entidade TypeORM,
UUID interno da versão ou metadados completos de importação.

SQL parametrizado e funções PostGIS/unaccent qualificadas pelo catálogo
evitam depender do `search_path`. Entidades de mapa não são registradas no
runtime para `synchronize`; `installExtensions: false` impede instalação
implícita de extensões.

## Endpoints geográficos

- `GET /mapa/versao`: código, status, versão de assets informativa,
  proveniência resumida, ativação e contagens.
- `GET /mapa/predios`: resumos por ID, sem polígonos.
- `GET /mapa/predios/:id`: detalhe com entradas e geometria, nula em portões.
- `GET /mapa/areas`: áreas por nome, com geometria.
- `GET /mapa/salas`: salas da versão ativa; lista vazia é válida.
- `GET /mapa/busca?q=&limit=`: resultados de prédio, área e sala.
- `POST /mapa/rotas`: cálculo sem escrita, com resposta 200.

IDs de prédio são os mesmos das footprints/GLBs; código/nome não são chaves.
Áreas/salas usam UUIDs. Coordenadas são WGS84.
O centro de prédio com polígono é o centro do bbox, coerente com o foco local;
portões usam seu ponto. A localização original da fonte pode ser diferente
desse centro e não deve substituir silenciosamente o contrato.

## Busca

Normalização por `unaccent`, lowercase, trim e espaços consecutivos reduzidos.
Ranking: código exato, nome exato, prefixo de nome, prefixo de código, nome contém.
Empate por tipo (prédio, área, sala), nome, código e ID normalizados.

- `q` ausente/vazia retorna `[]` sem consulta.
- `limit` padrão 8, máximo 20; consulta até 100 caracteres.
- Parâmetros desconhecidos ou inválidos retornam 400.
- `starts_with`/`strpos` tratam `%`, `_` e barra invertida como texto.
- Nome/código determinam os candidatos, sem aliases ou categorias inferidos.

Resultado inclui `id`, `tipo`, nome, código, categoria e latitude/longitude.
O tipo distingue prédio de área/sala para selecionar o alvo de rota.

## Rotas

`POST` permite enviar a posição no corpo, fora da URL e de logs de acesso.
Uma ponta é `{id}` de prédio **ou** `{latitude, longitude}`; misturar as
formas ou omiti-las retorna 400. `acessivel` é booleano opcional, padrão false.

```json
{
  "origem": {"latitude": -19.92255, "longitude": -43.99165},
  "destino": {"id": "P26"},
  "acessivel": false
}
```

A resposta contém versão, modo, pontas resolvidas, `distanciaMetros`,
`tempoSegundos`, contagens de nós/arestas e geometria LineString orientada.
`conexao` indica `entrada`, `caminho` ou `proximidade`.
Custos incluem os trechos fora do grafo, conforme [rotas.md](rotas.md).

Erros: 400 corpo inválido/campo extra; 404 prédio inexistente;
422 com `motivo` entre `origem-fora`, `destino-fora`, `mesmo-local`,
`sem-caminho` e `predio-sem-conexao`; 503 sem versão ativa.
Coordenadas não são persistidas nem registradas em log.

## Cliente Flutter

O app implementa `MapaApiPlaceRepository` e `MapaApiRouteService` usando
sua pilha HTTP; `campus_map` recebe os contratos, sem HTTP ou URL próprios.

- Busca usa timeout curto e fallback local em falha; resultado remoto vazio
  não aciona fallback.
- Foco consulta primeiro o resultado da última busca, depois detalhe de prédio
  e fallback. Isso preserva foco de áreas que não existem no snapshot local.
- Rotas não têm fallback local. Respostas atrasadas são invalidadas ao mudar
  pedido, seleção ou tela.
- O app não consulta `GET /mapa/versao` para compatibilizar assets;
  o manifesto empacotado continua sendo a referência do renderer.
- A busca não tem debounce próprio. Não confundir com debounce da câmera/LOD.

Não há ETag/cache HTTP próprio; o cache de grafo é específico de
`RotasService`, por versão e instância da API.

## Verificação

`src/mapa/mapa.service.spec.ts` verifica parâmetros, ranking e falhas.
`test/mapa-api.integration.spec.ts` verifica o contrato com PostGIS/unaccent
reais e bancos descartáveis, incluindo versão arquivada invisível.
[Procedimento de integração](../banco/migrations.md#testes).
Os contratos Flutter são testados em `test/mapa_api_test.dart` no app e
`campus_fallback_place_repository_test.dart` no pacote.
