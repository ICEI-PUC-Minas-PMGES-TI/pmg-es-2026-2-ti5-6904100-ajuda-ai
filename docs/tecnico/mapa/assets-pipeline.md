# Pipeline de assets 3D

> Estado: LEGADO (descreve o processo do projeto de origem) + PLANEJADO (o que fazer no Ajuda-aí)

## Origem dos GLBs

Os modelos 3D (GLB) do campus usados no projeto PUCMaps são gerados por um processo de modelagem e exportação executado **fora do repositório do projeto de origem** — ou seja, o código-fonte dos modelos (projeto de modelagem 3D, cenas, texturas de origem) não está versionado junto com o código do aplicativo, apenas os arquivos `.glb` finais.

> **ARTEFATO EXTERNO / PROCESSO NÃO REPRODUZÍVEL A PARTIR DO REPOSITÓRIO ATUAL.** O repositório do PUCMaps contém apenas referências de configuração (nomes de flags de build, convenções de nomes de nós dentro dos GLBs) ao processo de geração, não o processo em si nem os arquivos-fonte de modelagem.

## O que é confirmado em código/documentação do projeto de origem

- Os GLBs finais ficam embutidos no app (bundled), organizados em pastas por categoria (campus LOD0, campus LOD1, vegetação, props/veículos, totem).
- Existe uma pasta de debug com GLBs de teste, que não compõe o produto final.
- Existem convenções de nomenclatura de nós dentro dos modelos GLB (relevantes para animação/identificação do totem), definidas no projeto de origem.
- Existem flags de build que ligam/desligam partes do pipeline de renderização 3D (modo debug, picking de prédios, cores de depuração).

## LOD (níveis de detalhe)

Ver [renderizacao-3d.md](renderizacao-3d.md#lod-níveis-de-detalhe).

## Modelo do totem/PucStop — convenções estruturais do GLB

> CONFIRMADO NO ARTEFATO (documentação operacional do projeto de origem). Estas convenções dizem respeito especificamente ao modelo GLB do totem usado no PUCMaps. Preservadas aqui porque são necessárias para reexportar ou dar manutenção a esse modelo sem quebrar a renderização.

- O modelo do totem é um arquivo GLB separado dos chunks de campus (LOD0/LOD1), carregado individualmente pelo renderer via Mapbox (`ModelSource`/`ModelLayer`).
- **Nomes de nó exigidos para a animação do topo do totem:** os nós precisam se chamar exatamente `Aneis_Bronze` e `Joia_Azul`. A rotação do topo do totem depende desses nomes — se o modelo for reexportado com nós renomeados, a animação de giro deixa de funcionar.
- **Canal de UV do vitral:** o material do vitral do totem deve usar **apenas o primeiro canal de UV (`TEXCOORD_0`)**. O motivo confirmado é que o Mapbox ignora um segundo canal de UV (`TEXCOORD_1`) se o modelo o tiver — então qualquer textura do vitral mapeada num segundo canal simplesmente não aparece.
- Essas duas convenções (nomes de nó e uso de `TEXCOORD_0`) são regras de **exportação** do modelo, não de código do app: elas precisam ser respeitadas em qualquer novo `.glb` do totem gerado pela ferramenta de modelagem 3D, antes de o arquivo ser embutido no app/pacote.

> **LEGADO, sujeito a mudança no PucStop:** essas convenções (nomes de nó específicos, dependência de canal único de UV) são amarradas ao **modelo GLB específico do totem do PUCMaps** e ao modo como o renderer de origem lê esse modelo. Se o PucStop do Ajuda-aí vier a usar um modelo 3D novo ou diferente (nova modelagem, nova geometria, outro esquema de materiais), essas convenções **não se aplicam automaticamente** ao novo modelo — elas precisam ser redefinidas (ou confirmadas como as mesmas) junto de quem fizer a nova modelagem, e esta seção deve ser atualizada para refletir o modelo realmente usado pelo PucStop.

## Dependência do pipeline Blender/Python

> CONFIRMADO NO ARTEFATO, mas **fora do repositório** — ver também o aviso em "Origem dos GLBs" acima.

O pipeline de geração dos modelos do campus (prédios, vegetação) depende de um conjunto de scripts Python executados a partir de um projeto Blender, mantido **fora do repositório do PUCMaps**. A documentação de origem descreve, em alto nível, que esse pipeline inclui pelo menos:

- uma etapa que processa os prédios, valida a geometria (incluindo checagem de geometria abaixo do nível do solo) e gera os chunks de LOD0/LOD1;
- uma etapa separada para posicionamento de vegetação (árvores), que também gera saída para os assets do app.

O modelo do totem, especificamente, é descrito como exportado a partir de um arquivo-fonte de modelagem (formato nativo da ferramenta 3D), mantido junto do mesmo pipeline externo.

> **ARTEFATO EXTERNO / PROCESSO NÃO REPRODUZÍVEL A PARTIR DO REPOSITÓRIO ATUAL.** Nem os scripts do pipeline, nem o arquivo-fonte de modelagem do totem, estão versionados no repositório do PUCMaps nem neste repositório. Esta seção não descreve comandos, nomes de pasta ou caminhos de máquina específicos — apenas o que a documentação de origem confirma sobre a existência e o propósito do pipeline. Qualquer comando exato do pipeline não é reproduzido aqui por depender de uma instalação/máquina específica, fora do controle de versão de ambos os projetos.

## Limitações conhecidas

> CONFIRMADO NO ARTEFATO:

- O pipeline de modelagem 3D roda fora do controle de versão de qualquer um dos dois repositórios, o que significa que **novos** modelos (um novo prédio, uma nova versão do totem) não podem ser gerados só a partir do que está neste repositório — depende de acesso a esse processo externo.
- As convenções de nome de nó e de canal de UV do totem são amarradas ao comportamento de leitura de GLB do Mapbox usado no projeto de origem; não há garantia de que outra versão do SDK do Mapbox, ou outro motor de renderização, tenha a mesma limitação (ex.: ignorar um segundo canal de UV) — isso não foi testado neste projeto e não deve ser presumido.

## Ferramentas e dependências do pipeline externo

Não documentadas de forma reproduzível neste repositório — o processo depende de ferramentas de modelagem 3D fora do controle de versão do projeto. Qualquer tentativa de descrever passos exatos aqui seria inventada e não deve ser feita.

## Scripts existentes (confirmados no projeto de origem)

O projeto de origem possui scripts auxiliares para popular/promover versões do mapa e atualizar o arquivo de dados geoespaciais consumido pelo app (`campus-view.json`), mas esses scripts operam sobre a infraestrutura antiga (banco próprio, armazenamento temporário) e não são portados como estão — ver [ADR-0007](../decisoes/ADR-0007-admin-pucmaps.md) e [dados-geo.md](dados-geo.md#importação-futura) para o que é planejado no lugar deles.

## O que fazer no Ajuda-aí (planejado)

1. Confirmar, junto a quem gerou os GLBs originais, se há acesso ao processo de modelagem para eventuais novos modelos (não garantido por este repositório).
2. Selecionar, dos GLBs existentes, apenas os que fazem parte do produto final (excluir a pasta de debug).
3. Embutir os GLBs selecionados no pacote `campus_map` (ver [ADR-0004](../decisoes/ADR-0004-campus-map-package.md) e [ADR-0006](../decisoes/ADR-0006-assets-3d.md)).
4. Validar a resolução de caminho de asset dentro do contexto de pacote Flutter.

Nenhum GLB foi copiado nesta etapa de documentação.
