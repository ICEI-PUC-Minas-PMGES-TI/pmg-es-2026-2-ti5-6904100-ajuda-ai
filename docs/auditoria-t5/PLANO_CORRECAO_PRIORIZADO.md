# Plano de Correção Priorizado — Ajuda Aí (03/11/2026)

**Princípio:** menor correção segura; jornadas demonstráveis > quantidade de telas.  
**Não executar automaticamente** — este plano é guia pós-auditoria.

Referências: `AUDITORIA_COMPLETA.md`, `CHECKLIST_ENTREGA_SPRINT.md`.

---

## Ordem de ataque

1. Problemas que impedem executar / demonstrar com honestidade  
2. Autenticação e perfis  
3. Fluxos centrais (candidatura → aprovação → matching)  
4. Integração e persistência (mapa/XP)  
5. Funcionalidades secundárias  
6. UX / qualidade  

---

## 1. Problemas que impedem executar / demonstrar

### T1 — Decidir e documentar o roteiro da demo (P0 de processo)

| Campo | Conteúdo |
|---|---|
| Escopo | 15–30 min com a equipe: o que entra / o que fica pendente |
| Arquivos | Atualizar mentalmente checklist; opcional nota em `docs/auditoria-t5/` |
| Dependências | Nenhuma |
| Aceite | Lista escrita do roteiro + contas demo |
| Regressão | N/A |
| Viável hoje? | **Sim — fazer primeiro** |

### T2 — Authz do feed: só identidade autenticada + papel adequado (P0)

| Campo | Conteúdo |
|---|---|
| Errado | Qualquer um (pendente/rejeitado/apadrinhado) cria publicação |
| Por quê | Demo mente a regra; risco de abuso |
| Causa | `JwtOpcionalGuard` + `PublicacoesService.criar` sem checar participação ativa |
| Arquivos | `code/back/api/src/publicacoes/publicacoes.controller.ts`, `publicacoes.service.ts`; testes `publicacoes.service.spec.ts` |
| Correção mínima | Exigir JWT; permitir `POST` só se situação = `padrinho_ativo` (ou papel/`status` equivalentes); ignorar `x-user-id` se JWT presente; rejeitar anônimo |
| Dependências | Nenhuma de infra |
| Teste | Login Ana/Julia → POST 403; Thiago → 201; sem token → 401 |
| Risco | Baixo–médio (mobile feed precisa enviar Bearer — verificar `tela_feed.dart`) |
| Viável hoje? | **Sim** |

### T3 — Banco PostGIS + migrations (P0 **somente se mapa/XP forem da demo**)

| Campo | Conteúdo |
|---|---|
| Errado | `/mapa/*` e `/me/xp` → 500; migrations `[ ]` |
| Causa | Container `postgres:16-alpine`; sem extensão PostGIS; migrations nunca rodaram; sync não cobre PostGIS |
| Arquivos | `code/docker-compose.yml`, volume `ajuda-ai_postgres-data`, `code/back/api/.env` |
| Correção mínima segura | 1) Backup/export se dados importam; 2) Parar container; 3) Subir imagem PostGIS do compose **ou** recriar volume local; 4) `npm run migration:run`; 5) `SEED_DEMO_DATA` / `seed:demo` se preciso; 6) Smoke mapa/XP |
| Dependências | Docker; possível **perda do volume** se recriar — avisar equipe |
| Teste | `GET /mapa/predios` 200; `GET /me/xp` 200; `migration:show` todas `[X]` |
| Risco | **Alto** em volume compartilhado; médio em volume só local |
| Viável hoje? | Sim **com cuidado**; pular se demo não incluir mapa |

---

## 2. Autenticação e perfis

### T4 — Corrigir inconsistência Camila / fonte de verdade do papel (P0) — **FEITO**

| Campo | Conteúdo |
|---|---|
| Errado | Situação mostrava `candidatura_em_analise` apesar de vínculo apadrinhado ativo |
| Causa confirmada | Duas linhas no ciclo + `registroPrincipal` priorizava `candidato` |
| Correção aplicada | Preferir participação `em_andamento`; seed remove candidatura órfã |
| Teste | Unit 19/19; ao vivo Camila `apadrinhado_ativo`; candidaturas sem Camila |
| Status | **Concluído 03/11/2026** |

### T5 — Coordenador persistido (P1 — pode ficar pendência)

| Campo | Conteúdo |
|---|---|
| Errado | Renata só em memória |
| Correção mínima | Flag/`perfil` em `usuarios` ou tabela de papéis admin; `RolesGuard` reconsulta |
| Risco | Médio (auth) |
| Viável hoje? | Melhor **registrar como pendência** se demo demo-only |

### T6 — Microsoft Entra no `.env` (P1)

| Campo | Conteúdo |
|---|---|
| Correção | Preencher tenant/client + redirect SPA; espelhar no front `VITE_*` |
| Viável hoje? | Só se credenciais existirem; senão declarar “demo only” |

---

## 3. Fluxos centrais

### T7 — Publicar formulários do ciclo vigente (P1) — **FEITO**

| Campo | Conteúdo |
|---|---|
| Errado | Aluno recebia `perguntas=[]` / `publicado=false` |
| Correção aplicada | Seed `semearFormulariosDemo` publica padrões se nada salvo |
| Teste | Aluno vê 1 pergunta (padrinho) e 4 (apadrinhado) em `2026/2` |
| Status | **Concluído 03/11/2026** |

### T8 — Habilitar matching para demo (P1) — **FEITO** (execução)

| Campo | Conteúdo |
|---|---|
| Errado | `podeExecutar=false` — sem catálogo/config |
| Correção aplicada | Seed matching: critério + perguntas + config liberada + extras |
| Teste | Executar → 2 sugestões (`status=concluida`) |
| Pendente opcional | Aprovar sugestão na UI e mostrar vínculo; chat ainda não existe |
| Status | **Concluído 03/11/2026** (execução demonstrável) |

### T9 — Não mergear F04/F09/lojinha às cegas (P1 processo)

| Campo | Conteúdo |
|---|---|
| Errado | Tentação de puxar `Arthur_gv` no dia da entrega |
| Correção | Tratar como sprint seguinte; se merge, rodar e2e matching/candidaturas |
| Viável hoje? | **Evitar** |

---

## 4. Integração e persistência

### T10 — `DB_SYNCHRONIZE` vs migrations (P1)

| Campo | Conteúdo |
|---|---|
| Errado | Sync esconde migrations não aplicadas |
| Correção | Após T3: `DB_SYNCHRONIZE=false` em ambientes compartilhados; sync só scratch local |
| Risco | Alto se desligar sync sem migrations aplicadas |
| Viável hoje? | Só depois de T3 |

### T11 — Remover dívida `x-user-id` anônimo (P1)

| Campo | Conteúdo |
|---|---|
| Ligado a | T2 |
| Aceite | Sem JWT → 401 em mutações de publicações |

---

## 5. Funcionalidades secundárias (não priorizar hoje)

| ID | Item | Ação |
|---|---|---|
| T12 | Chat realtime | Pendência de produto; outbox já prepara eventos |
| T13 | Missões / níveis / conquistas | Pendência RF011 |
| T14 | Lojinha | Branch `Arthur_gv` — fora |
| T15 | Encontros | Domínio inexistente |
| T16 | Disciplinas RF010 | Ausente |
| T17 | Feed web aluno | Depois de T2; nova rota consumindo API |
| T18 | Admin delegado | Ausente |
| T19 | RabbitMQ / SSE | Alinhar docs à arquitetura real ou roadmap |

---

## 6. UX e qualidade

| ID | Item | Nota |
|---|---|---|
| T20 | Evitar Camila na demo até T4 | Imediato, zero código |
| T21 | Mensagens 400 “informe o programa” | Garantir selects de ciclo no front |
| T22 | Empty states honestos (chat em breve, mapa indisponível) | Já parcialmente no mobile |
| T23 | Rodar `npm test` / `f02-f07` / front tests antes da banca | Regressão |
| T24 | Versionar docs F01–F37 + AjudaAi.pdf no repo | Processo |

---

## Pacote mínimo recomendado para HOJE

Se houver **≤ 3–4 horas**:

1. T1 (roteiro)  
2. T4 (dados/UI perfil) — ou só excluir Camila  
3. T2 (authz feed) — se feed for mostrado  
4. T7 + T8 manuais na UI (formulários + matching config)  
5. Ensaio do checklist §10  

Se mapa for **obrigatório**: inserir T3 **antes** do ensaio (bloquear 1–2 h + risco de volume).

Se houver dúvida: **não mexer no banco**; demonstrar coordenação + candidaturas + padrinho ativo + declarar mapa/chat/XP como próxima entrega.

---

## Critérios de aceite por jornada (pós-correção)

### Jornada coordenação
- Login Renata → dashboard 200  
- Ver candidaturas com ≥3 status  
- (Opcional) Publicar formulário  
- (Opcional) Configurar e executar matching → aprovar 1 sugestão  

### Jornada aluno
- Ana: vê candidatura pendente  
- Julia: vê rejeitada com motivo  
- Thiago: vê vínculo/apadrinhados  
- Lucas: aguardando matching  
- Ninguém sem JWT publica no feed  

### Jornada mapa (só após T3)
- `/mapa/predios` 200  
- Mobile ou admin web carrega sem erro fatal  

---

## Registro de riscos de regressão

| Área | Risco se alterar às pressas |
|---|---|
| Publicações | Mobile quebrar se ainda depender de `x-user-id` sem Bearer |
| Seed / Camila | Outros testes e2e que assumem estado demo |
| Volume Postgres | Perda de dados locais ao recriar |
| RolesGuard / coord | Trancar Renata se migrar coord para DB sem seed |
| Matching | Sugestões inconsistentes se reexecutar sem limpar |

---

## Próxima ação única (estabilização)

**P0:** T4 feito; T2/T3 adiados. **P1:** T7 formulários e T8 matching **feitos**.  
**Próximo sugerido:** ensaiar demo (Renata → matching executar/aprovar) ou P1 restantes (coord em memória, Entra, etc.) sob demanda.
