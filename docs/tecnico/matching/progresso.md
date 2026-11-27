# Matching — execução do plano

Atualização em 27/11/2026: integração com a Sprint-6 e correções da revisão do PR #73 concluídas e verificadas localmente. Resultados atuais, comparação com a base e limitações em [integracao-sprint-6-pr-73.md](integracao-sprint-6-pr-73.md). Os resultados abaixo registram a execução anterior, de 24/11.

Atualizado em 24/11/2026. Este acompanhamento complementa o [plano original](plano-original.md), preservado integralmente. O plano registra decisões acordadas, propostas e decisões ainda abertas; não representa funcionalidades já implementadas.

## Mapa completo

| Parte | Objetivo | Situação |
|---|---|---|
| 0 | Base Git, ambiente e diagnóstico reproduzível | Base local preparada; PostgreSQL isolado validado na parte 9; atualização remota continua sem autenticação confirmada |
| 1 | Eliminar travamento no algoritmo residual | Implementada e testada; alterações sem commit |
| 2 | Contratos do cadastro, fontes canônicas e integridade do catálogo | Implementada e aplicada na pasta original; detalhes em [contrato-parte-2.md](contrato-parte-2.md) |
| 3 | Pontuação explicável, cobertura, viabilidade e equilíbrio condicionado à compatibilidade | Implementada e aplicada na pasta original; detalhes em [pontuacao-equilibrio-parte-3.md](pontuacao-equilibrio-parte-3.md) |
| 4 | Validade de execuções, recusa persistente no ciclo e "Reconsiderar par" | Implementada e aplicada na pasta original; migração e concorrência validadas em PostgreSQL isolado na parte 9. Detalhes em [validade-recusa-parte-4.md](validade-recusa-parte-4.md) |
| 5 | Vínculo manual/sugerido unificado, grupos e transferência atômica auditada | Implementada e conferida na pasta original; migração, concorrência e rollback validados na parte 9. Detalhes em [vinculos-transferencias-parte-5.md](vinculos-transferencias-parte-5.md) |
| 6 | Chat privado/coletivo real e acesso ao entrar, sair ou encerrar | Código conferido na pasta original; migração, PostgreSQL e três sessões de navegador validados na parte 9. Detalhes em [comunicacao-acesso-parte-6.md](comunicacao-acesso-parte-6.md) |
| 7 | Feed, moderação e permissões coerentes com o vínculo | Implementada e conferida na pasta original; PostgreSQL e suíte mobile completa validados na parte 9; transporte AMQP real pendente. Detalhes em [feed-permissoes-parte-7.md](feed-permissoes-parte-7.md) |
| 8 | Experiência completa e consistente em web/mobile | Implementada e conferida na pasta original; homologação integrada web/PostgreSQL e suíte mobile concluídas na parte 9. Detalhes em [experiencia-parte-8.md](experiencia-parte-8.md) |
| 9 | PostgreSQL isolado, concorrência, migrações e testes do fluxo completo | Implementada e validada no escopo disponível; APK Android e transporte AMQP real pendentes. Detalhes em [homologacao-parte-9.md](homologacao-parte-9.md) |

## Regras preservadas

- Um padrinho pode ter vários apadrinhados, dentro da capacidade.
- Equilíbrio não justifica encaminhar alguém incompatível ao padrinho vazio.
- Preferências de gênero são declaradas separadamente do próprio gênero, e consideradas nos dois sentidos.
- ProUni e mudança de cidade valorizam a vivência compartilhada; dois “não” não ganham automaticamente esse benefício.
- Ausência de resposta é desconhecida, distinta de “não” e “sem preferência”.
- Executar matching gera sugestões; a coordenação confirma os vínculos.
- Recusa por ciclo e reconsideração foram implementadas na parte 4. Transferências auditadas e grupos canônicos foram implementados na parte 5. A parte 6 conecta chats privados/coletivos ao vínculo; a parte 7 conecta publicação e moderação no feed. Validação em ambiente real segue na parte 9.

## Decisões que permanecem abertas

Os pesos são escolhidos pela coordenação, sem ativação automática de novos critérios. Não foi fixada tolerância numérica para trocar compatibilidade por melhor distribuição, nem limite arbitrário de score. Preferência de gênero exclusiva não foi habilitada. Não foram alteradas capacidades por apadrinhado nem criadas restrições no banco sem resolver a premissa R13. Preferências individuais adicionais para ProUni/cidade e complementação auditada de candidaturas antigas dependem de política específica.

## Estado de entrega

Branch de trabalho: `fix/matching-estabilizacao-parte-0-1`, baseada em `ac9975c31161ef555fb71c6e378024dc66aca664` (referência local de `origin/Arthur_gv`). Nenhum commit ou push criado nesta etapa. O fetch remoto anterior não conseguiu autenticar; a base não é anunciada como a versão remota mais recente.

A pasta original do GitHub Desktop continua protegida contra escrita nesta sessão. Foi confirmado que as partes 0–8 estão aplicadas nela. O patch incremental da parte 9 deve ser aplicado sobre esse estado. A cópia de trabalho mantém as mudanças anteriores sem commit. Não foram usados dados reais nem executadas migrações no banco do projeto; a parte 9 criou e utilizou um cluster separado exclusivamente para homologação.


## Parte 3 entregue

Política `3.0.0`: condições obrigatórias explícitas; aderência, afinidade e cobertura separadas; comparação proporcional de apoio/interesses; ocupação confirmada e projetada; prioridade a novos alunos; equilíbrio entre soluções de mesma qualidade; relatório de alunos sem sugestão e fotografia dos dados da rodada. Não há tolerância para sacrificar diferenças de qualidade representáveis em favor da ocupação. O histórico anterior continua identificado como histórico.

A aplicação das condições obrigatórias na geração de arestas foi concluída na parte 3. A parte 4 acrescentou a revalidação na aprovação e tornou pendências antigas sem o novo contrato desatualizadas. A parte 5 levou o mesmo avaliador ao vínculo manual e à transferência; o fluxo completo não está encerrado.


Validação da parte 3: 502 testes no backend, 38 na web e 20 no mobile; builds, tipos, análise Dart e lint aprovados. Consulte a seção de validação da parte 3 para o escopo exato e as limitações ainda pendentes.

## Parte 4 entregue

Sugestões vinculadas aos insumos da execução, revalidação antes das decisões e motivos de obsolescência. Aprovações normais da mesma rodada preservam as sugestões restantes. Recusa persistente por par/ciclo e reconsideração justificada, com histórico preservado e nova rodada necessária. Repetições e conflitos tratados; recuperação por timeout não permite publicação tardia. Web e mobile mostram histórico, impedimentos e validade, com proteção contra respostas atrasadas de outro ciclo.

Validação: 528 testes no backend, 42 na web e 26 no mobile, nos escopos descritos em [validade-recusa-parte-4.md](validade-recusa-parte-4.md). Builds, tipos, lint e análise Dart aprovados. O SQL da migração e os metadados foram testados sem conexão. Migração e concorrência/deadlocks em PostgreSQL real continuam pendentes; a suíte mobile completa também não foi executada pelas limitações de dependências já registradas.

Antes de usar a API da parte 4, aplicar sua migração em banco isolado e validar a importação das recusas existentes. O patch da parte 4 foi confirmado na pasta original; não deve ser aplicado novamente.

## Parte 5 entregue

Domínio comum para criar vínculos sugeridos e manuais, com revalidação de compatibilidade, capacidades e impedimentos. Grupos com identidade estável, contadores derivados das relações canônicas e transferência em uma transação, com motivo, responsável, UUID e histórico. Repetições não duplicam vínculos ou chats; falhas preservam a origem. Web e mobile oferecem grupos, destinos com vagas/compatibilidade e ação de transferência.

Validação: 551 testes no backend, 46 na web e 32 no mobile, nos escopos descritos em [vinculos-transferencias-parte-5.md](vinculos-transferencias-parte-5.md). Build Nest/Vite, tipos e análise Dart aprovados; lint sem erros. A migração foi preparada com fotografia das projeções antigas e relatório de divergências, sem execução em banco. Casos apenas legados exigem conciliação em ambiente isolado; não são convertidos por adivinhação.

O patch `Ajuda_ai_Matching_Parte_5.patch` é incremental sobre a parte 4 e mantém tudo sem commit. Foi conferido na pasta original durante a parte 6; não deve ser aplicado novamente. Antes de usar a nova API, validar e aplicar as migrações em banco isolado.

## Parte 6 entregue em código

Privado por vínculo e coletivo por grupo estável, com criação e fechamento de períodos na mesma transação das movimentações. Consulta e envio revalidam os vínculos canônicos. Entrada não revela mensagens anteriores; saída conserva apenas o histórico do período; retorno não revela mensagens da ausência. Ciclo encerrado oferece consulta autorizada sem envio. Revogação impede acesso mesmo com JWT ainda válido.

Mensagens têm repetição por UUID, destinatários registrados no envio e leitura individual da página consultada. Atualizações condicionais impedem uma entrega atrasada de apagar leitura confirmada em outra sessão. Web e mobile usam API e stream autenticados, recuperam páginas após desconexão e limpam conteúdo ao perder acesso ou mudar de conta/ciclo. Os atalhos de conversa foram conectados aos privados reais.

Validação: 570 testes no backend em 55 arquivos, 149 na web e 45 selecionados no mobile, incluindo 13 de chat. Builds Nest/Vite, tipos, lint dos arquivos alterados e análise Dart aprovados. A suíte mobile completa e o APK continuam limitados pelas dependências ausentes. Consulte [comunicacao-acesso-parte-6.md](comunicacao-acesso-parte-6.md) para os contratos, escopo e limites das verificações.

A migração da parte 6 está preparada e não foi executada. Docker/PostgreSQL isolado indisponível; migração, concorrência entre conexões e duas sessões reais permanecem para a parte 9. Antes de ativar a API, validar as migrações pendentes em banco isolado e substituir todas as instâncias antigas da API. O patch `Ajuda_ai_Matching_Parte_6.patch` foi conferido na pasta original durante a parte 7; não deve ser aplicado novamente.

## Parte 7 entregue em código

Permissões e chat compartilham a validação das relações atuais. Feed preservado para aprovados sem par; publicação por padrinho exige vínculo canônico e ciclo válido. Moderação acompanha os apadrinhados atuais e é revalidada na transação, com lock do ciclo antes da publicação. Rótulo de grupo e JWT antigo não restauram autoridade perdida. Transferência conserva conteúdo e autoria.

Stream revalida acesso, filtra semestre e informa mudança de permissões; eventos da outbox carregam o ciclo. Web e mobile revalidam sem novo login, descartam respostas de outro contexto e limpam conteúdo após revogação. Histórico consultado não concede permissão no ciclo atual.

Validação: 608 testes no backend em 57 arquivos, incluindo HTTP/Nest do feed; 155 testes na web; 64 testes selecionados no mobile. Builds Nest/Vite, tipos de produção/testes, lint e análise Dart aprovados. Tela mobile completa e APK continuam limitados pelas dependências ausentes. O escopo e os limites estão em [feed-permissoes-parte-7.md](feed-permissoes-parte-7.md).

Não há nova migration nesta parte. PostgreSQL real, broker e duas sessões continuam pendentes. O patch `Ajuda_ai_Matching_Parte_7.patch` foi conferido na pasta original durante a parte 8; não deve ser aplicado novamente.

## Parte 8 revisada e entregue em código

Múltiplos padrinhos e grupos preservados no modelo e nas telas dos alunos, com atalhos por ID de vínculo e grupo. Encerramento não é anunciado como vínculo ativo, e rejeições históricas conservam sua identificação. Contexto de participante atualizado em segundo plano, sem desmontar conversas ou apagar rascunhos; conta/ciclo antigos não podem substituir os atuais. Sessão mobile expirada limpa participação e token, enquanto falha de rede preserva o último estado confirmado.

Diagnóstico de dados antes da rodada, com contagens por critério/papel e condições obrigatórias pendentes. Visão de execução verifica o contrato da configuração e exclui participações terminadas dos elegíveis. Configuração protege edições dos novos clientes com `versaoBase` e conflito 409, sem sobrescrever a versão atual.

Validação: 614 testes no backend em 58 arquivos; 166 na web; 92 selecionados no mobile. Builds Nest/Vite, tipos de produção/testes, lint e análise Dart aprovados. Detalhes e limites em [experiencia-parte-8.md](experiencia-parte-8.md). A sessão mobile foi desacoplada das telas para ampliar os testes executáveis; aplicação completa e APK continuam limitados pelas dependências ausentes.

O patch `Ajuda_ai_Matching_Parte_8.patch` é incremental sobre a parte 7. Não altera branch, HEAD ou índice real. A parte 9 ainda precisa homologar banco, migrações, concorrência e jornada entre contas reais de teste; não se declara o sistema 100% validado.


## Parte 9 — código e validação integrada entregues

Cadeia de 14 migrações de cadastro/matching/chat/feed aplicada em PostgreSQL 16.13 isolado, sem `synchronize`. Importação de recusas e grupos legados, múltiplos padrinhos e privacidade temporal validados com SQL real. Concorrência entre pools, UUIDs repetidos, rollback, recibos e publicação de rodada desatualizada foram exercitados. Testes HTTP/SSE usam duas instâncias Nest, e o navegador Chrome usa três sessões isoladas.

A alocação passou para `worker_threads`, sem transação aberta durante o cálculo e com revalidação na publicação. Corrigidos contador de grupo para dados inconsistentes, consulta de histórico privado legado, montagem das telas mobile, largura da preferência de gênero e perfil com múltiplos padrinhos. Testes antigos foram alinhados aos contratos atuais sem desativar verificações.

Validação final: **631 testes backend aprovados em 63 arquivos**, incluindo **14 testes PostgreSQL/HTTP e uma jornada no navegador**; **166 testes web**; **386 testes mobile na suíte completa**. Build Nest/Vite, tipos de produção/testes, lint dos arquivos alterados e análise Dart completa (`lib test`) aprovados. Três testes de transporte AMQP real foram explicitamente ignorados por falta do broker; não contam como aprovados.

O Gradle local permitiu avançar na tentativa de APK, mas downloads de artefatos Android/Google foram bloqueados. A geração e validação em dispositivo/emulador continuam pendentes. Também continuam fora do escopo executado o banco real do projeto, Microsoft/Entra ID, Azure Storage e a cadeia espacial PostGIS. Consulte [homologacao-parte-9.md](homologacao-parte-9.md) para matriz, comandos e limites.

Patch incremental: `Ajuda_ai_Matching_Parte_9.patch`, a aplicar uma única vez sobre as partes 0–8. A pasta original não foi escrita nesta sessão; nenhum commit, push, branch ou índice real foi alterado.
