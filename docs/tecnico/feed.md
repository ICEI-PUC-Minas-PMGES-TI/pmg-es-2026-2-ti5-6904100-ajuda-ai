# Feed em tempo real

Implementado na branch `Feed`, criada a partir de `Sprint-5`. O código de matching e
as regras de participação não fazem parte desta alteração.

## Auditoria da base reutilizada

- Backend: `PublicacoesModule`, `PublicacoesController` e `PublicacoesService` já
  ofereciam listagem, criação, exclusão, comentários e curtidas.
- PostgreSQL: reutilizadas as entidades/tabelas `publicacoes`, `comentarios` e
  `curtidas`. A restrição única `(publicacao_id, usuario_id)` das curtidas foi mantida.
- Curtidas eram verificadas por leitura seguida de inserção; agora um lock na
  publicação serializa intenções concorrentes e evita erro de duplicidade.
- Comentários já eram persistidos, mas a API devolvia somente textos. A resposta
  mantém `comentariosTexto` e acrescenta identificadores/permissão para exclusão.
- Flutter: reutilizada `tela_feed.dart`, incluindo cards, filtros, criação/edição e painel
  de comentários. Administração mobile usa a permissão retornada pelo servidor,
  sessão explícita da coordenação e referências estáveis de mídia.
- React: a base tinha comunicados (`avisos`), sem tela do domínio `publicacoes`.
  Criada uma tela compartilhada nos layouts existentes. Comunicados foram preservados.
- Autenticação: `JwtAuthGuard`, `AuthModule`, login Microsoft e login demo existentes.
  Os perfis JWT são `coordenador`, `padrinho`, `apadrinhado` e `nenhuma`.
  O coordenador continua vindo da base já existente em `dados.ts`.
- Antes o feed usava `JwtOpcionalGuard` e aceitava `x-user-id`; agora exige JWT de
  acesso em todas as rotas, inclusive leitura e SSE. JWT de onboarding é recusado.
- Storage: reutilizados `StorageModule`, `AzureBlobStorageService` e container
  privado `feed`. O serviço já suportava upload pelo backend e SAS; foi adotado
  o upload pelo backend, como os fluxos existentes de foto/cardápio.
- Infraestrutura: estendido `code/docker-compose.yml`, preservando PostgreSQL,
  volumes e rede existentes.
- Testes anteriores: `publicacoes.service.spec.ts` e `mobile/test/feed_test.dart`.
  Foram adaptados às novas regras e complementados com testes HTTP, AMQP/SSE,
  concorrência no PostgreSQL e clientes web/mobile.

## Arquitetura e garantias

```text
Comando REST autenticado
  → transação PostgreSQL: publicação/curtida/comentário + feed_outbox
  → commit
  → publicador da outbox
  → RabbitMQ (exchange fanout)
  → consumidor de cada instância da API
  → FeedStreamService
  → SSE autenticado
  → React / Flutter consultam o estado atualizado por REST
```

`FeedPolicy` separa publicação, interação e administração conforme as decisões de
02/11/2026, que substituem as regras de feed do PDF de 14/10/2026:

- Coordenação e padrinhos **ativos no ciclo atual** publicam e enviam imagens.
  O perfil `padrinho` no JWT, sozinho, não concede essa permissão: a cada consulta
  de permissões, publicação e upload, o servidor verifica o ciclo cadastrado e não
  encerrado, a participação sem término e a situação `padrinho_ativo`, incluindo
  vínculo confirmado conforme `ParticipacoesService`. Candidaturas pendentes,
  em análise, rejeitadas ou aprovadas sem matching, apadrinhados e participações
  concluídas não publicam. Um ciclo antigo/futuro enviado pelo cliente não concede
  permissão: o feed global usa `ParticipacoesService.programaAtual()`.
- Coordenação, padrinhos e apadrinhados curtem/descurtem e comentam.
- Perfil `nenhuma` (ou ausente/desconhecido) mantém leitura autenticada, sem novas
  interações. Nenhuma regra de matching/candidatura é alterada.
- Qualquer autor pode excluir seu próprio comentário, mesmo após mudar de perfil;
  somente a coordenação pode excluir comentários alheios.
- Edição/exclusão de publicações continua administrativa, exclusiva da coordenação.
  Poder publicar não concede administração de posts ou comentários alheios.
- Comunicados oficiais são publicações do próprio feed com categoria `Comunicados`.
  React e Flutter permitem selecionar e filtrar as categorias, inclusive legadas.

O formulário separado de comunicados nas configurações React foi substituído por
acesso ao Feed; o atalho do dashboard também abre o Feed. No Flutter, o atalho
`Criar comunicado` abre o mesmo Feed e a tela separada foi retirada. Registros e
endpoints legados de `avisos` são preservados para compatibilidade/histórico;
não houve migração nem exclusão desses dados nesta alteração.

A autoria é obtida pelo servidor; posts de padrinhos são identificados como
`Padrinho do programa`, sem o rótulo da coordenação. Não se cria concessão ou role nova.

**Pendência:** moderação de comentários de apadrinhados vinculados por padrinhos.
A participação existente depende de ciclo/grupo e o post ainda não identifica esse
contexto; não é seguro inferir vínculo por nome ou pelo papel do JWT. Quando o
contrato de vínculos/contexto estiver finalizado, estender `podeExcluirComentario`
com a consulta autorizada. Até lá, padrinhos só excluem seus próprios comentários.

O publicador usa `amqplib` e `amqp-connection-manager`, bibliotecas indicadas na
[documentação RabbitMQ do NestJS](https://docs.nestjs.com/microservices/rabbitmq).
Foi usada a API AMQP diretamente para controlar publisher confirms e broadcast
para uma fila exclusiva por instância SSE, evitando competição entre servidores.

A outbox é gravada na mesma transação que o comando, e só suas linhas commitadas
são publicadas. O worker consulta a outbox a cada segundo, com `SKIP LOCKED` e
timeout de confirmação de 3 segundos. Isso é processamento no servidor; os clientes
não fazem polling. Uma falha do broker preserva o comando e seu evento pendente.
Uma falha após confirmação e antes de registrar a entrega pode repetir um evento;
seu UUID é estável e os consumidores deduplicam uma janela de 2000 IDs.

A exchange é durável; filas SSE são exclusivas, temporárias e possuem TTL de 60 s.
Elas representam clientes conectados, não um histórico de mensagens. Histórico e
estado oficial continuam no PostgreSQL. Em reconexões SSE e do broker, `feed.ready`
provoca nova consulta REST e recupera alterações que ocorreram durante a ausência.
Não há replay por `Last-Event-ID`; eventos servem para invalidar a visão do cliente.

O stream envia heartbeat a cada 15 s e encerra ao expirar o JWT. Os clientes usam
Bearer no header, sem JWT na URL, timeout de inatividade de 45 s, reconexão com
espera crescente até 15 s e cancelamento ao sair da tela. HTTP 401/403 encerra as
tentativas e pede novo login. O Flutter também fecha em segundo plano e reconecta
ao retornar. As consultas disparadas por eventos são agrupadas quando há uma
consulta em andamento, sem recarregar o aplicativo inteiro.

## Endpoints

Todos exigem `Authorization: Bearer <JWT da API>`:

- `GET /publicacoes`: feed e contadores personalizados para a identidade autenticada.
- `GET /publicacoes/:id`: estado atual de uma publicação.
- `GET /publicacoes/permissoes`: `{ podePublicar, podeAdministrar, podeInteragir }`, calculado pela policy.
- `GET /publicacoes/events`: `text/event-stream` autenticado.
- `POST /publicacoes`: cria; exige permissão de publicação.
- `PATCH /publicacoes/:id`: edita; exige administração da coordenação.
- `DELETE /publicacoes/:id`: exclui com seus comentários/curtidas; exige administração.
- `POST /publicacoes/midias`: multipart, campo `arquivo`; exige permissão.
- `POST /publicacoes/:id/comentarios`: `{ texto }`, até 2000 caracteres.
- `DELETE /publicacoes/:id/comentarios/:comentarioId`: autor do comentário ou administração.
- `POST /publicacoes/:id/curtidas`: `{ delta: 1 }` ou `{ delta: -1 }`, idempotente por intenção.

Corpo de criação/edição: `{ texto, categoria, imagens }`. `imagens` contém chaves
retornadas pelo upload, nunca binário, base64 ou SAS. Até 10000 caracteres de texto,
80 de categoria, 10 imagens; ao menos texto ou uma imagem é necessário.

## Eventos RabbitMQ e SSE

Eventos de domínio: `feed.post.created`, `feed.post.updated`, `feed.post.deleted`,
`feed.comment.created`, `feed.comment.deleted` e `feed.like.updated`.

Contrato: `{ id: UUID, tipo, ocorridoEm: ISO-8601, publicacaoId: number }`.
Não contém JWT, e-mail, corpo de comentário nem URL SAS. O consumidor valida o
contrato e rejeita mensagens inválidas sem requeue infinito. Não aplica regras
de negócio. O SSE usa `id` do evento e `event` igual a `tipo`.

`feed.ready` e `feed.heartbeat` são sinais do stream, não eventos de domínio AMQP.
O campo `conectado` informa se o servidor está conectado ao broker.

## Mídias e Azure

O upload aceita PNG, JPEG e WebP de até 5 MB, conferindo a assinatura dos bytes.
O cliente Azure é o único já existente em `src/storage`. A chave fica em
`publicacoes/<hash-do-autor>/<UUID>.<extensão>` dentro de `feed`.
O backend verifica propriedade da chave e existência do blob ao criar/adicionar
mídia. Imagens existentes podem ser preservadas na edição.

`publicacoes.imagens` guarda referências estáveis `feed/publicacoes/...`.
A API emite SAS de leitura temporária ao consultar, usando a validade já
configurada no storage. A resposta separa `imagens` (URLs de exibição) e `midias`
(chaves para editar). Dados antigos continuam legíveis. Nenhuma connection string
ou chave da conta é entregue ao navegador/app.

## Configuração

Novas variáveis em `code/back/api/.env.example`:

```dotenv
RABBITMQ_URL=amqp://ajudaai:ajudaai-local@localhost:5672
RABBITMQ_FEED_EXCHANGE=ajuda-ai.feed
RABBITMQ_FEED_QUEUE=ajuda-ai.feed.sse
HOST=0.0.0.0
```

`RABBITMQ_FEED_QUEUE` é um prefixo; cada instância acrescenta um UUID. A URL acima
usa somente credenciais de desenvolvimento. Em `code/.env`, `RABBITMQ_USER` e
`RABBITMQ_PASSWORD` configuram o Compose; mantenha a URL da API coerente com eles.
Portas 5672 e 15672 ficam vinculadas somente ao localhost do notebook.

São reutilizadas `PORT`, `DB_*`, `JWT_SECRET`, `AUTH_DEMO_ENABLED`,
`AZURE_STORAGE_CONNECTION_STRING` e `AZURE_STORAGE_SAS_LEITURA_MINUTOS`.
React usa `VITE_API_URL`; Flutter usa `--dart-define=API_BASE_URL=...`.

## Demonstração principal: dois celulares Flutter (PowerShell)

Os comandos abaixo partem da raiz do repositório; use terminais separados.
Não sobrescreva arquivos `.env` já configurados.

1. Inicie Docker Desktop. No primeiro terminal:

```powershell
Set-Location code
if (!(Test-Path .env)) { Copy-Item .env.example .env }
docker compose up -d rabbitmq
docker compose ps rabbitmq
```

Management UI: http://localhost:15672, com o usuário/senha definidos em `code/.env`
(no exemplo, `ajudaai` / `ajudaai-local`). AMQP: `localhost:5672`.

2. No terminal da API, a partir da raiz:

```powershell
Set-Location code/back/api
npm ci
if (!(Test-Path .env)) { Copy-Item .env.example .env }
```

Configure nesse `.env` o PostgreSQL/Supabase já utilizado e o storage real. Para
demo de coordenação, use `AUTH_DEMO_ENABLED=true` fora de produção. Com Supabase,
mantenha `SEED_DEMO_DATA=false` e `DB_SYNCHRONIZE=false`. Para banco local novo,
siga o setup de banco do README da API; alunos demo precisam existir no banco.
Revise as migrations pendentes antes de aplicá-las no seu ambiente:

```powershell
npm run migration:show
npm run migration:run
npm run start:dev
```

A migration nova é `FeedTempoReal1793300000000`, que cria somente `feed_outbox`.
Nenhuma migration foi executada pelo agente no banco compartilhado/Supabase.
A API escuta em `HOST=0.0.0.0`, porta 3000 por padrão.

3. Conecte notebook e os dois celulares à mesma rede. Identifique o IPv4 da
interface Wi-Fi/Ethernet do notebook (`ipconfig`). A porta da API deve estar
liberada para a rede privada. `localhost` e `10.0.2.2` não apontam para o notebook
em um smartphone físico. Em dois terminais, partindo da raiz:

```powershell
Set-Location code/mobile
flutter pub get
flutter devices
$ipNotebook = Read-Host 'IPv4 do notebook na rede dos celulares'
$dispositivo = Read-Host 'ID do celular A (no outro terminal, ID do celular B)'
flutter run -d $dispositivo --dart-define="API_BASE_URL=http://${ipNotebook}:3000"
```

Se o mapa exigir configurações do ambiente, acrescente os `--dart-define` Mapbox
já utilizados pelo projeto. Nenhum IP é fixado no código.

4. No **celular A**, entre como coordenador pelo login Microsoft ou, no ambiente
demo, escolha Renata. Na área da coordenação, toque no ícone **Feed do programa**
no cabeçalho ou em **Mais → Feed do programa**. O acesso independe de haver ciclo
selecionado. O feed usa explicitamente o JWT/base URL dessa sessão; não reutiliza
uma sessão de aluno anterior que possa estar em memória.

No **celular B**, entre como aluno existente e abra o feed pela navegação normal.
Os dois celulares consultam a permissão no backend. Apadrinhados não recebem
criação/edição/exclusão de posts e recebem 403 ao tentar essas ações diretamente.
Padrinhos recebem criação/upload, mas a administração de posts continua da coordenação.

5. No celular A, toque em **Criar**, escreva e adicione uma imagem PNG/JPEG/WebP.
Toque em **Publicar**. O upload vai pelo backend ao serviço Azure existente; a
publicação e o evento são persistidos e a atualização chega pelo RabbitMQ/SSE ao
celular B sem refresh. O editor aguarda a confirmação do servidor e preserva o
rascunho se houver falha.

6. No celular B, curta/descurta e comente. O celular A recebe os novos contadores
e comentários. Mantenha o painel de comentários aberto em A e envie outro
comentário em B para conferir a atualização do painel.

7. No menu **Mais opções** da publicação em A, escolha **Editar publicação**.
Altere o texto, mantenha/remova imagens existentes e adicione outra imagem.
**Salvar alterações** reutiliza as referências das imagens existentes e envia
somente as imagens novas. **Apagar publicação** pede confirmação e sua exclusão
também se propaga para B. Essas ações são novamente autorizadas pelo backend.

8. Para demonstrar recuperação do broker:

```powershell
Set-Location code
docker compose stop rabbitmq
# Publique pelo Flutter A; o evento permanece pendente na outbox.
docker compose start rabbitmq
```

O servidor reconecta e entrega pendências. Os clientes sincronizam quando a
conexão volta. Não é necessário abrir AMQP nos celulares; eles acessam só a API.

### React equivalente (opcional)

Em outro terminal na raiz:

```powershell
Set-Location code/front
npm ci
$env:VITE_API_URL='http://localhost:3000'
npm run dev
```

Abra http://localhost:5173/login, entre como Renata e use `/coordenacao/feed`.
O aluno web usa `/aluno/feed`. O React mantém os mesmos comandos e atualizações,
mas não é necessário para administrar o feed pelo Flutter.

## Verificações automatizadas

```powershell
# code/back/api
npm run build
npm run lint
npx tsc --noEmit
npm test

# code/front
npm run build
node --test test/*.test.mjs

# code/mobile
flutter analyze --no-pub
flutter test --no-pub
```

Teste opcional de integração real, usando exclusivamente um banco local de teste:

```powershell
# Na raiz: PostgreSQL temporário separado, sem os dados do projeto.
docker run --rm -d --name ajuda-ai-feed-test-postgres -p 127.0.0.1:55439:5432 -e POSTGRES_USER=feedtest -e POSTGRES_PASSWORD=feedtest-local -e POSTGRES_DB=feedtest postgres:16-alpine
Set-Location code/back/api
$env:FEED_TEST_DB_URL='postgres://feedtest:feedtest-local@127.0.0.1:55439/feedtest'
$env:FEED_TEST_RABBITMQ_URL='amqp://ajudaai:ajudaai-local@localhost:5672'
npm test -- test/feed.integration.spec.ts
docker stop ajuda-ai-feed-test-postgres
```

O teste cria/remove somente um schema `feed_test_<timestamp>`, aplica a migration
da outbox, verifica entrega a duas instâncias SSE e dez curtidas concorrentes.
Sem essas duas variáveis, a integração real é explicitamente ignorada; os demais
testes não precisam de banco, Azure ou RabbitMQ externos.

## Resultados verificados em 29/10/2026

- API: `npm run build`, `npm run lint` e `npx tsc --noEmit` aprovados.
- Suíte API com integração real habilitada: 357 testes aprovados e 98 ignorados
  de suítes opcionais não relacionadas ao feed.
- PostgreSQL/RabbitMQ locais reais: migration da outbox aplicada em schema
  temporário, entrega a duas instâncias SSE e dez curtidas concorrentes idempotentes.
- Web: build aprovado e 89 testes aprovados.
- Flutter: `flutter analyze --no-pub` sem avisos e 187 testes aprovados.
- Testes mobile confirmam sessão própria da coordenação, acesso sem ciclo,
  criação com upload multipart, edição mantendo referências Azure, remoção e
  adição de imagens, exclusão, erro 403 preservando rascunho e duas interfaces
  Flutter trocando publicação/curtida/comentário por streams simulados.
- Os testes de widgets simulam dois clientes; não representam execução em dois
  aparelhos físicos. Upload na conta Azure real e a demonstração física ainda
  precisam ser validados no ambiente do projeto.

## Limitações e operação

- Moderação de apadrinhados vinculados por padrinhos depende do contexto/vínculo
  definitivo; publicação pelo perfil `padrinho` já está habilitada.
- Mídias novas são imagens PNG/JPEG/WebP. Vídeo, PDF e notificações push com o app
  fechado não foram implementados; SSE atende clientes com a tela aberta.
- Uploads abandonados e blobs de imagens removidas são preservados. Não há limpeza
  automática de órfãos; evitar exclusão precipitada protege referências existentes.
- Eventos entregues permanecem na outbox para inspeção. Em produção, defina uma
  rotina de retenção para linhas com `publicado_em` antigo, preservando pendentes.
- As SAS expiram conforme o storage. Uma nova consulta emite URLs atualizadas;
  URLs de uma tela deixada aberta não devem ser tratadas como links permanentes.
- A listagem existente continua sem paginação. Teste de carga de 500 conexões e
  particionamento por programa não fazem parte desta entrega.
- Em proxy/reverse proxy, desative buffering para SSE e permita conexões longas.
  O serviço deve receber SIGTERM no encerramento para fechar AMQP/streams.
- Validar upload na conta Azure real e comunicação entre dois smartphones físicos exige as
  credenciais e os dispositivos do ambiente; testes usam storage simulado.

## Arquivos

Criados: migration `FeedTempoReal`; entidade `feed-outbox`; policy/guard do feed;
`feed-evento`, `feed-midias.service`, `feed-outbox.service`, `feed-rabbit.service`,
`feed-stream.service`, DTOs e testes de tempo real no módulo `publicacoes`;
`test/feed.e2e.spec.ts`, `test/feed.integration.spec.ts`, `test/helpers/feed.ts`;
React `api/feed-stream.js`, `pages/FeedPage.jsx`, `feed.css`, `test/feed.test.mjs`;
Flutter `services/feed_events.dart`, `test/feed_tempo_real_test.dart`, `test/feed_mobile_admin_test.dart`; este documento.

Alterados: controller/service/module e teste existente de publicações; `main.ts`;
`package.json`/lock da API; os dois `.env.example`; Compose; rotas e cliente API
React; layouts de aluno/coordenação; tela e teste existentes do feed Flutter; shell e atalhos da coordenação mobile;
READMEs de execução e índice técnico.
