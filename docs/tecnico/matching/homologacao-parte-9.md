# Parte 9 — homologação e correções finais

Validação de 24/11/2026. Esta entrega é incremental sobre a parte 8 e permanece sem commit. O banco utilizado foi um cluster PostgreSQL 16.13 criado exclusivamente no workspace, sem credenciais nem dados da aplicação.

## Correções encontradas na homologação

1. A migração de grupos incluía vínculos inconsistentes de outro ciclo no contador do padrinho. O contador agora utiliza somente relações que receberam um grupo canônico válido; a inconsistência permanece registrada para conciliação.
2. Chats privados que o legado desativava ao encerrar um vínculo ficavam inacessíveis. A migração restaura a consulta somente dos privados de origem canônica validada. Os períodos limitam o histórico ao encerramento do vínculo; isso não autoriza novos envios. Participantes adicionais de chats legados não ganham acesso por essa associação.
3. O cálculo de alocação ocupava o event loop da API. Ele agora executa em `worker_threads`, importando o mesmo algoritmo, com cancelamento após 60 segundos e encerramento da thread ao concluir ou falhar.
4. O cálculo também mantinha locks do ciclo. Agora há leitura consistente em transação curta, cálculo sem transação aberta e publicação em nova transação. Antes de publicar, a API confere novamente ciclo, execução, configuração, formulários, participantes, vínculos e decisões de pares. Mudanças invalidam a rodada, que termina como falha sem publicar sugestões parciais ou substituir pendências anteriores.
5. No mobile, a montagem das telas de perfil/vínculos iniciava notificações síncronas que podiam atualizar outra tela durante seu build. A consulta inicial foi deslocada para depois do primeiro frame. A preferência de gênero passou a respeitar a largura disponível e a declaração acadêmica ganhou seu próprio Material, preservando a interação do checkbox.
6. O cartão de perfil ainda apresentava um padrinho e contagem fixa de um. Agora informa todos os padrinhos presentes na resposta do ciclo e sua quantidade. Há regressão específica para dois padrinhos.

Os testes antigos do mobile foram atualizados para os contratos atuais: sessão autenticada no feed, declaração de primeiro período, preferência de gênero, rótulos de ações, seleção do ciclo vigente, rolagem do seletor demo e tipos comuns separados dos tipos de matching. Não foi relaxada a autenticação nem desativada a validação de cadastro.

## Matriz de evidências

| Área | Verificação executada |
|---|---|
| Migrações | Cadeia real de 14 migrações de cadastro/matching/chat/feed em schema vazio; nova execução sem alterações |
| Legado | Importação única de recusa com motivo/responsável e decisão anterior intacta; múltiplos padrinhos; vínculo fora do ciclo; chat sem origem; integrante indevido; histórico anterior/posterior ao encerramento |
| Vagas | Aprovação sugerida contra vínculo manual e duas transferências para a última vaga, usando pools independentes |
| Atomicidade | Falha controlada no chat provoca rollback de vínculo, períodos e auditoria; nova tentativa preserva a intenção |
| Idempotência | Mesmo UUID de transferência ou de mensagem concorrente gera um resultado e um evento |
| Histórico | Entrada, saída e retorno não expõem mensagens da ausência; recibos pertencem a cada destinatário |
| Execução | Envio de chat por outra conexão enquanto a rodada calcula; alteração de vínculo, configuração ou encerramento impede publicação desatualizada |
| HTTP/SSE | Duas instâncias Nest com conexões distintas; JWT continua o mesmo após transferência; stream antigo comunica perda de envio; histórico permanece limitado |
| Feed | Transferência troca a autoridade de moderação; aluno aprovado conserva leitura; encerramento suspende comandos |
| Outbox | Falha de confirmação mantém evento no PostgreSQL; recuperação publica o mesmo ID; dois workers respeitam `skip_locked` |
| Navegador | Chrome com três contextos isolados; conversa entre aluno e padrinho; atualização sem perder rascunho; transferência pela tela da coordenação; chat anterior para consulta; novo padrinho após reload |
| Mobile | Suíte completa, incluindo imagens, cadastro, coordenação, navegação, perfil, matching, feed e chat |

O teste de navegador utiliza o frontend real, controllers e serviços de negócio reais e PostgreSQL. Somente a identidade é preparada localmente, com JWT de teste e perfil sintético derivado da participação; não é uma homologação do login Microsoft ou do Azure Storage.

## Desempenho

Medição local do alocador, Node 24.11.1, capacidade de três alunos por padrinho e um vínculo por aluno. Grafos completos com empate e pontuações variadas:

| Padrinhos | Apadrinhados | Pares avaliados | Empate | Pontuações variadas |
|---:|---:|---:|---:|---:|
| 20 | 60 | 1.200 | 42 ms | 56 ms |
| 50 | 150 | 7.500 | 505 ms | 793 ms |
| 100 | 300 | 30.000 | 4.841 ms | 7.622 ms |

Na execução do worker compilado em `dist`, 30 mil pares produziram 300 alocações em 7.941 ms. O processo principal registrou 251 heartbeats, com intervalo máximo de 33 ms num monitor de 20 ms. Essas medidas mostram o custo da alocação e a liberação do event loop; não representam SLA, teste de carga da aplicação inteira ou limite universal de participantes. Pontuação, criação de arestas e persistência também consomem tempo.

## Resultado final

- Backend: 631 testes aprovados em 63 arquivos; três testes AMQP ignorados em um arquivo. Os aprovados incluem 14 testes PostgreSQL/HTTP e uma jornada de navegador.
- Web: 166 testes aprovados.
- Mobile: 386 testes aprovados na suíte completa; `dart analyze lib test` sem problemas.
- Builds Nest e Vite, checagem de tipos de produção/testes e lint dos arquivos alterados aprovados. Vite mantém o aviso de tamanho do bundle do mapa; o build termina com sucesso.
- O driver `pg` emite aviso de depreciação para consultas paralelas no mesmo cliente transacional. Não houve erro de SQL, deadlock ou falha nas disputas exercitadas; a adoção de uma futura versão principal do driver exige revisar esse padrão.

## Como repetir

Use um PostgreSQL de teste acessível ao usuário informado. O helper exige as duas variáveis abaixo e cria schemas aleatórios `matching_test_<uuid>`. Ele não usa `synchronize` nem o schema da aplicação e remove somente o schema gerado pelo próprio teste.

```powershell
cd code/back/api
$env:MATCHING_TEST_DB_URL = 'postgresql://USUARIO:SENHA@127.0.0.1:5432/BANCO_TESTE'
$env:MATCHING_TEST_DB_ISOLATED = 'true'
npm run build
npx vitest run src test/feed.e2e.spec.ts test/matching.integration.spec.ts test/matching-migracoes.integration.spec.ts test/matching-http.integration.spec.ts --no-file-parallelism --maxWorkers 1
```

O banco deve ter permissão para criar schema e instalar as extensões exigidas pelas migrações iniciais. No ambiente desta entrega, o cluster é separado do banco do projeto e a URL não contém senha. A cadeia de 14 migrações cobre as dependências destes testes; não inclui a cadeia espacial completa do mapa/PostGIS.

Para navegador, instale `playwright-core` em uma pasta de ferramentas e informe seu diretório absoluto, além de um executável Chrome/Chromium disponível. O teste inicia Vite e API em portas locais livres e encerra ambos ao terminar:

```powershell
$env:MATCHING_BROWSER_MODULE = 'CAMINHO_ABSOLUTO/node_modules/playwright-core'
$env:MATCHING_BROWSER_EXECUTABLE = 'CAMINHO_ABSOLUTO/chrome.exe'
npx vitest run test/matching-browser.integration.spec.ts --no-file-parallelism --maxWorkers 1
```

Para RabbitMQ real, use um broker de teste e acrescente `FEED_TEST_RABBITMQ_URL`. O teste `test/feed.integration.spec.ts` foi atualizado para usar as migrações e os vínculos canônicos reais. Ele fica explicitamente ignorado quando falta essa URL ou a configuração do PostgreSQL isolado. Os eventos de teste usam exchange e filas com nomes exclusivos por schema.

```powershell
$env:FEED_TEST_RABBITMQ_URL = 'amqp://USUARIO:SENHA@127.0.0.1:5672'
npx vitest run test/feed.integration.spec.ts --no-file-parallelism --maxWorkers 1
```

No mobile, as dependências foram obtidas com `pub get --enforce-lockfile`, preservando as versões:

```powershell
cd code/mobile
flutter test --no-pub --concurrency=1
dart analyze lib test
flutter build apk --debug --no-pub
```

## Limites restantes

- APK: a tentativa avançou usando o Gradle local, mas falhou na resolução de artefatos Android/Google (`Permission denied: getsockopt`). Nenhum APK desta entrega foi produzido ou homologado em emulador/dispositivo.
- Broker: RabbitMQ não estava disponível e o daemon Docker não respondeu. O teste de transporte AMQP real continua pendente; recuperação da outbox no PostgreSQL com publicador controlado e os streams HTTP foram executados separadamente.
- Banco da aplicação, backup/restauração de produção, Entra ID, Azure Storage e PostGIS não foram exercitados. As migrações novas foram corrigidas ainda nesta entrega sem commit; se uma instalação externa já as tiver aplicado, ela precisa de atualização corretiva específica, pois o TypeORM não reaplica migrações concluídas.
- R13 continua uma decisão de produto em aberto: a capacidade de múltiplos padrinhos por apadrinhado foi preservada, sem criar exclusividade silenciosa. Os pesos continuam definidos pela coordenação.

## Aplicação da entrega

As partes 0–8 foram conferidas na pasta original antes desta etapa. A parte 9 é entregue como patch incremental porque a pasta do GitHub Desktop está fora dos diretórios autorizados para escrita nesta sessão. A cópia de trabalho contém as alterações sem commit. Não houve commit, push, troca de branch ou migração no banco do projeto.

Antes de aplicar o patch na pasta original, `git apply --check` precisa passar. O patch não deve ser reaplicado depois de incorporado. O commit continua a cargo da autora, conforme solicitado.
