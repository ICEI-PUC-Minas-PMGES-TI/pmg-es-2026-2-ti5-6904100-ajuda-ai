# Matching — estabilização, partes 0 e 1

Data: 20/11/2026.

## Base e ambiente

- Branch de trabalho: `fix/matching-estabilizacao-parte-0-1`.
- Base: `origin/Arthur_gv`, commit `ac9975c31161ef555fb71c6e378024dc66aca664`, de 20/11/2026.
- Essa referência incorpora a Sprint-6 e possui quatro commits adicionais. Outras linhas de desenvolvimento, como chat e missões, não foram mescladas nesta entrega.
- Trata-se da referência mais recente entre as disponíveis localmente, não de uma confirmação do estado atual do servidor.
- O fetch foi tentado na origem e na cópia de trabalho. Na origem houve bloqueio de escrita em FETCH_HEAD; na cópia o ambiente não conseguiu executar a autenticação GitHub. O conector também não encontrou o repositório na conta disponível.
- Foi preparado um checkout Git independente em um diretório de trabalho com escrita permitida. Foram reutilizados os objetos e as referências locais, sem alternar a branch nem modificar os arquivos da pasta original.
- Configuração Git e arquivos locais de ambiente da origem não foram copiados. As dependências foram restauradas no checkout isolado com npm ci --ignore-scripts, seguindo o package-lock.json existente, sem alterar os manifestos.
- A branch não acompanha a branch Arthur_gv como upstream de publicação. Nenhum push ou merge foi feito.
- Nenhum banco foi acessado, iniciado ou alterado. Banco isolado e validação de migrations continuam necessários antes das entregas transacionais; o algoritmo desta etapa é puro e não depende de PostgreSQL.

## Escopo entregue

1. Preparar base local identificada e branch isolada.
2. Reproduzir o loop de forma interrompível.
3. Corrigir a reconstrução indireta de caminhos causada pelo desempate.
4. Verificar cobertura, score, capacidade e determinismo.
5. Registrar validações e limitações para a próxima etapa.

Não foram implementados nesta etapa novos pesos, balanceamento dos grupos, preferências de gênero, ProUni, reconsideração de pares, transferência ou integração de chat. O objetivo atual do algoritmo permanece maximizar o número de pares e, entre essas alocações, maximizar a soma das pontuações.

## Defeito e correção

O relaxamento de Bellman-Ford substituía o predecessor também quando a distância era igual. No grafo residual, arcos reversos podem formar caminhos alternativos de custo zero. A troca de predecessores por empate podia criar um ciclo no caminho reconstruído, e o laço de aumento de fluxo não terminava.

O relaxamento agora só substitui um predecessor quando encontra custo estritamente menor. Empates preservam o primeiro caminho encontrado. IDs e arestas já são ordenados antes da busca, mantendo o resultado reproduzível.

A correção não impõe um único apadrinhado por padrinho. As capacidades continuam sendo parâmetros do algoritmo. A política de equilibrar grupos permanece para a etapa de compatibilidade/distribuição.

## Testes de regressão

Arquivo novo: `code/back/api/src/matching/matching.algorithm.regression.spec.ts`.

O teste transpila o arquivo real do algoritmo e o executa em um Worker. O prazo é supervisionado fora do cálculo e pode terminar efetivamente um loop síncrono. Não há cópia alternativa da implementação no teste.

### Evidência antes da correção

Os três casos 3×3 com capacidade 1 e scores uniformes de 0, 0.5 e 1 falharam por exceder três segundos. A suíte foi encerrada normalmente, sem ficar bloqueada.

### Evidência depois da correção

- 3 padrinhos/3 apadrinhados, capacidade 1 e scores 0, 0.5 ou 1: termina e gera três pares.
- 3 padrinhos/10 apadrinhados, capacidade 3: termina e gera nove pares, com três por padrinho.
- Ordem de arestas e mapas invertida: produz o mesmo resultado.
- Sem arestas ou capacidade: retorna lista vazia.
- Capacidade restante: respeita o limite já descontado pelo serviço.
- Todos os 4.096 grafos da matriz de 2 padrinhos/3 apadrinhados: cardinalidade e score coincidem com enumeração exaustiva, respeitando as capacidades.
- Os quatro testes anteriores do algoritmo continuam aprovados.

Total da verificação direcionada: **12 testes aprovados**, incluindo oito testes novos.

## Comandos de validação

Executar em `code/back/api`, com as dependências instaladas:

```powershell
node node_modules/vitest/vitest.mjs run src/matching/matching.algorithm.spec.ts src/matching/matching.algorithm.regression.spec.ts --configLoader runner --no-cache --no-file-parallelism --pool threads --maxWorkers 1 --reporter verbose
node node_modules/vitest/vitest.mjs run src --configLoader runner --no-cache --no-file-parallelism --pool threads --maxWorkers 1 --reporter dot
node node_modules/typescript/bin/tsc --ignoreConfig --noEmit --target es2023 --module nodenext --moduleResolution nodenext --esModuleInterop --skipLibCheck --types vitest/globals,node src/matching/matching.algorithm.ts src/matching/matching.algorithm.regression.spec.ts
node node_modules/typescript/bin/tsc --project tsconfig.build.json --noEmit --incremental false
node node_modules/@nestjs/cli/bin/nest.js build
node node_modules/oxlint/dist/cli.js src/matching/matching.algorithm.ts src/matching/matching.algorithm.regression.spec.ts
node node_modules/prettier/bin/prettier.cjs --check src/matching/matching.algorithm.ts src/matching/matching.algorithm.regression.spec.ts
git diff --check
```

O parâmetro `--ignoreConfig` é suportado pelo TypeScript 6 declarado no projeto.

## Validação ampliada

- A primeira tentativa encontrou dependências de mensageria ausentes na instalação de origem: 41 arquivos passaram e dois não carregaram. Não foi tratado como aprovação integral.
- Depois da restauração pelo package-lock.json, a suíte sob src foi repetida: **43 arquivos aprovados e 437 testes aprovados**, sem falhas nem testes ignorados nessa seleção. Duração local: 146,52 segundos.
- A checagem de tipos dos arquivos alterados e da API completa passou.
- O build da API pelo Nest CLI passou.
- O lint dos arquivos alterados, a formatação e a verificação de espaços do diff passaram.
- Não foram executados os testes de integração PostgreSQL da pasta test; o teste de matching dessa pasta continua desatualizado, conforme o plano das próximas etapas.
- O npm emitiu avisos de engine: algumas ferramentas de desenvolvimento declararam uma versão de Node superior à versão local 24.11.1. As verificações acima foram concluídas, mas o runtime deve ser alinhado antes da homologação final.

## Medição local indicativa

Cenários completos, scores iguais a 1, capacidade 3 por padrinho. O tempo mede apenas o cálculo em uma VM Node, sem banco, rede ou HTTP, e foi coletado enquanto outras verificações também estavam em execução.

| Padrinhos | Apadrinhados | Arestas | Pares alocados | Tempo local |
| --------- | -----------: | ------: | -------------: | ----------: |
| 3         |            3 |       9 |              3 |        4 ms |
| 3         |           10 |      30 |              9 |        1 ms |
| 10        |           30 |     300 |             30 |        4 ms |
| 30        |           90 |   2.700 |             90 |       32 ms |
| 50        |          200 |  10.000 |            150 |      182 ms |

Esta medição não é um teste de carga da API, não valida 500 usuários simultâneos e não define um SLA. A execução de produção continua síncrona; isolamento de cálculo e limite operacional devem ser decididos a partir das medições e dos volumes esperados. O Worker desta entrega é proteção da suíte de regressão.

## Pendências e próximo passo

1. Atualizar as referências em um ambiente com autenticação GitHub funcional e confirmar se a base avançou.
2. Preparar PostgreSQL isolado antes de validar operações transacionais e migrations; não reutilizar banco compartilhado.
3. Alinhar o runtime de desenvolvimento às engines declaradas pelas ferramentas antes da homologação final.
4. Iniciar a parte 2: contrato de dados e critérios válidos, com preferência de gênero, reutilização dos dados existentes e regras de compatibilidade explícitas.

A parte 1 está implementada e verificada no checkout de trabalho. A preparação local da parte 0, incluindo dependências reproduzíveis, foi executada; atualização remota e banco de integração não foram considerados concluídos.

## Transporte da branch para a pasta original

Um bundle Git da branch pode ser importado sem alterar a branch ativa nem os arquivos de trabalho da pasta original:

```powershell
git bundle verify <caminho-do-bundle>
git fetch <caminho-do-bundle> fix/matching-estabilizacao-parte-0-1:fix/matching-estabilizacao-parte-0-1
```

O bundle incremental requer a base ac9975c, já presente no repositório de origem consultado. A importação apenas cria a referência local; checkout e integração devem respeitar eventuais alterações locais do usuário.
