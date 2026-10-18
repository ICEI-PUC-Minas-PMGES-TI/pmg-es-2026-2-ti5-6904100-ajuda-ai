# Inspeção do grafo

O gerador lê um snapshot local e produz visões topológica, geográfica e HTML
interativo, sem banco, rede ou bibliotecas adicionais.
Os outputs são derivados e não são versionados; o snapshot é a fonte de verdade.

Na raiz do projeto, com Python 3.10+:

```powershell
python code/back/api/scripts/mapa/gerar-grafos.py --saida "$env:TEMP/ajuda-ai-grafo"
```

Opções: `--snapshot <arquivo.json>` e `--saida <diretorio>`.
O snapshot padrão é `code/back/api/scripts/mapa/dados/pucmaps-12.json`.
Sem `--saida`, os arquivos ficam nesta pasta e são ignorados pelo Git.

Abra `campus-graph.html` na saída: arraste para pan, use a roda para zoom
e o seletor para inspecionar nós/arestas, inclusive coincidentes.
Os SVGs `campus-graph-topologico.svg` e `campus-graph-geografico.svg`
podem ser usados em apresentações. `resumo.json` registra contagens e SHA-256
do snapshot utilizado. São saídas locais, não assets do aplicativo.

A visão topológica usa forças determinísticas e não mede distância física.
A geográfica usa projeção equirretangular local, norte para cima e escala;
não certifica condições de acessibilidade do campus.

Cinza indica arestas acessíveis; laranja, não acessíveis.
Nós de prédio são azuis; caminhos, escuros; componentes secundários, laranja.
Arestas dirigidas reversas e nós coincidentes podem se sobrepor.
Conectores sem LineString ligam nós coincidentes, sem segmento visível;
distância zero não significa custo de tempo zero. Use o seletor para distingui-los.

Componentes desconectados não têm rota entre si. A geração não corrige nem altera
o grafo. [Regras do algoritmo](../rotas.md).
