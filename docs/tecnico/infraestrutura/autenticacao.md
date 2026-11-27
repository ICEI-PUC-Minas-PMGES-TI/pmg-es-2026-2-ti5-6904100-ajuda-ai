# Autenticação, contas demo e ambientes

> Auditoria e preparação de 21/11/2026 (branch `infra/hospedagem`).
>
> Nenhum token foi emitido contra o Supabase compartilhado nesta etapa. Os testes de container usaram o Postgres **local**.
>
> Nenhuma configuração do Entra ID foi alterada.

## 1. Login Microsoft: estado real

**Resumo: o código está completo nas duas plataformas, mas nunca funcionou de ponta a ponta.** Não existe app registration configurado (`MICROSOFT_TENANT_ID` e `MICROSOFT_CLIENT_ID` vazios) e nenhum teste usou conta real.

| Parte | Como funciona | Avaliação |
|---|---|---|
| **Web** (`code/front/src/auth/microsoft.js`) | OIDC *authorization code* + **PKCE S256**, `state` e `nonce` aleatórios (sessionStorage, validade de 10 min), troca do código direto no `/token` (exige plataforma **SPA** no Entra), só o `id_token` vai para a API. `prompt=select_account` | ✔ Correto para SPA. O redirect é `location.origin + /auth/callback`, então funciona com a URL pública desde que esteja cadastrada |
| **Flutter** (`lib/services/microsoft_auth.dart`) | `flutter_appauth` (AppAuth: PKCE e nonce automáticos), issuer do tenant, redirect `br.pucminas.ajudaai://auth` (manifest placeholder já configurado) | ✔ Correto. Exige plataforma **Mobile e desktop** com esse redirect |
| **Backend** (`microsoft-token.verifier.ts`) | `jose.jwtVerify` contra o JWKS do tenant: assinatura, `aud = client_id`, `iss` do tenant, `tid` conferido; e-mail de `preferred_username`/`email`/`upn` | ✔ Sólido. Nesta branch o JWKS passou a ficar em cache por tenant. O backend não confere o `nonce` (os clientes conferem): risco baixo |
| **Domínio** | `AUTH_ALLOWED_DOMAIN` | ⚠ Era um domínio só (`pucminas.edu.br`). Contas de aluno da PUC Minas costumam ser **`@sga.pucminas.edu.br`**: se for o caso, todo aluno real era recusado. **Nesta branch aceita lista** (`pucminas.edu.br,sga.pucminas.edu.br`), com domínio exato. **Confirmar com uma conta real** |
| **Primeiro acesso** | Conta institucional sem cadastro recebe um token de **onboarding** (15 min, só serve para o cadastro) | ✔ |
| **Sessão** | JWT HS256 de 1 h (`escopo: acesso`), sem refresh | ⚠ Depois de 1 h é preciso entrar de novo. A web do aluno trata 401; a coordenação na web e o app não (UXW-003, UXM-004) |
| **Logout** | Só no cliente (apaga o token); não há revogação no servidor | ⚠ Um token copiado vale até expirar (≤ 1 h) |
| **Papéis** | Aluno: `tipoParticipacao` do banco. Coordenação: e-mail | Corrigido nesta branch: `COORDENADORES_EMAILS`, sem a coordenadora fictícia em produção |

### Situação dos achados de segurança

| ID | Situação na branch atual (`Sprint-6`) | Nesta branch |
|---|---|---|
| **SEG-001** (demo emite token de coordenação sem senha, com banco compartilhado) | Aberto no código. A exposição ativa nesta máquina foi **contida em 21/11**: `HOST=127.0.0.1` no `.env` local e a API só escuta em loopback. Outros integrantes com `HOST=0.0.0.0` continuam expostos até o merge ou até ajustarem o `.env` | **Corrigido**: (1) demo desligado em produção pelo código; (2) com banco remoto ou API exposta, exige chave ou operador e, sem eles, **desliga sozinho**; (3) limite de tentativas; (4) a API não sobe com o segredo JWT de exemplo se o banco não for local; (5) `.env.example` com `HOST=127.0.0.1` |
| **SEG-002** (coordenação fixa no código; papel não revalidado) | Aberto | **Parcial**: lista por ambiente; produção sem a coordenadora fictícia; e-mails demo bloqueados no login Microsoft em ambiente publicado. **Falta**: tabela de coordenadores e revalidação a cada requisição (remover alguém ainda leva até 1 h) e autoria das ações |
| **SEG-006** (sessão renovável indefinidamente) | Aberto: `PUT /cadastro/perfil` aceita token de acesso e devolve uma sessão nova | **Corrigido, sem mudar os clientes**: o token precisa ter `escopo`. Com token de **acesso**, a sessão devolvida por `PUT /cadastro/perfil` e `POST /cadastro` **expira no mesmo instante** do token apresentado, sem renovação. Só o token de onboarding (vindo do login Microsoft) abre sessão nova de 1 h. Testes em `auth-ambientes.spec.ts`. Continua sem revogação imediata (logout no servidor): o risco fica limitado a ≤ 1 h |
| **SEG-011** (detalhes do login Microsoft) | Aberto | **Parcial**: JWKS em cache e lista de domínios. **Falta**: `nonce` no backend (baixo) e decidir se funcionários do tenant podem se cadastrar como alunos |

## 2. Contas demo: estratégia segura

O objetivo é seguir apresentando os perfis aos professores **sem** deixar uma rota pública que entregue contas sem senha.

| Ambiente | Login demo | Como entra |
|---|---|---|
| **Produção** | **Desligado no código** (qualquer `.env`). A web de produção nem contém o painel | — |
| **Homologação** (dados fictícios, banco separado da produção) | **Protegido** | (a) **chave de demonstração**: quem apresenta digita a chave uma vez na tela de login (enviada em `X-Demo-Chave`); ou (b) **operador**: entra com a conta Microsoft listada em `DEMO_OPERADORES` e depois escolhe qualquer perfil demo |
| **Desenvolvimento** | Aberto só se isolado (banco local **ou** `HOST=127.0.0.1`); senão, exige a chave | Seletor de contas, como hoje |

**Regras que tornam isso seguro:**
- **Chave forte:** a chave tem ≥ 24 caracteres aleatórios e é comparada em tempo constante.
- **Limite de tentativas:** 10 por IP a cada 5 minutos (429 depois disso).
- **Troca:** troque a chave depois de cada apresentação (é só mudar o secret do Container App).
- **Falha fechada:** sem chave nem operador configurado, o demo fica **desligado**.
- **Nada real em jogo:** a homologação usa um banco **diferente** da produção, só com dados fictícios. Nenhum dado real fica atrás de uma conta sem senha.
- **APK de homologação:** a chave **não** vai no APK (seria extraível do binário). O APK só liga o campo "Chave de demonstração" na tela de login (`DEMO_LOGIN` + `DEMO_LOGIN_PROTEGIDO`, que não são segredos) e quem apresenta a digita. Troque a chave depois da apresentação.

**Usar a sua conta Microsoft para QA: viável e recomendado**, assim que o Entra estiver configurado.

1. Em homologação, ponha seu e-mail institucional em `DEMO_OPERADORES` **e** em `COORDENADORES_EMAILS`. O operador precisa de uma sessão de acesso; como coordenação de homologação, você recebe uma.
2. Entre com "Entrar com Microsoft". Você chega à coordenação de homologação.
3. Volte à tela de login e escolha qualquer perfil demo, **sem digitar a chave**: a API reconhece a sua sessão de operador.
4. Para o painel de QA da gamificação, inclua o mesmo e-mail em `GAMIFICACAO_QA_EMAILS`.

Assim, quem apresenta não precisa compartilhar chave e o acesso some ao remover o e-mail da lista.

## 3. Testes que cobrem isso

| Teste | O que prova |
|---|---|
| `code/back/api/src/config/ambiente.spec.ts` | Modo do demo por ambiente (inclusive o cenário exato do SEG-001); CORS; chave em tempo constante; limite de tentativas; `/health/ready` com banco em falha ou lento |
| `code/back/api/test/auth-ambientes.spec.ts` | Demo: sem chave, chave errada, chave certa, operador, aluno comum e token de onboarding; produção desligada; coordenação por lista; e-mails demo bloqueados no Microsoft; domínios `@sga` |
| Container local (manual, registrado) | Produção sem CORS não sobe; segredo fraco não sobe; banco remoto com segredo de exemplo não sobe; CORS bloqueia origem não listada; demo sem chave 401, chave errada 401, chave certa 200, 11ª tentativa 429; `/health/ready` 503 com o banco parado |

**Integração com a Microsoft real:** não é possível automatizar sem credencial. O procedimento manual está na [§5](#5-teste-com-uma-conta-microsoft-real-sem-senhas).

## 4. Microsoft Entra ID: o que configurar

Um app registration **público** (sem client secret) atende web e Android.

| Item | Valor |
|---|---|
| Tipo de conta | "Somente contas deste diretório" (o tenant da PUC Minas) |
| Plataforma **SPA** (Redirect URIs) | `https://<web-homologacao>/auth/callback`, `https://<web-producao>/auth/callback`, `http://localhost:5173/auth/callback` |
| Plataforma **Mobile e desktop** | `br.pucminas.ajudaai://auth` |
| Permissões delegadas | `openid`, `profile`, `email` (Microsoft Graph). Nenhuma permissão de aplicativo, nenhum client secret |
| Tokens | ID token v2 (`accessTokenAcceptedVersion` não importa: só o ID token é usado) |
| Valores que viram configuração | **Application (client) ID** → `MICROSOFT_CLIENT_ID` (API), `VITE_MICROSOFT_CLIENT_ID` (web), dart-define do app. **Directory (tenant) ID** → `MICROSOFT_TENANT_ID` em todos. Não são segredos, mas ficam como variáveis do Environment, não no código |
| Homologação × produção | O mesmo app serve aos dois (redirects listados acima). Se a TI preferir, crie dois apps e use IDs diferentes por Environment |
| Domínios | `AUTH_ALLOWED_DOMAIN=pucminas.edu.br,sga.pucminas.edu.br` (confirmar o de alunos e o de professores) |

**Dependência de autorização da PUC Minas:**
- **Quem registra o app.** Registrar apps no tenant institucional depende da política "usuários podem registrar aplicativos". Se estiver bloqueada, quem registra é a TI ou um professor com permissão.
- **Consentimento.** As permissões pedidas (`openid profile email`) costumam aceitar consentimento do próprio usuário. Se o tenant exigir **consentimento do administrador**, a TI precisa aprová-lo uma vez.
- **Credencial OIDC do GitHub Actions.** Ela também é um app registration no mesmo diretório. Se a política bloquear, o deploy da API pode rodar da sua máquina (`az login` + os mesmos comandos do workflow) até a TI liberar.
- **Como verificar sem alterar nada:** no Portal do Azure › Microsoft Entra ID › App registrations, veja se "New registration" aparece habilitado.

## 5. Teste com uma conta Microsoft real (sem senhas)

Ninguém além do dono da conta digita senha. A pessoa que testa entra no próprio navegador ou celular.

1. Com o app registrado, preencha `MICROSOFT_*` só na **homologação**.
2. **Web:**
   - abra a URL de homologação e use "Entrar com Microsoft";
   - confira que volta para `/auth/callback` e depois para o cadastro (primeiro acesso) ou para o perfil;
   - no DevTools › Rede, `POST /auth/login` deve responder 200 (`situacao: onboarding` ou `autenticado`).
3. **Domínio:** se a resposta for 401 "Use uma conta institucional", leia na mensagem o domínio esperado e ajuste `AUTH_ALLOWED_DOMAIN`. Não copie o token para lugar nenhum.
4. **Android:**
   - instale o APK de homologação e entre com a Microsoft;
   - o retorno pelo esquema `br.pucminas.ajudaai://auth` deve voltar ao app.
5. **Coordenação:** com um e-mail em `COORDENADORES_EMAILS`, o login cai na área da coordenação. Com um e-mail fora da lista, cai na área do aluno.
6. **Conta recusada:** uma conta pessoal (outlook.com) ou de outro tenant deve parar na própria Microsoft ou receber 401 da API.
7. Registre o resultado na tabela da §6.

## 6. Checklist de aceitação

| # | Cenário | Como verificar | Resultado esperado |
|---|---|---|---|
| 1 | Login Microsoft de aluno na web | §5, passo 2 | Cadastro (1º acesso) ou perfil; `POST /auth/login` 200 |
| 2 | Login Microsoft de aluno no Flutter | §5, passo 4 | Volta ao app autenticado |
| 3 | Login de coordenador autorizado | E-mail em `COORDENADORES_EMAILS` | Área da coordenação; ações administrativas funcionam |
| 4 | Rejeição de contas não autorizadas | Conta pessoal, outro tenant e domínio fora da lista | Recusa na Microsoft ou 401 "Use uma conta institucional" |
| 5 | Expiração e logout | Esperar 1 h, ou apagar o token e repetir uma ação; "Sair" | 401 → tela de login; depois de sair, voltar não reabre a sessão |
| 6 | Demo bloqueado em produção | `POST https://<api-prod>/auth/login-demo` com e-mail demo, com e sem `X-Demo-Chave` | Sempre 401 "indisponível em produção"; a web de produção não mostra o painel |
| 7 | Demo só em homologação, protegido | Mesmo POST na homologação sem chave, com chave errada, com chave certa e 11 vezes seguidas | 401, 401, 200, 429 |
| 8 | Permissões no backend | Token de aluno em `GET /coordenacao/dashboard` | 403 |
| 9 | Isolamento entre ambientes | Comparar `DB_HOST`/projeto, conta de storage e instância RabbitMQ das duas apps; usuário criado na homologação não existe na produção | Recursos distintos; dados não se cruzam |
| 10 | Painel de QA restrito | Conta fora de `GAMIFICACAO_QA_EMAILS` em `/aluno/testes-gamificacao`; produção com `GAMIFICACAO_QA_PRODUCAO=false` | Redireciona ao perfil (API 403/404); desligado em produção |
| 11 | Saúde e SSE | `/health/ready` 200; feed aberto por 10 min | Atualizações ao vivo continuam (o heartbeat segura o ingress) |
| 12 | CORS | `fetch` à API a partir de outro site | Bloqueado pelo navegador |
