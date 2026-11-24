# Parte 7 - feed, moderação e permissões

Entrega de código em 24/11/2026, sem commit. Complementa o [plano original](plano-original.md) e o [progresso geral](progresso.md). Os 30 arquivos da parte 6 foram conferidos na pasta original, normalizando finais de linha. O patch desta etapa é incremental sobre esse estado.

## Regras entregues

| Situação do aluno no ciclo atual | Ler feed | Comentar e curtir | Publicar | Moderar comentários de outra pessoa |
|---|---|---|---|---|
| Aprovado, aguardando vínculo | Sim | Sim | Não | Não |
| Padrinho com vínculo canônico válido | Sim | Sim | Sim, em formação/andamento com inscrições fechadas | Somente dos seus apadrinhados atuais |
| Padrinho que perdeu o último vínculo | Sim, se continua aprovado | Sim | Não | Não |
| Apadrinhado com vínculo | Sim | Sim | Não | Não |
| Participação revogada, encerrada ou fora do ciclo atual | Não | Não | Não | Não |
| Ciclo em encerramento | Não | Não | Não | Não |

A coordenação mantém suas permissões administrativas e consulta de semestres anteriores. A seleção de semestre de histórico não muda o ciclo que concede permissão ao aluno. O autor pode excluir seu próprio conteúdo enquanto mantém acesso ao feed; autoria não permite contornar revogação ou encerramento. A coordenação continua podendo remover conteúdo histórico.

Transferir um apadrinhado remove a autoridade do padrinho antigo sobre os comentários desse aluno, inclusive os escritos antes da transferência. O novo padrinho passa a ter a autoridade correspondente ao vínculo atual. Se o padrinho antigo ainda acompanha outros alunos, conserva publicação e moderação somente desses outros alunos. Nenhuma movimentação reatribui autores, modifica textos ou apaga publicações e comentários.

Um padrinho pode ter vários apadrinhados. Não foi introduzida restrição de um único padrinho por apadrinhado: continuam valendo as capacidades configuradas nas etapas anteriores.

## Mapeamento do plano

| Item | Implementação |
|---|---|
| P7-01 | Predicado compartilhado em `participacoes/vinculos-atuais.ts`, reutilizado pelo chat e pela consulta canônica de participações. `PermissoesAlunoService.contexto` calcula permissões e apadrinhados a partir do mesmo contexto. A escolha do registro principal é compartilhada e determinística. |
| P7-02 | Aprovados do ciclo atual continuam lendo e interagindo sem exigir grupo ou par. |
| P7-03 | Publicação exige papel efetivo de padrinho, participantes elegíveis, vínculo canônico e ciclo liberado. A decisão é repetida dentro da transação antes de gravar conteúdo e outbox. |
| P7-04 | Moderação consulta os vínculos atuais dentro da transação. A transferência troca a autoridade sem renovação do JWT. |
| P7-05 | Movimentações não alteram autoria nem conteúdo do feed; regressão preserva os registros antes/depois da mudança de vínculo. |
| P7-06 | Nome de grupo, contador projetado e claim de papel no JWT não concedem publicação ou moderação. Ausência de fonte canônica não habilita fallback de autorização. |
| P7-07 | Web e mobile revalidam permissões por eventos, retorno ao primeiro plano e consulta periódica de dez segundos. Respostas de contexto anterior são descartadas. Perda de acesso limpa conteúdo da tela; perda de publicação fecha o editor. |
| P7-08 | SSE autorizado revalida antes de cada evento e a cada dois segundos, fecha na revogação/expiração e filtra o semestre dos eventos. Mudanças de autoridade geram nova revisão de permissões. |
| P7-09 | Permissões são sempre do ciclo atual calculado pelo servidor. Consulta histórica do coordenador tem escopo separado; o parâmetro do cliente não autoriza um aluno. |
| P7-10 | Testes de chamadas diretas ao serviço e HTTP/Nest com JWT: transferência, publicação, exclusão, leitura, upload, revogação, encerramento e consulta a outro semestre. |

## Fonte de autoridade e transações

Uma relação atual exige vínculo ativo no mesmo ciclo, identidades distintas, papéis corretos, participações em andamento e ausência de término. As duas pontas são conferidas; uma linha ativa apontando para pessoa de outro ciclo, papel divergente ou participação encerrada não concede autoridade.

`ParticipacoesService.vinculosAtuais` consulta essa relação sem recorrer à string `grupo`. As consultas de pessoas vinculadas e a verificação de vínculo em ambiente com banco usam a mesma regra. Caminhos legados de apresentação que ainda existem não são utilizados pelo cálculo de permissões do feed. Grupo nulo ou rótulos divergentes também não retiram acesso de uma relação canônica válida, o que preserva o suporte a múltiplos grupos.

Criar e alterar conteúdo bloqueia primeiro o registro do ciclo e depois a publicação, acompanhando a ordem usada nas movimentações do matching. Publicação, interação e moderação são revalidadas com o `EntityManager` dessa transação. Uma permissão verificada pelo guard antes da transferência não basta para gravar depois dela. O evento correspondente continua sendo persistido na outbox junto ao comando; falha desfaz os dois.

As leituras do serviço também verificam acesso, além dos guards HTTP. Assim, chamadas internas diretas a lista, detalhe e curtidores não contornam a restrição. Exclusão de autoria própria exige participação válida, e não somente igualdade do e-mail com o autor.

## Contratos e eventos

`GET /publicacoes/permissoes` conserva os quatro booleanos e acrescenta `programa` e `revisao`. A revisão é um hash do contexto, incluindo a autoridade de moderação. Transferir apenas um aluno pode mudar a revisão mesmo que o padrinho continue podendo publicar. O resumo e os eventos de permissão não expõem os e-mails dos apadrinhados.

`GET /publicacoes/events` usa Bearer no cabeçalho. O parâmetro opcional `programa` delimita o semestre consultado pela coordenação; um aluno não pode usá-lo para receber eventos de outro ciclo. O stream emite:

- `feed.permissions`: resumo atualizado, quando a revisão muda;
- `feed.access`: perda de acesso, seguida de encerramento da conexão;
- `feed.ready` e `feed.heartbeat`: conexão e ressincronização;
- eventos de publicação/comentário/curtida: somente do semestre autorizado, sem texto, identidade ou URL de mídia.

Eventos novos da outbox incluem `programaCodigo`, inclusive após exclusão da publicação. O consumidor RabbitMQ preserva apenas os campos permitidos. Eventos legados sem semestre continuam válidos para processamento da outbox, mas seu identificador de publicação não é encaminhado ao stream autorizado. A consulta periódica dos clientes recupera o estado persistido sem depender da chegada desses eventos antigos ou da disponibilidade do broker.

Rajadas recebidas durante uma consulta de autorização são agrupadas em uma solicitação de ressincronização completa, evitando perder posts ao substituir apenas um ID pendente. Consulta de autorização em voo não pode emitir depois do cancelamento ou da expiração. O stream mantém os mecanismos existentes de deduplicação, heartbeat e limpeza de assinaturas.

## Web e mobile

A web consulta permissões antes do conteúdo. Troca de conta ou semestre invalida respostas pendentes; comandos e uploads antigos não atualizam o novo contexto. Revogação limpa lista, editor e confirmação. A consulta periódica funciona somente com a página visível e também é acionada ao recuperar foco. A recuperação de acesso permite reabrir o stream sem novo login.

O Flutter usa `FeedAccess` para descartar consultas antigas e negar permissões de outra conta mesmo antes da resposta seguinte. Falha de rede suspende novos comandos sem inventar que a participação foi revogada. O feed atualiza permissões em primeiro plano, interrompe o stream ao sair dele e revalida ao retornar. Conta, semestre e geração da consulta protegem a lista, os detalhes e as respostas de comandos. A folha de comentários aberta lê a permissão atual e limpa o rascunho ao perder interação.

Foram ajustadas as respostas simuladas dos testes antigos que forneciam somente `podePublicar`, para representar o contrato completo de leitura/interação. O cenário de conta somente do mapa passa a esperar ausência de conteúdo. Esses ajustes não constituem validação executada da tela completa neste ambiente.

## Validação e pendências

- Web: 155 testes passaram, incluindo 16 no arquivo de feed. Casos novos verificam revogação, suspensão de publicação, contexto antigo e encerramento do stream. Build Vite aprovado, com o aviso existente de tamanho dos bundles.
- Mobile: 64 testes selecionados passaram, incluindo os 12 novos de acesso/stream/folha e sete da folha de comentários. Também foram executadas as regressões selecionadas de chat e matching. Análise Dart dos arquivos alterados aprovada.
- Backend: 608 testes passaram em 57 arquivos, reunindo a suíte de `src` e os testes HTTP do feed. Incluem regras de domínio, fluxo real de transferência no repositório em memória, SSE e transações simuladas. Build Nest, tipos de produção/testes e lint aprovados.
- HTTP utiliza aplicação Nest e requisições reais locais, mas repositórios em memória. Não é prova de locks PostgreSQL, concorrência entre conexões ou entrega com RabbitMQ real.
- `gal` e `path_provider` continuam ausentes da configuração de dependências mobile. A tela completa do feed, seus testes que importam o aplicativo inteiro e o APK não foram homologados. Os 64 testes não incluem esses fluxos completos.
- Não houve conexão com dados reais nem execução de migração. A parte 7 não acrescenta migration; as migrações anteriores e a conciliação de dados legados continuam pendentes de validação em banco isolado. Não misturar instâncias antigas e novas da API ao ativar os controles de acesso.

A próxima etapa é a parte 8: revisão da experiência completa em web/mobile, incluindo estados e atualização de home, perfil e vínculos. A parte 9 continua responsável pela homologação com PostgreSQL, broker e contas reais de teste.
