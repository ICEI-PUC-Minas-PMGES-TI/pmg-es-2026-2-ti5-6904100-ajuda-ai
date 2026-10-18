# PucStops

> Estado: ATUAL (Tarefa 10, revisada em 17/10/2026). PucStops são **conteúdo
> administrativo da coordenação** (CRUD em `/coordenacao/pucstops` e na web da
> coordenação), a única fonte dos PucStops. Migration **aplicada no Supabase
> em 18/10/2026**: produção começa com **zero PucStops** (`GET /mapa/pucstops`
> → `[]`); nenhuma importação de legado. O totem da r3 é só o modelo visual
> genérico. `criado_por` é nulo por enquanto (coordenador mockado; ver
> [Limitações](#limitações)). Detalhes da aplicação em
> [banco/migrations.md](../banco/migrations.md#aplicação-no-supabase-18102026).

PucStops são pontos do campus que concedem XP **uma vez** a quem os coleta
estando perto. É a reescrita, no domínio do Ajuda-aí, dos "totens" do PUCMaps.
O XP vai para a carteira global do usuário ([gamificacao/xp.md](../gamificacao/xp.md));
o mapa só diz onde os PucStops estão.

## Regra atual: cadastro pela coordenação

Decisão de 17/10/2026: os totens herdados do PUCMaps têm nomes e posições
inconsistentes (ver [Referência histórica](#referência-histórica-totens-do-pucmaps-não-importados))
e **não** viram dados de produção. A coordenação cadastra os PucStops:

```
Coordenação → PucStops → Adicionar PucStop → clica no ponto do mapa do campus
→ nome → XP → raio da geofence → Salvar → aparece no mapa dos alunos
```

- Editar nome, posição, XP e raio; ativar/desativar. **"Excluir" = desativar**
  (`ativo = false`): some do mapa dos alunos e não pode ser coletado, mas a
  linha, as coletas e o ledger ficam. Não há exclusão física (nem pela API,
  nem por SQL quando há coletas: `ON DELETE RESTRICT`).
- **XP após edição**: vale só para as próximas coletas. Cada coleta grava o
  XP concedido (`pucstop_coletas.xp` e a movimentação no ledger); nada é
  recalculado retroativamente. Mudar posição ou desativar também não toca em
  coletas antigas. Quem já coletou não coleta de novo depois de uma mudança
  de posição (coleta única por usuário e PucStop).
- **Identidade**: UUID gerado pelo banco (`gen_random_uuid()`). Ids do PUCMaps
  (`totem_*`) e nomes não são chave.
- **Sem lista no app nem no manifesto**: o app recebe tudo de
  `GET /mapa/pucstops`. Sem PucStops cadastrados, o mapa simplesmente não
  mostra totens (não é erro).

## Referência histórica: totens do PUCMaps (não importados)

> Registro da origem da funcionalidade. **Nada desta seção está no banco**: o
> snapshot `pucstops-pucmaps.json`, o exportador e o importador
> (`pucstops:importar`) foram removidos em 17/10/2026 para que os totens
> legados não sejam importados por engano.

Auditoria do PUCMaps, commit `776e113`:

| Item | O que existia | Decisão |
|---|---|---|
| Tabela `totems` | `geography(Point)`, `radiusMeters` (padrão 40), `xpReward` (padrão 50); **nenhuma linha** em seed, dump ou script; só a API admin criaria | Não há dado real no banco antigo |
| Lista `_fallbackTotems` (`totem_remote_datasource.dart`, commit `69b2de0`) | 11 totens hardcoded no app, "MVP sem backend" | **Única fonte concreta**: base do snapshot |
| Raio | 35–50 m por totem; validação do admin 10..500 m; padrão 40 m | Copiado por totem; mesmos limites em CHECK |
| XP | 20–50 por totem; validação 1..1000; padrão 50 | Copiado por totem; mesmos limites em CHECK |
| Regra de coleta | Uma vez por usuário e totem, para sempre (`UQ_totem_claims_user_totem`); **sem cooldown** | Mantida |
| Tolerância de GPS | Nenhuma (`distance <= radius` no cliente; `accuracy` ignorada) | Margem técnica 0 |
| Geofence no servidor | Nenhuma: o claim não recebia posição ("validação feita no cliente") | **Corrigido**: PostGIS no servidor |
| Claim × XP | Duas operações sem transação única; corrida virava 500 | **Corrigido**: uma transação; corrida vira 409 |
| `user_stats`/`xp_log` | XP total + nível (`floor(xp/100)+1`) e log sem FK para usuário | Não portados (ADR-0002) |
| Totem 3D | `torre_pucstop.glb` 3,1 MB, ModelLayer, 12 m, giro 180°, zoom ≥ 16, só para "pronto" | Migrado para a r3 (ver [Totem](#totem-3d)) |
| Áudio | `totem_spin.wav` (8 s, 1,5 MB) e `totem_finish.mp3` (0,86 s, 21 KB) | Não migrados (ver [Som](#som)) |

### Inventário (11 entradas da origem)

| id | Nome | lat, lon | Raio | XP | Classificação |
|---|---|---|---|---|---|
| `totem_teste_dev` | Torre PUC · Teste | -19.9230, -43.9940 | 300 | 99 | **DESCARTAR** (teste: "raio de 300 m cobre o campus inteiro") |
| `totem_entrada_principal` | Entrada Principal | -19.9239, -43.9921 | 45 | 20 | MIGRAR (ativo) |
| `totem_biblioteca` | Biblioteca Central | -19.9226, -43.9940 | 40 | 50 | MIGRAR (ativo) |
| `totem_reitoria` | Reitoria | -19.9233, -43.9948 | 40 | 35 | **ADIAR** (inativo: dentro do footprint do P45) |
| `totem_praca_alimentacao` | Praça de Alimentação | -19.9221, -43.9933 | 38 | 30 | MIGRAR (ativo) |
| `totem_capelinha` | Capelinha | -19.9218, -43.9944 | 35 | 40 | MIGRAR (ativo) |
| `totem_patio_engenharia` | Pátio de Engenharia | -19.9243, -43.9955 | 40 | 45 | MIGRAR (ativo) |
| `totem_auditorio` | Auditório Principal | -19.9228, -43.9958 | 40 | 40 | MIGRAR (ativo) |
| `totem_campo_esportes` | Campo de Esportes | -19.9250, -43.9935 | 50 | 35 | **ADIAR** (inativo: dentro do footprint do P47) |
| `totem_medicina` | Bloco de Medicina | -19.9215, -43.9920 | 40 | 45 | MIGRAR (ativo) |
| `totem_estacionamento_central` | Estacionamento Central | -19.9246, -43.9943 | 45 | 25 | MIGRAR (ativo) |

Esses totens nunca existiram no banco do PUCMaps (só no app, como fallback "MVP
sem backend"), com coordenadas de 4 casas (~11 m) posicionadas à mão; os nomes
não conferem com o mapa real (ver
[auditoria de coerência](#auditoria-de-coerência-nome--posição-revisão-final-17102026)).
Por isso foram descartados como dados de produção.

## Arquitetura

```
app (toque em "Coletar XP")
   │  leitura de GPS sob demanda (CampusLocationService), JWT da sessão
   ▼
POST /mapa/pucstops/:id/claim  {latitude, longitude, accuracy?}
   │  usuário = JWT sub → usuarios.id (e-mail conferido)
   ▼
transação:
   PucStop ativo? ─ ST_DWithin/ST_Distance (geography) ≤ raio?
   trava a carteira do usuário (FOR UPDATE)
   já coletado? → 409
   INSERT ledger (+XP) → UPDATE carteira → INSERT coleta
commit  →  {pucstopId, xpGanho, xpTotal, claimedAt, distanciaMetros}
```

- **Onde fica cada coisa**: `mapa.pucstops` (posição, raio, XP, ativo) é dado
  do mapa; coletas, ledger e saldo ficam no schema `gamificacao` (domínio do
  usuário). Ver [gamificacao/xp.md](../gamificacao/xp.md).
- **PucStop não pertence à versão do mapa.** É conteúdo da coordenação,
  criado e editado sem publicar versão nova do mapa, e a coleta precisa valer
  para sempre pelo mesmo `id`. Sem `versao_id` (nem `pucmaps-12` nem outra).
  A versão **ativa** do mapa só entra na validação da escrita: define onde o
  campus fica ([limite do campus](#limite-do-campus)).
- **Colunas de `mapa.pucstops`**: `id` (uuid), `nome`, `localizacao`, `raio_metros`,
  `xp`, `ativo`, `criado_por` (FK `usuarios.id`, nula; ver
  [Limitações](#limitações)), `criado_em`, `atualizado_em`. Sem `descricao`
  (o fluxo não usa) nem `origem` (nada é importado).
- **Geometria**: `geometry(Point, 4326)` como o resto de `mapa`; o cálculo
  converte para `geography` (metros, geodésico no esferoide).

## Geofence (servidor)

```sql
ST_Distance(p.localizacao::geography, ST_SetSRID(ST_MakePoint($lon, $lat), 4326)::geography)
ST_DWithin (p.localizacao::geography, <mesmo ponto>, p.raio_metros + 0)   -- elegível (inclusivo)
```

- Funções qualificadas pelo schema real do PostGIS (`extensions` no Supabase),
  sem depender do `search_path`.
- **Raio físico** = `raio_metros` cadastrado pela coordenação (10–200 m). **Margem técnica** =
  `MARGEM_TECNICA_METROS = 0` (a origem não tinha tolerância). Separadas no
  código para que uma margem futura seja explícita.
- **Precisão do GPS**: `accuracy` é opcional e **não aumenta o raio** (o
  cliente poderia mentir). Leitura com `accuracy > 100 m` é recusada
  (`precisao-insuficiente`): com incerteza desse tamanho a leitura não
  distingue dentro de fora. Não protege contra GPS falsificado
  (nenhuma validação server-side protege; ver [Limitações](#limitações)).
- Testado com PostGIS real: ponto a raio − 5 cm coleta, raio + 5 cm recusa;
  no E2E HTTP, 39,5 m → 201 e 40,5 m → 422.

## Claim: transação, idempotência e concorrência

- Tudo em uma transação (`READ COMMITTED`): leitura do PucStop (`FOR SHARE`),
  geofence, trava da carteira, checagem, ledger, saldo, coleta.
- **Serialização por usuário**: `xp_carteiras` é criada (`ON CONFLICT DO
  NOTHING`) e travada com `SELECT … FOR UPDATE` antes de checar a coleta
  anterior. A segunda requisição simultânea espera e então vê a coleta → 409.
- **Barreiras no banco**: `UNIQUE (usuario_id, pucstop_id)` em
  `pucstop_coletas` e `UNIQUE (chave_idempotencia)` no ledger
  (`pucstop:<id>:usuario:<uid>`). Se algo escapar da trava, a violação vira 409
  (nunca 500).
- Teste: 20 requisições simultâneas do mesmo usuário ao mesmo PucStop → 1×201,
  19×409, uma movimentação; 5 coletas simultâneas de PucStops diferentes →
  todas 201, `saldo_apos` em sequência, saldo = soma.
- Rollback testado: falha forçada ao gravar a coleta → nada gravado (nem XP,
  nem ledger); a mesma coleta funciona depois.
- **Coleta × edição da coordenação**: a coleta lê o PucStop com `FOR SHARE`
  na transação; o `UPDATE` da coordenação espera por ela (e vice-versa). A
  coleta usa o XP/posição de antes ou de depois da edição, nunca uma mistura.
  PucStop inativo → 422 `inativo`.

## Endpoints

| Método e rota | Auth | Resposta | Erros |
|---|---|---|---|
| `GET /mapa/pucstops` | pública | `PucStopDto[]` (só ativos, ordem por nome; `[]` sem cadastro) | — |
| `GET /mapa/pucstops/:id` | pública | `PucStopDto` | 404 inexistente, inativo ou id malformado |
| `POST /mapa/pucstops/:id/claim` | JWT | 201 `ColetaPucStopDto` | 400 corpo inválido/campo extra; 401 sem token; 403 sem cadastro; 404; 409 `ja-coletado`; 422 `fora-do-alcance` (com `distanciaMetros`, `raioMetros`), `inativo`, `precisao-insuficiente` |
| `GET /me/pucstops` | JWT | `[{pucstopId, xp, claimedAt}]` | 401, 403 |

```jsonc
// PucStopDto
{ "id": "3f6c2a1e-8b4d-4c2a-9e1f-0a7b5c3d2e10", "nome": "Biblioteca",
  "latitude": -19.92085, "longitude": -43.99316, "raioMetros": 30, "xp": 50 }
// POST /mapa/pucstops/3f6c2a1e-8b4d-4c2a-9e1f-0a7b5c3d2e10/claim  { "latitude": -19.92085, "longitude": -43.99305, "accuracy": 8.5 }
{ "pucstopId": "3f6c2a1e-8b4d-4c2a-9e1f-0a7b5c3d2e10", "xpGanho": 50, "xpTotal": 320,
  "claimedAt": "2026-10-17T23:44:28.749Z", "distanciaMetros": 12 }
```

Corpo validado pelo `ValidationPipe` global (`whitelist` +
`forbidNonWhitelisted`): `xp`, `raioMetros`, `usuarioId` ou qualquer outro
campo → 400. XP, raio e usuário são sempre do servidor.

As rotas públicas são **só leitura** e a coleta: `POST`/`PATCH` em
`/mapa/pucstops` não existem (404, testado).

### Administração (coordenação)

Mesmos guards de `/coordenacao` (`JwtAuthGuard` + `RolesGuard`,
`@Roles('coordenador')`): sem token 401; aluno 403 (testado em todas as rotas).

| Método e rota | Resposta | Erros |
|---|---|---|
| `GET /coordenacao/pucstops` | `PucStopAdminDto[]` (ativos e inativos, por nome) | 401, 403 |
| `GET /coordenacao/pucstops/campus` | `{limite (GeoJSON Polygon), margemMetros, bbox, centro}` | 503 sem versão ativa do mapa |
| `GET /coordenacao/pucstops/:id` | `PucStopAdminDto` | 400 id não UUID; 404 |
| `POST /coordenacao/pucstops` | 201 `PucStopAdminDto` | 400 validação/campo extra; 422 `fora-do-campus`; 503 |
| `PATCH /coordenacao/pucstops/:id` | `PucStopAdminDto` | 400 (vazio, latitude sem longitude, `ativo`, campo extra); 404; 422; 503 |
| `POST /coordenacao/pucstops/:id/desativar` | 200 `PucStopAdminDto` ("excluir"; idempotente) | 404 |
| `POST /coordenacao/pucstops/:id/ativar` | 200 `PucStopAdminDto` (confere o campus de novo) | 404; 422 |

`PucStopAdminDto` = `PucStopDto` + `ativo`, `criadoPor`, `criadoEm`,
`atualizadoEm` e `coletas` (quantas coletas já houve). Corpo do POST:
`{nome, latitude, longitude, xp, raioMetros, ativo?}`; PATCH: qualquer
subconjunto de `{nome, latitude, longitude, xp, raioMetros}`.

**Validação no servidor** (o front só antecipa a mensagem): nome com algum
caractere visível, até 120 (gravado sem espaços nas pontas); XP inteiro
1..1000; raio 10..200 m; latitude/longitude numéricas e finitas; posição
dentro do campus. Os mesmos limites são CHECKs da tabela.

### Limite do campus

A posição precisa estar a até `MARGEM_CAMPUS_METROS = 30` m (geodésico) da
**envoltória convexa da versão ativa do mapa**: polígonos/pontos de
`mapa.predios`, `mapa.areas` e os nós do grafo de caminhos
(`mapa.nos_grafo`). É a geometria real do campus, não um retângulo fixo:
uma versão nova do mapa muda o limite sem migration. Fora → 422
`fora-do-campus` com `distanciaMetros`; sem versão ativa → 503 (não há como
conferir). Testado: 600 m a leste do Museu (P40), Praça da Liberdade (~6 km)
e (0, 0) recusados; o retângulo resultante tem menos de 0,02° de lado. A web
recebe o mesmo polígono (`/campus`) para desenhar a área permitida.

**Rate limit:** não adicionado. A coleta é idempotente (cada PucStop rende XP
uma vez por usuário), as posições já são públicas (não há o que "descobrir"
tentando coordenadas) e um limitador em memória não vale com várias
instâncias. Reavaliar se surgir abuso.

## Privacidade

- A coordenada do claim é usada **só** na consulta de distância: não é
  gravada (nenhuma coluna de posição em `gamificacao`, conferido em teste),
  não vai para log (o log registra PucStop, usuário e XP; conferido no E2E) e
  não volta na resposta (só a distância, que o próprio usuário já sabe).
- Vai no corpo do POST (fora de URL e de log de acesso).
- O app lê o GPS só quando o card abre (distância) e no "Coletar XP"; sem
  stream, sem background, sem geofencing do Android, sem histórico.

## Web da coordenação

`code/front`, menu **PucStops** (`/coordenacao/pucstops`; não depende do
programa/ciclo selecionado, então o seletor de ciclo some nessa página).

- Lista com nome, status (Ativo/Inativo), XP, raio, coletas e atualização;
  filtro Todos/Ativos/Inativos; ações Editar, Excluir (modal explicando que é
  desativação e que o histórico fica) e Reativar.
- Formulário (modal): nome, XP, raio e o **seletor no mapa**
  (`SeletorPucStopMapa.jsx`): Mapbox GL JS (`mapbox-gl` 3.32, carregado sob
  demanda), enquadrado no `bbox` do campus, com a área permitida desenhada.
  Clique posiciona um marcador temporário (arrastável) e desenha o círculo da
  geofence; dá para reposicionar antes de salvar. Latitude/longitude aparecem
  só como texto; ninguém digita coordenada. Ponto fora da área mostra aviso
  (o servidor decide). PATCH envia só os campos alterados.
- Configuração: `VITE_MAPBOX_ACCESS_TOKEN` (o mesmo token **público** `pk.` do
  app; as restrições de URL do token precisam permitir a origem da web) e
  `VITE_MAPBOX_STYLE_URI` opcional (ver `code/front/README.md`). Sem token, o
  mapa mostra "Mapa indisponível" e só a edição de nome/XP/raio funciona.
- E2E (18/10/2026, API + web locais, banco PostGIS descartável com
  `pucmaps-12` ativa, login demo da coordenação, token `pk.` do `.env`): lista
  vazia → criar clicando no mapa (área permitida desenhada) → aparece em
  `GET /mapa/pucstops` com UUID; mover para fora do campus → aviso no front e
  422 do servidor, posição intacta; excluir → "Inativo" na coordenação e
  `GET /mapa/pucstops` vazio; reativar → volta. Coleta não foi exercitada
  nesse E2E (coberta pelos testes de integração).

## App (campus_map + Ajuda-aí)

- `campus_map` continua sem HTTP: contrato `CampusPucStopService`
  (`list`, `collected`, `canClaim`, `claim`), implementado no app por
  `MapaApiPucStopService` (`lib/services/pucstops_api.dart`) com o JWT da
  sessão. Ligado na `MapaPage` com `features.pucStops: true`.
- **Renderização** (`CampusPucStopLayer`): source GeoJSON `campus-map-pucstops`
  com `id`, nome, XP e estado (`available`/`collected`); halo (`#FFD58A`) e
  ponto (`#F59E0B` disponível, `#22C55E` coletado) desde o zoom 15; nome a
  partir do zoom 17,5 (coletado = "✓ nome"; disponível = "nome · +XP"); totem
  3D desde o zoom 16,5 (junto com o LOD1), só nos não coletados.
- **Picking**: `addInteraction(TapInteraction(FeaturesetDescriptor(layerId: …)))`
  só nas camadas `dot` e `halo` (raio de 12 px). Nenhum picking genérico.
- **Card**: nome, "+XP", estado com ícone **e** texto (disponível / no alcance /
  fora de alcance / já coletado / indisponível), distância aproximada
  (haversine; difere do PostGIS em centímetros) e "Coletar XP". Fora de
  alcance oferece "Atualizar distância". Sem login: "Entre na sua conta para
  coletar XP". Abrir um PucStop fecha o card de rota (um card por vez).
- **Coleta manual**: só no toque em "Coletar XP" → nova leitura de GPS →
  POST. Nada é coletado por passar perto.
- **Feedback**: "+50 XP · total 320 XP" com animação curta, vibração
  (`HapticFeedback`), ponto vira verde e o totem some daquele PucStop; o saldo
  da sessão (`SessaoUsuario.xp`) recebe `xpTotal` do servidor.
- **Lista dinâmica**: carregada ao abrir o mapa e de novo quando o app volta
  ao primeiro plano (`CampusMapController.reloadPucStops`): PucStop criado,
  movido ou desativado pela coordenação aparece, muda ou some. Card aberto de
  um PucStop que sumiu fecha. Falha de rede mantém a lista anterior. Ids
  aceitos só no formato UUID.
- Falhas: offline/timeout, já coletado (marca como coletado), fora de alcance
  (mostra a distância medida no servidor), precisão, indisponível, sem login,
  permissão de GPS negada; resposta atrasada depois de fechar o card ou sair
  da tela é descartada.

## Totem 3D

- `torre_pucstop.glb` (3.096.036 B, 26.759 triângulos) publicado na versão
  imutável `2026-09-30-r3` do `map-assets`, seção `pucstops` do manifesto (só
  modelo + `placement`). O manifesto define o **modelo** do totem, não as
  instâncias: onde cada totem aparece vem do banco (`GET /mapa/pucstops`).
  Cadastrar PucStops não exige publicar `r4`. Fora do APK. Detalhes em
  [assets-pipeline.md](assets-pipeline.md#totem-dos-pucstops-seção-pucstops).
- `ModelLayer` própria (`campus-map-pucstops-totem`), separada dos props:
  escala 12 m / 16,39 = 0,7322, rotação `[0, 0, 180]`, sombras, emissão 0,4.
- Sem animação de giro: a origem só girava o topo arrastando, num modo de foco
  que não foi portado.
- Se o GLB falhar (erro de carregamento com a URL do totem) a camada do totem
  é removida e os pontos 2D continuam, inclusive o toque. Sem
  `MAP_ASSETS_BASE_URL` ou sem a seção no manifesto: só 2D.

## Som

Auditado: `totem_spin.wav` (8 s, 1,5 MB, toca durante o giro arrastado) e
`totem_finish.mp3` (0,86 s, 21 KB, toca no fim da recompensa), via
`audioplayers`. **Não migrados nesta tarefa**: o giro não existe aqui; o
`totem_finish.mp3` não teve origem/licença confirmada nem audição humana
contra o pedido (som fantasioso e encantador, brilho final, sem náusea), e
exigiria um plugin de áudio novo. Gancho pronto: `CampusMapView.onPucStopClaimed`
(hoje atualiza o XP; é onde tocar o som). Candidato para avaliação humana:
`totem_finish.mp3` (sha256 `be037330…b9a0`).

## Testes

| Onde | Cobre |
|---|---|
| `test/pucstops-xp.integration.spec.ts` (PostGIS real, `pucmaps-12` ativa) | zero PucStops (lista vazia); colunas (uuid, sem `versao_id`/`origem`); CRUD: aluno 403 e sem token 401 em todas as rotas, escrita inexistente em `/mapa/pucstops`, região do campus, criação, `criado_por` (nulo para o coordenador mockado; `usuarios.id` quando existe), 400 de validação, 422 fora do campus, edição de nome/XP/raio/posição refletida no público, edição inválida sem efeito, desativar/reativar idempotente, sem DELETE; histórico: coleta e ledger antigos intactos após mudar XP/posição/nome, novo XP só para novas coletas, posição antiga fora do alcance, desativar não apaga coletas/ledger e bloqueia coleta, DELETE barrado por FK; coleta: 401/403, 400, perto, limite ±5 cm, longe, precisão, inativo, inexistente/id legado, 409, 20 simultâneas, simultâneas diferentes, `/me/xp`, paginação, `/me/pucstops`, saldo = ledger, somente inserção, CHECKs, rollback; migration: 503 sem versão ativa, recusa de rollback com dados, up/down/up |
| `src/gamificacao/gamificacao.spec.ts` | `usuarioDoToken`; ledger sem transação |
| `scripts/publicar-assets-mapa.spec.ts` | totem só em `models/pucstops/`; manifesto r3 |
| `code/front/test/pucstops.test.mjs` | cliente HTTP (rotas, JWT, erros 403/422), validação, diff do PATCH, ponto no polígono, círculo da geofence, lista/estado/ações, modal de exclusão, mapa indisponível |
| `campus_map/test/campus_pucstop_test.dart` | modelo (só UUID; id legado recusado), distância, manifesto (só o modelo), camadas, controller (zero PucStops, recarga: criado aparece / movido muda / inativo some e fecha o card, recarga sem rede, coleta em PucStop novo, falhas, cancelamento), card |
| `test/pucstops_api_test.dart` (app) | contrato HTTP, lista vazia, id legado ignorado, erros, timeout, XP na home e no perfil |

## E2E visual no emulador (17/10/2026)

> Histórico: executado com os totens legados, **antes** da mudança para
> cadastro pela coordenação. Não foi refeito com o CRUD.

Android emulator (`emulator-5554`), APK debug com `MAPBOX_ACCESS_TOKEN` e
`MAP_ASSETS_BASE_URL` (r3) por `--dart-define` (lidos do `.env` local, sem
imprimir), API local contra o banco Docker, usuária demo Camila (0 XP no
início), GPS por `adb emu geo fix` em pontos calculados com `ST_Project`.

| Verificação | Resultado |
|---|---|
| Visão geral | 8 pontos laranja; extrusões; logo e ⓘ do Mapbox |
| "Minha localização" | permissão pedida sob demanda (enquanto em uso); puck no ponto do GPS |
| 3D / vegetação / props | prédios LOD0, árvores, carros e área esportiva da r3; totens 3D (GLB `models/pucstops/`, só existe na r3) com rótulo "nome · +XP" |
| Picking | toque na base do totem abre o card certo |
| B — 120 m da Biblioteca | "Fora de alcance: aproxime-se", "A 120 m · raio de 40 m", sem botão de coleta |
| C fora — 42 m | "A 42 m · raio de 40 m", fora de alcance |
| C dentro — 38,5 m | "Você está no alcance", "A 39 m"; coleta → "XP coletado!", "+50 XP · total 50 XP"; ponto verde "✓ Biblioteca Central"; log da API sem coordenada |
| A — 10 m da Praça | "A 10 m · raio de 38 m"; coleta → "+30 XP · total 80 XP" |
| 2º claim | card "Já coletado" sem botão; mesmo claim via HTTP → 409 `ja-coletado`; `/me/xp` = 80 |
| XP no app | Perfil "★ 80 XP"; Início "Seus pontos 80 XP · 80 / 2.000" |
| Reabrir o app | coletados continuam verdes (de `/me/pucstops`) |
| Reentrada Perfil → Mapa → Perfil → Mapa | mapa, pontos e estados recriados; sem erro do app no logcat |
| Busca | "Biblioteca" → "Biblioteca Padre Alberto Antoniazzi - P. 26" |
| Rota | "2 min a pé · 180 m", linha até a entrada; card de rota e de PucStop não se sobrepõem |
| Attribution | diálogo com © Mapbox, © OpenStreetMap, telemetria, privacidade |

**Defeito encontrado e corrigido no E2E:** depois da coleta, a parte
translúcida do totem (anéis/joia, materiais com transmissão) continuava
desenhada sobre o ponto verde, embora o filtro da camada já excluísse o
PucStop. `CampusPucStopLayer.show` agora recria a camada do totem quando os
dados mudam (o GLB fica no cache do style; sem novo download). Revalidado no
cenário A: sem resíduo.

## Auditoria de coerência nome × posição (revisão final, 17/10/2026)

> Histórico: esta auditoria motivou o descarte dos totens legados. A tabela
> recomendada abaixo **não será aplicada**; serve de sugestão para a
> coordenação ao cadastrar os PucStops reais.

Fontes: `mapa.predios`/`mapa.areas` da versão ativa `pucmaps-12` (mesmos nomes
dos footprints OSM), grafo de caminhos, POIs do basemap Mapbox Streets v8
(Tilequery, raio 80 m) e a lista original do PUCMaps. Distâncias geodésicas
(PostGIS `geography`) até o polígono do prédio/área. Nenhum dado foi alterado.

Critério: **NOME INCORRETO** = o lugar do nome não existe no dataset/basemap,
mas a posição é um ponto aberto e alcançável; **POSIÇÃO SUSPEITA** = o lugar
existe, em outro ponto; **AMBOS SUSPEITOS** = o nome não bate e a posição é
ruim (dentro de prédio, longe dos caminhos ou sem referência).

| id | Nome atual | lat, lon | Raio | XP | O que há no ponto | Lugar do nome no dataset | Classificação |
|---|---|---|---|---|---|---|---|
| `totem_entrada_principal` | Entrada Principal | -19.9239, -43.9921 | 45 | 20 | dentro do Jardim Dom Cabral (1,9 m); P84 Centro de Espiritualidade a 7 m (entrada a ~13 m); P1 PROGRAD 30 m | nenhuma portaria perto: Portaria 2 a 232 m, Portaria 1 a 311 m | NOME INCORRETO |
| `totem_biblioteca` | Biblioteca Central | -19.9226, -43.9940 | 40 | 50 | P61 SECOM 14 m; Arena da PUC 20 m | Biblioteca P26 a **193 m** | POSIÇÃO SUSPEITA |
| `totem_praca_alimentacao` | Praça de Alimentação | -19.9221, -43.9933 | 38 | 30 | **dentro** do polígono "Estacionamento" (0 m); P42 34 m | Cantina P16 a 51 m; Restaurante Universitário a 133 m | POSIÇÃO SUSPEITA |
| `totem_capelinha` | Capelinha | -19.9218, -43.9944 | 35 | 40 | Estacionamento 21 m; Portaria 10 24 m; nenhum POI nomeado em 80 m | nenhuma capela; Centro de Espiritualidade P84 a 342 m | AMBOS SUSPEITOS |
| `totem_patio_engenharia` | Pátio de Engenharia | -19.9243, -43.9955 | 40 | 45 | P52 (sem função no dataset) 5,6 m | IPUC (Inst. Politécnico) P09 a 145 m, P10 a 164 m | NOME INCORRETO (não verificável: depende da função real do P52) |
| `totem_auditorio` | Auditório Principal | -19.9228, -43.9958 | 40 | 40 | P20 (Pós-Letras/Escola de Teatro) 47–50 m; **47 m do caminho mais próximo** (o pior do conjunto); nenhum POI em 80 m | Teatro João Paulo II P30 a 478 m | AMBOS SUSPEITOS |
| `totem_medicina` | Bloco de Medicina | -19.9215, -43.9920 | 40 | 45 | P53 6 m; P27 12 m; P60 Cisal–ICBS 19 m | nenhum prédio de Medicina no dataset nem no basemap | NOME INCORRETO |
| `totem_estacionamento_central` | Estacionamento Central | -19.9246, -43.9943 | 45 | 25 | **dentro** do "Estacionamento Docentes e Funcionários" (1,3 m), a 0,1 m de um caminho | o próprio estacionamento | CORRETO (nome genérico) |
| `totem_reitoria` *(inativo)* | Reitoria | -19.9233, -43.9948 | 40 | 35 | dentro do P45 Clínica de Odontologia | nenhuma reitoria no dataset | AMBOS SUSPEITOS |
| `totem_campo_esportes` *(inativo)* | Campo de Esportes | -19.9250, -43.9935 | 50 | 35 | dentro do P47 | área esportiva (âncora do GLB) a ~440 m; Arena da PUC a 226 m | AMBOS SUSPEITOS |

Fonte de todos: `_fallbackTotems` (`totem_remote_datasource.dart`, PUCMaps
commit `69b2de0`), copiados sem alteração. Resumo dos 8 ativos: **1 CORRETO**,
**3 NOME INCORRETO**, **2 POSIÇÃO SUSPEITA**, **2 AMBOS SUSPEITOS**.

Ambiguidades que dependem de decisão humana:

- "Entrada Principal" está a 13 m da entrada do Centro de Espiritualidade
  (P84) — o lugar religioso mais próximo de qualquer totem. Pode ser que
  "Capelinha" e "Entrada Principal" tenham sido trocados na origem; o dataset
  não permite confirmar.
- A função do Prédio 52 e a existência de uma "capelinha" não mapeada no OSM
  só podem ser confirmadas por quem conhece o campus.
- "Auditório Principal" pode significar o Teatro João Paulo II (P30) ou a
  Escola de Teatro (P20).
- Mover pontos pode criar sobreposição de raios (ex.: IPUC P09 fica a ~50 m do
  `estacionamento_central`, raios 40 + 45).

### Tabela recomendada (proposta — NÃO aplicada)

Mantém ids (nenhuma coleta foi feita no Supabase, mas ids estáveis evitam
retrabalho), raio e XP da origem. Posições propostas = entrada do prédio no
`pucmaps-12` (campo `entradas`).

| id | Nome proposto | Posição proposta | Ativo | Observação |
|---|---|---|---|---|
| `totem_entrada_principal` | Jardim Dom Cabral | manter (-19.9239, -43.9921) | sim | alternativa: "Centro de Espiritualidade – P84"; mover para uma portaria só se "entrada" for essencial |
| `totem_biblioteca` | Biblioteca Padre Alberto Antoniazzi – P26 | entrada do P26 (-19.9209329, -43.9932976) | sim | alternativa sem mover: renomear para "Arena da PUC" |
| `totem_praca_alimentacao` | Cantina – Prédio 16 | entrada do P16 (-19.9225444, -43.9929118) | sim | alternativa: Restaurante Universitário (-19.9232805, -43.9937301) |
| `totem_capelinha` | — | — | **não** | inativar até confirmar uma capela real; não reaproveitar o P84 (colide com o Jardim Dom Cabral) |
| `totem_patio_engenharia` | Prédio 52 *(ou nome confirmado)* | manter | sim | confirmar a função do P52 |
| `totem_auditorio` | Teatro João Paulo II – P30 | entrada do P30 (-19.923252, -43.9911518) | sim | alternativa: "Escola de Teatro – P20" na entrada (-19.9235249, -43.9959081) |
| `totem_medicina` | Cisal – ICBS (Prédio 60) | manter (19 m do P60) ou entrada do P60 (-19.9212929, -43.9920437) | sim | — |
| `totem_estacionamento_central` | Estacionamento Docentes e Funcionários | manter | sim | — |
| `totem_reitoria` | — | — | não | continua inativo |
| `totem_campo_esportes` | Área esportiva | perto da âncora do GLB esportivo (-19.92181, -43.99085), fora das quadras | a decidir | hoje inativo |

## Limitações

- GPS falsificado (mock location) não é detectável pelo servidor; a geofence
  impede só a coleta "de longe" com o app honesto.
- `criado_por` fica nulo enquanto o coordenador for mockado
  (`dados/dados.ts`; não existe em `usuarios`). Quando houver coordenador em
  `usuarios`, o mesmo código grava o `usuarios.id` (testado).
- Sem trilha de quem **editou** (só quem criou e `atualizado_em`); o ledger e
  as coletas continuam sendo a fonte auditável do XP.
- Coletas desta versão não guardam coordenada; não há como auditar "onde" o
  usuário estava (decisão de privacidade).
- O limite do campus vem da versão ativa do mapa no momento da escrita:
  trocar a versão não revalida PucStops já cadastrados (só ao editar a
  posição ou reativar).
- O seletor da web exige mouse/toque (sem posicionamento por teclado).
- Ler o GPS no emulador para coletar leva alguns segundos
  (`LocationAccuracy.high`); o card mostra "Coletando…" nesse intervalo.
- O selo "Nível N" e a "Missão do dia" da home continuam sendo exemplos fixos
  (não há regra de nível; fora do escopo).

## Pendências

1. A coordenação cadastrar os primeiros PucStops reais pela web (produção
   está vazia de propósito).
2. Configurar `VITE_MAPBOX_ACCESS_TOKEN` no build da web de produção (e
   liberar a origem dela nas restrições de URL do token).
3. Coordenador em `usuarios` para `criado_por` deixar de ser nulo (hoje é
   mockado em `dados/dados.ts`).
4. Decisão sobre o som.
5. Corrigir a linha `MAP_ASSETS_BASE_URL` do `code/back/api/.env` local, que
   está com o prefixo repetido (`MAP_ASSETS_BASE_URL=MAP_ASSETS_BASE_URL=…`);
   o script do E2E tolerou, mas outras ferramentas podem ler o valor errado.
