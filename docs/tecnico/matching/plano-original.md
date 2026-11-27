# Ajuda-aí — plano detalhado de correção e evolução do matching

**Projeto:** TI5 — PUC Minas  
**Data:** 20/11/2026  
**Versão do plano:** 1.0 — planejamento, sem implementação  
**Base analisada:** branch local Sprint-6, commit d7a67ed57b5ee270fea0ccee25f2bd01328d8a1f.  
**Comparação adicional:** referências locais de origin/Arthur_Luiz, origin/Arthur_gv e origin/matheus-missoes.  
**Limite da análise:** o fetch não foi concluído; o plano precisa ser confrontado com referências atualizadas antes de implementar. Os principais arquivos inspecionados foram conferidos contra HEAD, normalizando os finais de linha do Git.

## 1. Resultado que queremos entregar

O matching deve sugerir relações viáveis e explicáveis, considerar preferências e experiências relevantes, respeitar a ocupação dos padrinhos e deixar a decisão final com a coordenação. A criação, transferência e encerramento de vínculos devem manter grupos, conversas e permissões coerentes.

Fluxo de entrega: cadastro e formulários → elegibilidade → configuração → execução → revisão das sugestões → confirmação do vínculo → acesso ao grupo e às conversas → transferência ou encerramento → histórico preservado.

O escopo deste plano é o matching e seus pontos de integração. Ele não equivale a uma auditoria completa de todos os módulos do Ajuda-aí.

## 2. Regras acordadas e premissas

| ID | Regra | Situação |
|---|---|---|
| R01 | Um padrinho pode atender vários apadrinhados, respeitando sua capacidade. | Acordada |
| R02 | Equilíbrio considera apenas combinações adequadas; um padrinho vazio não deve receber alguém incompatível só para preencher o grupo. | Acordada |
| R03 | Preferência de gênero deve influenciar a compatibilidade; se houver preferência dos dois lados, considerar ambos. | Acordada |
| R04 | ProUni e experiência de mudança de cidade devem contribuir para a compatibilidade. | Acordada |
| R05 | Valorizar vivência compartilhada quando ela existe; dois valores “não” não equivalem automaticamente à vivência de dois bolsistas ou dois alunos que se mudaram. | Aceita na discussão |
| R06 | “Sem preferência” é uma resposta explícita. Não inferir preferência de gênero a partir do gênero da própria pessoa. | Acordada |
| R07 | Par recusado permanece fora das sugestões do ciclo até ação explícita “Reconsiderar par”. | Acordada |
| R08 | A recusa do par não rejeita as candidaturas; ambos continuam disponíveis para outras combinações. | Acordada |
| R09 | A coordenação poderá transferir um apadrinhado em uma única operação, com validação de vaga e histórico. | Acordada |
| R10 | Aprovar sugestão cria vínculo; executar o algoritmo não cria vínculos automaticamente. | Regra do produto preservada |
| R11 | Distinguir dados insuficientes, incompatibilidade e baixa afinidade. | Aceita na discussão |
| R12 | Manter a leitura/interação no feed para participantes aprovados do ciclo; publicação por padrinho exige vínculo ativo. | Comportamento atual a preservar |
| R13 | Um apadrinhado terá um padrinho ativo por ciclo, com vários apadrinhados por padrinho. | Premissa recomendada para resolver a contradição atual; confirmar antes de fixar restrições de banco |
| R14 | Usar preferência de gênero como peso por padrão. Uma modalidade “exclusivamente” só se torna eliminatória se essa opção for aprovada e declarada explicitamente. | Proposta delimitada; não tornar toda preferência obrigatória |
| R15 | Disponibilidade e apoio oferecido/necessário poderão ser obrigatórios quando forem condições efetivas do programa. | Política a configurar; não impor automaticamente para todo ciclo |

### Decisões que ainda não devem ser inventadas no código

- Pesos numéricos de gênero, ProUni, mudança de cidade, áreas de apoio e interesses.
- Regra para preferir o padrinho vazio quando ele é viável, mas tem pontuação menor que outro já ocupado. A diretriz está acordada; a tolerância entre adequações diferentes ainda precisa ser especificada com exemplos.
- Forma de representar horários: valores padronizados e interseção real; nomes de turnos genéricos não bastam se houver dias/intervalos distintos.
- Adoção ou não de preferência de gênero exclusiva.
- Condições obrigatórias de cada ciclo, incluindo disponibilidade e área de apoio.
- Visibilidade do histórico do chat coletivo após saída e para novos integrantes. Proposta inicial: novo integrante não recebe automaticamente mensagens anteriores à entrada; ex-integrante não recebe novas mensagens após sair.
- Escopo de “Reconsiderar par”: remove o impedimento daquela recusa; não aprova vínculo nem sobrepõe capacidade, ciclo encerrado ou requisito obrigatório.

Essas decisões não impedem começar a correção do loop. Elas precisam estar definidas antes de finalizar o novo cálculo e suas telas.

## 3. Diagnóstico consolidado

| ID | Achado | Evidência e efeito |
|---|---|---|
| F01 | Loop no algoritmo com empates | Reproduzido com 3 padrinhos/3 apadrinhados, capacidades 1, pontuações iguais; também com 3/10 e capacidade 3 por padrinho. Pode bloquear o processo da API. |
| F02 | Distribuição concentrada | Dois padrinhos com capacidade 3 e três apadrinhados igualmente compatíveis resultaram em 3/0. A função atual não equilibra carga. |
| F03 | Caminho manual ignora capacidade | Operação manual aceitou um segundo vínculo com limite configurado de 1. |
| F04 | Configuração permite vários padrinhos, mas aprovação bloqueia | Capacidade de 2 por apadrinhado foi aceita; a segunda aprovação foi recusada por pertencer a outro grupo. |
| F05 | Sugestão de configuração antiga é aprovável | Verificação isolada aprovou sugestão da configuração 1 enquanto a vigente era 2. |
| F06 | Chat não acompanha encerramento do ciclo | Verificação isolada salvou mensagem com programa em encerramento e vínculo ainda ativo. |
| F07 | Integração do chat depende da branch | Sprint-6 tem chat web simulado e atalho mobile “Em breve”; Arthur_Luiz contém integração web real. |
| F08 | Chat coletivo não nasce no fluxo atual | A criação consultada gera exatamente dois membros por vínculo; o grupo lógico não gera conversa coletiva. |
| F09 | Formulário não valida integralmente o catálogo | Validação isolada aceitou criterioId 999999, versão 888 e alternativa arbitrária. |
| F10 | Tipos incompatíveis são aceitos entre critérios distintos | Igualdade entre lista e texto pode ser configurada e não produz correspondência útil. |
| F11 | Resposta ausente pode inflar percentual | Critério de peso 90 ausente e outro de peso 10 compatível produziram 100%. Comportamento atual intencional, mas apresentação e política precisam mudar. |
| F12 | Recusa não exclui o par das próximas execuções | O filtro de geração exclui pares ativos, mas não consulta um impedimento persistente por recusa no ciclo. |
| F13 | Dados fixos e motor de pontuação estão separados | genero, bolsistaProuni e deOutraCidade já são coletados. O cálculo consultado usa extras por pergunta de catálogo; preferência de gênero não aparece como campo próprio nos contratos inspecionados. |
| F14 | Teste PostgreSQL desatualizado | Usa construtor sem chat, critérios legados e expectativa de outbox anterior. Não comprova o fluxo atual sem atualização. |

**Validação anterior:** 7 arquivos de testes selecionados, 59 testes aprovados. Os cenários adicionais foram executados isoladamente, sem banco da aplicação. Aprovação concorrente, rollback e migrations ainda precisam de PostgreSQL de teste.

## 4. Divisão em partes e dependências

| Parte | Entrega | Depende de |
|---|---|---|
| 0 | Preparar a base de implementação e registrar o diagnóstico | Nenhuma |
| 1 | Corrigir o travamento e estabilizar a alocação atual | 0 |
| 2 | Unificar dados, catálogo e regras de compatibilidade | 0; regras de produto fechadas antes de concluir |
| 3 | Implementar pontuação explicável e equilíbrio condicionado à compatibilidade | 1 e 2 |
| 4 | Controlar versões, validade das sugestões, recusas e reconsideração | 2 e 3 |
| 5 | Unificar vínculos e criar transferência atômica | 2 e 4 |
| 6 | Integrar chat privado/coletivo e ciclo de vida dos grupos | 5; revisão da branch de chat |
| 7 | Alinhar feed, moderação, permissões e atualização dos clientes | 5 e 6 |
| 8 | Concluir telas web/mobile da coordenação e dos participantes | Contratos das partes 2 a 7; telas podem ser entregues junto de cada parte |
| 9 | Homologar a jornada completa e preparar a integração final | Todas as anteriores |

Testes acompanham cada parte. A parte 9 reúne homologação integrada, concorrência, recuperação e aceite final; não adia a verificação das etapas anteriores.

## Parte 0 — Preparação da implementação

**Objetivo:** começar sobre uma base conhecida sem sobrescrever trabalho existente.

- P0-01: atualizar referências remotas com fetch autorizado e conferir quais correções já chegaram em outras branches.
- P0-02: obter acesso de trabalho ao repositório. A conversa está aberta em new-chat e o repositório original fica em outra pasta; a escrita/fetch foi bloqueada. Abrir o repositório como workspace autorizado ou preparar uma cópia de trabalho isolada em caminho permitido, mantendo a origem intacta.
- P0-03: registrar branch, commit, alterações locais e eventuais arquivos não versionados antes de qualquer edição. A auditoria atual não conseguiu validar o status completo.
- P0-04: escolher uma branch de trabalho após autorização de implementação e definir a base; não fazer merge amplo da branch de chat sem revisar o diff.
- P0-05: identificar migrations já aplicadas e configurar banco de teste isolado. Não usar synchronize em banco compartilhado.
- P0-06: separar este trabalho em entregas pequenas e revisáveis, com evidências de teste por etapa.

**Aceite:** base atualizada e identificada, alterações existentes preservadas, ambiente de teste separado e primeira alteração limitada ao algoritmo.

## Parte 1 — Eliminar o loop e estabilizar a alocação

**Problema:** F01. Esta é a primeira correção de código recomendada.

- P1-01: criar regressões dos casos de empate que travam. Executar o código problemático em processo ou worker isolado com interrupção efetiva; um timer no mesmo event loop não interrompe um loop síncrono.
- P1-02: corrigir a atualização dos predecessores e a reconstrução dos caminhos no grafo residual, impedindo ciclos.
- P1-03: definir desempate determinístico que não altere a prioridade do score nem introduza ciclos.
- P1-04: preservar capacidade dos dois lados, proibição de autopar e exclusão de pares ativos.
- P1-05: comparar casos pequenos com uma solução por enumeração para verificar cardinalidade e pontuação da alocação atual.
- P1-06: testar entradas vazias, capacidade esgotada, vários vínculos por padrinho, permutação da entrada e empates completos.
- P1-07: prever limite de execução e tratamento de falha do cálculo; decidir se a execução precisa sair do processo HTTP com base em medição de carga.

**Não inclui nesta primeira entrega:** novos pesos, equilíbrio, transferência ou alterações no chat.

**Arquivos principais:** code/back/api/src/matching/matching.algorithm.ts e matching.algorithm.spec.ts; matching.service.ts se necessário para o tratamento de falhas.

**Aceite:** casos antes travados terminam; alocação respeita limites; resultados são reproduzíveis e ótimos para o objetivo atual em casos pequenos; nenhuma sugestão vira vínculo sem decisão humana.

## Parte 2 — Contrato de dados e compatibilidade

**Objetivo:** tornar explícito o que cada dado significa e impedir configurações incoerentes.

### Dados

- P2-01: inventariar os dados já coletados e reaproveitar genero, bolsistaProuni, deOutraCidade, disponibilidade, areas e interesses. Não criar perguntas duplicadas para informações existentes.
- P2-02: adicionar preferência de gênero como dado distinto do gênero da pessoa, com “sem preferência” explícito e seleção de gêneros aceitos quando aplicável.
- P2-03: representar intensidade da preferência apenas se a modalidade exclusiva for aprovada. Não deduzir exclusividade de uma seleção comum.
- P2-04: criar opção explícita para relevância das vivências de ProUni e mudança de cidade, caso a política permita preferência individual por essa experiência.
- P2-05: validar novos campos no recebimento, saneamento, persistência, revisão, consulta e reconstrução da sessão, em React e Flutter.
- P2-06: preservar a fotografia das respostas enviadas. Se for necessária complementação de dados legados, criar uma revisão auditável; não reescrever silenciosamente uma candidatura histórica.
- P2-07: ausência de informação antiga é desconhecido, não false e não “sem preferência”.

### Catálogo e configuração

- P2-08: associar critérios a uma fonte canônica: atributo já existente, preferência explícita ou pergunta extra do catálogo.
- P2-09: para perguntas extras, conferir no servidor existência do critério, versão, tipo, alternativas e uso permitido no formulário.
- P2-10: impedir alternativas inventadas, versões inexistentes, perguntas duplicadas e comparações entre fontes incompatíveis.
- P2-11: manter identificadores estáveis; para critérios diferentes, exigir comparação semanticamente definida em vez de confiar em coincidências de rótulo ou ID de alternativa.
- P2-12: separar peso de preferência de condição obrigatória. Configuração deve informar claramente se afeta a pontuação ou impede a combinação.
- P2-13: definir a política de uso de versões antigas e de critérios desativados; manter histórico e impedir que desativação altere execuções antigas.
- P2-14: resolver capacidade por apadrinhado conforme R13 antes de alterar DTO, telas e restrições de banco.

**Aceite:** preferência de gênero sobrevive ao ciclo completo de cadastro e leitura; os atributos existentes alimentam o motor sem duplicação; referências inválidas e comparações incompatíveis são recusadas pela API.

**Arquivos afetados:** matching/dto e entities, criterio-catalogo.service.ts, formularios.service.ts, campos-fixos.ts, cadastro.service.ts, cadastro.dto.ts, participacao.entity.ts, ParticipacoesService.limparRespostas, formulários React e modelos/serviços/telas de cadastro Flutter.

## Parte 3 — Novo cálculo de compatibilidade e equilíbrio

**Objetivo:** distinguir viabilidade, afinidade, confiança nos dados e ocupação.

- P3-01: avaliar condições obrigatórias antes de criar arestas no algoritmo. Resultado possível: viável, inviável com motivo, ou dados insuficientes com pendências.
- P3-02: comparar preferência de gênero com o gênero do outro participante; avaliar as preferências dos dois lados quando existentes.
- P3-03: aplicar pesos de ProUni e mudança de cidade à vivência relevante. Não atribuir automaticamente afinidade especial ao par false/false.
- P3-04: interpretar deOutraCidade como experiência de mudança; não como mesma cidade natal.
- P3-05: comparar apoio oferecido pelo padrinho com apoio buscado pelo apadrinhado; interesses entram como afinidade.
- P3-06: apresentar score e cobertura dos dados separadamente. “Sem preferência” é neutralidade conhecida; resposta ausente é dado não conhecido.
- P3-07: evitar percentuais altos sem contexto: 10 pontos obtidos entre 10 conhecidos de 100 configurados devem exibir cobertura de 10%, e não apenas um destaque de 100%.
- P3-08: considerar vínculos confirmados já existentes e a ocupação projetada pelas sugestões da rodada.
- P3-09: impedir que o equilíbrio force uma combinação inviável ou sobreponha uma preferência exclusiva aprovada.
- P3-10: priorizar melhor distribuição entre alternativas adequadas segundo a política definida, preservando as diferenças relevantes de compatibilidade. Não introduzir pesos ou uma tolerância arbitrária sem registrar a decisão.
- P3-11: dar preferência a novos alunos ainda sem vínculo e preservar vínculos confirmados; nova execução não deve remanejar automaticamente quem já foi alocado.
- P3-12: produzir motivos legíveis por critério e por distribuição: pontos, pesos, neutralidades, pendências e carga dos padrinhos.
- P3-13: versionar a política do algoritmo para explicar e reproduzir decisões futuras.

**Exemplos obrigatórios de aceite:**

| Cenário | Resultado esperado |
|---|---|
| 2 padrinhos igualmente adequados, ambos vazios, 3 alunos compatíveis com ambos, limite 3 | Distribuição 2/1, sem prometer qual padrinho recebe 2 |
| Um padrinho com 3 e outro com 0, novo aluno compatível com ambos, primeiro já no limite | Sugerir o segundo |
| Um padrinho com 2 e outro com 0, novo aluno igualmente adequado a ambos | Favorecer o segundo |
| Padrinho vazio incompatível com o novo aluno | Não sugerir só para equilibrar |
| Padrinho vazio viável, mas com menor aderência a preferências relevantes | Aplicar a política explícita de equilíbrio/qualidade; exibir a razão |
| Nenhum par viável | Manter aluno sem sugestão e informar motivo, sem criar vínculo artificial |
| 6 alunos e 2 padrinhos igualmente adequados com limite 3 | Distribuição 3/3 |
| Todos os pares empatados | Terminar sem travamento e produzir resultado estável |

**Aceite:** parâmetros alteram o resultado de forma verificável; equilíbrio usa ocupação total; relatórios mostram quem ficou sem sugestão e por quê.

## Parte 4 — Execuções, validade, recusa e reconsideração

**Objetivo:** fazer a sugestão corresponder às regras vigentes e preservar as decisões humanas.

- P4-01: registrar snapshot reprodutível da configuração, versões dos critérios, respostas relevantes, elegibilidade e ocupação usada no cálculo.
- P4-02: associar sugestão à versão da configuração e à versão/fingerprint dos dados usados.
- P4-03: invalidar sugestões pendentes quando alterações relevantes as tornarem desatualizadas.
- P4-04: revalidar configuração, ciclo, participantes, recusas e capacidade na aprovação, incluindo alterações entre geração e decisão.
- P4-05: persistir impedimento de par por ciclo, separado do status de uma sugestão de uma execução específica.
- P4-06: registrar a recusa, responsável, data e motivo; consultar esse impedimento em todas as novas execuções.
- P4-07: criar “Reconsiderar par” com registro de responsável, data e justificativa. Remover o impedimento não aprova o vínculo nem muda uma recusa histórica para aprovação.
- P4-08: nova execução pode gerar uma nova sugestão do par reconsiderado; não modificar a decisão antiga.
- P4-09: rejeitar aprovação duplicada/conflitante e manter idempotência em repetição legítima da mesma aprovação.
- P4-10: definir uma ordem única de aquisição de locks para execução, aprovação, recusa e mudança de configuração; testar deadlocks e concorrência.
- P4-11: tratar timeout, falha de execução e recuperação sem publicar sugestões incompletas.
- P4-12: diferenciar sugestões pendentes de alunos ainda sem vínculo. Resolver ou recusar todas as sugestões não significa que todos foram atendidos.

**Aceite:** a configuração antiga não passa como vigente; par recusado não reaparece automaticamente; reconsideração preserva histórico; dois coordenadores não criam vínculos acima da capacidade.

## Parte 5 — Vínculos, grupos e transferência em uma operação

**Objetivo:** aplicar o mesmo contrato em aprovações, vínculos manuais, encerramentos e transferências.

- P5-01: extrair uma operação de domínio comum para criar vínculo, usada pelos caminhos sugerido e manual.
- P5-02: validar ciclo, inscrições/etapa, identidade distinta, papéis, status, capacidade, impedimentos e duplicidade.
- P5-03: definir matching_vinculos como fonte canônica das relações e tratar grupo legado como projeção/compatibilidade de migração.
- P5-04: modelar identidade estável do grupo. Uma string de nome não deve ser a única fonte para permissões ou propriedade.
- P5-05: recalcular contadores e situação dos participantes sem duplicar vínculos nem confiar em valores enviados pelos clientes.
- P5-06: criar comando “Transferir apadrinhado” com vínculo atual, padrinho destino, motivo e identificador de operação.
- P5-07: em uma transação, validar destino, encerrar origem, confirmar destino, atualizar grupo/contadores e executar as alterações de chat que estiverem no mesmo banco.
- P5-08: falha em qualquer etapa da mudança deve preservar o vínculo original; nenhuma janela entre duas requisições independentes.
- P5-09: transferência não contorna recusa de par, exclusividade aprovada ou capacidade. Exceções administrativas só poderão existir como ação explícita, com permissão e justificativa próprias.
- P5-10: preservar decisão de matching original e registrar a transferência como evento novo, com origem, destino, data e coordenador.
- P5-11: tratar o padrinho que perde seu último apadrinhado conforme a situação canônica do sistema, atualizando suas permissões.
- P5-12: planejar migration conciliando grupos legados e vínculos canônicos, com relatório de inconsistências; não excluir dados para “corrigir” divergências.

**Aceite:** limite respeitado nos dois caminhos; transferência bem-sucedida mantém exatamente as relações previstas; falha no destino não deixa aluno sem padrinho; repetição não duplica vínculo ou chat.

## Parte 6 — Chat privado, coletivo e ciclo de vida

**Objetivo:** todo vínculo confirmado ter comunicação real, com acesso consistente durante mudanças.

- P6-01: revisar as diferenças de Arthur_Luiz e reaproveitar a integração real do chat web, após resolver conflitos de contrato e permissões.
- P6-02: manter criação idempotente de conversa privada por vínculo. Confirmar que vínculo e conversa são criados juntos no banco atual.
- P6-03: criar uma conversa coletiva por grupo, com identidade estável e sem duplicar a conversa a cada novo apadrinhado.
- P6-04: adicionar padrinho e membros efetivamente vinculados; não inferir acesso apenas pelo papel no JWT ou pelo nome do grupo.
- P6-05: em transferência, encerrar envio no privado anterior, remover acesso a novas mensagens do coletivo de origem, criar/reutilizar o privado do novo vínculo e adicionar ao novo coletivo.
- P6-06: aplicar política de histórico baseada em entrada e saída, conforme decisão de produto. Não expor automaticamente conversas anteriores do novo grupo.
- P6-07: bloquear envio quando ciclo, vínculo ou participação não permitirem comunicação; preservar histórico conforme política.
- P6-08: revalidar conexões em tempo real já abertas quando houver revogação/transferência/encerramento; não validar apenas na abertura da conexão.
- P6-09: reutilizar mecanismo confiável de eventos e outbox quando houver efeitos após commit ou entre serviços. A existência de uma tabela antiga de outbox não prova que exista um consumidor ativo.
- P6-10: para leitura e não lidas do coletivo, registrar estado por destinatário ou cursor por membro; uma única flag global de mensagem não representa a leitura de várias pessoas.
- P6-11: implementar consumo real da API e dos eventos no Flutter, substituindo o atalho “Em breve”.
- P6-12: testar envio entre duas sessões reais, reconexão e recuperação de eventos, sem duplicar mensagens ou conversas.

**Aceite:** aprovação gera privado e coletivo acessíveis aos participantes certos; transferência atualiza membros e corta acesso futuro no grupo anterior; ciclo encerrado não aceita novos envios.

## Parte 7 — Feed, moderação e permissões

**Objetivo:** mudanças de vínculo alterarem apenas os acessos correspondentes, sem regras divergentes.

- P7-01: consolidar resolução de participação e vínculo atual em serviço compartilhado; evitar que cada módulo invente outra definição de “ativo”.
- P7-02: preservar feed para aprovados do ciclo mesmo sem par, conforme a regra atual.
- P7-03: permitir publicação do padrinho somente enquanto houver vínculo ativo e ciclo válido.
- P7-04: moderação por padrinho alcança apenas seus apadrinhados atuais; transferência remove a autoridade do antigo padrinho e concede ao novo quando aplicável.
- P7-05: preservar autoria e histórico de posts/comentários; transferência não reatribui nem apaga publicações.
- P7-06: revisar fallback de grupo legado para não conceder acesso por dados divergentes de vínculos encerrados.
- P7-07: atualizar permissões nos clientes após aprovação, transferência, revogação e encerramento sem exigir novo login.
- P7-08: revalidar streams em andamento e encerrar acesso quando a participação/ciclo for revogado; eventos devem respeitar o escopo autorizado.
- P7-09: distinguir ciclo consultado para histórico do ciclo que efetivamente concede permissão; não permitir que um parâmetro do cliente conceda acesso.
- P7-10: testar endpoints diretamente, incluindo tentativa de usar token antigo ou identificador de outro grupo.

**Aceite:** antigo padrinho não modera quem foi transferido; perder o último vínculo bloqueia publicação, sem retirar indevidamente a leitura de participante aprovado; encerramento produz o mesmo estado autorizado em feed e chat.

## Parte 8 — Experiência web e mobile

**Objetivo:** permitir que a coordenação entenda, decida e corrija a distribuição.

### Coordenação

- P8-01: configuração separa capacidade, critérios obrigatórios, pesos de preferências e política de equilíbrio.
- P8-02: retirar a possibilidade de configurar vários padrinhos por apadrinhado se R13 for confirmada.
- P8-03: mostrar disponibilidade de dados por critério e informar quem precisa complementar dados antes de executar.
- P8-04: apresentar sugestões com compatibilidade, cobertura, motivos, ocupação atual/projetada e alertas.
- P8-05: oferecer comparação entre os dois participantes sem expor detalhes pessoais além do necessário à decisão.
- P8-06: exibir apadrinhados sem sugestão e padrinhos sem apadrinhados, com motivos e alternativas viáveis.
- P8-07: distinguir execução em andamento, falha, configuração alterada, sugestão obsoleta, recusa e aprovação.
- P8-08: disponibilizar lista de pares recusados e ação “Reconsiderar par”, sem apagar decisões antigas.
- P8-09: criar visão de grupos e ação “Transferir” com seleção do destino, vagas, compatibilidade e confirmação.
- P8-10: manter estado de tela coerente após ações e proteger contra respostas atrasadas ao trocar ciclo/filtro.
- P8-11: informar conflitos por dados alterados por outro coordenador e recarregar a informação atual.

### Participantes

- P8-12: incluir preferência de gênero e novas opções de vivência nos formulários e na revisão, com termos claros e “sem preferência”.
- P8-13: mostrar estados aguardando sugestão, vínculo confirmado, transferência e participação encerrada.
- P8-14: conectar atalhos “Conversar” ao privado correto e disponibilizar o coletivo do grupo.
- P8-15: atualizar home, perfil, padrinho/apadrinhados, feed e conversas após mudança de vínculo.
- P8-16: alinhar o comportamento no React e no Flutter, incluindo erro, vazio, sessão expirada e ausência de permissão.

**Aceite:** cada ação essencial pode ser concluída na interface; telas não prometem chat integrado quando só existe backend; nenhuma mudança exige manipulação manual do banco.

## Parte 9 — Homologação, migrations e integração final

**Objetivo:** comprovar o comportamento completo e sua recuperação de falhas.

- P9-01: atualizar test/matching.integration.spec.ts para os contratos atuais, injeção do chat e entidades efetivamente usadas.
- P9-02: validar migrations em banco vazio e em cópia de teste contendo vínculos/grupos antigos.
- P9-03: executar concorrência real em PostgreSQL: aprovações disputando vaga, transferência disputando destino, alteração de configuração durante decisão e encerramento durante envio.
- P9-04: verificar rollback e idempotência de vínculo, grupo, privado e coletivo.
- P9-05: testar o fluxo real em duas contas de aluno e uma de coordenação, nos clientes web e mobile.
- P9-06: simular indisponibilidade do broker, reconexão e falhas depois de commit; preservar dados e recuperar eventos.
- P9-07: medir o algoritmo com volumes realistas e casos de empate. Usar resultados para fixar limites de resposta e estratégia de execução.
- P9-08: atualizar documentação, regras de produto, contratos de API e demonstração para apresentação.
- P9-09: revisar o diff final, registrar validações e integrar apenas após a etapa de implementação ser autorizada.
- P9-10: registrar limitações remanescentes. “Todos os testes passaram” não substitui homologação dos fluxos prometidos.

## 5. Matriz mínima de testes e aceite

| ID | Cenário | Evidência esperada |
|---|---|---|
| T01 | 3×3, capacidade 1, todas as pontuações iguais | Cálculo termina e respeita capacidade |
| T02 | 3 padrinhos/10 alunos, capacidade 3, empates | Termina, aloca até 9 e informa 1 não atendido |
| T03 | Entrada em ordens diferentes | Resultado determinístico conforme política |
| T04 | Comparação com enumeração em casos pequenos | Cardinalidade e objetivo corretos |
| T05 | Padrinho pode receber vários alunos | Não limitar indevidamente a um vínculo |
| T06 | 3 alunos/2 padrinhos igualmente adequados | 2/1 |
| T07 | Padrinho vazio incompatível | Não recebe aluno para equilibrar |
| T08 | Ocupação anterior 2/0 e novo aluno igualmente adequado | Favorece padrinho vazio |
| T09 | Capacidade esgotada | Nenhum caminho cria vínculo excedente |
| T10 | Gênero com preferência declarada | Pontuação utiliza o gênero da outra pessoa |
| T11 | Preferência dos dois lados | Ambos os resultados aparecem na explicação |
| T12 | Sem preferência ou gênero não informado | Sem inferência; neutralidade e pendência distintas |
| T13 | Exclusividade explicitamente aprovada | Par que viola condição não é sugerido |
| T14 | Dois bolsistas e vivência relevante | Contribuição de ProUni conforme peso |
| T15 | ProUni false/false | Não recebe automaticamente pontos de vivência de bolsista |
| T16 | Ambos de outra cidade, origens diferentes | Vivência compartilhada pode contribuir |
| T17 | Informação ausente | Não converter para false ou fabricar preferência |
| T18 | 90 pontos desconhecidos/10 conhecidos | Cobertura visível; não apresentar apenas “100% compatível” |
| T19 | Critério, versão ou alternativa inexistente | API recusa |
| T20 | Tipos incompatíveis e critérios sem mapeamento | API recusa configuração incoerente |
| T21 | Configuração alterada após execução | Sugestão antiga não é aprovada como atual |
| T22 | Par recusado e nova execução | Não reaparece |
| T23 | Reconsiderar par | Libera candidatura a nova sugestão; histórico permanece |
| T24 | Aprovação repetida | Um vínculo e conversas sem duplicação |
| T25 | Dois coordenadores disputam última vaga | Uma aprovação; outra recebe conflito controlado |
| T26 | Vínculo manual com padrinho lotado | Mesma regra do sugerido |
| T27 | Transferência bem-sucedida | Origem encerrada, destino ativo, contadores corretos |
| T28 | Destino sem vaga ou falha durante transferência | Vínculo original preservado |
| T29 | Transferência repetida | Não duplica destino ou eventos |
| T30 | Novo vínculo | Privado e coletivo disponíveis para membros corretos |
| T31 | Leitura em grupo com vários destinatários | Um membro ler não marca como lida para todos |
| T32 | Saída/transferência de integrante | Sem recebimento de mensagens futuras do grupo anterior |
| T33 | Entrada em grupo | Política de histórico respeitada |
| T34 | Encerramento do programa | Envio de chat e permissões de feed acompanham ciclo |
| T35 | Padrinho perde último vínculo | Publicação e moderação ajustadas; leitura conforme participação |
| T36 | Token antigo e identificador de outro grupo | API bloqueia acesso indevido |
| T37 | Broker indisponível/reconexão | Comandos persistidos, eventos recuperáveis |
| T38 | Troca rápida de ciclo/filtro | Resposta antiga não sobrescreve tela do novo ciclo |
| T39 | Cadastro, aprovação, matching, transferência e encerramento | Fluxo completo em web e mobile |
| T40 | Migration com dados legados | Histórico preservado e inconsistências relatadas |

## 6. Mapa dos principais arquivos

Os caminhos abaixo são relativos à raiz do repositório. Arquivos novos são propostas, ainda não criadas no projeto.

| Área | Arquivos/pastas existentes |
|---|---|
| Alocação | code/back/api/src/matching/matching.algorithm.ts e matching.algorithm.spec.ts |
| Execução/aprovação/recusa | code/back/api/src/matching/matching.service.ts, matching.controller.ts, dto/matching.dto.ts, entities/matching.entity.ts |
| Catálogo | code/back/api/src/matching/criterio-catalogo.service.ts, dto/criterio-catalogo.dto.ts, entities/criterio-catalogo.entity.ts |
| Formulários | code/back/api/src/formularios/formularios.service.ts, campos-fixos.ts, entities/formulario.entity.ts |
| Cadastro e respostas | code/back/api/src/cadastro/cadastro.service.ts, dto/cadastro.dto.ts; code/back/api/src/participacoes/entities/participacao.entity.ts |
| Vínculos e situação | code/back/api/src/participacoes/participacoes.service.ts, permissoes-aluno.service.ts |
| Coordenação e ciclos | code/back/api/src/coordenacao/coordenacao.service.ts e controller; code/back/api/src/programas/programas.service.ts e etapas.ts |
| Chat | code/back/api/src/chat/chat.service.ts, chat.controller.ts, entities/chat.entity.ts; eventos/outbox/stream existentes na referência Arthur_Luiz |
| Feed | code/back/api/src/publicacoes/feed-policy.ts, publicacoes.service.ts, publicacoes.controller.ts, feed-stream.service.ts |
| Banco | code/back/api/src/migrations/; scripts de verificação e migrations documentados no projeto |
| Coordenação React | code/front/src/pages/coordenacao/MatchingPage.jsx, MatchingManualPage.jsx, FormulariosPage.jsx, CandidaturaDetalhe.jsx, VinculosAtivos.jsx, UsuariosPage.jsx, comum.jsx |
| Participante React | code/front/src/pages/cadastro/; code/front/src/pages/aluno/AlunoLayout.jsx, ChatPage.jsx e telas de perfil/vínculos; code/front/src/api/client.js |
| Coordenação Flutter | code/mobile/lib/coordenacao/tela_matching_coord.dart, tela_matching_manual_coord.dart e telas de formulários/participantes |
| Dados e clientes Flutter | code/mobile/lib/models/formulario.dart, sessao_usuario.dart, services/coordenacao_api.dart, services/participacoes_api.dart e telas de cadastro/revisão |
| Testes de integração | code/back/api/test/matching.integration.spec.ts; testes existentes de participação, chat, feed e clientes |
| Documentação | docs/2.nosso_produto.md, docs/3.requisitos.md, docs/tecnico/ e contratos atualizados por entrega |

### Componentes novos prováveis

- Avaliador de compatibilidade com resultado de viabilidade, score, cobertura e explicação.
- Serviço único de criação/encerramento/transferência de vínculos.
- Registro persistente de impedimentos de pares e eventos de reconsideração por ciclo.
- Identidade canônica de grupo e associação temporal de membros, se a revisão confirmar que o modelo atual não atende.
- DTO e endpoint de transferência e reconsideração.
- Interface web/mobile de transferência e lista de recusas.
- Serviço/telas de conversas reais no mobile e suporte ao coletivo.

Os nomes concretos devem seguir o padrão do repositório. Evitar introduzir serviços novos quando uma extensão clara do serviço atual resolver o contrato sem duplicação.

## 7. Estratégia de entregas revisáveis

| Entrega | Conteúdo | Condição para avançar |
|---|---|---|
| A | Partes 0 e 1: base preparada e loop corrigido | Regressões, enumeração e suíte pertinente aprovadas |
| B | Parte 2: dados e regras válidos | Cadastro completo e validação de catálogo comprovados |
| C | Parte 3: compatibilidade, explicação e equilíbrio | Cenários acordados de distribuição aprovados |
| D | Parte 4: validade, recusa e reconsideração | Histórico e reexecução coerentes |
| E | Parte 5: vínculos comuns e transferência | Capacidade, rollback e idempotência comprovados |
| F | Partes 6 e 7: comunicação e permissões | Privado/coletivo, transferências e encerramento integrados |
| G | Parte 8: telas completas | Fluxos essenciais disponíveis em web/mobile |
| H | Parte 9: homologação | Matriz de aceite e limitações documentadas |

As telas de uma entrega devem acompanhar o respectivo contrato quando necessário. Esta divisão não exige guardar toda a interface para o final.

## 8. Primeiro passo recomendado

**Começar pela Parte 0 e, em seguida, pela Parte 1.** O loop é um defeito confirmado, tem escopo pequeno e independe dos pesos de produto ainda abertos.

Primeira entrega concreta: regressão segura do empate → correção da alocação → verificação de capacidade e múltiplos apadrinhados → testes existentes → revisão do diff.

**Estado ao concluir este plano:** nenhum código, branch, configuração de execução ou banco do projeto foi modificado. Este documento organiza o trabalho futuro; as novas regras descritas ainda não estão implementadas.

