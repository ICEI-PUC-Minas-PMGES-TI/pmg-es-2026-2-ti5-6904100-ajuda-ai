# Integração do PR #73 com a Sprint-6

Validação local em 27/11/2026. Base integrada: `Sprint-6` em `d5820e7`; PR antes da integração: `4d3fd37`. A integração foi feita por merge, preservando o histórico das duas branches.

As correções posteriores sobre identidade/prazo das operações e atualização incremental do chat estão em [revisao-operacoes-chat-pr-73.md](revisao-operacoes-chat-pr-73.md). Os números abaixo registram a validação da integração inicial.

## Mudanças analisadas

- [PR #70](https://github.com/ICEI-PUC-Minas-PMGES-TI/pmg-es-2026-2-ti5-6904100-ajuda-ai/pull/70): XP, moedas e desfechos de resgate. As permissões passam pela participação e pelos vínculos atuais; a fixture dos testes SQL da lojinha foi adaptada ao contrato `vinculosAtuais`, sem substituir as regras da aplicação.
- [PR #71](https://github.com/ICEI-PUC-Minas-PMGES-TI/pmg-es-2026-2-ti5-6904100-ajuda-ai/pull/71): ambientes, hospedagem e login demo protegido. Foram preservadas as validações de ambiente, chave demo, cliente HTTP e workflows. O cálculo compilado foi exercitado na imagem Docker de produção.
- [PR #75](https://github.com/ICEI-PUC-Minas-PMGES-TI/pmg-es-2026-2-ti5-6904100-ajuda-ai/pull/75): missões e notificações. Foram preservados os avisos após decisões de candidatura, o sino real, a navegação entre ciclos e a atualização de perfil. As fixtures de missões agora criam vínculos pelo domínio canônico, com grupo, compatibilidade e responsável, e enviam mensagens com `clientId`.

Os PRs #72 e #74 permaneciam abertos e não faziam parte de `Sprint-6`. Não foram integrados.

## Resolução dos conflitos

- `participacoes.service.ts`: mantém `VinculosService` e o acesso a `NotificacoesService` via `ModuleRef`. As decisões notificam após a transação; as escritas de vínculo continuam no domínio único.
- `tela_home.dart`: mantém o acesso às conversas e substitui o sino fictício pelo sino real da sprint.
- `tela_perfil.dart`: um único listener atualiza dados ao trocar de ciclo/conta e preserva a edição em andamento; a atualização de estado ocorre em microtask e o listener é removido no descarte.

Também foram conferidos os merges automáticos de cadastro, cliente web, layout do aluno, sessão e navegação mobile.

## Correções da revisão

1. Os e2e de autenticação, cadastro, requisitos e F02/F07 carregam o grafo real dos módulos com um `DataSource` completo em memória. Os testes de etapas recebem o domínio canônico de vínculos, configuração, compatibilidade e responsável autenticado. Não foi removida a dependência de produção nem restaurada a criação legada de vínculos.
2. Pontuação de todos os pares, filtragem, alocação e relatório executam no worker. As transações apenas preparam a fotografia e revalidam as entradas antes de publicar. Configuração, vínculos, decisões e encerramento alterados durante o cálculo continuam impedindo publicação desatualizada. O prazo de 60 segundos encerra o worker, inclusive durante a pontuação.
3. A web consulta a rodada até observar `concluida` ou `falha` após perder a resposta do POST. Retoma uma rodada em andamento ao abrir a página, continua após falhas transitórias de rede e descarta respostas após troca de contexto/sessão. Uma perda da resposta HTTP não é apresentada como falha definitiva do cálculo.

## Verificações

- API completa com PostgreSQL/PostGIS e RabbitMQ locais: **1.414 aprovados, 2 com falha, 16 ignorados**, mais uma suíte que não inicializa. As falhas remanescentes também foram reproduzidas na Sprint-6 original; detalhes abaixo.
- As cinco suítes apontadas na revisão: **98/98 aprovados**.
- Integrações de matching: **10/10 PostgreSQL**, **2/2 migrations**, **2/2 HTTP/SSE**; transporte RabbitMQ real: **3/3**.
- Missões/notificações: **227 aprovados e 1 falha de carga**, também reproduzida na base.
- Navegador Chrome com três sessões: conversa, preservação de rascunho e transferência aprovadas. Teste adicional reteve o POST por 13 segundos: o cliente atingiu o timeout real de 12 segundos e acompanhou a rodada até a conclusão, sem erro definitivo na tela.
- Web: **208/208 aprovados** e build Vite aprovado.
- App: **453 aprovados e 1 falha de golden**; pacote `campus_map`: **319/319 aprovados**. `flutter analyze` sem problemas.
- Tipos de produção/testes (`tsc --noEmit`), build Nest e lint sem erros. O lint ainda informa três avisos em arquivos herdados da sprint.
- Build Docker de produção aprovado; cálculo real de um par executado dentro da imagem, confirmando a resolução dos módulos JS do worker.
- Medição local na imagem Docker: **30.000 pares pontuados, 300 sugestões em 6.782 ms**; monitor de 20 ms registrou **336 batimentos**, com maior intervalo de **21 ms** no processo principal. É uma medição sintética local, não um SLA da aplicação.

Ambiente local: Node 24.11.1, Flutter 3.47.5, PostgreSQL 16/PostGIS 3.5 e RabbitMQ 4. A imagem de produção utiliza Node 24 Alpine. Não foram atualizados manifests nem versões dos lockfiles por esta integração.

## Limitações reproduzidas na Sprint-6 original

- `mapa-api.integration.spec.ts`: a suíte não inicializa. Sua montagem de teste não registra todas as dependências atuais do módulo do mapa.
- `mapa-banco.integration.spec.ts`, cenário A: a lista parcial de migrations da fixture deixa seis diferenças com as entidades (versão/encerramento de formulário, verificação acadêmica, ciclo do feed e resposta a comentário). As mesmas seis diferenças aparecem na base; o cenário B passa.
- `missoes-notificacoes.integration.spec.ts`: o caso de 200 check-ins simultâneos termina com `ECONNREFUSED` neste ambiente, tanto na base quanto na integração. Os demais 227 casos passam na integração. Não há evidência suficiente para atribuir a falha ao sistema ou ao ambiente; esse nível de concorrência continua sem aprovação.
- `missoes_preview_test.dart`: dez comparações de imagem falham dentro de um único teste. A execução isolada da Sprint-6 original falha nas mesmas imagens. Os goldens não foram sobrescritos para forçar aprovação.

Essas limitações impedem afirmar que a suíte completa está verde ou garantir ausência de defeitos. Não foi executado deploy, não foram aplicadas migrations no banco compartilhado e não foi gerado APK. Login Microsoft/Entra e Azure Storage não são cobertos pela jornada de navegador com identidades locais.

## Repetição

Use um PostgreSQL/PostGIS descartável, com `search_path` incluindo `public, extensions`, e RabbitMQ local. Nunca aponte as variáveis de teste para homologação ou produção: algumas suítes criam e removem bancos de nomes fixos.

Na pasta `code/back/api`, configure `MAPA_TEST_DB_URL`, `FEED_TEST_DB_URL` e `MATCHING_TEST_DB_URL` para o servidor descartável, `MATCHING_TEST_DB_ISOLATED=true` e `FEED_TEST_RABBITMQ_URL` para o broker local. Para a jornada de navegador, configure `MATCHING_BROWSER_MODULE` com o módulo Playwright externo e `MATCHING_BROWSER_EXECUTABLE` com o executável do Chrome.

Execute `npm ci --no-audit --no-fund`, `npx tsc --noEmit`, `npm run lint`, `npm run build` e `npx vitest run --maxWorkers=2`. Na web, execute `node --test test/*.test.mjs` e `npm run build`. No app, execute `flutter analyze`, `flutter test` e, em `packages/campus_map`, `flutter test`.

O PR continua sujeito a nova revisão da equipe. Antes de publicar a aplicação, conferir as migrations pendentes no ambiente e seguir o fluxo manual de migrations da sprint.
