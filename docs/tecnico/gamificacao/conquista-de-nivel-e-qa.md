# Animação de novo nível e painel de testes (QA)

## Animação de conquista

Mesma sequência na web (`code/front/src/components/levelup/`) e no app
(`code/mobile/lib/widgets/celebracao_nivel.dart`), cerca de 3,4 s:

| ms | fase |
| --- | --- |
| 0–650 | overlay escurece; o emblema real do nível salta (escala + elástico); brilho surge |
| 650–1650 | giro de 360° em Y com perspectiva: frente iluminada, verso escurecido, reflexo sobre a arte |
| 1650–2550 | onda, raios, estrelas, faíscas e confetes; "NOVO NÍVEL ALCANÇADO!" e o nível |
| 2550–3400 | efeitos somem; o emblema fica em destaque até "Continuar" |

- Emblemas: os PNGs de `code/mobile/assets/gamificacao` (a web os publica por
  `publicDir`). Nível sem arte própria mostra um disco com o número.
- Partículas: gerador com semente pelo número do nível, igual nas duas
  plataformas (o mesmo nível sempre tem a mesma explosão).
- Sons: `assets/gamificacao/sons/{giro,conquista,brilho}.wav`, sintetizados por
  `code/front/scripts/gerar-sons-conquista.mjs` (sem amostras de terceiros).
  Botão de silenciar na própria animação e no painel. Web: o áudio só toca se o
  navegador permitir (sem gesto, a animação segue em silêncio). App:
  `audioplayers`, sem tomar o foco de áudio e respeitando o modo silencioso.
- Movimento reduzido (sistema, ou "sem animações" do Ajuda-aí na web): sem
  giro, partículas nem raios; emblema e textos aparecem com fade.

## Quando aparece (fluxo real)

Fonte de verdade: o servidor.

- `gamificacao.celebracoes_nivel` guarda o último nível celebrado por usuário
  (migration `1795500000000-CelebracoesNivel`). Sem linha = nível 1. A
  migration preenche o nível atual de quem já tem XP, para que a implantação
  não dispare conquistas antigas.
- `GET /me/xp` devolve `celebracao: { de, para, nome, niveisAvancados }` quando
  o nível real passou do celebrado; senão `null`.
- `POST /me/xp/celebracoes { nivel }` confirma a exibição. O servidor grava
  `GREATEST(atual, min(pedido, nível real))`: idempotente, nunca retrocede,
  nunca passa do XP real e não mexe em XP, moedas, ledger ou coletas.

Consequências:

- recarregar a página ou reabrir o app não repete a animação;
- quem viu no app não vê de novo na web (e vice-versa);
- subir vários níveis de uma vez gera uma só animação, do nível final, com
  "Você avançou N níveis de uma vez";
- XP reduzido por correção administrativa não gera nova celebração ao
  recuperar o nível;
- offline: nada é lido, nada aparece; a conquista fica pendente no servidor e
  aparece na próxima leitura com rede. Se a confirmação falhar depois de a
  animação aparecer, ela é reenviada na próxima leitura e a mesma animação não
  volta nesse meio-tempo (guarda local de 10 min na web; em memória no app).
- Sem a migration aplicada, `GET /me/xp` responde normalmente com
  `celebracao: null` (nada quebra).

Onde é exibida: web, em qualquer página do aluno (`AlunoLayout`, relê ao voltar
para a aba); app, na casca logada (`AppShell`), inclusive logo após coletar um
totem no mapa (a recompensa "+XP" aparece antes).

## Painel de testes da gamificação (QA)

Para ver qualquer nível sem precisar de várias contas.

- Web: menu do aluno › **Testes de gamificação** (`/aluno/testes-gamificacao`).
- App: Perfil › Acessos rápidos › **Testes de gamificação**.

Funções: lista os níveis da tabela real (`NIVEIS`, sem limite fixo), mostra o
emblema, o XP exigido e o próximo limiar; simula o cartão de perfil do nível
(mesmo componente do perfil real, com selo "Simulação") com a barra em qualquer
posição; compara com outro nível; reproduz a animação quantas vezes quiser
(inclusive simulando subida de vários níveis); "Reiniciar teste" volta ao
nível real e apaga o estado temporário.

### Segurança

- API: `GET /qa/gamificacao/acesso` e `GET /qa/gamificacao/simulacao` (só
  leitura; não há rota de escrita). Guard no servidor: JWT válido + e-mail em
  `GAMIFICACAO_QA_EMAILS` + conta existente em `usuarios` com o mesmo `sub`.
  Painel desligado → 404; conta fora da lista → 403.
- Em produção só liga com `GAMIFICACAO_QA_PRODUCAO=true` além da lista.
- Sem credencial no código: a conta entra pelo login normal (Microsoft, ou
  login demo fora de produção). A interface esconde o atalho e a rota quando a
  API nega.
- A simulação é calculada em memória (`nivelDe`) e a animação manual não chama
  `POST /me/xp/celebracoes`: nada no banco muda.

### Como acessar

Não há conta dedicada: o painel é liberado para contas que já existem.

1. Na API (`code/back/api/.env`), liste os e-mails autorizados:

   ```
   GAMIFICACAO_QA_EMAILS=camila@pucminas.edu.br,lucas.almeida@pucminas.edu.br
   ```

   Em produção, use contas Microsoft reais e `GAMIFICACAO_QA_PRODUCAO=true`.
2. Reinicie a API (o modo watch recarrega sozinho).
3. Entre com uma dessas contas (login demo em desenvolvimento) e abra o painel.

## Ativação no banco compartilhado

O banco compartilhado também tem outras migrations pendentes, de outras frentes
(`CriaChats`, `MatchingManualVinculoOrigem`, `GaranteRestaurantesOficiaisCampus`).
Um `npm run migration:run` aplicaria todas. Para ativar só a celebração:

```
cd code/back/api
npm run celebracoes:aplicar                           # pré-voo, só leitura
npm run celebracoes:aplicar -- --confirmar=<DB_HOST>  # aplica
```

O script roda tabela, backfill e registro em `migrations` numa única transação
(com `lock_timeout`), confere o número de linhas do backfill e recusa um
`--confirmar` que não repita o `DB_HOST` do `.env`. Depois dele, um
`migration:run` futuro não reaplica esta migration e aplica só as outras.

O que muda no banco:

- cria `gamificacao.celebracoes_nivel` (`usuario_id` PK e FK para
  `usuarios.id` com `ON DELETE CASCADE`, `nivel_celebrado` ≥ 1, `atualizado_em`);
- insere uma linha por carteira com XP ≥ 50 (o nível atual, para não haver
  animação de conquistas antigas);
- insere um registro em `feed.migrations`.

Nada é alterado em `usuarios`, `xp_carteiras`, `xp_movimentacoes`,
`pucstop_coletas`, recompensas ou resgates. Sem RLS e sem acesso para
`anon`/`authenticated`, como as demais tabelas de `gamificacao`.

Ordem recomendada: migration antes do backend novo. O backend antigo ignora a
tabela; subidas de nível nesse intervalo são celebradas quando o backend novo
entrar. (Na ordem inversa, as subidas do intervalo são absorvidas pelo
backfill, sem animação.)

### Recuperação

```
npm run celebracoes:aplicar -- --reverter --confirmar=<DB_HOST>
```

Remove a tabela e o registro numa transação; XP, moedas e ledger não mudam. O
backend novo continua funcionando sem a tabela (`celebracao: null`; a
confirmação responde 503 e o cliente tenta de novo depois). Como a tabela só
guarda estado de apresentação, perder seu conteúdo não perde dado de negócio:
reaplicar refaz o backfill.

### Validação

`test/celebracoes.integration.spec.ts` roda contra PostgreSQL 17 + PostGIS
descartável (instruções no topo do arquivo): migration sobre dados existentes,
subida por totem, vários níveis, confirmações simultâneas, correção de XP,
down/up e falha no meio da migration.
