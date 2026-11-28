# Parte 6 - conversas e acesso por vínculo

Entrega de código em 24/11/2026, sem commit. Complementa o [plano original](plano-original.md) e o [progresso geral](progresso.md). Os arquivos da parte 5 foram conferidos na pasta original antes desta implementação. A migração foi preparada, mas não foi executada.

## Comportamento entregue

Cada vínculo tem uma conversa privada e cada grupo canônico tem uma conversa coletiva. Um padrinho com três apadrinhados participa de três privados e de um coletivo. O grupo conserva sua identidade quando fica vazio; uma transferência encerra o privado de origem e altera os membros dos coletivos de origem e destino. Criação de conversas, atualização dos períodos de acesso e alteração do vínculo acontecem na mesma transação. Falha na criação do coletivo também desfaz a criação do vínculo e do privado.

As telas web e mobile consultam a API real. Os atalhos **Conversar** abrem a conversa privada correspondente; a lista diferencia privados, grupos e históricos. Envio, recebimento e leitura dependem de respostas do servidor. Não há resposta simulada de outro participante.

## Mapeamento do plano

| Item | Entrega e verificação |
|---|---|
| P6-01 | Revisada a referência local `origin/Arthur_Luiz`, commit `a691a579c8866c6e7c6d8458217d2017212d6357`. Foram aproveitados os contratos de rotas, autenticação Bearer do stream e organização da interface. A branch não foi incorporada integralmente; suas permissões não atendiam ao acesso temporal por vínculo. Não se afirma que essa referência seja a versão remota mais recente. |
| P6-02 | Privado único por vínculo; criação repetida devolve a mesma conversa. |
| P6-03 | Coletivo único por ID estável do grupo, compartilhado pelos vínculos ativos daquele padrinho. |
| P6-04 | Membros atuais derivados dos vínculos, participações e ciclo; rótulo do grupo, linhas antigas de participantes e dados do JWT não concedem acesso por si sós. |
| P6-05 | Transferência fecha os períodos de origem e abre os de destino atomicamente. Mensagens futuras da origem deixam de ser visíveis para quem saiu. |
| P6-06 | Histórico limitado à união dos períodos de participação, preservando lacunas entre saída e retorno. |
| P6-07 | Envio depende de ciclo liberado, inscrições fechadas, vínculo ativo e participantes elegíveis. Encerramento permite apenas o histórico autorizado; revogação de elegibilidade não mantém acesso pelo JWT antigo. |
| P6-08 | Stream revalida o acesso no servidor a cada dois segundos, encerra na expiração do token e sinaliza mudança para consulta autenticada. |
| P6-09 | Efeitos de vínculo e chat persistidos na mesma transação PostgreSQL. Revisão, mensagens e recibos são duráveis; reconexão recupera dados por HTTP. Esse caminho não depende de RabbitMQ nem anuncia processamento da outbox legada. |
| P6-10 | Destinatários fotografados no envio; entrega e leitura individuais, com leitura somente da página consultada. Atualizações condicionais preservam leituras concorrentes. |
| P6-11 | Flutter integrado à API, paginação, eventos autenticados, repetição idempotente e ciclo de vida do aplicativo. Web usa o mesmo contrato. |
| P6-12 | Testes automatizados de domínio, transporte e widgets, incluindo reconexão e revogação. Duas sessões reais com PostgreSQL, migração e concorrência entre processos permanecem para a parte 9. |

## Entrada, saída e histórico

`chat_periodos` registra limites pelos IDs das mensagens da própria conversa. O limite de entrada é exclusivo e o de saída é inclusivo. O lock do ciclo serializa envio e movimentação, impedindo que uma mensagem seja classificada em um intervalo indefinido. Os períodos são unidos para consulta sem preencher a lacuna entre eles.

| Momento da mensagem no coletivo | Pessoa que entrou, saiu e retornou |
|---|---|
| Antes da primeira entrada | Não vê |
| Durante a primeira participação | Vê, inclusive depois de sair |
| Entre a saída e o retorno | Não vê |
| Depois do retorno, enquanto participante | Vê |

Quem saiu conserva o histórico autorizado em modo de leitura. A resposta não revela a lista atual de membros de um coletivo antigo nem a revisão de mensagens futuras. Nome do remetente é registrado pelo servidor nas mensagens novas. Conversas privadas antigas conservam a identificação do par original. Dados históricos não são apagados durante a transferência.

Períodos abertos só dão acesso com relação canônica válida. Em ciclo encerrado, a consulta histórica também aceita as participações concluídas daquela relação; isso não reabre envio. Relações divergentes não ganham autorização apenas porque uma linha antiga de período continua aberta. Negação de acesso remove conteúdo protegido das telas. Troca de conta ou ciclo invalida respostas pendentes e limpa mensagens, rascunho e envio pendente.

## Mensagens, leitura e reconexão

Cada mensagem recebe um `clientId` UUID gerado pelo cliente. Repetir autor, conversa, UUID e texto devolve a mesma mensagem, sem duplicar destinatários. Reutilizar o UUID com outro texto gera conflito. O cliente mantém a intenção após uma falha incerta e permite repetir o envio; não troca silenciosamente o identificador. A identidade do remetente é extraída da autenticação.

`chat_destinatarios` registra quem deveria receber a mensagem no instante do envio. Entrar depois não acrescenta destinatários retroativamente. Consultar a lista confirma entrega das mensagens autorizadas; consultar uma página confirma leitura somente das mensagens devolvidas para aquela pessoa. O estado agregado de leitura completa exige todos os destinatários previstos. Contagens individuais acompanham o agregado. O remetente não marca leitura em nome de outra pessoa.

As atualizações de recibos usam condições `IS NULL` e ordem crescente de IDs. Uma consulta de entrega que começou antes da leitura em outra sessão não pode gravar um objeto antigo e apagar essa leitura. O teste correspondente simula essa intercalação; a disputa real entre conexões PostgreSQL continua pendente.

O SSE usa `Authorization: Bearer`, sem token na URL. Emite `chat.ready`, `chat.changed`, `chat.access` e heartbeat, com metadados para atualização; o conteúdo vem da consulta HTTP autenticada. Há revalidação a cada dois segundos, heartbeat em quinze segundos e fechamento na expiração do JWT. Cada consulta e envio revalida o acesso imediatamente; o stream não é autoridade para permitir envio. A recuperação consulta os cursores em páginas de até 50 mensagens, inclusive quando mais de uma página chegou durante a desconexão.

A web cancela o leitor e as consultas ao sair da conversa. O mobile fecha a conexão ao ir para segundo plano, recupera mensagens ao voltar e reconecta com esperas progressivas de 3, 6, 12, 24 e até 30 segundos. A reconexão continua após falha de HTTP. Erros de acesso encerram as tentativas e limpam os dados protegidos. Os dois clientes mesclam mensagens pelo ID e preservam confirmações de leitura mais recentes quando respostas chegam fora de ordem.

## API

Todas as rotas exigem JWT de aluno. Nenhuma recebe uma identidade de remetente confiável do corpo ou da URL.

| Método e caminho | Finalidade |
|---|---|
| `GET /chats?programa=<codigo>` | Lista autorizada por ciclo, com tipo, histórico e não lidas. |
| `GET /chats/:id/participantes` | Participantes permitidos pelo contexto atual ou histórico. |
| `GET /chats/:id/mensagens?antesDe=<id>` | Histórico anterior, em páginas de até 50 mensagens. |
| `GET /chats/:id/mensagens?depoisDe=<id>` | Recuperação crescente; `0` é um cursor válido. Não pode ser combinado com `antesDe`. |
| `POST /chats/:id/mensagens` | Corpo `{ texto, clientId }`; valida autorização, texto e repetição. |
| `GET /chats/:id/events` | SSE autenticado com revalidação de acesso. |

O `clientId` permanece opcional no servidor para compatibilidade com clientes anteriores; somente requisições com esse identificador têm a garantia de repetição idempotente. As novas telas sempre o enviam. Texto tem limite de 4.000 caracteres.

## Migração e ativação

Migração: `1794500000000-ChatGruposAcesso.ts`. Acrescenta tipo, grupo e revisão às conversas; UUID e nome do remetente às mensagens; períodos de participação e recibos individuais. Define chaves estrangeiras e índices únicos para privados, coletivos, períodos abertos, destinatários e repetição de envio.

Privados anteriores são associados somente quando o vínculo canônico e o ciclo identificam um par coerente. Períodos encerrados usam o último ID autorizado, limitado pela data de encerramento do vínculo quando existente. O estado global antigo de entrega/leitura é importado apenas para o destinatário correto do privado. Coletivos novos começam vazios, a partir dos grupos canônicos atuais. Conversas sem origem validada são registradas em `chat_conciliacao` e não concedem acesso por semelhança de nomes. Mensagens antigas não são reescritas nem excluídas.

Antes de ativar a nova API, usar banco isolado com backup, manter `synchronize=false`, revisar `npm run migration:show` e executar as migrações pendentes das partes 4, 5 e 6 por `npm run migration:run`. Conferir vínculos, períodos e relatórios de conciliação antes de liberar o acesso. Não manter instâncias antigas e novas da API atendendo simultaneamente: as antigas não aplicam o novo controle temporal. O `down` recusa remoção automática de períodos e recibos; reversão exige plano de recuperação com backup.

Nenhum desses comandos de migração foi executado nesta entrega. O daemon Docker local não estava disponível. A migração ainda precisa ser exercitada em PostgreSQL, com dados de teste representativos e revisão da conciliação legada.

## Validação e limites

- Backend: 570 testes passaram em 55 arquivos da suíte de `src`, incluindo 20 casos de domínio do chat, transações simuladas, migração e metadados TypeORM sem conexão. Build Nest, verificação de tipos e lint dos arquivos alterados aprovados. Casos incluem múltiplos privados/coletivo, entrada, transferência, retorno com lacuna, revogação, encerramento, leitura individual, paginação, repetição de envio, SSE e corrida de recibos.
- Web: 149 testes passaram, incluindo nove de chat e transporte; build Vite passou. Há o aviso de tamanho de bundles já observado. Esses testes não equivalem a duas sessões reais no navegador.
- Mobile: 45 testes selecionados passaram, incluindo 13 de chat, transporte, widgets, reconexão e segundo plano. Análise Dart dos arquivos de integração e testes sem problemas. Suíte completa e APK permanecem limitados pelas dependências `gal` e `path_provider` ausentes no ambiente.
- A suíte usa repositório em memória com rollback e fila de transações. Ela verifica regras e efeitos, mas não prova a sintaxe executada no PostgreSQL, disputa de vagas, bloqueios ou ausência de deadlocks entre conexões reais.
- Faltam migração em banco isolado, transferência com dois usuários conectados, reconexão entre processos da API e verificação de permissões com dados persistidos. Não se declara o sistema 100% validado.

A próxima etapa é a parte 7: feed, moderação e permissões derivados dos vínculos canônicos. A parte 9 concentra a validação integrada em PostgreSQL e entre sessões reais.
