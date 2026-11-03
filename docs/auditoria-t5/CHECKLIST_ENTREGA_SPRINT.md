# Checklist de Entrega — Sprint (03/11/2026)

**Branch:** `Sprint-5`  
**Base:** `docs/auditoria-t5/AUDITORIA_COMPLETA.md`  
**Limitação:** objetivo formal da Sprint-5 **não localizado** (sem ata Sprint-5; GitHub Projects/issues inacessíveis sem `gh auth`). Priorização abaixo é **provisória**, baseada em RF essenciais + o que a branch entrega + o que quebra a demo local.

---

## 1. Escopo de hoje × escopo total do produto

| | Hoje (realista na branch) | Produto completo (docs RF/produto) |
|---|---|---|
| Auth demo + áreas web aluno/coord | Sim | + Microsoft real em produção |
| Candidaturas + aprovação | Sim | + F09 conferência acadêmica |
| Formulários versionados | Sim (rascunho no seed) | Publicados + respostas reais |
| Matching + vínculos | API/UI; precisa config | + chat pós-match |
| Comunicados | Sim | + notificações |
| Feed | API (authz quebrada); mobile | Web + regras de papel |
| Mapa / PucStops / XP | Código; **DB local quebrado** | PostGIS + assets + mobile |
| Chat / missões / lojinha / encontros / disciplinas | Fora | RF008, RF010, RF011 parcial, etc. |

**Não assumir que as 37 funcionalidades precisam estar completas hoje** — o catálogo F01–F37 sequer está no repositório.

---

## 2. Funcionalidades prontas e verificadas (demo API)

- [x] Login demo (`POST /auth/login-demo`)
- [x] Sessão JWT aluno e coordenador
- [x] Bloqueio aluno → rotas `/coordenacao/*` (403)
- [x] Bloqueio sem token → `/me` (401)
- [x] Listagem de programas/ciclos
- [x] Dashboard da coordenação (`programa=2026/2`)
- [x] Lista de candidaturas com status
- [x] Situação do aluno por programa (Ana, Thiago, Julia, Lucas, Pedro)
- [x] Comunicados (`GET /avisos`)
- [x] Distinção candidatura ≠ vínculo ≠ padrinho ativo (modelo ok; Thiago ativo)

---

## 3. Funcionalidades parcialmente prontas

- [x] Perfil Camila alinhado ao ciclo (`apadrinhado_ativo`) — P0-3 corrigido
- [x] Formulários F05/F06 publicados no ciclo vigente (seed demo) — P1-1
- [x] Matching F11/F12 executável na demo (config + critérios seed) — P1-2
- [ ] Vínculos (existem; chat outbox morta)
- [ ] Feed (API + mobile; **sem authz**; **sem tela web aluno**)
- [ ] Mapa/PucStops/XP (código; **500 no ambiente local**)
- [ ] Edição de perfil / foto (código; Azure N/V)
- [ ] Login Microsoft (código; credenciais placeholder)

---

## 4. Funcionalidades que NÃO podem ser demonstradas hoje

| Item | Motivo |
|---|---|
| Mapa do campus (qualquer cliente contra DB local atual) | Sem PostGIS; migrations pendentes |
| PucStops / coleta / XP | Schema `gamificacao` ausente |
| Chat / mensagens | Não implementado |
| Missões / ranking / lojinha | Stub ou outra branch |
| Encontros | Sem domínio |
| Disciplinas (RF010) | Ausente |
| Notificações push | Ausente |
| Feed com regra “só padrinho ativo” | Authz falha |
| Matching ponta a ponta (executar → aprovar → chat) | Config ausente + chat ausente |
| F04 / F09 | Fora do HEAD `Sprint-5` |
| App mobile runtime | Não executado nesta auditoria |
| Catálogo F13–F37 nominais | Documento ausente |

---

## 5. Bugs bloqueadores (P0)

| ID | Bug | Impacto na entrega | Status |
|---|---|---|---|
| P0-1 | Postgres local sem PostGIS + migrations 0/9 | Mapa/XP/PucStops 500 — demo de mapa impossível | **Adiado** — fora do escopo agora |
| P0-2 | `POST /publicacoes` sem checagem de papel | Demo de feed mostra regra de negócio falsa / risco | **Adiado** — colega vai resolver |
| P0-3 | `/me.perfil` diverge de `/participacoes/situacao` (Camila) | Demo de perfis confunde banca/avaliador | **CORRIGIDO** 03/11 — ver `AUDITORIA_COMPLETA.md` §14 |

---

## 6. Bugs críticos (P1)

| ID | Bug |
|---|---|
| P1-1 | Formulários do ciclo vigente em rascunho (`perguntas=[]` no aluno) | **CORRIGIDO** 03/11 — seed publica padrões |
| P1-2 | Matching `podeExecutar=false` (critérios/capacidades) | **CORRIGIDO** 03/11 — seed matching demo |
| P1-3 | Coordenador apenas em memória |
| P1-4 | Feed web aluno inexistente |
| P1-5 | `JwtOpcionalGuard` + `x-user-id` no feed |
| P1-6 | Chat outbox sem consumer (`disponivel:false`) |
| P1-7 | Microsoft Entra não configurado no `.env` local |
| P1-8 | Compose PostGIS ≠ container em execução |

---

## 7. Pendências de integração

- [ ] Alinhar imagem Docker PostGIS com volume/dados existentes  
- [ ] Aplicar migrations (ou recriar volume **local** consciente)  
- [ ] Publicar formulários + seed de critérios de matching  
- [ ] Corrigir seed/dados da Camila  
- [ ] Front: sempre enviar `programa`  
- [ ] Azure + Mapbox tokens para demo visual  
- [ ] Decidir se mobile entra na demo de hoje  

---

## 8. Sequência recomendada de correções (hoje)

1. **Decisão de escopo da demo** (15 min) — o que será mostrado / o que será declarado pendente.  
2. **P0-3** dados Camila + UI lendo situação do ciclo (estabiliza narrativa de perfis).  
3. **P0-2** authz mínima no feed (mesmo que a demo de feed seja só mobile).  
4. **P1-1 + P1-2** seed: publicar formulário + critérios matching (habilita jornada coord completa).  
5. **Só se mapa for obrigatório na banca:** P0-1 (PostGIS + migrations) — maior risco/tempo.  
6. Ensaio do roteiro §10.

Detalhes em `PLANO_CORRECAO_PRIORIZADO.md`.

---

## 9. Dependências entre tarefas

```
PostGIS/imagem ──► migrations mapa/XP ──► demo mapa/PucStops
Publicar formulários ──► candidatura com perguntas extras
Critérios matching ──► executar matching ──► aprovar sugestão ──► vínculo
Authz feed ──► demo feed honesta
Situação≠perfil ──► qualquer demo multi-persona
```

Não começar lojinha/missões/chat/F04/F09 hoje.

---

## 10. Roteiro seguro de demonstração (sugerido)

### Pode mostrar com confiança (API/web, DB atual)

1. Login demo **Renata** → dashboard coordenação (`2026/2`).  
2. Candidaturas: Ana (pendente), Pedro (em análise), Julia (não aprovada).  
3. Usuário **Thiago** → padrinho ativo / grupo.  
4. Usuário **Lucas** → apadrinhado aguardando matching.  
5. Comunicados.  
6. Telas de programas e formulários (deixar claro: rascunho, se não corrigir P1-1).  
7. Matching UI (deixar claro: bloqueado sem critérios, se não corrigir P1-2).

### Evitar ou declarar pendente

- Mapa / XP / PucStops no ambiente local atual  
- Feed como “só padrinho publica” (hoje qualquer um publica)  
- Chat / missões / lojinha / encontros  
- Login Microsoft real  
- Conta **Camila** (até corrigir inconsistência)

### Contas seguras para demo

| Persona | Conta |
|---|---|
| Coordenação | `renata@pucminas.edu.br` |
| Padrinho ativo | `thiago@pucminas.edu.br` |
| Apadrinhado aguardando | `lucas.almeida@pucminas.edu.br` |
| Candidata pendente | `ana.beatriz@pucminas.edu.br` |
| Não aprovada | `julia.fernandes@pucminas.edu.br` |
| Apadrinhada ativa | `camila@pucminas.edu.br` (ok após P0-3) |

---

## 11. Pendências a comunicar à equipe

1. Documentos `AjudaAi.pdf`, `ajuda-ai_features_projects.md`, mapa mestre **não estão no repo** — repositá-los.  
2. Escopo formal Sprint-5 não encontrado — alinhar verbalmente o que a banca espera.  
3. Ambiente local de mapa/XP está **vermelho** (PostGIS + migrations).  
4. Feed com falha de autorização — não vender como concluído.  
5. Chat RF008 não existe (apenas outbox).  
6. F04/F09/lojinha estão em `Arthur_gv`, não em `Sprint-5`.  
7. Arquitetura documentada (Rabbit/SSE/microsserviços) ≠ runtime.  
8. Autenticar `gh` para cruzar issues do Projects com a entrega.

---

## 12. Definition of Done mínima sugerida para “entrega de hoje”

Marque só o que for verdade no ensaio final:

- [ ] Renata acessa coordenação sem erro  
- [ ] Pelo menos 3 status de candidatura distintos visíveis  
- [ ] Thiago mostra padrinho ativo  
- [ ] Nenhuma demo depende de Camila sem correção  
- [ ] Equipe declara explicitamente: chat, mapa local, missões, lojinha  
- [ ] Se mapa for mostrado: PostGIS + migrations + smoke `/mapa/predios` = 200  
- [ ] Se feed for mostrado: só padrinho ativo consegue criar publicação  
