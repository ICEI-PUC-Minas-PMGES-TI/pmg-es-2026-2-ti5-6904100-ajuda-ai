# Evolução da infraestrutura

> Estado: ROADMAP (nada aqui está implementado). Registro das capacidades do
> PUCMaps que dependiam de infraestrutura própria e que **não** foram trazidas
> para o Ajuda-aí, com o gatilho que justificaria cada uma. Levantado na
> auditoria da Tarefa 11 ([administracao.md](../mapa/administracao.md)).

O Ajuda-aí hoje roda com: API NestJS única, PostgreSQL/PostGIS (Supabase),
Azure Blob Storage (`map-assets`, `restaurant-menus`, privados) e Mapbox. Nada
de fila, cache distribuído, worker ou push. A regra é **não adicionar
infraestrutura sem uma funcionalidade que a exija**.

| Capacidade | Como era no PUCMaps | Por que não agora | Gatilho para reconsiderar | Caminho provável no Ajuda-aí |
|---|---|---|---|---|
| Lembretes push de eventos | regras por evento (ISO 8601) → EventBridge Scheduler → SNS/FCM; o app nunca registrava token, então nada chegava | sem registro de dispositivo, sem serviço de envio e sem pedido de produto | coordenação pedir aviso de evento no celular | registrar token FCM por usuário (tabela própria), job agendado na API ou Azure Functions/Notification Hubs; reaproveitar o período de `mapa.eventos` |
| Notificações gerais (RF012) | — (requisito do projeto; stubs no admin) | não existe canal de notificação no Ajuda-aí | primeira notificação real (vínculo, cadastro, evento) | o mesmo serviço de push acima; SSE só se houver tela aberta que precise de tempo real |
| Fila/worker (SQS + consumidores na API) | cálculo de rotas pré-calculadas e pipeline de tiles | rotas são sob demanda (ADR-0003); não há processamento longo | importação de mapa que passe de alguns segundos ou processamento de mídia (ex.: miniaturas) | Azure Service Bus ou Storage Queue + worker separado; enquanto couber numa requisição, nada |
| Redis | refresh tokens, versão ativa em cache, locks e contadores de progresso, pub/sub do SSE | sem refresh token (JWT de 1 h), versão ativa é uma consulta barata, grafo fica em memória por instância | várias instâncias da API precisando de cache/lock comum, ou rate limit distribuído | Azure Cache for Redis, só para o que precisar ser compartilhado |
| Progresso em tempo real (SSE via Lambda + gRPC) | barra de progresso da criação de versão e do cálculo de rotas | importação de versão é um script síncrono e transacional | importação pela web com processamento longo | SSE direto da API (sem gRPC/Lambda), alimentado pela fila acima |
| Pipeline OSM (Overpass → grafo, sprites, tiles vetor/raster, Lambdas Rust) | criação de versão pelo admin | o campus muda pouco; a versão `pucmaps-12` foi exportada e importada por script | reforma/obra que mude prédios ou caminhos | script versionado no repositório (Overpass → snapshot → `mapa:importar`); tiles continuam no Mapbox |
| CDN de imagens/mapas (CloudFront) | `images.pucmaps.com.br`, `maps.pucmaps.com.br` | o Blob público serve bem o volume atual (GLBs com cache imutável) | latência ou custo de egress relevantes | Azure Front Door/CDN na frente dos containers públicos, sem mudar URLs versionadas |
| Imagens de eventos/prédios | S3 `pucmaps-bucket-images`, upload multipart sem validação | sem container definido e sem uso no app | pedido de produto por foto de evento | container público próprio (ex. `campus-media`) com o mesmo upload mediado dos cardápios (tipo por bytes, nome determinístico, sem órfãos) |
| Observabilidade (OpenTelemetry + Zipkin) | traces locais | logs estruturados do Nest bastam hoje | incidentes difíceis de rastrear em produção | Application Insights via OpenTelemetry |

Fora de questão: autenticação própria, LocalStack/Ministack, credenciais AWS,
`precalculated_routes` e o app Angular separado ([administracao.md](../mapa/administracao.md#o-que-não-volta)).
