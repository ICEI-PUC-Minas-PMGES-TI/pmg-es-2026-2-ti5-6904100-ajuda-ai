# Parte 8 - experiência de matching em web e mobile

Entrega de código em 24/11/2026, sem commit. A parte 7 foi conferida na pasta original antes de começar. Este documento complementa o [plano original](plano-original.md) e o [progresso geral](progresso.md). Implementação e testes locais não substituem a homologação integrada da parte 9.

## Correções da revisão

O mobile descartava a lista `padrinhos` retornada pela API e as telas dos participantes mostravam apenas o primeiro padrinho. O modelo agora conserva todos os vínculos, seus grupos e identificadores. Web e mobile mostram a lista completa e oferecem atalhos para o privado do vínculo e o coletivo do grupo. Um padrinho continua podendo acompanhar vários apadrinhados.

IDs exatos também resolvem uma conversa histórica autorizada. A busca por e-mail continua limitada a privados ativos; um ID inválido não faz a interface escolher outra pessoa como alternativa. No mobile, uma abertura agendada para o quadro seguinte não pode usar o resultado de uma consulta já substituída.

A situação do aluno usa as mesmas relações canônicas na lista e no estado apresentado. Ciclo encerrado deixa de anunciar participante aprovado como ativo; os vínculos e as decisões históricas não são reescritos. Candidatura rejeitada continua identificada como rejeitada. A API informa `podeConversar`, e as telas distinguem envio liberado de consulta ao histórico. Lista canônica vazia não recupera um padrinho singular antigo.

Antes de executar, a coordenação vê quantos participantes têm os dados de cada critério e quem tem pendências, incluindo condições obrigatórias. A visão também valida o contrato da configuração com o mesmo avaliador usado pelo comando: uma configuração inválida não é anunciada como pronta para executar. Participação com data de término não entra nas contagens de elegíveis.

## Mapeamento do plano

| Item | Situação |
|---|---|
| P8-01 | Mantidos capacidade, pesos, condições obrigatórias e equilíbrio por qualidade, com diagnóstico anterior à rodada. |
| P8-02 | A premissa R13 não foi confirmada. Não foi removida a capacidade de vários padrinhos por apadrinhado. |
| P8-03 | `diagnosticoDados` na visão da API e componentes web/mobile com contagens por papel e pendências por participante. |
| P8-04 | Preservados aderência, cobertura, motivos e ocupação atual/projetada das partes anteriores. |
| P8-05 | Comparação e dados dos critérios permanecem restritos à coordenação; respostas atrasadas de outro detalhe são descartadas. |
| P8-06 | Relatório destaca padrinhos sem apadrinhados confirmados, além de alunos sem sugestão, causas e ocupação. Consulta de destinos continua oferecendo alternativas viáveis para transferência. |
| P8-07 | Preservados estados distintos de execução, decisão e validade; erros de configuração e dados ausentes não são anunciados como execução pronta. |
| P8-08 | Lista de recusas, reconsideração justificada e histórico da parte 4 mantidos e incluídos na regressão. |
| P8-09 | Grupos e transferência da parte 5 mantidos; revisão inclui troca de ciclo, capacidade, compatibilidade e conflito. |
| P8-10 | Atualização de participantes em segundo plano, com proteção por conta, ciclo e sequência; rascunhos não são apagados pela consulta periódica. |
| P8-11 | Novos clientes enviam `versaoBase` ao salvar configuração. Conflito retorna 409 e exige carregar a configuração atual antes de salvar novamente. |
| P8-12 | Preferência de gênero e atributos de vivência já coletados foram preservados. Novas preferências individuais ou exclusividade ainda não aprovadas não foram inventadas. |
| P8-13 | Estados de espera, vínculo, alteração dos relacionamentos e encerramento refletidos nas telas; transferência atualiza as pessoas/grupos apresentados. |
| P8-14 | Atalhos por `vinculoId` e `grupoId` em ambos os clientes; testes verificam que não se abre simplesmente a primeira conversa. |
| P8-15 | Web atualiza o contexto compartilhado. Mobile atualiza a sessão e os componentes de home/perfil/vínculos sem substituir as páginas por carregamento. Feed e conversas mantêm sua própria revalidação de acesso. |
| P8-16 | Espera, erro, ausência de dados, sessão expirada e encerramento separados. 401/403 limpam dados protegidos; falha de rede conserva o último estado confirmado. |

## Atualização dos participantes

A web consulta perfil, programas e permissões do feed antes de aplicar a situação do ciclo selecionado. A atualização periódica ocorre a cada dez segundos com a página visível e também ao recuperar foco ou navegar. A consulta em segundo plano conserva o conteúdo montado, evitando fechar uma conversa ou apagar um formulário. Troca de conta ou ciclo invalida respostas anteriores. Falha de rede informa que a atualização não foi concluída; não transforma estado desconhecido em ausência de participação.

O feed usa sua permissão efetiva no ciclo atual, separada do semestre histórico escolhido para perfil e vínculos. Consultar um semestre antigo não remove nem concede esse acesso por inferência da tela.

O mobile compartilha a revalidação na casca de navegação e na tela de vínculos. Consultas lentas não se sobrepõem, pausam fora do primeiro plano e retomam ao voltar. Home e perfil ouvem mudanças reais da sessão. Edição de perfil não é sobrescrita por uma consulta periódica, mas troca de conta descarta o rascunho anterior. Resposta de autorização 401/403 limpa participação, vínculos e token; erro de rede mantém o último valor confirmado.

A sessão importava telas completas apenas para usar enums e diagnóstico de navegação. Esses tipos foram movidos para arquivos próprios e reexportados pelos caminhos anteriores, preservando os consumidores. Isso permitiu executar os testes reais da sessão sem carregar dependências de toda a interface. Nenhuma dependência do projeto foi acrescentada ou substituída.

## Configuração e qualidade dos dados

`GET /coordenacao/matching?programa=...` acrescenta `diagnosticoDados`, com a versão da configuração, critérios, contagens de dados por papel e pendências por participante. Contagem de dados não é score, afinidade nem garantia de um par viável. `false` em ProUni/cidade é informação conhecida, distinta de ausência. Preferência de gênero exige informação válida da preferência e do gênero da pessoa para a conferência completa. Perguntas do catálogo usam as mesmas referências de formulário e versão utilizadas pelo matching.

O diagnóstico não executa uma rodada nem modifica respostas. Não oferece complementação silenciosa de candidaturas históricas. Pendência de condição obrigatória é destacada; ausência em preferência ponderada não vira uma nova proibição global.

`PUT /coordenacao/matching/config` aceita `versaoBase`, inteira não negativa. A comparação ocorre sob o lock do ciclo e da configuração vigente. Se outra sessão já salvou, o servidor retorna 409 sem gravar nova versão nem sobrescrever a atual. A web conserva a versão usada ao abrir o editor mesmo se receber uma visão mais recente. O mobile envia a versão do formulário aberto. Ambos oferecem **Carregar configuração atual**; conflito não é apresentado como sucesso.

O campo permanece opcional no servidor para compatibilidade com consumidores antigos. A proteção contra edição sobre uma versão desatualizada depende do envio de `versaoBase`; os novos editores o enviam sempre. Migração conjunta dos clientes é necessária para aplicar essa garantia a todas as edições.

## Validação e limites

- Backend: 614 testes passaram em 58 arquivos, reunindo `src` e HTTP/Nest do feed. Os seis casos novos cobrem diagnóstico, elegibilidade terminada, visão coerente, conflito de configuração, múltiplos vínculos e encerramento. O ajuste final que preserva rejeição em ciclo encerrado passou na repetição direcionada desses seis casos.
- Web: 166 testes passaram, incluindo 11 novos de experiência, contexto e seleção da conversa. Build Vite aprovado; permanece o aviso de tamanho dos bundles. Os testes de componentes React usam renderização no servidor, não duas sessões reais em navegador.
- Mobile: 92 testes selecionados passaram. Incluem dez novos de modelo/widgets/revalidação, quinze de sessão, seleção de grupo/privado, conflito 409 no editor e regressões anteriores de matching, feed e chat. Rascunho preservado, consulta lenta, pausa/retorno, largura de 320 pixels e expiração da sessão foram exercitados.
- Build Nest, verificação de tipos de produção/testes, lint do backend e análise Dart dos arquivos alterados aprovados, sem problemas pendentes nesses checks.
- A aplicação mobile inteira e o APK continuam sem homologação neste ambiente, pelas dependências `gal` e `path_provider` ausentes. O desacoplamento da sessão ampliou o escopo executável, mas não elimina essa limitação.
- Nenhuma migration foi criada ou executada nesta parte. Migrações anteriores, dados legados, locks entre conexões PostgreSQL, RabbitMQ e a jornada com duas contas de aluno e uma de coordenação permanecem para a parte 9. Repositório em memória não prova concorrência no banco real.

O patch desta parte é incremental sobre a parte 7. A pasta original foi somente lida. Branch, HEAD e índice real são preservados; nenhum commit ou push foi criado. A próxima etapa é a homologação integrada da parte 9.
