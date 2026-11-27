# Parte 3 — pontuação, viabilidade e equilíbrio

Entrega de 22/11/2026. A política do algoritmo passa a ser `3.0.0`. O [mapa de alterações](progresso.md) distingue esta entrega das próximas etapas.

## Resultado

O sistema avalia as condições do programa antes de incluir um par no grafo. Ausência de afinidade, condição obrigatória descumprida e dados insuficientes têm motivos diferentes. A distribuição considera vínculos confirmados e todas as sugestões projetadas nesta rodada; executar não cria vínculos nem transfere pessoas automaticamente.

### Critérios obrigatórios são uma escolha do programa

A coordenação pode marcar correspondência obrigatória ao editar a configuração. Nos dados do cadastro, essa opção existe para áreas de apoio e disponibilidade. Nas áreas exige ao menos uma área solicitada que o padrinho ofereça; na disponibilidade exige ao menos um horário em comum. Modalidade online não constitui horário.

Perguntas adicionais do catálogo também podem exigir a comparação configurada: igualdade para resposta escalar; interseção/diferença para múltipla escolha. Os critérios e tipos continuam validados pelo servidor. Uma condição sem resposta suficiente bloqueia a sugestão com pendência, em vez de ser tratada como falsa.

Nada se torna obrigatório automaticamente. Gênero, interesses, ProUni e mudança de cidade permanecem preferências ponderadas nos campos canônicos. A modalidade de preferência de gênero exclusiva continua fora do produto. O servidor rejeita obrigatoriedade nesses campos e não aceita flags de exclusividade.

```json
{"campoCadastro": "areas", "operacao": "intersecao", "peso": 30, "obrigatorio": true}
```

O peso do exemplo não é uma recomendação global: continua configurável entre 1 e 100.

## Como a pontuação funciona

| Critério do cadastro | Avaliação |
|---|---|
| Áreas de apoio | Fração das áreas solicitadas pelo apadrinhado que o padrinho consegue oferecer. Ter uma em comum estabelece correspondência mínima; atender mais necessidades aumenta a contribuição. |
| Interesses | Interseção dividida pela união dos interesses (Jaccard), sem duplicidades. |
| Disponibilidade | Algum horário declarado em comum; online não basta. Não infere dias/intervalos que ainda não foram coletados. |
| Preferência de gênero | Cada direção representa metade do critério. A preferência é comparada ao gênero do outro participante. A direção sem preferência explicitamente declarada é neutra e conhecida; ausência de declaração permanece desconhecida. |
| ProUni e mudança de cidade | Compartilhar a vivência verdadeira contribui. Dois “não” são neutros, não recebem os pontos dessa vivência. Um valor ausente é desconhecido. |
| Critérios adicionais | Aplicam a comparação explícita do catálogo, respeitando IDs e versões respondidas. |

Os conjuntos canônicos eliminam repetições e diferenças de caixa/espaços sem regravar as respostas originais. Uma preferência declarada é aproveitada mesmo se a outra direção for desconhecida; nesse caso sua cobertura é parcial. Dados de gênero não informado não comprovam preferência atendida nem violada.

### Três indicadores separados

Sejam `W` o peso configurado, `K` o peso dos dados conhecidos, `N` o peso de neutralidades explícitas e `O` os pontos comprovados:

- **Cobertura:** `K / W`. Neutralidade explícita é conhecida; uma ausência não é.
- **Afinidade entre dados avaliáveis:** `O / (K - N)`. Sem dados aplicáveis, é apresentada como indisponível.
- **Aderência comprovada (score):** `O / (W - N)`. Ausências não comprovam afinidade; as neutralidades explícitas são excluídas da base aplicável.

Exemplo: 10 pontos obtidos em 10 conhecidos, com 100 configurados e sem neutralidades, resultam em **afinidade 100%, cobertura 10% e aderência comprovada 10%**. Não se destaca um 100% sem contexto.

A interface usa os valores completos da explicação e mostra `<0,01%` para evidência positiva muito pequena. O campo numérico legado da sugestão continua com quatro casas decimais. Rodadas antigas são identificadas como históricas e não recebem cobertura retroativa inventada.

Um par só entra na alocação quando todas as condições obrigatórias foram conferidas e há alguma evidência positiva de afinidade. Não foi criado corte arbitrário de 70%, nem outra nota mínima. Um par conhecido com zero afinidade pode ser viável nas condições do programa, mas não recebe sugestão automática; a coordenação vê a razão no relatório.

## Ordem dos objetivos da distribuição

1. Respeitar pares permitidos e capacidades restantes.
2. Maximizar a quantidade de sugestões viáveis e o atendimento a alunos ainda sem vínculo.
3. Maximizar a soma da aderência comprovada.
4. Entre soluções de mesma qualidade, minimizar a soma dos quadrados da ocupação final dos padrinhos.
5. Resolver empates de forma estável pelos identificadores.

A qualidade utiliza a precisão já registrada no sistema, quatro casas decimais do score. Não há fator numérico que permita trocar qualidade por melhor distribuição. Custos são comparados lexicograficamente: equilíbrio e desempate não ultrapassam o objetivo de qualidade. A implementação mantém a correção do caminho residual da parte 1 e protege a reconstrução contra ciclos.

A ocupação final é `confirmados + sugeridos nesta rodada`. O custo marginal de acrescentar uma pessoa a um padrinho com carga `n` é `2n + 1`, que equivale a minimizar a carga quadrática. Isso evita concentrar alunos igualmente adequados em um mesmo padrinho.

| Situação | Resultado |
|---|---|
| Dois padrinhos vazios, três alunos igualmente adequados, capacidade três | 2/1 |
| Dois padrinhos vazios, seis alunos igualmente adequados, capacidade três | 3/3 |
| Ocupações 2/0, novo aluno igualmente adequado a ambos | Favorece o vazio |
| Ocupações 3/0 e o primeiro está no limite | Só o segundo tem vaga |
| Padrinho vazio sem par adequado | Não recebe alguém só para preencher |
| Padrinho vazio com menor qualidade | A diferença de qualidade prevalece sobre a ocupação |
| Nenhum par adequado | Nenhuma sugestão artificial; motivo no relatório |

Vínculos existentes continuam ativos. A capacidade por apadrinhado não foi alterada: a premissa R13 permanece aberta. Se o ciclo permite mais de um padrinho por apadrinhado, o primeiro vínculo de um novo aluno tem prioridade sobre ampliar o atendimento de quem já está vinculado; não ocorre transferência automática.

## Relatório e reprodução

Cada rodada registra a versão e a ordem dos objetivos da política, configuração utilizada, dados dos participantes efetivamente avaliados, formulários respondidos e vínculos confirmados considerados. Os dados da rodada são copiados, preservando o resultado se um objeto for posteriormente alterado.

O relatório apresenta novos alunos atendidos, alunos já vinculados, carga confirmada/projetada por padrinho e cada aluno ainda sem sugestão. Diferencia falta de vagas, vagas disputadas na rodada, falta de dados, condições obrigatórias e ausência de afinidade comprovada. Explicações dos pares sugeridos incluem pesos, pontos, cobertura e a ocupação do padrinho.

O relatório é uma fotografia da rodada, não uma reserva de vagas nem a ocupação ao vivo após decisões posteriores. As regras de aprovação, obsolescência por mudança de configuração e recusa/reconsideração serão tratadas na parte 4. Vínculo manual/transferência e permissões de chat/feed continuam nas partes 5 a 7.

## Validação

Os testes incluem os exemplos acima, comparação com enumeração independente de todas as alocações em 512 grafos pequenos, os 4.096 grafos de regressão da parte 1, execução do serviço com snapshots e preservação de vínculos, contratos de configuração e renderização web/mobile. A enumeração é independente do algoritmo de fluxo.

PostgreSQL isolado, concorrência real e a regressão ampliada do mobile continuam sujeitos aos limites registrados nas partes anteriores; não houve migração nem execução contra dados reais.


### Resultados finais

| Verificação | Resultado |
|---|---|
| Backend: toda a pasta `src` | 502 testes / 48 arquivos aprovados |
| Web: cadastro, formulários e política de matching | 38 testes / 4 arquivos aprovados |
| Flutter: cadastro de preferência, coordenação e indicadores da política | 20 testes / 3 arquivos aprovados |
| TypeScript dos testes de matching | Aprovado |
| Build Nest e build Vite | Aprovados; Vite mantém aviso sobre tamanho dos bundles |
| Dart analyze dos arquivos de matching alterados | Sem problemas |
| Oxlint do backend alterado | Aprovado |
| `git diff --check` | Sem erros |

Comandos principais, a partir de cada componente:

```powershell
# code/back/api
node node_modules/vitest/vitest.mjs run src --configLoader runner --no-cache --no-file-parallelism --pool threads --maxWorkers 1 --reporter dot
node node_modules/@nestjs/cli/bin/nest.js build

# code/front
node --test --test-concurrency=1 test/matching-cadastro.test.mjs test/matching-politica.test.mjs test/f02-f07.test.mjs test/perguntas-adicionais.test.mjs
npm run build

# code/mobile
flutter test --no-pub --concurrency=1 test/preferencia_genero_test.dart test/coordenacao_matching_test.dart test/matching_politica_test.dart
```

A suíte ampliada de cadastro/sessão do Flutter continua limitada pelos pacotes `gal` e `path_provider` ausentes no ambiente, conforme registrado na parte 2. Os testes direcionados desta entrega passaram com SDK e temporários isolados no workspace. A validação contra PostgreSQL real continua na parte 9.

Nenhum commit, push, troca de branch ou migração de banco foi realizado nesta etapa. A pasta original do GitHub Desktop foi consultada apenas para leitura; o patch incremental deve ser aplicado sobre a parte 2 já existente nela.
