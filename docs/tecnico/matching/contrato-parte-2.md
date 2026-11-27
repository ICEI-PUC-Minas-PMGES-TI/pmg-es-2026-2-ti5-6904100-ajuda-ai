# Parte 2 — dados e critérios de compatibilidade

Entrega de 22/11/2026. Consulte o [mapa completo](progresso.md) e o [plano original](plano-original.md).

## Comportamento entregue

O cadastro armazena `genero` e `preferenciaGenero` separadamente. Preferência é opcional, pode aceitar vários gêneros e tem duas escolhas explícitas:

```json
{"modo": "sem_preferencia", "generos": []}
```

```json
{"modo": "preferencia", "generos": ["Feminino", "Não binário"]}
```

Os gêneros selecionáveis são `Feminino`, `Masculino` e `Não binário`. `Prefiro não informar` continua sendo uma resposta válida para o próprio gênero, sem representar um gênero desejado. O servidor rejeita objetos, modos, opções ou duplicidades inválidas, inclusive tentativa de incluir exclusividade. A ausência histórica permanece ausência; não é convertida em “sem preferência”. As respostas enviadas anteriormente não são regravadas.

Web e Flutter permitem informar, revisar e enviar a preferência; o Flutter a reconstrói da resposta do servidor e a preserva ao copiar os dados. Consultas da coordenação exibem o novo dado. O acompanhamento web também identifica o ciclo da candidatura.

## Fontes sem perguntas repetidas

| `campoCadastro` | Dados utilizados | Operação permitida |
|---|---|---|
| `disponibilidade` | Horários declarados nos dois cadastros | `intersecao` |
| `areas` | Áreas oferecidas/necessárias | `intersecao` |
| `interesses` | Interesses de ambos | `intersecao` |
| `preferenciaGenero` | Preferência de cada pessoa e gênero do outro participante | `preferencia_genero` |
| `bolsistaProuni` | Atributo existente no cadastro | `vivencia_compartilhada` |
| `deOutraCidade` | Atributo existente no cadastro | `vivencia_compartilhada` |

A configuração escolhe a fonte e o peso inteiro entre 1 e 100. Os critérios novos não são ativados automaticamente. O peso inicial apresentado ao adicionar uma linha é editável; não constitui uma política fixa de importância relativa.

```json
{"campoCadastro": "preferenciaGenero", "operacao": "preferencia_genero", "peso": 30}
```

O número acima é um exemplo de configuração. Os critérios adicionais continuam usando `criterioPadrinhoId` e `criterioApadrinhadoId`. Misturar as duas fontes na mesma linha é inválido. Não há necessidade de migração de tabela: respostas e critérios são campos JSONB já existentes.

## Avaliação dos novos dados

- Só uma preferência de gênero declarada: verifica-se o gênero do outro participante. Quando os dois declaram preferência, cada direção representa metade do atendimento do critério. As duas atendidas produzem fator 1; apenas uma, fator 0,5. Esse fator é multiplicado pelo peso escolhido pela coordenação.
- Duas escolhas explícitas “sem preferência” são neutras. Preferência ausente ou gênero necessário não informado produz indicação de dados insuficientes, sem inventar uma resposta.
- ProUni e mudança de cidade valorizam `true/true`. `true/false` não ganha os pontos do critério; `false/false` é neutro e não ganha o benefício da vivência. Mudança de cidade não significa morar na mesma cidade de origem.
- `Online` é modalidade e não gera interseção de horários sozinho. O modelo detalhado de dias/intervalos permanece para a etapa de pontuação.
- A explicação mostra a fonte, os valores, peso, contribuição, neutralidade e atendimento parcial. Preferências são apresentadas em linguagem legível.

Essa avaliação inicial foi antecipada da parte 3 para que os novos campos realmente alimentem a execução. Ela não conclui cobertura do score, condições eliminatórias nem equilíbrio da distribuição. O denominador histórico ainda considera apenas os critérios utilizáveis: não interpretar esse score como cobertura completa ou probabilidade de sucesso.

## Integridade do catálogo

Salvar ou duplicar formulário consulta o catálogo real. IDs, versões, tipos e alternativas precisam corresponder; não basta enviar números válidos sintaticamente. Novas inclusões exigem critério ativo e versão atual. Uma pergunta já existente pode manter sua versão histórica ou seu critério posteriormente desativado. Enunciados das perguntas podem ser contextualizados, mas as alternativas pertencem à versão do catálogo.

A comparação entre catálogos distintos exige equivalência semântica que o sistema ainda não oferece; esta entrega permite o mesmo critério nos dois públicos e rejeita pares arbitrários de IDs. Igualdade exige tipo escalar; interseção/diferença exigem múltipla escolha. Uma mesma fonte não pode ser repetida com outra operação para duplicar seu peso.

Durante a execução, referências dos formulários são carregadas em lote. Cada snapshot respondido é conferido pela versão real do catálogo; versões inexistentes e alternativas inventadas não produzem afinidade. O identificador da pergunta respondida continua vindo do snapshot do candidato, preservando respostas antigas mesmo quando a pergunta atual tem outro ID.

Critérios referenciados apenas em candidaturas antigas também contam como usados: impedem exclusão física e protegem a versão. Alterar enunciado ou rótulos de uma versão usada cria nova versão, preservando a anterior. Web e mobile mantêm os IDs das alternativas ao editar rótulos. Alterações e inclusões usam locks do registro do catálogo; os testes locais em memória não substituem verificação concorrente no PostgreSQL.

## Limites de política

Não há modalidade “exclusivamente”, escolha individual de relevância para ProUni/cidade nem complementação editável de candidaturas já enviadas. Não foram fixados novos pesos globais, nota mínima ou tolerância para equilíbrio. Flags obrigatórias são recusadas em vez de serem gravadas sem efeito. A política e a execução de condições eliminatórias pertencem à parte 3.

A capacidade por apadrinhado não foi alterada e nenhuma restrição nova foi aplicada ao banco: a premissa R13 precisa ser resolvida antes disso. A capacidade de um padrinho receber vários apadrinhados permanece.

## Validação

Os resultados finais estão registrados ao final deste documento. Não foi usado banco real, executada migração ou criado commit/push. O patch incremental desta entrega parte das mudanças das partes 0 e 1 já aplicadas.

### Resultados finais

| Verificação | Resultado |
|---|---|
| Vitest, toda a pasta `src` do backend | 479 testes / 45 arquivos aprovados |
| Web: contrato de cadastro, formulários e novos critérios | 31 testes / 3 arquivos aprovados |
| Flutter: preferências e matching da coordenação | 14 testes / 2 arquivos aprovados |
| TypeScript dos testes alterados e build Nest | Aprovados |
| Build Vite | Aprovado; aviso existente sobre tamanho dos bundles |
| Dart analyze dos arquivos alterados | Sem problemas reportados |
| Oxlint do backend alterado e `git diff --check` | Aprovados |

Comandos principais reproduzíveis, a partir de cada componente:

```powershell
# code/back/api
node node_modules/vitest/vitest.mjs run src --configLoader runner --no-cache --no-file-parallelism --pool threads --maxWorkers 1 --reporter dot
node node_modules/@nestjs/cli/bin/nest.js build

# code/front
node --test --test-concurrency=1 test/matching-cadastro.test.mjs test/f02-f07.test.mjs test/perguntas-adicionais.test.mjs
npm run build

# code/mobile, depois de instalar as dependências do pubspec.lock
flutter test --no-pub --concurrency=1 test/preferencia_genero_test.dart test/coordenacao_matching_test.dart
```

Os testes Flutter `cadastro_test.dart`, `padrinho_test.dart` e `sessao_situacao_test.dart` também foram tentados, mas não carregaram por falta dos pacotes `gal` e `path_provider` no ambiente. A resolução offline confirma ausência de `gal 2.3.3`; o carregamento das dependências pela rede não foi concluído. Não foram alterados os manifests nem o lockfile para contornar essa limitação. Esses três arquivos precisam ser executados com todas as dependências instaladas antes de considerar a regressão completa do mobile validada.

A instalação global do Flutter e a pasta original do projeto são protegidas contra escrita nesta sessão. Os testes aprovados usaram uma cópia isolada do SDK e uma pasta temporária dentro do workspace. Essa preparação não integra o patch de código.
