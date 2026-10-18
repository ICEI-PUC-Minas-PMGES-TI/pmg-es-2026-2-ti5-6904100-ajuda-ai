# Eventos, restaurantes e cardápios

> Estado: ATUAL (Tarefa 11, 18/10/2026). Backend, migration, web da
> coordenação e app implementados e testados (PostGIS real nos testes de
> integração). Migration `EventosRestaurantesCardapios` **aplicada no Supabase
> em 18/10/2026**: as três tabelas começam **vazias** (0 eventos, 0
> restaurantes, 0 cardápios; `GET /mapa/eventos` e `GET /mapa/restaurantes` →
> `[]`). Nada foi importado: o conteúdo real é cadastrado pela coordenação
> ([detalhes da aplicação](../banco/migrations.md#aplicação-no-supabase-tarefa-11-18102026)).

Conteúdo do campus administrado pela coordenação: o que está acontecendo
(eventos), onde comer (restaurantes/lanchonetes) e o que tem para comer
(cardápios). O aluno vê no mapa, foca o local e traça rota até lá.

## O que existia no PUCMaps (auditoria)

Fonte: `mapa-da-puc-1` (commit `776e113`), API `code/api`, admin `code/web`,
app `code/mobile` e o banco local `pucmaps` (consultado só com `SELECT`).

| Domínio | Modelo no PUCMaps | Dados reais | Uso |
|---|---|---|---|
| Eventos (`events`) | `title`, `description`, `times[]` (`startsAt`/`endsAt`), `location` (ponto, obrigatório), `polygon` opcional, `images[]` (S3, ≥ 1 obrigatória), `pushNotificationRules[]`; sem categoria, status, link nem prédio | **0 linhas**; só fixtures de teste e 2 cards fixos no app com imagens do Figma | Admin com CRUD (busca quebrada: 400; editar exigia reenviar imagens); app só lia a 1ª página e o toque no marcador não abria nada; push agendado no EventBridge nunca chegava ao celular (sem registro de token) |
| Lanchonetes (`canteens`) | `name`, `description`, `locationType` (`BUILDING`/`ROOM`) + `locationId` (sem FK), `openingHours[]` (`weekday`, `opensAt`, `closesAt`), `status` (`OPEN`/`CLOSED`/`MAINTENANCE`/`UNDER_CONSTRUCTION`); sem imagem (o campo de foto da tela nunca era enviado) | **0 linhas** | Painel dentro do prédio `CAFETERIA` no admin (listagem quebrada: 400); **nenhuma tela no app** |
| Cardápios (`menus`, `menu_items`) | itens estruturados por data (`validDate`): nome, descrição, preço, categoria livre, disponível | **0 linhas** | Editor no painel da lanchonete; "hoje" calculado em UTC (vira às 21h em Brasília); sem índice único por data |
| Ofertas (`offers`) | título, desconto %, vigência, itens | **0 linhas** | Só API, sem tela |

Estabelecimentos reais existem como **prédios** `CAFETERIA` do mapa
(`pucmaps-12`): `P16` Cantina – Prédio 16, `P29` Cantina – Prédio 29, `P57`
Trailer de Lanches, `P95` Varanda Pastoral, `OSM_455954541` Restaurante
Universitário e `OSM_271050665` ("Prédio 31", nome genérico). Nada foi
importado: a coordenação recebe esses prédios como **sugestões** no cadastro.

## Decisões

- **Schema `mapa`**, como `mapa.pucstops`: é conteúdo posicionado no mapa e
  administrado pela coordenação, **sem `versao_id`** (editado sem publicar
  versão nova). Não vai para `feed` (avisos/publicações do programa não têm
  local nem período) nem para um schema novo (seria mais um schema sem ganho).
- **Local**: exatamente uma forma — `predio_id` (chave estável, ex. `P16`),
  `area_id` (UUID da área) ou `localizacao` (ponto clicado). Sem FK (prédios e
  áreas são por versão) e sem copiar geometria: a API confere o local na
  versão ativa ao gravar e resolve nome/posição nela ao ler. Evento pode não
  ter local; restaurante precisa ter. Ponto livre precisa cair no campus (o
  mesmo limite dos PucStops).
- **Evento com um período** (`inicio`, `fim`, até 31 dias) em vez da lista de
  horários do PUCMaps: sem dados a migrar e mais simples de cadastrar; um
  evento recorrente vira eventos separados. Datas sempre com fuso (o PUCMaps
  interpretava `datetime-local` no fuso do servidor).
- **Restaurante**: nome, descrição, local e `horarios` (`dia` 0–6, `abre`,
  `fecha`, como o PUCMaps, sem atravessar meia-noite e sem sobreposição). O
  `status` do PUCMaps virou `ativo` (visibilidade) + "aberto agora", calculado
  pelos horários no fuso de Brasília. Sem foto, avaliação, delivery ou preço.
- **Cardápio como arquivo** (imagem ou PDF) com vigência (`validoDe`..
  `validoAte`, até 31 dias), no container público `restaurant-menus`, que
  existia no Azure vazio e sem uso. É o que a cantina já publica (foto ou PDF
  da semana) e evita digitar itens todo dia. Itens estruturados e ofertas
  ficam como trabalho futuro ([administracao.md](administracao.md)).
- **"Excluir"** evento/restaurante = desativar (some do aluno, volta ao
  reativar). Cardápio é removido de verdade (arquivo + linha): não é histórico.
- **Fora agora**: imagens de eventos (não há container definido para elas),
  lembretes push (exigem registro de dispositivo e um serviço de envio; ver
  [evolucao.md](../infraestrutura/evolucao.md)), ofertas.

## Banco

Migration `1792298839015-EventosRestaurantesCardapios` (só `CREATE`):

| Tabela | Colunas | Regras |
|---|---|---|
| `mapa.eventos` | `id` uuid (`gen_random_uuid()`), `titulo`, `descricao`, `inicio`, `fim` (timestamptz), `predio_id`, `area_id`, `localizacao` (Point 4326), `ativo`, `criado_por`, `criado_em`, `atualizado_em` | título 3..255; descrição ≤ 2000; `fim > inicio` e ≤ 31 dias; no máximo um local; índice parcial `(fim, inicio) WHERE ativo` |
| `mapa.restaurantes` | `id`, `nome`, `descricao`, local (as mesmas 3 colunas), `horarios` jsonb, `ativo`, auditoria | nome 3..255; **exatamente** um local; `horarios` é lista de até 21 faixas |
| `mapa.cardapios` | `id` (gerado pela API), `restaurante_id` (FK RESTRICT), `valido_de`, `valido_ate` (date), `arquivo`, `tipo_conteudo`, `tamanho_bytes`, `criado_por`, `criado_em` | vigência ≤ 31 dias; tipo ∈ PNG/JPEG/WebP/PDF; 1 B..10 MB; `arquivo` UNIQUE e igual a `restaurantes/<restaurante>/cardapios/<id>.<ext>` (CHECK) |

`criado_por` → `usuarios.id` (nulo enquanto o coordenador for mockado, como
nos PucStops). `down` recusa apagar com dados (os arquivos ficariam no Azure).

## API

### Pública (aluno, sem login, só leitura)

| Rota | Resposta |
|---|---|
| `GET /mapa/eventos` | ativos que **não acabaram**, por início; `[]` sem eventos |
| `GET /mapa/eventos/:id` | evento ativo (inclusive encerrado, para link direto); 404 inativo/inexistente |
| `GET /mapa/restaurantes` | ativos, por nome |
| `GET /mapa/restaurantes/:id` | ativo; 404 caso contrário |
| `GET /mapa/restaurantes/:id/cardapio?data=AAAA-MM-DD` | `{data, cardapio}`: o mais recente cuja vigência cobre a data (padrão: hoje em Brasília); `cardapio: null` sem cardápio |

```jsonc
// EventoDto
{ "id": "…uuid…", "titulo": "Semana de Engenharia", "descricao": "…",
  "inicio": "2026-10-20T22:00:00.000Z", "fim": "2026-10-21T01:00:00.000Z",
  "situacao": "em-breve",            // em-breve | acontecendo | encerrado
  "local": { "tipo": "predio", "id": "P26", "nome": "Biblioteca Padre Alberto Antoniazzi - P. 26",
             "latitude": -19.92085, "longitude": -43.99316, "rota": { "id": "P26" } } }
// RestauranteDto
{ "id": "…", "nome": "Cantina do Prédio 16", "descricao": "",
  "local": { "tipo": "predio", "id": "P16", "nome": "Cantina - Prédio 16", "…": "…", "rota": { "id": "P16" } },
  "horarios": [{ "dia": 1, "abre": "07:00", "fecha": "21:00" }],
  "abertoAgora": true, "cardapioHoje": true }
// GET /mapa/restaurantes/:id/cardapio
{ "data": "2026-10-19", "cardapio": { "id": "…", "url": "https://<conta>.blob.core.windows.net/restaurant-menus/restaurantes/<id>/cardapios/<id>.pdf",
  "tipoConteudo": "application/pdf", "tamanhoBytes": 183204, "validoDe": "2026-10-19", "validoAte": "2026-10-25", "criadoEm": "…" } }
```

`local.rota` diz como traçar rota: prédio pelo `id`, área e ponto pela
coordenada. `local` com posição nula (prédio/área ausente do mapa ativo) não
tem marcador nem rota.

### Coordenação

Mesmos guards de `/coordenacao` (`JwtAuthGuard` + `RolesGuard`,
`@Roles('coordenador')`): 401 sem token, 403 aluno (testado em todas as rotas).

| Rota | Observação |
|---|---|
| `GET /coordenacao/campus` | região onde se pode posicionar conteúdo (mesmo limite dos PucStops) |
| `GET/POST /coordenacao/eventos`, `GET/PATCH /coordenacao/eventos/:id` | PATCH parcial; `local: null` remove o local |
| `POST /coordenacao/eventos/:id/desativar` \| `/ativar` | "excluir" lógico, idempotente |
| `GET /coordenacao/restaurantes/sugestoes` | prédios `CAFETERIA` do mapa ativo + `cadastrado` |
| `GET/POST /coordenacao/restaurantes`, `GET/PATCH /coordenacao/restaurantes/:id` | local obrigatório (PATCH com `local: null` → 400) |
| `POST /coordenacao/restaurantes/:id/desativar` \| `/ativar` | o público e o cardápio público somem junto |
| `GET /coordenacao/restaurantes/:id/cardapios` | todos, vigentes ou não |
| `POST /coordenacao/restaurantes/:id/cardapios` | multipart: `arquivo`, `validoDe`, `validoAte`, `substitui?` |
| `DELETE /coordenacao/cardapios/:id` | remove arquivo e registro |

Erros: 400 validação (inclui campo extra, data sem fuso, título curto,
período, horários, local em duas formas); 422 `local-inexistente` (prédio/área
fora do mapa ativo) ou `fora-do-campus`; 503 sem versão ativa do mapa; 413
arquivo acima de 10 MB.

## Cardápios no Azure

Container `restaurant-menus` (público para leitura de blob, já existente e
vazio antes desta tarefa; conferido só com leitura de metadados).

- **Upload mediado pelo backend** (multipart, como a foto de perfil): o front
  nunca recebe connection string nem SAS. O tipo é decidido pelos **bytes**
  (assinatura PNG/JPEG/WebP/`%PDF-`), nunca pelo Content-Type ou nome
  enviados; limite de 10 MB no multer e no serviço.
- **Nome determinístico**: `restaurantes/<restauranteId>/cardapios/<cardapioId>.<ext>`
  (UUID gerado pela API; nada do nome original). `If-None-Match: *`: nunca
  sobrescreve. `Cache-Control: public, max-age=31536000, immutable` (o nome
  muda a cada envio).
- **Sem lixo órfão**: grava o blob, depois a linha; se a linha falhar, apaga o
  blob. Remover apaga o blob e depois a linha (com o Azure fora, a linha fica
  e continua apontando para um arquivo existente; blob já ausente não impede
  limpar a linha). Substituir grava o novo e só então remove o anterior.
- A URL pública não tem SAS nem segredo; a resposta não expõe chave interna
  além do caminho público do blob.

## Rotas até o local

`POST /mapa/rotas` passou a aceitar **destino por coordenada** (antes: só
prédio). A coordenada é encaixada no caminho mais próximo até 30 m (mesma regra
da origem) respeitando o sentido das arestas; dentro de um prédio sem caminho
perto, usa as entradas dele. Novos casos: 422 `destino-fora` e `mesmo-local`
(destino dentro do prédio de origem ou a menos de 10 m). Origem e destino na
mesma aresta andam direto entre as projeções (sem ir a um nó e voltar). O app
usa `local.rota`: prédio por `id`, área/ponto por coordenada. Ver
[rotas.md](rotas.md).

## Web da coordenação

`code/front`, menus **Eventos** e **Restaurantes** (logo após PucStops; não
dependem do programa/ciclo, como os PucStops). Mesmo padrão visual e de
componentes das outras páginas da coordenação.

- **Seletor de local** (`SeletorLocal.jsx`): "Prédio do mapa" (busca por
  nome/código/id, sem acento), "Área", "Ponto no mapa" (clique/arraste, com a
  área permitida desenhada) e, só em eventos, "Sem local". O mapa é o mesmo
  Mapbox dos PucStops: o seletor dos PucStops virou um componente genérico
  (`SeletorPontoMapa.jsx`) com o círculo de geofence opcional; a página de
  PucStops usa um invólucro e seus testes seguem iguais. Recusas do servidor
  (`fora-do-campus`, `local-inexistente`, 503) têm mensagem própria.
- **Eventos**: lista (período em pt-BR, situação, local, status), filtros,
  criar/editar (início e fim em `datetime-local`, enviados em ISO com fuso),
  excluir (desativar, com confirmação) e reativar. PATCH só com o que mudou.
- **Restaurantes**: lista (horários resumidos, "Aberto agora", "Cardápio
  hoje", contagem de cardápios), **sugestões do mapa** (os prédios
  `CAFETERIA`, um clique preenche nome e prédio), editor de horários (com
  "Preencher Seg a Sex") e painel de **cardápios**: lista com vigência, tipo,
  tamanho, miniatura e "Abrir"; enviar (arquivo + vigência, padrão a semana
  atual), substituir e remover (com confirmação: o arquivo é apagado).

## App (aluno)

`campus_map` + `lib/services/campus_conteudo_api.dart` (o pacote continua
sem HTTP; o app implementa `CampusContentService`).

- Chips **"Eventos"** e **"Onde comer"** abaixo da busca abrem uma lista
  (carregando, vazio, offline com "Tentar novamente"). Escolher um item fecha
  a lista, leva a câmera ao local e abre o card.
- **Marcadores leves** (sem GLB nem sprite): uma source GeoJSON com `kind`;
  círculos roxos (eventos) e laranja (restaurantes), mais fortes quando
  acontecendo/aberto; pontos a partir do zoom 15, nomes a partir do 17; só
  itens com posição. Toque no ponto abre o card. Um card por vez (PucStop,
  conteúdo ou busca/rota).
- **Card**: "Ver no mapa", "Traçar rota" (só com destino; reaproveita a linha
  e as mensagens de rota, inclusive acessível) e, em restaurante, "Ver
  cardápio" — imagem em tela cheia (`Image.network`), PDF aberto fora do app
  (`url_launcher`, com "Copiar link" se não abrir), "Sem cardápio publicado
  para hoje." quando não há.
- Recarrega ao voltar para o app (como os PucStops); falha mantém a lista
  anterior; resposta atrasada é descartada.
- **Correção junto**: resultado de busca do tipo área/sala (id UUID) mandava o
  UUID como prédio e a rota falhava; agora o `tipo` da busca remota vira
  `CampusPlace.kind` e área/sala vão pela coordenada
  (`CampusRouteTarget.forPlace`). `CampusRouteService.route` recebe um
  `CampusRouteTarget` (prédio ou coordenada).

## E2E local (18/10/2026)

API + web locais, banco PostGIS descartável com `pucmaps-12` ativa, Azurite
(emulador oficial do Azure Storage) no lugar do Azure real, login demo da
coordenação, token Mapbox `pk.`. Nenhum dado tocou o Supabase ou o Azure
real.

| Passo | Resultado |
|---|---|
| Restaurantes vazio | 6 sugestões do mapa (P16, P29, P57, P95, RU, Prédio 31) |
| "Cadastrar" a partir de P16 + "Preencher Seg a Sex" | criado; público com `rota: {id: "P16"}`; "Fechado agora" correto (domingo 02h em Brasília) |
| Enviar PNG pelo painel | blob `restaurantes/<id>/cardapios/<id>.png` no Azurite; download anônimo 200, `image/png`, `Cache-Control: public, max-age=31536000, immutable`, bytes PNG; cardápio de hoje no público; miniatura carregada |
| Remover (confirmação) | blob 404, linha apagada, público `cardapio: null` |
| Evento pela web (10:00–12:00, prédio P34) | gravado 13:00Z–15:00Z (fuso certo); público com `rota: {id: "P34"}`; `POST /mapa/rotas` até ele: 200, 339 m |

### Visual no emulador Android (18/10/2026)

Mesmo ambiente local (API em `10.0.2.2:3000`, Azurite via `adb reverse`,
GPS simulado na Biblioteca P26). Dados criados pela API local da coordenação:
3 eventos (prédio P34 acontecendo, área Jardim amanhã, ponto livre ter. 20/10;
um encerrado, que não aparece), 3 restaurantes (Cantina P16 aberta com PNG,
RU seg–sex com PDF, Trailer sem horário e sem cardápio) e 1 PucStop.

| Cenário | Resultado |
|---|---|
| Vazio | "Nenhum evento programado." / "Nenhum restaurante cadastrado." |
| Lista de eventos | horários de Brasília ("Hoje · 06:30–12:00", "Amanhã · 14:00–17:30", "ter., 20/10 · 19:00–22:00"); encerrado oculto |
| Marcadores, card, "Ver no mapa" | pontos roxo/laranja visíveis sobre o 3D; foco com o ponto acima do card |
| Rotas | prédio 340 m, área 470 m, ponto livre 720 m, cantina 280 m (acessível 390 m), todas enquadradas entre os atalhos e o card |
| Onde comer | Cantina "Aberto agora", RU "Fechado hoje" (domingo), Trailer "Horário não informado" |
| Cardápio | PNG em tela cheia; PDF entregue ao navegador (`127.0.0.1:10000`, 200 `application/pdf`); Trailer "Sem cardápio publicado para hoje."; arquivo indisponível (Azurite parado) "Não foi possível carregar a imagem do cardápio." |
| Regressão | busca remota = `/mapa/busca`; rota de local da busca; PucStop "Você está no alcance" → "+50 XP · total 50 XP" (marcador verde mantido após reabrir); 2D/3D, vegetação (16) e props (85); attribution; Perfil → Mapa ×2 sem source/layer duplicado nem crash |
| Offline (API parada) | mapa base e 3D seguem; lista "Não foi possível carregar os eventos…" com "Tentar novamente"; busca pelo fallback local; rota "Não foi possível calcular a rota agora." |

Corrigido durante o E2E (no `campus_map`, com testes):

- Foco e rota com card aberto: a câmera reserva a **altura medida** do card
  (no padding da câmera, não no das coordenadas, que o Mapbox ignorava no
  centro) e reenquadra quando o card cresce com a linha de tempo/distância;
  margem do topo cobre os atalhos Eventos/Onde comer.
- Ponto de evento/restaurante no slot `top`, voltado para a tela: no `middle`
  o prédio 3D o cobria.
- Restaurante sem horário cadastrado não aparece como "Fechado": mostra
  "Horário não informado" sem selo (também na web: "Sem horário").
- Fechar o card deixava a linha da rota na tela até mover o mapa (remover
  camadas não redesenha o mapa parado): `triggerRepaint()` após limpar.

## Testes

| Onde | Cobre |
|---|---|
| `test/campus.integration.spec.ts` (PostGIS real, `pucmaps-12`) | listas vazias; 401/403 em todas as rotas da coordenação; região do campus; colunas; eventos (prédio/área/ponto/sem local, situação, encerrado fora da lista, validações 400/422, PATCH com `local: null`, desativar/reativar, rota até cada evento pelo `local.rota`); restaurantes (sugestões = 6 `CAFETERIA`, criação, validações, horários, PATCH); cardápios (imagem e PDF, nome e cache, vigência, mais recente vence, formato pelos bytes, 413, substituição, falha no banco desfaz o blob, remoção com Azure fora, restaurante desativado); CHECKs; migration up/down/up |
| `src/campus/horarios.spec.ts` | formato, ordem, sobreposição, meia-noite; aberto agora em Brasília (21h não vira o dia) |
| `src/campus/cardapios/cardapio-arquivo.spec.ts` | assinatura dos 4 formatos; SVG/GIF/HTML recusados; 10 MB; nome determinístico |
| `src/mapa/rotas/rotas.service.spec.ts`, `test/mapa-api.integration.spec.ts` | destino por coordenada (grafo sintético e grafo real P26 → cantina P16), `destino-fora`, `mesmo-local`, mesma aresta, coordenada fora do log |
| `code/front/test/eventos.test.mjs`, `restaurantes.test.mjs` | cliente HTTP (rotas, JWT, FormData do cardápio, erros com `motivo`), validações (título, período, horários, arquivo/vigência), diff do PATCH, conversões de local, listas/estados/formulários renderizados; PucStops sem regressão |
| `campus_map/test/campus_content_test.dart`, `campus_route_test.dart` | modelos (itens inválidos ignorados), camada GeoJSON, controller (carga única, recarga, exclusividade dos cards, foco, rota por id/coordenada, respostas atrasadas), lista e card (vazio, offline, cardápio imagem/PDF/nenhum), alvo de rota e correção de área/sala |
| `test/campus_conteudo_api_test.dart`, `test/mapa_api_test.dart` (app) | contrato HTTP (URLs, lista vazia, offline/timeout, 404, cardápio nulo), `destino` por id ou coordenada, `destino-fora`, `tipo` da busca |

## Pendências

1. A coordenação cadastrar os primeiros eventos e restaurantes (as tabelas do
   Supabase estão vazias de propósito; as sugestões do mapa ajudam no
   primeiro cadastro).
2. Imagens de eventos, lembretes push e ofertas: trabalho futuro.
3. Itens estruturados de cardápio (preço/categoria), se a coordenação pedir.
