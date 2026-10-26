# Fronteiras de infraestrutura

O mapa usa a API NestJS do Ajuda-aí, PostgreSQL/PostGIS, Blob Storage e Mapbox.
[Arquitetura e fluxo](../arquitetura.md). Não há dependência de serviços do PUCMaps
para operar o aplicativo.

## Responsabilidades operacionais

- **Banco:** mudanças estruturais por migrations; imports são operações
  separadas e transacionais. Não usar `synchronize` em banco compartilhado.
  [Procedimentos e rollback](../banco/migrations.md).
- **Storage:** a API não cria containers. `map-assets` e `restaurant-menus`
  precisam permitir leitura pública dos blobs; `profiles`, `feed` e `chat`
  são privados. Credenciais de escrita ficam no backend/ambiente de publicação.
- **Rede:** GLBs e basemap dependem de HTTPS ou cache local do SDK.
  Um proxy/CDN deve preservar URLs versionadas e cache imutável dos assets.
- **Web:** upload direto de blobs privados exige CORS para a origem e operações
  usadas pelo frontend. O upload de cardápios é mediado pela API; o app nativo
  não depende de CORS de navegador.

## Critérios para ampliar a infraestrutura

Adicionar serviços apenas quando existir uma necessidade demonstrada:

- Processamento longo de importação/mídia pode exigir fila e worker; o progresso
  só precisa de canal em tempo real se houver uma tela que o acompanhe.
- Cache/locks distribuídos só se justificam quando várias instâncias precisarem
  compartilhar estado; o cache de grafo é local a cada instância.
- Push exige registro de dispositivos, consentimento e um serviço de envio.
- Novos dados OSM ou modelos exigem pipeline de geração e validação antes da
  publicação; importar o snapshot existente não executa esse pipeline.
- Latência/egress e incidentes devem orientar adoção de CDN ou tracing.

Esses critérios não representam compromisso de implementação nem escolha de provedor.
