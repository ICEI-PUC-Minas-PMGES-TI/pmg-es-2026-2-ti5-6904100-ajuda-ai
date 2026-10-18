# Administração do mapa — inventário

> Estado: ATUAL (Tarefa 11, 18/10/2026). Inventário fechado a partir da
> auditoria do PUCMaps (`mapa-da-puc-1`, commit `776e113`: código do admin
> Angular `code/web`, API Nest `code/api` e banco local `pucmaps`) e do
> Ajuda-aí atual. Decisão de base: [ADR-0007](../decisoes/ADR-0007-admin-pucmaps.md)
> — o Angular **não** é migrado como aplicação; as funções úteis vão para o
> React da coordenação, o Nest do Ajuda-aí ou scripts.

## Fatos da auditoria

- **Dados reais:** o banco do PUCMaps (`pucmaps-postgres`, volume
  `mapa_postgres-data`, consultado só com `SELECT` em sessão read-only e
  parado de novo) tem as 20 tabelas **vazias**: 0 eventos, 0 lanchonetes,
  0 cardápios/itens/ofertas. Não há seed, dump ou CSV desses domínios no
  repositório; os únicos nomes são fixtures de teste ("Test Event", "Canteen 1",
  "Pizza"…) e dois cards fixos do app ("Evento em Destaque", "Promoções", com
  imagens de Figma). **Nada a importar.**
- **Estabelecimentos reais** existem só como prédios do mapa (`pucmaps-12`,
  tipo `CAFETERIA`): `P16` Cantina – Prédio 16, `P29` Cantina – Prédio 29,
  `P57` Trailer de Lanches, `P95` Varanda Pastoral, `OSM_455954541`
  Restaurante Universitário e `OSM_271050665` (nome genérico "Prédio 31").
  Viram **sugestões** no cadastro de restaurantes, não registros automáticos.
- **Autenticação do admin antigo:** login próprio (e-mail/senha), JWT dividido
  (cookie da assinatura), CSRF, sessões de refresh no Redis; só role `ADMIN`
  (criado por seed). O refresh nunca funcionava (o interceptor não manda o
  token para `/auth/*`) e não há logout na UI.

## Inventário (tela por tela)

Classificação: **MIGRADA** (reimplementada no Ajuda-aí), **SUBSTITUÍDA**
(outra solução já cobre), **DESNECESSÁRIA** (sem valor no Ajuda-aí),
**FUTURA** (útil, fora desta fase).

| Funcionalidade | Origem PUCMaps | Já existe no Ajuda-aí? | Classificação | Justificativa |
|---|---|---|---|---|
| Login, sessão, refresh, CSRF | `/login`, `auth.controller.ts`, Redis `refresh:{jti}` | Sim: login Microsoft + JWT; coordenação por `RolesGuard` | DESNECESSÁRIA | Uma autenticação só (ADR-0001); o fluxo antigo nem renovava sessão |
| Usuários (`/users/me`, troca de e-mail/senha, registro) | API sem tela | Sim (`usuarios`, cadastro) | DESNECESSÁRIA | Identidade é do Ajuda-aí |
| Shell, seletor de versão, "Promover" | Shell Angular, `POST /admin/map/versions/:id/promote` | Sim: `npm run mapa:importar` (`--ativar`), `GET /mapa/versao` | SUBSTITUÍDA | Versão é snapshot imutável importado por script; promover = ativar no import |
| Progresso por SSE (stream-ticket, Lambda, gRPC, Redis pub/sub) | `map-version-progress.service.ts`, `progress-streamer` | Não | DESNECESSÁRIA | Não há processamento assíncrono de versão; import é transacional e síncrono |
| Criar versão (`/welcome`, `/create-version`): polígono, Overpass/OSM, sprites, tiles, filas SQS, Lambdas | Pipeline OSM completo | Parcial: exportador do snapshot do PUCMaps | FUTURA | Pipeline OSM próprio só quando o campus mudar; ver [evolucao.md](../infraestrutura/evolucao.md) |
| Lista de versões (`/maps`), excluir versão | `/maps`, `DELETE /admin/map/versions/:id` (sem botão) | Sim: `mapa.versoes` + `GET /mapa/versao` | SUBSTITUÍDA / DESNECESSÁRIA | Versões não são apagadas (histórico; `arquivada`) |
| Visualizar/reextrair grafo, exportar grafo (gephi/graphml/gdf) | `/maps/:id`, `GET /admin/map/:v/graph` | Sim: testes do grafo e da rota real | SUBSTITUÍDA (diagnóstico) | Reextração depende do pipeline OSM; inspeção coberta por testes. Overlay de grafo no `campus_map`: FUTURA |
| Editar estilo/ícones do mapa (`/maps/:id/edit`) | renderStyle JSON + sprites (spreet) | Sim: estilo Mapbox + renderer do `campus_map` | DESNECESSÁRIA | Sem pipeline de tiles próprio (estava quebrado com ícones) |
| CRUD de prédios, salas e áreas (com imagens) | `/buildings*`, `/areas*`, `/admin/map/:v/{buildings,rooms,areas}` | Sim, por versão importada | SUBSTITUÍDA | Dado geográfico vem do snapshot versionado; correção = nova versão. Edição pontual de nomes: FUTURA |
| Imagens de prédios/áreas (S3) | multipart → `pucmaps-bucket-images` | Não | FUTURA | Sem uso no app atual; exigiria container próprio |
| Rotas pré-calculadas, calcular/excluir, rota ao vivo | `/routes`, `precalculated_routes`, SQS, pgRouting | Sim: `POST /mapa/rotas` sob demanda (ADR-0003) | SUBSTITUÍDA | Rota calculada na hora; sem tabela gigante nem filas |
| **Eventos** (CRUD, horários, local, imagens) | `/events*`, `admin-event.controller.ts` | Não | **MIGRADA (agora)** | Valor de produto; ver [eventos-cantinas.md](eventos-cantinas.md) |
| Lembretes push de eventos (EventBridge + SNS/FCM) | `pushNotificationRules` | Não | FUTURA | No PUCMaps nunca chegava ao celular (sem registro de token); exige infra de notificação |
| Imagens de eventos | S3 obrigatório (≥ 1) | Não | FUTURA | Sem container definido; criar container no Azure é decisão à parte |
| **Lanchonetes / restaurantes** (CRUD, horários) | painel no prédio `CAFETERIA`, `admin-business.controller.ts` | Não | **MIGRADA (agora)** | Valor de produto; página própria, não escondida no prédio |
| **Cardápio** | itens estruturados por data (`menus`, `menu_items`) | Não | **MIGRADA (agora), como arquivo** | Imagem/PDF por período no `restaurant-menus` (ver [eventos-cantinas.md](eventos-cantinas.md#cardápios)); itens estruturados: FUTURA |
| Ofertas/promoções | só API (`offers`), sem tela | Não | FUTURA | Nunca teve UI nem dados |
| Totens (CRUD) | só API `/admin/totems`, sem tela | Sim: PucStops (Tarefa 10) | MIGRADA (antes) | CRUD com seletor no mapa, XP e geofence |
| Dashboard, Notificações, Configurações | componentes esqueleto, fora do router | Não | DESNECESSÁRIA | Stubs sem função |
| Scripts admin (`admin-populate-promote`, `refresh-campus-view`…) | `code/scripts` | Sim: `mapa:exportar-pucmaps`, `mapa:importar` | SUBSTITUÍDA | |
| Webhook de tiles, gRPC de ticket | `map-webhook.controller.ts`, `auth.grpc.controller.ts` | Não | DESNECESSÁRIA | Infra do pipeline antigo |

## Onde ficou cada função migrada

| Função | Ajuda-aí |
|---|---|
| PucStops | `/coordenacao/pucstops` (React: menu PucStops) |
| Eventos | `/coordenacao/eventos` (React: menu Eventos) |
| Restaurantes e cardápios | `/coordenacao/restaurantes`, `/coordenacao/cardapios/:id` (React: menu Restaurantes) |
| Versões/importação do mapa | `npm run mapa:exportar-pucmaps`, `npm run mapa:importar` |

Tudo no mesmo React da coordenação, com a mesma autenticação e os mesmos
guards (`JwtAuthGuard` + `RolesGuard`, `@Roles('coordenador')`). Nenhum app
Angular paralelo.

## O que não volta

Autenticação própria do PUCMaps, usuários antigos, Redis, refresh token antigo,
LocalStack/Ministack, SQS, SNS, EventBridge, gRPC, credenciais AWS, Lambdas do
pipeline de tiles, `precalculated_routes`, editor de estilo e o app Angular.
