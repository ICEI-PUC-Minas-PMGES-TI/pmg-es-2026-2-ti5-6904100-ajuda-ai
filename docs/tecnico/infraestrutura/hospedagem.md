# Hospedagem do Ajuda-aí: orçamento pessoal R$ 0

> Atualizado em 21/11/2026, na branch `infra/hospedagem` (a partir de `Sprint-6`).
> Regra: **nenhum valor sai do bolso**. Só o crédito do Azure for Students e planos gratuitos sem cartão.
> Nada foi publicado nem criado no Azure, no Supabase ou no Entra.
> Autenticação e contas demo: [autenticacao.md](autenticacao.md).
> **Decisão (21/11/2026): login Microsoft/Entra ID e OIDC do GitHub ADIADOS.** Não dependem da TI da PUC nem entram no caminho crítico. Deploy manual por `infra/azure/deploy-manual.ps1` (API e web), APK por `infra/azure/build-apk.ps1`, acesso pelo login demo protegido. As seções sobre Entra/OIDC abaixo ficam como referência futura.

## 1. Arquitetura custo zero

```
 Navegador ──► Azure Storage, site estático (web homologação | web produção) ── HTTPS, Brasil Sul
 App Android (APK do GitHub Actions)
      │
      ▼
 Azure Container Apps (consumo, réplica mínima 0, HTTPS automático, sem Log Analytics)
   ajudaai-api-hml (ambiente cae-ajudaai-wp)   ajudaai-api
      │  imagem privada: Docker Hub FREE (1 repositório privado, sem cartão)
      ├─► Supabase FREE: projeto homologação (dados fictícios) | projeto produção
      ├─► CloudAMQP Little Lemur FREE (RabbitMQ AMQPS): instância por ambiente
      └─► Azure Blob Storage (já existe) ── Mapbox (token público) ── Microsoft Entra ID
```

| Serviço | Plano | Gasta crédito Azure? | Grátis de verdade? | O que acontece no limite |
|---|---|---|---|---|
| Container Apps (API ×2) | Consumo, 0,25 vCPU / 0,5 GiB, réplicas 0..1 | Só acima da cota grátis mensal (180 mil vCPU-s, 360 mil GiB-s, 2 mi requisições) | Sim, com réplica mínima 0 e uso acadêmico | Acima da cota: consome crédito; no fim do crédito, a assinatura é **desativada** (não cobra) |
| Storage, site estático (web ×2) | Standard_LRS, Brasil Sul | **Sim, centavos** (poucos MB armazenados; saída de dados pelo uso real) | Quase (a cota grátis de saída cobre o uso acadêmico) | Desativa com a assinatura. **O Static Web Apps foi descartado:** a política da assinatura só permite as regiões `southafricanorth`, `mexicocentral`, `brazilsouth`, `belgiumcentral` e `spaincentral` |
| Docker Hub (imagem) | Personal Free | Não | Sim (1 repositório privado; limite de pulls por hora) | Pull bloqueado temporariamente; nada é cobrado |
| Supabase ×2 | Free | Não | Sim (500 MB; pausa após 7 dias sem uso) | Projeto pausado até reativar no painel; sem cobrança no Free |
| CloudAMQP ×2 | Little Lemur | Não | Sim (1 mi mensagens/mês, 20 conexões) | Bloqueia novas mensagens; sem cobrança |
| Blob Storage | Já existe (LRS) | Sim, centavos (armazenamento + operações) | Quase | Desativa com a assinatura |
| Log Analytics | **Não usado** (`--logs-destination none`) | — | — | Log ao vivo continua (`az containerapp logs show --follow`) |
| Container Registry (ACR) | **Não usado** por padrão | Seria ~US$ 5/mês | — | Opcional (`-Registro acr`) |
| GitHub Actions | Cota da organização | Não | Sim, dentro da cota | Sem método de pagamento, os jobs param; nada é cobrado |
| Mapbox | Conta de outro integrante | Não | Sim, dentro da franquia grátis | ⚠ Se essa conta tiver cartão cadastrado, o excesso é cobrado **dela**. Confirmar com o dono |

**Estimativa de consumo de crédito: ≈ US$ 0 a 1/mês** (Blob e, se houver muito uso, o excedente do Container Apps).

Nos dias de apresentação, deixar a produção com 1 réplica fixa custa cerca de US$ 0,15 a 0,40 por dia ociosa. É uma estimativa: as tarifas em dólar não foram confirmadas; veja a calculadora do Azure.

### 1.1 Web pública no Storage: o que protege cada coisa

O site estático é **público por natureza**: qualquer pessoa carrega os arquivos. Isso é aceitável porque o site é só HTML/JS/CSS e **não contém segredo**: o bundle leva apenas valores públicos (`VITE_*`: URL da API, token público do Mapbox, IDs do Entra, a flag `DEMO_LOGIN`). Quem protege os dados é a **API**:

| O que | Proteção | Onde |
|---|---|---|
| Dados de alunos, feed, XP, coordenação | JWT obrigatório e papéis no backend; a API não depende do site para decidir nada | API |
| Login demo (contas sem senha) | Produção: desligado no código. Homologação: chave (`X-Demo-Chave`) ou operador Microsoft; limite de 10 tentativas/5 min por IP; sem chave configurada, desliga sozinho | API |
| Seletor de contas demo na tela | O build de produção **não contém** o painel (conferido no bundle). O de homologação contém a lista de e-mails demo, que é pública e inofensiva sem a chave | Build |
| Quem pode chamar a API pelo navegador | CORS só para o endereço exato da web (o script o define a partir do endereço real do storage) | API |
| Chave de demonstração | Fica no Container App e no GitHub (secret), nunca no site. O APK de homologação a carrega e deve ir só a quem apresenta | Secrets |
| Painel de QA | Lista de e-mails e `APP_ENV`; desligado em produção | API |
| Dados reais × demonstração | Projetos Supabase separados; a homologação só com dados fictícios | Banco |

Limites a aceitar, sem custo extra: o site estático **não permite cabeçalhos de segurança** (HSTS, CSP) nem domínio próprio com HTTPS sem CDN (pago). O CORS não protege contra quem chama a API sem navegador; por isso a barreira real é a chave, o JWT e o limite de tentativas.

**Antes de apontar a homologação para o Supabase compartilhado**, conferir que ele não tem dados reais de alunos (consulta só de leitura, a ser feita com a sua autorização).

### 1.2 Rotas do React e o callback do login Microsoft

- **O app usa URLs limpas** (`/aluno/feed`, `/auth/callback`), sem `#`. O site estático não tem regras de reescrita: o `index.html` é configurado também como **página de erro**, então qualquer rota interna devolve o app.
- **O status HTTP dessas rotas é 404** (o corpo é o app). O navegador renderiza normalmente; só não dá para devolver 200 sem CDN/Front Door (pago). Testado localmente com um servidor que imita esse comportamento: a página `/auth/callback?code=…&state=…` carregou com status 404, o app leu os parâmetros, limpou a URL e validou o retorno.
- **A raiz `/` responde 200**, e é ela que o monitoramento verifica.
- **Callback do Entra:** o `redirect_uri` é `<WEB_URL>/auth/callback` (o workflow o passa ao build). Deve estar **idêntico** no Entra, na plataforma **SPA**. O endereço do storage só existe depois de criado (`https://<conta>.z<N>.web.core.windows.net`): crie o storage, leia o endereço, registre o redirect no Entra, preencha `WEB_URL` e só então rode o deploy da web.
- **Só HTTPS:** a conta exige conexão segura. Compartilhe sempre o endereço `https://`.
- **Verificação automática:** depois de cada publicação da web, o workflow confere que `/auth/callback` devolve o app.
- **Rollback da web:** rodar `Deploy Web` a partir do commit anterior. O `index.html` fica com `no-cache`, e os demais arquivos têm hash no nome.

**Garantia de R$ 0:**
- **Não ultrapassa o crédito:** a assinatura Azure for Students tem **limite de gastos ligado** e não tem cartão. Quando o crédito acaba, ou completa 12 meses, ela é **desativada**, não cobrada ([doc oficial](https://learn.microsoft.com/azure/cost-management-billing/manage/azurestudents-subscription-disabled)).
- **Nunca adicione cartão** nem aceite "Upgrade"/"pago conforme o uso": isso remove o limite.
- **O script confere antes:** `provisionar.ps1` checa que `spendingLimit = On` e para se não estiver.
- **Nenhum serviço externo pede cartão:** Docker Hub, Supabase e CloudAMQP. Se algum pedir cartão no cadastro, pare e me avise.

**Alertas e acompanhamento:**
1. **Saldo e validade:** [Microsoft Azure Sponsorships › Balance](https://www.microsoftazuresponsorships.com/Balance) (login com a conta do Azure for Students). Confira semanalmente.
2. **Alertas de orçamento:** Portal do Azure › Cost Management › Budgets › "Add": orçamento mensal de US$ 5, alertas por e-mail em 50 %, 80 % e 100 %. Não encontrei documentação oficial confirmando que *budgets* funcionam nessa oferta; se a opção não aparecer, o limite de gastos continua protegendo, e o acompanhamento fica pelo portal de saldo.
3. **Cotas mensais** do Container Apps: Portal › Container App › Metrics (Requests, réplicas).

## 2. Situação atual

Homologação **no ar** desde 21/11/2026 (provisionada e publicada à mão, sem OIDC e sem Entra):

| Item | Estado |
|---|---|
| API | Container App `ajudaai-api-hml` no ambiente **`cae-ajudaai-wp`** (Workload Profiles, só perfil Consumption), 0,25 vCPU / 0,5 GiB, réplicas 0 a 1. Imagem privada `docker.io/<usuario>/ajudaai-api:<tag>`. `/health` e `/health/ready` respondem 200 |
| Web | Storage `ajudaiwebhomolog` (site estático), publicado por `deploy-manual.ps1 -Somente web` |
| Banco | Supabase compartilhado (somente contas fictícias, conferido em leitura), pelo pooler de sessão; nenhuma migration roda ao iniciar a API |
| RabbitMQ | CloudAMQP Little Lemur; a API mantém 1 conexão e 1 consumidor na fila `ajuda-ai.feed.sse.*` |
| APK | `build-apk.ps1`: HTTPS da API, **sem a chave demo embutida** (a pessoa a digita na tela de login) |
| Entra ID / OIDC | Adiado |
| CI/CD | Pronto na branch; **travado** até `DEPLOY_ATIVO=true` |
| Sobrou da tentativa inicial | Ambientes `cae-ajudaai-homolog` e `cae-ajudaai-hml` (modo **Express**) e o app `ajudaai-api-homolog`: sem uso, sem custo fixo, podem ser removidos |

### 2.1 Lições da homologação (para não repetir)

- **Express não guarda `registries`.** Um `az containerapp env create` comum e um `PUT` sem modo saíram em **Express**, e o registro do Docker Hub era descartado em silêncio. O ambiente padrão só nasceu com `environmentMode: WorkloadProfiles` pedido pela API estável **2026-07-01** (`provisionar.ps1 -Etapa ambiente`). O app é criado com imagem + registro na mesma escrita (`-Etapa api -Imagem <tag>`).
- **Cold start de ~45 s** com mínimo 0 réplicas (imagem + inicialização). O login demo do app espera até 90 s e avisa na tela; na véspera da apresentação use `--min-replicas 1`.
- **Segredos nunca em argumento exibido:** `provisionar.ps1` usa `AzSeguro`, que mascara tokens na saída e nos erros.
- **`az storage blob sync` não aceita `--content-cache-control`:** o deploy da web usa `upload-batch`.
- **Chave demo colada errada** (texto copiado do chat) quebrava o cabeçalho HTTP e aparecia como "sem conexão": o app agora valida a chave e mostra mensagem própria.

## 3. Revisão da branch para integrar na Sprint-6

| Verificação | Resultado |
|---|---|
| Base | `origin/Sprint-6` atual (0 commits novos desde a criação da branch) |
| Conflitos (simulados com `git merge-tree`, sem commit nem ref) | Sem conflito com `Sprint-6`, `Arthur_gv` (PR #70), `matheus-missoes` e `main`. Com `Arthur_Luiz` (chat) há conflito em `code/front/src/api/client.js`, **pré-existente**: essa branch já conflita com a `Sprint-6` sem a infraestrutura; nossa alteração nesse arquivo mescla limpa |
| Segredos | Varredura no diff: nenhum token, connection string, chave privada ou JWT. Novo `.gitignore` na raiz bloqueia `*.env` reais, keystores, `key.properties` e arquivos de defines |
| Workflows | Deploys e monitoramento só rodam com a variável de repositório `DEPLOY_ATIVO=true`: o merge **não publica nada** sozinho. Migrations só manuais. Sintaxe revisada manualmente (não rodei `actionlint`: download de executável externo foi bloqueado) |
| Testes | API: 647 passando (inclui login demo, CORS, coordenação, domínios e SEG-006). Web e app: as mesmas falhas pré-existentes (6 e 16). Builds de imagem Docker, web (homologação e produção) e APK release passam |
| Impacto nos colegas | Com banco compartilhado e `HOST=0.0.0.0`, o login demo local passa a pedir chave. Quem usa só o computador ou o emulador deve pôr `HOST=127.0.0.1` (o novo `.env.example` já traz isso). A API também recusa subir com o segredo JWT de exemplo quando o banco é remoto |

## 4. Ativação em etapas

Cada etapa só começa com a sua autorização (🔒).

### Etapa 0: preparação, sem custo e sem criar nada no Azure
1. 🔒 Commit, push e PR `infra/hospedagem` → `Sprint-6`; revisão do grupo e merge.
2. 🔒 Instalar a Azure CLI e `az login`. Conferir o saldo no portal de patrocínios.
3. Simular: `./infra/azure/provisionar.ps1 -Ambiente homologacao`.

### Etapa 1: homologação (backend + web)

| Recurso | Onde | Custo | 🔒 |
|---|---|---|---|
| Conta Docker Hub (se ainda não houver) + repositório privado `ajudaai-api` + access token de leitura/escrita | hub.docker.com | Grátis, sem cartão | Sim (conta externa) |
| Instância CloudAMQP Little Lemur "ajudaai-homolog" | cloudamqp.com | Grátis, sem cartão | Sim (conta externa) |
| Grupo de recursos `rg-ajudaai`, ambiente `cae-ajudaai-wp`, Container App `ajudaai-api-hml`, conta de storage `ajudaiwebhomolog` (site estático) | Azure (script) | ≈ US$ 0 | Sim (cria recursos na assinatura) |
| ~~App registration "github-ajudaai-homologacao" com credencial OIDC~~ (ADIADO) | Entra ID (script) | Grátis | Sim (altera o diretório; pode exigir a TI da PUC) |
| Environment `homologacao` no GitHub + variáveis/secrets + `DEPLOY_ATIVO=true` | GitHub | Grátis | Sim (configuração do repositório) |

Passos:
1. Montar o arquivo de segredos **fora do repositório** a partir de `infra/ambientes/homologacao.env.example`:
   - `DB_*` do Supabase atual **pelo pooler de sessão** (porta 5432, usuário `postgres.<ref>`). O host direto é só IPv6 e o Container Apps sai por IPv4.
   - `JWT_SECRET` e `DEMO_CHAVE_ACESSO` novos.
   - `RABBITMQ_URL` do CloudAMQP.
   - `REGISTRO_USUARIO` e `REGISTRO_SENHA` (token do Docker Hub).
   - `CORS_ORIGINS` (a URL da web sai do passo 2; dá para atualizar depois).
2. `./infra/azure/provisionar.ps1 -Ambiente homologacao -ArquivoSegredos <arquivo> -Executar`.
3. GitHub › Settings › Environments › `homologacao`: preencher a tabela da §5.
4. Rodar `Deploy API` e `Deploy Web` manualmente (ambiente homologação).
5. Validar com o checklist de [autenticacao.md §6](autenticacao.md#6-checklist-de-aceitação), itens 6 a 12. Conferir o SSE do feed por 10 min.
6. Conferir o saldo no portal de patrocínios no dia seguinte.

### Etapa 2: login Microsoft (ADIADO, fora do caminho crítico)
Ver [autenticacao.md §4–5](autenticacao.md#4-microsoft-entra-id-o-que-configurar). 🔒 Registrar o app (ou pedir à TI). Preencher `MICROSOFT_*` só na homologação e testar com a sua conta (itens 1 a 5).

### Etapa 3: produção
1. 🔒 Novo projeto Supabase **de produção** (o 2º projeto grátis da conta) e CloudAMQP "ajudaai-prod".
2. 🔒 `Migrations` (workflow manual): "mostrar" e depois "aplicar" com `APLICAR-producao`. Banco vazio, sem seeds. O `migration:run` cria o schema `feed` sozinho (script `preparar-schema`, idempotente: só consulta se ele já existe), então não há passo manual de `CREATE SCHEMA`.
3. 🔒 `provisionar.ps1 -Ambiente producao -Executar` (sem `DEMO_*`, `AUTH_DEMO_ENABLED=false`).
4. 🔒 Environment `producao` com "Required reviewers" e branch `main`; merge `Sprint-6` → `main` com aprovação.
5. 🔒 APK: gerar o keystore (backup fora do repositório) e rodar `Android APK`.

### Dia da apresentação
- **Véspera:** `az containerapp update -n ajudaai-api-hml -g rg-ajudaai --min-replicas 1` (e na produção, se for usada). Voltar para 0 depois.
- **Supabase:** conferir que os projetos não estão pausados.
- **Chave de demonstração:** gerar uma nova e trocar depois.

## 5. Configuração do GitHub (por Environment)

| Nome | Tipo | Uso |
|---|---|---|
| `DEPLOY_ATIVO` | **variável de repositório** | `true` libera os deploys e o monitoramento |
| `AZURE_CLIENT_ID`, `AZURE_TENANT_ID`, `AZURE_SUBSCRIPTION_ID` | secret | Deploy API (OIDC) |
| `REGISTRO` | variável | `docker.io/<usuario>` (ou `<acr>.azurecr.io`) |
| `REGISTRO_USUARIO` / `REGISTRO_SENHA` | variável / secret | Push da imagem no Docker Hub |
| `AZURE_RESOURCE_GROUP`, `ACA_APP_NAME`, `API_URL`, `WEB_URL` | variável | Deploys |
| `WEB_STORAGE_ACCOUNT` | variável | Deploy Web: `ajudaiwebhomolog` / `ajudaiweb` |
| `MAPBOX_ACCESS_TOKEN` | secret | Web e APK |
| `MICROSOFT_CLIENT_ID`, `MICROSOFT_TENANT_ID`, `MAP_ASSETS_BASE_URL`, `MAPBOX_STYLE_URI` | variável | Web e APK |
| `DEMO_LOGIN` (variável) e `DEMO_CHAVE_ACESSO` (secret) | — | Só homologação |
| `DB_HOST`, `DB_PORT`, `DB_USERNAME`, `DB_PASSWORD`, `DB_DATABASE` | secret | Migrations |
| `ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD` | secret | APK assinado |

## 6. Arquivos desta branch

| Arquivo | Para quê |
|---|---|
| `code/back/api/Dockerfile`, `.dockerignore` | Imagem multi-stage, usuário sem privilégio, `HEALTHCHECK`, sem segredos |
| `code/back/api/src/main.ts`, `saude.ts`, `config/ambiente.ts` | CORS por lista, `trust proxy`, travas de inicialização, `/health` e `/health/ready` |
| `code/back/api/src/auth/*`, `dados/dados.ts`, `cadastro/*` | Login demo protegido, limite de tentativas, coordenação por lista, domínios, JWKS em cache, **SEG-006** |
| `code/front/...` (login, client) | Painel demo só na homologação |
| `code/mobile/...` (auth, login, gradle, manifest) | APK de homologação com chave; assinatura de release; HTTPS obrigatório no release; nome "Ajuda-aí" |
| `.github/workflows/*.yml` | CI, Deploy API, Deploy Web, Android APK, Migrations, Monitoramento |
| `infra/azure/provisionar.ps1`, `infra/ambientes/*.env.example` | Provisionamento custo zero (simulação por padrão) e modelos de variáveis |
| `.gitignore` (raiz) | Bloqueia arquivos de segredos de deploy |

Fontes: [Container Apps: cobrança](https://learn.microsoft.com/en-us/azure/container-apps/billing) · [Container Apps: opções de log](https://learn.microsoft.com/azure/container-apps/log-options) · [Static Web Apps: cotas](https://learn.microsoft.com/azure/static-web-apps/quotas) · [Supabase: pausa](https://supabase.com/docs/guides/platform/free-project-pausing) · [CloudAMQP: limites](https://www.cloudamqp.com/blog/added-limits-for-shared-plans-lemur-tiger.html) · [Docker Hub: limites](https://docs.docker.com/docker-hub/usage/pulls/) · [Azure for Students](https://azure.microsoft.com/free/students/) · [Assinatura desativada](https://learn.microsoft.com/azure/cost-management-billing/manage/azurestudents-subscription-disabled)
