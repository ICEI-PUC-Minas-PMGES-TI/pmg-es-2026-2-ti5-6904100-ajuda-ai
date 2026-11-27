# Parte 5 — vínculos, grupos e transferências

Entrega de 22/11/2026, sem commit. Complementa o [plano original](plano-original.md) e o [progresso geral](progresso.md). A parte 4 foi conferida na pasta original antes desta implementação.

## Comportamento entregue

A aprovação de sugestão e a criação manual usam a mesma operação de domínio. Ambas exigem participantes elegíveis do mesmo ciclo, identidade distinta, configuração válida, compatibilidade comprovada, condições obrigatórias atendidas, capacidade disponível, ausência de duplicidade e ausência de recusa vigente. A operação manual deixa de contornar as regras do matching.

Um padrinho pode acompanhar vários apadrinhados. A capacidade por apadrinhado continua configurável, sem impor a premissa R13 no banco. Se houver mais de um padrinho, cada relação tem seu próprio vínculo e grupo; uma transferência substitui somente o vínculo escolhido. A antiga string `participacoes.grupo` fica nula quando não representa um único grupo. O endpoint de situação do aluno oferece também a lista `padrinhos`, mantendo o campo singular para compatibilidade. A apresentação completa de múltiplas relações em todas as telas do aluno ainda pertence à parte 8.

Na tela de matching, web e mobile mostram os grupos, seus membros, histórico e ação **Transferir**. A consulta de destinos informa vagas, aderência, cobertura e motivos de bloqueio. O servidor verifica tudo novamente ao confirmar; a consulta não reserva vaga. A consulta compartilha os insumos entre destinos, sem repetir uma série de consultas ao banco para cada padrinho.

## Mapeamento do plano

| Item | Entrega |
|---|---|
| P5-01 | `criarVinculoNaTransacao` em `vinculos.dominio.ts`, usada pela aprovação sugerida e por `VinculosService`. |
| P5-02 | Elegibilidade, ciclo/inscrições, identidade, compatibilidade, capacidades, recusa e duplicidade verificadas no servidor. Não há exceção administrativa implícita. |
| P5-03 | `matching_vinculos` determina relações ativas. Nome de grupo não acrescenta vínculo nem autoridade nos caminhos conectados ao repositório canônico. |
| P5-04 | `matching_grupos` tem ID estável e proprietário por participação/ciclo; vínculo referencia `grupo_id`. Grupo vazio continua existindo para reutilização. |
| P5-05 | Grupo legado, papel, situação e contador são projeções recalculadas dos vínculos, com locks nas participações em ordem crescente. Não são aceitos do cliente. |
| P5-06 | Comando de transferência com vínculo de origem, padrinho destino, motivo e UUID de operação. |
| P5-07–08 | Validação, encerramento da origem, criação do destino, projeções, chat privado e auditoria na mesma transação. Falha preserva a origem. |
| P5-09 | Transferência exige compatibilidade, capacidade e ausência de recusa no destino. Preferência de gênero permanece ponderada conforme a política aprovada, sem exclusividade inventada. |
| P5-10 | Aprovação original permanece no histórico. Transferência é um novo evento com origem, destino, responsável, motivo e data. |
| P5-11 | Quem perde o último vínculo volta a candidato aprovado aguardando matching; o contador fica zero e o grupo projetado é limpo. Permissões calculadas a partir da situação passam a refletir essa condição. |
| P5-12 | Migração preparada para grupos canônicos e relatório das projeções/divergências anteriores. Relações ambíguas apenas por nome não são convertidas silenciosamente. Execução e conferência em PostgreSQL permanecem pendentes. |

## Identidade e histórico

Um grupo pertence à participação do padrinho no ciclo, e não ao nome exibido. Dois rótulos iguais não juntam os membros. Voltar ao mesmo padrinho reutiliza seu grupo, criando um novo vínculo com outro intervalo de atividade. O vínculo de origem conserva os IDs, a origem e a eventual referência à sugestão que o criou; apenas fica inativo, com data de encerramento.

`matching_vinculos_eventos` registra criação, encerramento e transferência. Há índice único no UUID de operação. A repetição de uma transferência com a mesma intenção devolve seu resultado sem criar outro vínculo, grupo, chat ou evento. O mesmo UUID com origem, destino, motivo ou responsável diferentes gera conflito. Se o destino já tiver sido encerrado depois, repetir a transferência antiga devolve o resultado histórico e não o reativa.

Repetir uma criação manual cujo par já está ativo devolve o vínculo existente. Repetir um encerramento não acrescenta outro evento. As rotas antigas de vínculo e encerramento delegam ao domínio comum, e o responsável é extraído da autenticação da coordenação.

O ciclo é bloqueado antes dos demais registros. A origem é lida novamente depois de adquirir esse lock. A preparação do par bloqueia as participações em ordem crescente; o recálculo também faz isso. A revogação de aprovação passou a adquirir o ciclo antes da participação, para acompanhar essa ordem. As provas de ausência de deadlock e de disputa de vaga em PostgreSQL real ainda são necessárias.

## Transferência e comunicação

A operação valida o destino descontando somente o vínculo de origem na capacidade do apadrinhado. Depois encerra a origem, cria o destino pelo domínio comum, recalcula os participantes e cria o privado do novo vínculo. Falha em qualquer uma dessas etapas desfaz a transação inteira. As sugestões pendentes do ciclo ficam desatualizadas porque a base de vínculos mudou; decisões humanas anteriores permanecem intactas.

O privado antigo conserva o histórico. O mecanismo atual de envio já verifica o vínculo ativo e bloqueia novos envios naquele privado quando a origem é encerrada. Chat coletivo, associação temporal de membros, histórico de entrada/saída e revalidação de conexões em andamento continuam na parte 6. Esta etapa não anuncia essa integração completa.

As interfaces geram um UUID para cada intenção de transferência. Depois da primeira tentativa, preservam destino, motivo e identificador para repetir a mesma operação se o resultado da rede ficar incerto. Para mudar a intenção, a coordenação atualiza os grupos. Respostas de ciclos anteriores não substituem o painel atual, e o diálogo mobile revalida a seleção de ciclo antes de enviar.

## APIs

Todas as rotas abaixo exigem autenticação de coordenador. O autor da movimentação vem do JWT.

| Método e rota | Finalidade |
|---|---|
| `GET /coordenacao/matching/grupos?programa=2026%2F2` | Grupos com IDs, vínculos atuais dos membros, histórico e inconsistências detectadas. |
| `GET /coordenacao/matching/destinos?apadrinhadoId=100&vinculoOrigemId=7` | Destinos, vagas, compatibilidade e impedimentos. O vínculo de origem é obrigatório para simular uma transferência; sem ele, a consulta simula criação adicional. |
| `POST /coordenacao/matching/vinculos/7/transferir` | `{ "padrinhoDestinoId": 2, "motivo": "Melhor disponibilidade", "operacaoId": "63be4551-9576-48ef-9dd8-d0ede2e7ab8e" }`. |
| `POST /coordenacao/vinculos` | Contrato manual existente, agora submetido ao domínio comum. |
| `POST /coordenacao/candidaturas/:id/vinculos/:vinculoId/encerrar` | Encerramento canônico auditado, preservando relações restantes. |
| `POST /coordenacao/candidaturas/:id/desvincular` | Encerra os vínculos ativos do apadrinhado em uma transação, com eventos de auditoria. |

O motivo da transferência é obrigatório, aparado e limitado a 1.000 caracteres. Não é necessário remover o vínculo antigo em uma chamada separada. Conflitos de origem, capacidade, recusa ou dados atuais exigem atualizar a consulta.

## Migração e dados legados

Arquivo: `code/back/api/src/migrations/1794400000000-GruposTransferenciasMatching.ts`, após a migração de decisões da parte 4.

O `up` cria os grupos, a referência nos vínculos e o histórico de movimentações. Antes de atualizar projeções, salva uma fotografia em `matching_grupos_conciliacao`, incluindo grupo, papel, status, contador e IDs dos vínculos ativos. Também registra vínculos com participantes fora do ciclo ou com a mesma identidade. Grupos e referências são preenchidos a partir das relações canônicas existentes. Nenhum vínculo é criado apenas porque duas pessoas compartilham um nome de grupo; vínculos encerrados não são reativados.

Grupos apenas legados e vínculos sem grupo canônico consistente aparecem como pendências. A criação/transferência que afetaria esses dados é bloqueada para evitar ocupar uma vaga fictícia. Isso também se aplica a registros antigos de demo que tenham somente rótulos. A conciliação de casos ambíguos deve ser planejada sobre o relatório em cópia isolada; esta entrega não escolhe automaticamente um padrinho para corrigir dados incertos.

**A migração não foi executada nesta sessão.** Primeiro preparar um PostgreSQL isolado com dados de teste, verificar o destino de `DB_*`, revisar `npm run migration:show` e só então aplicar `npm run migration:run` a partir de `code/back/api`. Esse comando executa todas as pendências. Conferir relatório, grupos, múltiplos vínculos, criação, transferência, repetição, encerramento e rollback antes de atualizar o ambiente compartilhado. A nova API depende das tabelas novas; aplicar migrações antes de iniciá-la. Manter sincronização automática desativada.

O `down` recusa reversão automática: apagar as tabelas perderia auditoria e não restabeleceria com segurança as projeções antigas. Uma reversão precisa de recuperação planejada de backup. Não foi usado banco compartilhado, dado real nem comando de migração nesta implementação.

## Validação e limites

- Backend: 551 testes em 53 arquivos, incluindo 21 cenários dedicados ao domínio de vínculos/transferências e dois testes do SQL da migração. Montagem dos metadados TypeORM sem conexão, build Nest e checagem de tipos dos testes. Lint sem erros; permanece um aviso anterior sobre spread na preparação da demo da coordenação.
- Web: 46 testes selecionados de contratos, componentes renderizados e transporte; build Vite aprovado, com o aviso anterior de tamanho dos bundles. Os testes novos da web não substituem uma homologação interativa completa no navegador.
- Mobile: 32 testes nos cinco arquivos selecionados, com confirmação, motivo obrigatório, UUID preservado na repetição, ciclo encerrado e troca de ciclo. Análise Dart sem ocorrências nos arquivos da etapa.
- A fixture backend usa repositórios em memória, rollback e fila de transações. Seus testes com requisições paralelas verificam resultados e idempotência, não simulam o gerenciador de locks do PostgreSQL.
- O Docker foi consultado novamente: o daemon segue indisponível. Migração executada, concorrência real, deadlocks e integração com dados legados continuam na parte 9. A suíte mobile completa continua limitada pelas dependências locais ausentes `gal` e `path_provider`.

Próxima etapa: parte 6, comunicação privada/coletiva e ciclo de vida do acesso. Feed, moderação e atualização de permissões nos clientes seguem na parte 7. O fluxo completo continua sujeito à homologação final.
