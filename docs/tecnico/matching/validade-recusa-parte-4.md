# Parte 4 — validade das sugestões e decisões sobre pares

Entrega de 22/11/2026, sem commit. Complementa o [plano original](plano-original.md) e o [acompanhamento geral](progresso.md). A política de pontuação permanece `3.0.0`; o contrato de integridade dos dados passa a `4.0.0`.

## Comportamento entregue

Uma sugestão só pode ser aprovada enquanto os dados que sustentaram a rodada continuarem válidos. Recusar uma sugestão impede o mesmo par nas próximas rodadas daquele ciclo. A coordenação pode usar **Reconsiderar par**, com justificativa obrigatória, para retirar o impedimento. A recusa anterior permanece no histórico; a reconsideração não cria vínculo nem restaura a sugestão antiga. Uma nova rodada pode produzir uma nova sugestão, conforme compatibilidade e capacidade atuais.

O padrinho continua podendo ter vários apadrinhados dentro da capacidade. Aprovar o primeiro par de uma rodada não invalida automaticamente os demais pares planejados nessa mesma rodada.

## Mapeamento do plano

| Item | Implementação e alcance |
|---|---|
| P4-01 | Snapshot dos dados efetivamente usados: configuração, política, formulários, respostas, participantes elegíveis, vínculos confirmados, ocupação e impedimentos. |
| P4-02 | Fingerprint SHA-256 dos insumos; cada sugestão também vincula execução, participantes e cálculo à assinatura da rodada. |
| P4-03 | Alteração de configuração invalida imediatamente as pendências. Outras alterações relevantes são detectadas na atualização da visão/lista/detalhe e na decisão. |
| P4-04 | Aprovação revalida ciclo, configuração, política, dados, viabilidade, recusa e capacidade em transação. |
| P4-05–06 | Histórico de decisões do par por ciclo em tabela própria, consultado a cada nova execução; recusa registra autor, data e motivo opcional. |
| P4-07–08 | Reconsideração explícita com justificativa, autor e data, sem reescrever decisões anteriores. Nova rodada necessária para outra sugestão. |
| P4-09 | Repetição legítima de aprovação devolve o vínculo correspondente; decisões conflitantes são rejeitadas. |
| P4-10 | Ordem de locks definida nas operações do matching e coberta por testes de contrato. Comprovação de concorrência/deadlock em PostgreSQL real ainda pendente. |
| P4-11 | Execução recuperada por timeout não pode publicar depois de ser substituída. Falhas não publicam sugestões parciais. |
| P4-12 | Indicador de sugestões pendentes separado dos totais de participantes sem vínculo e do relatório de pessoas sem sugestão. |

## O que torna uma sugestão desatualizada

O fingerprint considera a configuração e a política, as pessoas elegíveis, os campos usados nos critérios e os vínculos confirmados da base da rodada. Nos critérios de formulário, entram versão, tipo, alternativas e respostas efetivas. Para preferência de gênero, também entra o próprio gênero, necessário para avaliar a preferência da outra pessoa.

A canonização independe da ordem de propriedades e conjuntos. Campos opcionais sobrevivem à serialização JSONB: propriedades `undefined` são omitidas como no JSON; ausência não é confundida com resposta negativa. A comparação de texto usada para ordenar a assinatura não depende do idioma do processo.

Uma alteração relevante na base pode invalidar a rodada inteira, pois a alocação é calculada sobre o conjunto de candidatos. Nome de exibição, grupo projetado e contador de apadrinhados não são tratados como respostas de compatibilidade. A passagem normal de candidato aprovado para padrinho ativo é normalizada na assinatura.

Vínculos consistentes criados pela aprovação da própria rodada são excluídos da comparação com a ocupação inicial. A capacidade atual ainda é verificada em cada aprovação. Se um desses vínculos for encerrado ou alterado externamente, a exceção deixa de valer e as pendências são invalidadas.

Os motivos incluem mudança de configuração ou dados, contrato antigo, ciclo indisponível, execução substituída, par recusado, vínculo alterado, capacidade atingida e par sem viabilidade atual. As telas apresentam o motivo da obsolescência e retiram as ações de confirmação. Uma nova rodada também registra o motivo ao substituir pendências anteriores.

As consultas de visão, lista e detalhe atualizam o estado derivado das pendências. Elas não registram decisões humanas. A aprovação e a recusa repetem a validação no servidor; a tela não é a garantia de integridade. Quando uma decisão encontra dados desatualizados, a invalidação é confirmada na transação antes da resposta HTTP 409. Assim, o erro não desfaz a atualização para `obsoleta`.

Pendências geradas antes deste contrato ficam desatualizadas e precisam de nova execução. Aprovações e recusas históricas são preservadas.

## Recusa e reconsideração

`matching_pares_decisoes` guarda eventos acrescentados, sem atualização ou remoção dos anteriores pelo serviço. A chave lógica é ciclo + participação do padrinho + participação do apadrinhado. O último evento por ID determina o impedimento. O ID evita que o horário de início de transações concorrentes seja confundido com a ordem efetiva de decisões após o lock do ciclo.

Uma recusa bloqueia somente aquele par naquele ciclo. As candidaturas e os demais pares permanecem disponíveis conforme as regras atuais. A lista de pares recusados mostra autor, data, motivo e histórico. A reconsideração exige texto não vazio de até 1.000 caracteres e referencia a recusa atual.

Repetir a mesma reconsideração não duplica eventos. Um pedido antigo não pode retirar o impedimento de uma recusa posterior. Repetir uma recusa antiga depois da reconsideração também não bloqueia novamente o par.

| API da coordenação | Contrato |
|---|---|
| `GET /coordenacao/matching/pares/recusados?programa=2026%2F2` | Pares atualmente impedidos, histórico e indicação de possibilidade de reconsiderar. |
| `POST /coordenacao/matching/pares/:id/reconsiderar` | `id` do evento de recusa atual; corpo `{ "justificativa": "Informação complementada" }`. Retorna `impedido: false` e `novaExecucaoNecessaria: true`. |
| `GET /coordenacao/matching/sugestao/:id` | Inclui `historicoPar`, `validade` e `podeAprovar`. |

As rotas permanecem protegidas por autenticação e papel de coordenador. O responsável vem da identidade autenticada no servidor, sem aceitar autor arbitrário no corpo.

## Transações e execução

Nas operações do matching, a ordem começa pelo programa/ciclo; segue pela configuração e, quando aplicável, execução ou sugestão; participações são lidas em ordem crescente de ID. A consulta inicial de um ID para localizar seu ciclo não adquire lock na sugestão antes do ciclo. O lock do ciclo serializa as decisões desse módulo.

A repetição de uma aprovação retorna somente o vínculo correspondente àquela aprovação, mesmo que ele já tenha sido encerrado; não recria vínculo nem chat. Um vínculo histórico inconsistente gera conflito. Falha ao criar o chat desfaz a aprovação e a criação do vínculo na mesma transação.

A execução mantém duas fases e verifica novamente a configuração e seu próprio estado antes de publicar. A recuperação de timeout marca a execução antiga como falha; um trabalhador antigo não consegue publicar depois disso. O registro de falha usa atualização condicionada ao estado `executando`, preservando a recuperação já concluída por outra requisição.

Na web, a troca de ciclo remonta o conteúdo e descarta respostas antigas; atualizações concorrentes de filtros usam sequência de requisição. No mobile, a troca de ciclo limpa o estado e recarrega; respostas atrasadas da visão ou da lista de recusas não substituem o ciclo atual. Reconsiderações também verificam o ciclo antes de atualizar a interface.

## Migração necessária antes de usar a nova API

Arquivo: `code/back/api/src/migrations/1794300000000-DecisoesParesMatching.ts`.

A migração cria a tabela do histórico, índices, cinco referências e restrições de validade. Também importa recusas anteriores a partir das sugestões e decisões existentes, preservando autor, motivo e data disponíveis. Nenhuma sugestão ou decisão antiga é regravada pelo `up`.

**A migração foi preparada e testada quanto ao SQL emitido, mas não foi executada em banco nesta sessão.** O novo serviço depende dessa tabela. A atualização deve aplicar as migrações pendentes antes de iniciar a nova versão da API; não misturar versões antigas e novas durante a migração. O caminho padrão mantém `synchronize: false`; não substituir a migração por sincronização automática.

Primeiro configurar um PostgreSQL isolado de teste com schema/base existentes e verificar cuidadosamente o destino das variáveis `DB_*`. Somente nesse ambiente, a partir de `code/back/api`, executar `npm run migration:show` e revisar as pendências antes de `npm run migration:run`. O comando `migration:run` executa todas as migrações pendentes, não apenas esta. A validação deve conferir importação das recusas, geração, aprovação, reconsideração e nova execução antes de qualquer uso no ambiente compartilhado. Nenhum comando de banco foi executado aqui.

## Validação e limites

- Backend: 528 testes em 51 arquivos, incluindo 23 cenários específicos de integridade/decisão, dois testes do SQL da migração e montagem dos metadados TypeORM sem conexão. Build Nest, checagem de tipos e lint dos arquivos alterados.
- Web: 42 testes nos contratos, componentes renderizados e transporte da API selecionados; build Vite aprovado. O aviso de tamanho dos bundles permanece.
- Mobile: 26 testes nos quatro arquivos selecionados, incluindo seis novos cenários de decisão/validade e troca de ciclo; análise Dart sem ocorrências nos arquivos da etapa.
- A fixture transacional usa repositórios em memória, rollback e uma fila de transações. Os cenários com chamadas paralelas verificam resultados e ordem solicitada dos locks; **não comprovam ausência de deadlock nem o comportamento dos locks PostgreSQL**.
- O executável Docker está disponível, mas o daemon não está acessível nesta sessão. Não houve execução da migração, concorrência em PostgreSQL ou testes com dados reais. Essa validação permanece registrada em P4-10 e na parte 9.
- A suíte mobile ampliada de cadastro/padrinho/sessão continua limitada pelas dependências locais ausentes `gal` e `path_provider`. Os 26 testes acima não representam a suíte completa do aplicativo.

A parte 5 ainda precisa unificar os caminhos de vínculo manual e sugerido, grupos e transferências. A ordem de locks desta entrega não é uma garantia para todos os serviços que escrevem participações ou vínculos. Chat coletivo, permissões de acesso e feed continuam nas partes 6 e 7. Não foi criada restrição nova de capacidade por apadrinhado no banco; a premissa R13 permanece aberta.

## Aplicação na pasta do GitHub Desktop

As mudanças estão na cópia de trabalho autorizada, sem commit. O patch `outputs/Ajuda_ai_Matching_Parte_4.patch` é incremental sobre a parte 3, confirmada na pasta original no início desta etapa. Inclui código, testes e documentação, sem dependências ou configurações de ambiente.

Na pasta original, verificar e aplicar o patch antes de revisar os arquivos em **Changes**. A migração de banco é uma etapa separada da aplicação dos arquivos. Não aplicar novamente os patches anteriores.
