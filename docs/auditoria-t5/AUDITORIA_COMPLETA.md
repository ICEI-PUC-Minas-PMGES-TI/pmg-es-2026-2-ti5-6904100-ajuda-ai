# Auditoria Completa — Ajuda Aí (T5 / Sprint-5)

**Data:** 03/11/2026  
**Branch auditada:** `Sprint-5` (`4788393`)  
**Ambiente verificado:** local (API `localhost:3000`, front `localhost:5173`, Postgres `ajuda-ai-postgres:5433`)  
**Escopo inicial:** diagnóstico.  
**Estabilização P0 (em andamento):** ver §14.

---

## 0. Fontes de verdade — disponibilidade

| Documento solicitado | Status no workspace |
|---|---|
| `AjudaAi.pdf` (especificação funcional v2.0, 14/10/2026) | **AUSENTE** |
| `ajuda-ai_contexto_regras_de_negocio.md` | **AUSENTE** |
| `ajuda-ai_features_projects.md` (F01–F37) | **AUSENTE** |
| `Ajuda-ai_Mapa_Mestre_de_Telas` | **AUSENTE** |
| Issues / Projects no GitHub | **NÃO ACESSÍVEL** (`gh` sem autenticação) |

**Fontes efetivamente usadas (prioridade):**

1. `docs/3.requisitos.md` (RF001–RF013) e `docs/2.nosso_produto.md`
2. `code/front/README.md`, `code/back/api/README.md`, `docs/tecnico/*`
3. Código e testes na branch `Sprint-5`
4. Commits/branches (`feat/f02-f07…`, `feat/f05…`, `Arthur_gv` com F04/F09/lojinha)
5. Verificação ao vivo da API com login demo (03/11/2026)
6. Atas em `assets/atas/` (Sprint 3–4; **sem ata formal do objetivo da Sprint-5**)

> Sem o catálogo F01–F37, a matriz da seção 4 distingue IDs com evidência no código dos IDs **NÃO VERIFICADOS** por ausência documental. Há também uma **matriz de capacidades** alinhada aos RF e ao produto, para orientar a entrega de hoje.

---

## 1. Resumo executivo

O monorepo sobe e a jornada **coordenação + candidatura + matching (API)** está parcialmente operacional no ambiente local com login demo. Porém o estado real do projeto **não está pronto para demonstrar o produto completo** descrito em `docs/2.nosso_produto.md` e `docs/3.requisitos.md`.

**Pontos fortes (Sprint-5):**

- Auth demo + JWT + área web de coordenação e aluno (perfil/candidatura)
- Programas/ciclos, formulários (F05/F06), candidaturas, matching (F11/F12) no backend
- Mobile com mapa, feed, PucStops/XP e paridade parcial da coordenação
- Testes automatizados relevantes (`f02-f07`, matching, formulários, mapa)

**Pontos críticos:**

1. **Banco local incompatível com o mapa/gamificação:** container `postgres:16-alpine` **sem PostGIS**; **todas as 9 migrations TypeORM estão pendentes** (`migration:show` → todas `[ ]`). `DB_SYNCHRONIZE=true` cria só o que as entities cobrem (schema `feed`). Resultado ao vivo: `/mapa/*` e `/me/xp` → **500**.
2. **Feed sem autorização de papel:** qualquer conta (pendente, rejeitada, apadrinhado) conseguiu `POST /publicacoes` → **201**.
3. ~~**Inconsistência de perfil (Camila)**~~ → **CORRIGIDO em 03/11/2026** (ver §14).
4. **Chat (RF008), missões, lojinha, encontros, disciplinas (RF010), push, RabbitMQ/SSE:** ausentes ou stub.
5. **Coordenador só em memória** (`dados.ts` / Renata); JWT de coord não é revalidado no banco.
6. **Documentos F01–F37 e especificação v2.0 ausentes** — impede auditoria fiel das 37 features e do escopo formal da sprint de hoje.

**Veredito:** sistema **demonstrável em fatia estreita** (login demo → coordenação → candidaturas → matching UI/API; aluno perfil/status). **Não demonstrável** como plataforma completa de apadrinhamento + comunicação + mapa + gamificação no ambiente local atual.

---

## 2. Estado atual da aplicação

| Camada | Estado verificado |
|---|---|
| Frontend web | Sobe (`Vite` em `:5173`). Rotas aluno + coordenação. Sem feed/mapa/XP/chat do aluno. |
| API NestJS | Sobe (`:3000`). Login demo OK. Domínio feed/programa/matching responde. Mapa/XP 500. |
| Postgres Docker | Container antigo `postgres:16-alpine` (compose atual pede `postgis/postgis:16-3.5-alpine`). Schemas: `feed`, `public`. Sem `mapa`, sem `gamificacao`, sem extensão PostGIS. |
| Migrations | **0/9 aplicadas**. Schema de negócio alimentado por `DB_SYNCHRONIZE=true` + seed demo. |
| Mobile Flutter | Código extenso presente; **não executado** nesta auditoria (NÃO VERIFICADO runtime). |
| Microsoft Entra | `.env` com placeholders; login real **não validado**. Demo OK. |
| Azure Blob | Placeholder; API sobe com aviso; uploads **NÃO VERIFICADOS**. |
| Mapbox (web admin) | Depende de `VITE_MAPBOX_ACCESS_TOKEN`; front `.env` ausente → mapa admin provavelmente indisponível na UI. |

---

## 3. Arquitetura identificada

```
[React/Vite :5173] ──REST/JWT──► [NestJS monólito :3000] ──TypeORM──► [Postgres :5433]
[Flutter mobile]  ──REST/JWT──►         │
                                        ├── Azure Blob (fotos/assets) — opcional em dev
                                        └── Mapbox (cliente) — mobile + seletores web coord
```

**Divergência documental:** `docs/3.requisitos.md` prevê microsserviços, API Gateway, RabbitMQ, SSE. Runtime real = **monólito Nest** + Postgres (+ Azure/Mapbox). Confirmado em `docs/tecnico/arquitetura.md` e `code/docker-compose.yml` (só Postgres).

### Módulos backend

`auth`, `cadastro`, `usuarios`, `participacoes`, `programas`, `formularios`, `coordenacao`, `matching`, `avisos`, `publicacoes`, `mapa`, `campus`, `gamificacao` (XP/PucStops), `storage`.

### Rotas web principais

- Aluno: `/aluno/perfil`, `candidatura`, `padrinho`, `historico`, `configuracoes`
- Coord: dashboard, candidaturas, matching, usuarios, programas, formularios, pucstops, eventos, restaurantes, comunicados
- **Ausentes na web:** feed social, mapa do aluno, chat, missões, lojinha, XP

### Riscos estruturais

| Risco | Evidência |
|---|---|
| Schema por synchronize vs migrations | `.env` `DB_SYNCHRONIZE=true`; `migration:show` tudo pendente |
| Imagem Docker desatualizada | Container `postgres:16-alpine` vs compose PostGIS |
| Authz fraca no feed | `JwtOpcionalGuard` + `x-user-id` |
| Coord em memória | `dados/dados.ts` |
| Dois “perfis” (conta vs participação) desalinhados | caso Camila ao vivo |
| Chat outbox sem consumer | `matching.service.ts` `chat.disponivel: false` |

---

## 4. Matriz das 37 funcionalidades

### 4.1 Limitação

O arquivo `ajuda-ai_features_projects.md` **não está no repositório**. Só há evidência textual explícita de: **F02, F04, F05, F06, F07, F09, F11, F12**.

### 4.2 IDs com evidência no código/commits

| ID | Nome inferido | Esperado (síntese) | Evidência | Front | Back | Persistência | Integração | Status | Problema | Pri |
|---|---|---|---|---|---|---|---|---|---|---|
| F02 | Perfil / participação no ciclo | Contratos aluno, isolamento de ciclo | PR #55, `f02-f07.e2e`, README front | Parcial | Implementado | Real (feed) | Parcial | **PARCIAL** | Conta (`/me.perfil`) ≠ situação do ciclo; programa obrigatório | P1 |
| F04 | Etapas de programa / gate matching | Liberação por etapa | Commits `F04` em `Arthur_gv` | Ausente no Sprint-5 | Ausente no Sprint-5 | — | — | **AUSENTE (nesta branch)** | Código em outra branch | P1 |
| F05 | Construtor de formulários | CRUD/publicação pela coord | PR #59, `FormulariosPage` | Implementado | Implementado | Real | Parcial | **PARCIAL** | Ao vivo: só rascunhos; aluno vê `perguntas=[]` | P1 |
| F06 | Versões / encerramento formulários | Versionar ao publicar; encerrar | Migration + entity | Implementado | Implementado | Migration **não aplicada** local | Parcial | **IMPLEMENTADA NÃO VALIDADA** | Depende de migration/versão real em DB limpo | P2 |
| F07 | Candidatura padrinho/apadrinhado | Envio, status, imutabilidade | Mesmo pacote F02 | Implementado | Implementado | Real | Funciona (demo) | **IMPLEMENTADA E VALIDADA** (demo) | Formulário extra vazio se não publicado | P2 |
| F09 | Verificação acadêmica pré-aprovação | Checklist/histórico antes de aprovar | `Arthur_gv` / #31 | Ausente Sprint-5 | Ausente Sprint-5 | — | — | **AUSENTE (nesta branch)** | Fora do HEAD atual | P2 |
| F11 | Matching (config/execução/sugestões) | Critérios, executar, listar | Migration F11F12, `MatchingPage` | Implementado | Implementado | Migration pendente; tables via sync? | Parcial | **PARCIAL** | Ao vivo: `podeExecutar=false` (critérios/capacidades) | P1 |
| F12 | Aprovar match → vínculos (+ chat) | Vínculo sem auto-chat | Matching + outbox | Implementado | Implementado | Real (vínculos); outbox morta | Parcial | **PARCIAL** | Chat `disponivel:false`; outbox sem consumer | P1 |

### 4.3 IDs F01, F03, F08, F10, F13–F37

| IDs | Status | Motivo |
|---|---|---|
| F01, F03, F08, F10, F13–F37 (**29 IDs**) | **NÃO VERIFICADA** | Catálogo F01–F37 ausente; sem string `Fxx` no código para mapear nome/aceitação |

### 4.4 Contagem mutuamente exclusiva (obrigatória F01–F37)

| Classificação | Qtd | Quais |
|---|---|---|
| IMPLEMENTADA E VALIDADA | **1** | F07 |
| IMPLEMENTADA NÃO VALIDADA | **1** | F06 |
| PARCIAL | **4** | F02, F05, F11, F12 |
| QUEBRADA | **0** | — (nos IDs conhecidos; ver capacidades quebradas abaixo) |
| AUSENTE | **2** | F04, F09 *(nesta branch)* |
| BLOQUEADA | **0** | — |
| NÃO VERIFICADA | **29** | F01, F03, F08, F10, F13–F37 |
| **Total** | **37** | |

### 4.5 Matriz complementar de capacidades (RF / produto) — independente do ID F

Use esta tabela para decisão de sprint; **não substitui** o catálogo F perdido.

| Capacidade | RF | Front web | Mobile | Backend | Persistência local | Status verificado | Pri |
|---|---|---|---|---|---|---|---|
| Login Microsoft | RF001 | Código presente | Código | Sim | — | **NÃO VERIFICADO** (credenciais placeholder) | P1 |
| Login demo | RF001 | Sim | Sim | Sim | — | **VALIDADO** | — |
| Identificação de papel | RF001 | Sim | Sim | Parcial | Conta≠ciclo | **QUEBRADA/inconsistente** (Camila) | P0 |
| Editar perfil | RF002 | Sim | Sim | Sim | Real | Parcial (Azure foto N/V) | P2 |
| Elegibilidade / aprovar padrinhos | RF003 | Sim | Sim | Sim | Real | **VALIDADO** (API) | P1 |
| Gerir vínculos | RF004 | Sim (via matching/usuários) | Sim | Sim | Real | Parcial | P1 |
| Critérios compatibilidade | RF005 | Sim | Sim | Sim | Real | Parcial (não configurado no seed) | P1 |
| Sugestões matching | RF006 | Sim | Sim | Sim | Real | Parcial (bloqueado sem config) | P1 |
| Grupos / capacidade | RF007 | Parcial | Parcial | Sim | Real | Parcial | P1 |
| Chat realtime | RF008 | Ausente | Stub | Outbox só | Ausente msgs | **AUSENTE** | P1* |
| Anúncios/comunicados | RF009 | Coord sim | Sim | Sim | Real | **VALIDADO** leitura | P2 |
| Feed social | — | **Ausente** | Sim | Sim (authz fraca) | Real | **QUEBRADA** (authz) | P0 |
| Disciplinas | RF010 | Ausente | Ausente | Ausente | — | **AUSENTE** | P3 |
| XP / níveis / conquistas | RF011 | Ausente aluno | XP sim; níveis não | XP sim | **Schema ausente local** | **QUEBRADA** local | P0 |
| Notificações | RF012 | Stub | Stub | Ausente | — | **AUSENTE** | P3 |
| Mapa campus | RF013 | Só admin pontos | Sim | Sim | **PostGIS ausente** | **QUEBRADA** local | P0 |
| PucStops | — | Admin web | Sim | Sim | Ausente local | **QUEBRADA** local | P0 |
| Missões | — | Ausente | “em breve” | Ausente | — | **AUSENTE** | P3 |
| Lojinha | — | Ausente | Stub | Só outra branch | — | **AUSENTE** Sprint-5 | P3 |
| Encontros | — | Copy/toggles | — | Ausente | — | **AUSENTE** | P3 |
| Admin delegado | — | Ausente | Ausente | Ausente | — | **AUSENTE** | P3 |
| RabbitMQ / SSE | restrição arq. | — | — | Ausente | — | **AUSENTE** (doc ≠ código) | P3 |

\*Prioridade de chat depende se a sprint prometeu RF008 hoje; se não, comunicar como pendência explícita.

---

## 5. Matriz de perfis e permissões

### 5.1 Modelo implementado (correto em intenção)

Camadas separadas no código:

1. **Conta** (`usuarios`) — identidade  
2. **Intenção/papel na participação** (`participacoes.papel`)  
3. **Status de candidatura** (`participacoes.status`)  
4. **Vínculo** (grupo / `matching_vinculos`)  
5. **Admin** (`perfil: coordenador` no JWT, origem memória)

Situações canônicas (`SituacaoAluno`): `nenhuma`, `candidatura_pendente`, `candidatura_em_analise`, `candidatura_rejeitada`, `candidatura_aprovada_aguardando_matching`, `padrinho_ativo`, `apadrinhado_pendente`, `apadrinhado_rejeitado`, `apadrinhado_aguardando`, `apadrinhado_ativo`, `concluido`.

### 5.2 Matriz esperado × encontrado

| Situação | Telas esperadas (produto) | Encontrado (web) | Backend | Problema |
|---|---|---|---|---|
| Onboarding | Cadastro perfil | `/` CadastroPage | JWT `escopo:onboarding` | OK conceitual |
| Candidato pendente/em análise | Status candidatura | Sim | Situação OK (Ana, Pedro) | OK |
| Não aprovado | Ver status + motivo | Sim (Julia) | OK | OK |
| Aprovado aguardando match | Sem vínculo ativo | Lucas: `apadrinhado_aguardando` | OK | Rota `/aluno/padrinho` existe sem guard rígido |
| Padrinho ativo | Ver apadrinhados | Thiago OK | OK | OK |
| Apadrinhado ativo | Ver padrinho | Depende vínculo | Guard só em `/me/vinculos` | Parcial |
| Coordenador | Painel total | Renata OK | `@Roles('coordenador')` | Coord só memória; RolesGuard não revalida |
| Aluno → rotas coord | Bloqueado | Camila → **403** | OK | OK |
| Sem token | Bloqueado | `/me` **401** | OK | OK |
| Publicar no feed | Só padrinho ativo (regra produto citada) | Qualquer um **201** | `JwtOpcionalGuard` | **FALHA GRAVE** |
| Admin delegado | Escopo limitado | Não existe | — | Ausente |
| Programa encerrado | Só histórico | Etapa existe; não força `concluido` em massa | Parcial | Parcial |

### 5.3 Falhas de segurança / autorização

| ID | Severidade | Descrição | Evidência |
|---|---|---|---|
| SEC-01 | **P0** | Criar publicação sem checar papel/vínculo | POST 201 com Ana (pendente) e Julia (rejeitada) |
| SEC-02 | **P0** | Feed aceita identidade via `x-user-id` sem JWT | `PublicacoesController` + `JwtOpcionalGuard` |
| SEC-03 | **P1** | Coordenador não persistido; JWT coord até expirar | `dados.ts`, `RolesGuard` |
| SEC-04 | **P1** | `/me.perfil` (tipoParticipacao conta) diverge da situação do ciclo | Camila ao vivo |
| SEC-05 | **P2** | `GET /avisos` acessível sem autenticação efetiva de papel | Teste avisos 200 para todos |
| SEC-06 | **P2** | `CadastroAprovadoGuard` quase não usado | Só `/me/vinculos` |

---

## 6. Fluxos esperados versus encontrados

### Fluxo A — Entrada e perfil
- **Entrada:** `/login` → Microsoft PKCE ou demo.  
- **Implementado:** demo validado; Microsoft não validado.  
- **Gap:** placeholders Entra; sessões aluno/coord separadas no `localStorage` (ok para demo, frágil).

### Fluxo B — Candidatura
- **Implementado:** escolha → formulário → revisão → envio → status.  
- **Gap ao vivo:** formulários do ciclo `2026/2` em **rascunho**; endpoint aluno retorna perguntas vazias. Seed não publica formulários.

### Fluxo C — Coordenação / programas
- **Implementado:** programas, etapas, formulários, dashboard.  
- **Validado:** `GET /coordenacao/programas` (3 ciclos; vigente `2026/2`, etapa `analise`).

### Fluxo D — Aprovação
- **Implementado:** listar/aprovar/rejeitar/em_analise/massa.  
- **Gap:** F09 (conferência acadêmica) fora da branch.

### Fluxo E — Matching
- **Implementado:** API + UI.  
- **Ao vivo:** bloqueado (`Configure os critérios e as capacidades`). Não se validou execução ponta a ponta neste ambiente.

### Fluxo F — Vínculos / chat
- **Vínculos:** existem (Thiago em grupo).  
- **Chat:** **não existe**; outbox declara dependência externa.

### Fluxo G — Feed / comunicados
- **Comunicados:** OK (3 avisos).  
- **Feed:** API existe; web aluno sem tela; permissões **incorretas**.

### Fluxo H — Mapa / PucStops
- **Código:** mobile + admin web + API.  
- **Local:** **500** (PostGIS/migrations).

### Fluxo I — Missões / XP / lojinha
- **XP API:** 500 local (schema ausente).  
- **Missões/lojinha:** ausentes ou stub / outra branch.

### Fluxo J — Encontros / encerramento
- **Encerramento:** etapa de programa.  
- **Encontros:** sem domínio.

---

## 7. Problemas de integração frontend/backend

| Problema | Detalhe |
|---|---|
| Programa obrigatório | Vários endpoints 400 sem `?programa=` — front precisa sempre enviar (README/e2e cobrem; fácil quebrar UX) |
| Feed só mobile | API pronta; web não consome |
| Mapa só mobile (aluno) | Web só admin de pontos |
| `/me.perfil` vs situação | UI pode mostrar papel errado se ler conta |
| Matching code vs id | `programa=2` → 404; exige código `2026/2` |
| Azure/Mapbox | Sem config local → foto/mapa admin degradados |

---

## 8. Problemas de persistência e modelo de dados

1. **Migrations nunca aplicadas** no banco local em uso.  
2. **`DB_SYNCHRONIZE=true`** mascara o problema no schema `feed`, mas **não** cria PostGIS/`mapa`/`gamificacao` completos.  
3. Container **sem PostGIS** apesar do compose atual.  
4. Coordenador **fora** da tabela `usuarios`.  
5. Seed demo deixa dados contraditórios (Camila).  
6. Outbox de chat grava eventos que **nunca** são processados.

---

## 9. Falhas de segurança e autorização

Ver seção 5.3. Destaques para entrega: **SEC-01/SEC-02 (feed)** e **SEC-03 (coord em memória)** devem ser comunicados explicitamente se houver demo pública.

---

## 10. Inconsistências de regras de negócio

| Regra (produto/docs/código) | Implementação |
|---|---|
| Escolher ser padrinho ≠ padrinho ativo | **Respeitada** (papel `candidato` até match) |
| Aprovar candidatura ≠ criar vínculo | **Respeitada** |
| Match aprovado cria vínculo; chat separado | Vínculo sim; chat não |
| Só padrinho ativo publica no feed | **Violada** |
| Coord não vira padrinho | Renata `situacao=nenhuma` — OK |
| Histórico preservado ao encerrar | Parcial (não auditado encerramento completo) |
| Microsserviços / Rabbit / SSE | Documentados, **não implementados** |

---

## 11. Testes executados e evidências

### 11.1 Runtime (esta auditoria)

| Teste | Resultado |
|---|---|
| Docker Desktop + start `ajuda-ai-postgres` | OK (imagem alpine sem PostGIS) |
| `npm run start:dev` API | OK — Nest started |
| `npm run dev` front | OK — http://localhost:5173 |
| Login demo (7 contas) | 201 |
| `/me`, `/participacoes/situacao?programa=2026/2` | 200 (com inconsistência Camila) |
| Coord dashboard/candidaturas/matching/formularios | 200 |
| Aluno → coord | 403 |
| Sem token → `/me` | 401 |
| `/mapa/predios`, `/mapa/pucstops` | **500** PostGIS |
| `/me/xp` | **500** relation missing |
| `POST /publicacoes` Ana/Julia/Camila/Thiago/Lucas | **201** todos |
| `npm run migration:show` | **9 pendentes** |

### 11.2 Testes automatizados do repo

Presentes (não reexecutados integralmente nesta auditoria por tempo):  
- Back: Vitest unit + e2e/integration (`f02-f07`, matching, formularios, mapa, pucstops-xp, auth…)  
- Front: `code/front/test/*.mjs`  
- Mobile: `flutter test` suites  

**Status desta auditoria:** suíte completa = **NÃO VERIFICADA** (não rodada ponta a ponta aqui).

### 11.3 UI E2E visual

**NÃO VERIFICADO** — sem automação de browser nesta sessão; apenas API + leitura de código/rotas.

---

## 12. O que não pôde ser verificado

- Catálogo e critérios de aceite F01–F37 (doc ausente)  
- Especificação funcional v2.0 / mapa mestre de telas  
- Objetivo formal da Sprint-5 no GitHub Projects/issues (`gh` sem login)  
- Login Microsoft real  
- App mobile em runtime  
- Azure Blob (upload/foto)  
- Mapbox na UI web  
- Execução completa de matching (seed sem critérios)  
- Fluxo de aprovação + match + vínculo ponta a ponta na UI  
- Suíte de testes automatizados completa  
- Branch `Arthur_gv` (F04/F09/lojinha) além de inspeção por commits  

---

## 13. Recomendações de melhoria (sem executar agora)

1. **Antes de qualquer demo de mapa/XP:** trocar container para PostGIS, backup do volume se necessário, rodar migrations (ou recriar volume local), alinhar `DB_SYNCHRONIZE=false` após migrations.  
2. **Corrigir authz do feed** (JWT obrigatório + papel `padrinho_ativo`). Remover confiança em `x-user-id` anônimo.  
3. ~~Unificar papel Camila / seed~~ → feito (§14); UI ainda pode preferir situação do ciclo como regra geral.  
4. **Publicar formulários do ciclo vigente** no seed/demo.  
5. **Configurar critérios/capacidades** no seed para matching demonstrável.  
6. **Comunicar escopo honesto:** chat/missões/lojinha/encontros/disciplinas fora; mapa só mobile + DB PostGIS.  
7. **Versionar no repo** (ou anexo) `AjudaAi.pdf` + `ajuda-ai_features_projects.md` + mapa de telas.  
8. Não misturar commits de `Arthur_gv` na demo sem merge consciente e teste.

---

## 14. Log de estabilização P0 (pós-auditoria)

### 14.1 P0-3 — Inconsistência Camila / registro principal — **CORRIGIDO** (03/11/2026)

| Campo | Detalhe |
|---|---|
| Causa confirmada | Duas linhas em `feed.participacoes` no ciclo `2026/2`: `candidato/em_analise` (órfã) + `apadrinhado/em_andamento/Grupo 08` (seed). `registroPrincipal` priorizava `candidato` > `apadrinhado`, mascarando o vínculo ativo. |
| Correção | (1) `registroPrincipal` passa a preferir `padrinho`/`apadrinhado` com `status=em_andamento` antes da ordem por papel. (2) Seed demo remove candidatura órfã quando define participação ativa. |
| Arquivos | `code/back/api/src/participacoes/participacoes.service.ts`, `code/back/api/src/coordenacao/coordenacao.service.ts`, `code/back/api/src/participacoes/participacoes.fluxo.spec.ts` |
| Testes | `vitest` `participacoes.fluxo.spec.ts` + `participacoes.service.spec.ts`: **19/19 OK**. Ao vivo: Camila `situacao=apadrinhado_ativo`; sumiu da lista de candidaturas; Thiago `padrinho_ativo`; Julia `candidatura_rejeitada`. |
| Pendente neste P0 | Nenhum. |

### 14.2 P0 restantes

| ID | Status |
|---|---|
| P0-2 Feed authz | **Adiado** — colega responsável (03/11/2026) |
| P0-1 PostGIS/migrations | **Adiado** — pulado a pedido (03/11/2026); demo sem mapa/XP local |

### 14.3 P1-1 — Formulários do ciclo em rascunho — **CORRIGIDO** (03/11/2026)

| Campo | Detalhe |
|---|---|
| Causa | Coordenação via perguntas sugeridas em memória (`salvo:false`); aluno só recebe perguntas se `publicado=true`. Seed demo não publicava formulários. |
| Correção | `semearFormulariosDemo()` publica padrinho/apadrinhado do ciclo atual quando ainda não há formulário salvo. |
| Arquivo | `code/back/api/src/coordenacao/coordenacao.service.ts` |
| Testes ao vivo | `GET /formularios/padrinho?programa=2026/2` → 1 pergunta, `publicado=true`; apadrinhado → 4 perguntas. Camila permanece `apadrinhado_ativo`. |
| Pendente neste item | Nenhum. |

### 14.4 P1-2 — Matching bloqueado — **CORRIGIDO** (03/11/2026)

| Campo | Detalhe |
|---|---|
| Causa | Catálogo de critérios vazio (migration não rodada), formulários sem pergunta de matching (`criterioId`), `configuracao=null` → `podeExecutar=false`. |
| Correção | Seed `semearMatchingDemo`: cria critério “Áreas de apoio”, anexa pergunta vinculada aos formulários publicados, salva config liberada (cap. 3/1) e preenche `extras` nos elegíveis demo. |
| Arquivo | `code/back/api/src/coordenacao/coordenacao.service.ts` |
| Testes ao vivo | `podeExecutar=true`; `POST .../matching/executar` → `concluida`; 2 sugestões; Camila/`formularios` ok. |
| Limitação | Chat pós-aprovação continua indisponível (outbox). |

---

## Apêndice A — Contas demo usadas

| E-mail | Papel esperado | Situação ao vivo (`2026/2`) |
|---|---|---|
| renata@pucminas.edu.br | Coordenadora | `nenhuma` + JWT coord |
| camila@pucminas.edu.br | Apadrinhada | `apadrinhado_ativo` (Grupo 08) — **corrigido** |
| lucas.almeida@pucminas.edu.br | Apadrinhado | `apadrinhado_aguardando` |
| thiago@pucminas.edu.br | Padrinho | `padrinho_ativo` |
| ana.beatriz@pucminas.edu.br | Candidata | `candidatura_pendente` |
| pedro.lima@pucminas.edu.br | Candidato | em análise |
| julia.fernandes@pucminas.edu.br | Não aprovada | `candidatura_rejeitada` |

## Apêndice B — Inventário técnico resumido

Ver Etapa 1: monorepo `code/{front,back/api,mobile}`, Nest 12 + React 19 + Flutter, Postgres, Azure, Mapbox, Entra.
