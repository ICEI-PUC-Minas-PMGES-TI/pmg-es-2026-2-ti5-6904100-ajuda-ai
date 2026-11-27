# Conquistas (F32)

A coordenação define as conquistas; o servidor confere o progresso real do
aluno e desbloqueia. O cliente nunca marca uma conquista como obtida.

## Migration

`1795300000000-CriaConquistas` (schema `gamificacao`):

- `conquistas`: `nome` (até 80), `descricao` (até 500), `imagem_url`
  (opcional, `https://`; a API grava o protocolo em minúsculas, então
  `HTTPS://` também é aceito), `criterio`, `meta`, `publico` (`TODOS`,
  `PADRINHOS`, `APADRINHADOS`), `programa_codigo` (nulo = todos os ciclos;
  FK para `programas`, RESTRICT), `xp` (0 a 50), `ativa` e `publicada_em`.
  CHECKs repetem as regras da API: critério suportado, meta na faixa do
  critério, `APADRINHADOS` + `FEED_PUBLICACOES` recusado, XP no teto e
  `ck_conquistas_publicada` (ativa sempre tem `publicada_em`).
- `conquistas_desbloqueios`: só de inserção (gatilhos barram UPDATE, DELETE
  e TRUNCATE). UNIQUE (`conquista_id`, `usuario_id`, `contexto`): o mesmo
  aluno não desbloqueia duas vezes no mesmo contexto. Guarda a `meta`, o
  `progresso` e o XP da época (`xp_configurado`, `xp_creditado`,
  `movimentacao_id`); CHECK exige `progresso >= meta`.
- Ledger: tipo `CONQUISTA` no CHECK de `xp_movimentacoes`.
- O rollback recusa se já houver desbloqueio ou XP de conquista no extrato.

## Critérios suportados

Fonte única: `src/gamificacao/conquistas/conquistas.ts`
(`DEFINICAO_CRITERIOS`). Critério fora da lista responde 400.

| Critério | Contexto | Meta | Como o servidor conta |
|---|---|---|---|
| `MISSOES_CONCLUIDAS` | ciclo | 1–50 | Conclusões em `missoes_conclusoes` no ciclo |
| `PUCSTOPS_COLETADOS` | ciclo | 1–50 | Coletas em `pucstop_coletas` no ciclo |
| `FEED_PUBLICACOES` | ciclo | 1–50 | Publicações do aluno no feed do ciclo com 10+ caracteres ou foto (só para quem pode publicar: padrinho com dupla) |
| `FEED_COMENTARIOS` | ciclo | 1–50 | Posts diferentes de colegas comentados no ciclo com 10+ caracteres |
| `NIVEL_ALCANCADO` | `GERAL` | 2–10 | Nível do XP acumulado |

- **Contexto**: nos critérios de ciclo, o desbloqueio vale para o semestre
  (outro semestre pode desbloquear de novo); no nível, vale para a carreira
  (`GERAL`, uma vez só).
- O progresso conta o semestre inteiro, com as mesmas regras de tamanho
  mínimo das missões. Uma conquista publicada no meio do semestre
  reconhece o que o aluno já fez no ciclo.

## Quando desbloqueia

`ConquistasService.sincronizar` confere as conquistas publicadas e
elegíveis (público do papel, programa nulo ou igual ao ciclo, critério ao
alcance) que o aluno ainda não tem no contexto, e desbloqueia as que têm a
meta cumprida. Roda:

- em `GET /me/conquistas` (a coleção);
- depois do commit de `POST /me/missoes/:id/concluir` e de
  `POST /mapa/pucstops/:id/claim`;
- depois do commit de `POST /publicacoes` e de
  `POST /publicacoes/:id/comentarios` (`aposAtividadeNoFeed`), **no ciclo da
  publicação**: quem cumpre a meta no fim do semestre e só volta no seguinte
  não perde a conquista nem o XP do semestre anterior;
- em `GET /me/xp` (Início e Perfil leem o XP ao abrir: é quando o nível, que
  não tem gancho próprio, libera conquistas).

Uma falha na conferência só gera log: nunca derruba a missão, a coleta ou o
XP. Só quem participa do ciclo (`podeColetarTotens`) desbloqueia; quem não
participa vê só as já obtidas.

Cada desbloqueio roda numa transação com a carteira do aluno travada
(`travarCarteira`): consultas simultâneas do mesmo aluno se enfileiram, e o
UNIQUE do desbloqueio e o da chave do ledger barram o repetido. A conquista é
relida (`FOR SHARE`): arquivada no meio, não desbloqueia. Os avisos
(`CONQUISTA_DESBLOQUEADA` e, se for o caso, `NIVEL_SUBIU`) são gravados **na
mesma transação**: se a gravação falhar, desbloqueio e XP são desfeitos e a
próxima consulta tenta de novo, sem conquista sem aviso no sino.

O XP de uma conquista pode subir o nível e liberar uma conquista de nível,
cujo XP sobe o nível de novo. A conferência repete enquanto o nível sobe, até
`PASSADAS_MAX` = `NIVEIS.length` (10) passadas: o nível sobe no máximo 9
vezes, então a cadeia inteira sai na mesma consulta.

## XP

- Só por regra explícita: `xp` da definição (padrão 0, só a medalha; teto
  `LIMITES.porConquista` = 50).
- Crédito por `creditarGanho()` com fonte `CONQUISTA`, tipo `CONQUISTA` no
  ledger e chave `conquista:<id>:<usuario>:<contexto>`, separada da chave da
  missão (`missao:...`): concluir missões nunca credita a missão de novo, e
  a conquista é creditada uma vez por contexto.
- Entra no teto geral do ciclo (1.500 XP), como totens e missões; não usa o
  teto semanal de missões. Com o teto cheio, a conquista é desbloqueada com
  `xp_creditado = 0`.

## Rotas da coordenação: `/coordenacao/conquistas`

Perfil `coordenador` (aluno recebe 403). Tela "Conquistas" do painel web
(`ConquistasPage.jsx`).

- `GET /` (`?estado=rascunho|publicada|arquivada`), `GET /:id`: com
  `criterioTexto`, `estado`, `desbloqueios` (uso) e `podeExcluir`.
- `GET /criterios`: critérios suportados (rótulo, contexto, faixa da meta).
- `POST /`: `nome`, `descricao`, `imagemUrl`, `criterio`, `meta`, `publico`
  (padrão `TODOS`), `programaCodigo` (padrão todos), `xp` (padrão 0) e
  `publicar`. Regra inválida: 400 `regra-invalida`.
- `PATCH /:id`: com o `atualizadoEm` que a tela mostrava (409
  `conquista-alterada` se outra pessoa editou antes). Depois da primeira
  publicação só mudam nome, descrição e imagem; critério, meta, público,
  programa e XP respondem 409 `conquista-publicada` com a lista `campos`.
- `POST /:id/publicar` e `POST /:id/arquivar`: idempotentes;
  `publicada_em` guarda a primeira publicação. Rascunho não é arquivado (409
  `conquista-rascunho`).
- `DELETE /:id`: 204 só sem uso; com desbloqueios, 409 `conquista-em-uso`
  (arquive).

## Rota do aluno: `GET /me/conquistas`

JWT de aluno cadastrado. Resposta:

- `obtidas`: todas as do aluno (de qualquer ciclo, inclusive de definições
  arquivadas, com `arquivada: true`), com `criterioTexto` da meta da época,
  `contexto`, `xpCreditado` e `desbloqueadaEm`;
- `disponiveis`: publicadas e elegíveis ainda não obtidas, com
  `criterioTexto`, `xp` e `progresso { atual, meta }`;
- `novas`: desbloqueios desta consulta (o aviso da tela), como
  `{ id, contexto }`. A mesma conquista obtida em dois semestres aparece duas
  vezes em `obtidas`; web e app comparam id **e** contexto para marcar só a
  nova.

## Notificação

`CONQUISTA_DESBLOQUEADA`, chave `conquista:<id>:<contexto>` (um aviso por
desbloqueio), link `/conquistas` (web: `/aluno/conquistas`; app: tela de
conquistas). Subir de nível pelo XP da conquista também gera `NIVEL_SUBIU`.

## Telas

- Web (coordenação): `ConquistasPage.jsx`, com filtros por estado, criar e
  editar (campos congelados travados depois da publicação), publicar,
  arquivar e excluir só sem uso.
- Web (aluno): `ConquistasAlunoPage.jsx` no menu lateral: coleção, critério e
  barra de progresso; aviso quando há conquista nova.
- App (aluno): `tela_conquistas.dart`, aberta por "Minhas conquistas" nos
  acessos rápidos do Perfil e pela notificação.

## Testes

- `src/gamificacao/conquistas/conquistas.spec.ts`: regras puras.
- `test/conquistas.integration.spec.ts`: banco real (todas as migrations,
  HTTP, ledger e notificações). Pulado sem `MAPA_TEST_DB_URL`.
- Web: `code/front/test/conquistas.test.mjs`. App:
  `code/mobile/test/conquistas_test.dart`.
