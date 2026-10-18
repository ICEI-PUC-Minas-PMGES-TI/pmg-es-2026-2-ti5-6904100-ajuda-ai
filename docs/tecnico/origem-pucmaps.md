# Origem e atribuição PUCMaps

Parte do mapa do campus do Ajuda-aí deriva do projeto acadêmico
[PUCMaps](https://github.com/ICEI-PUC-Minas-PMGES-TI/pmg-es-2026-1-ti5-6904100-pucmaps).
A referência de origem é o commit
`776e11391439b6c7ee6b85438613d0d74d652362`.

O `CITATION.cff` de origem declara **CC-BY-4.0** e identifica os autores
Gabriel Assis de Souza, João Pedro Lezsi Fernandes, João Pedro Peres Barbosa,
Luis Henrique Gonçalves Barbosa e Marcela Mendes Campos, com os orientadores
Artur Martins Mol, Cleiton Silva Tavares e Leonardo Vilela Cardoso.
[Metadados de citação da origem](https://github.com/ICEI-PUC-Minas-PMGES-TI/pmg-es-2026-1-ti5-6904100-pucmaps/blob/776e11391439b6c7ee6b85438613d0d74d652362/CITATION.cff).

A integração reconhece essa autoria; não atribui os trabalhos de origem à equipe
do Ajuda-aí. A forma final dos créditos de distribuição deve ser confirmada
com os responsáveis pelo projeto, conforme a pendência de atribuição já registrada.

## Dados e assets derivados

- **Footprints e identidade:** `code/mobile/assets/campus/campus_footprints.geojson`
  e `campus_chunks.json` da origem alimentam os assets de
  `code/mobile/packages/campus_map/assets/data/`. A junção usa o ID exato;
  coordenadas, identidade e metadados de origem são preservados.
- **Dados geográficos:** `code/back/api/scripts/mapa/dados/pucmaps-12.json`
  reúne a versão 12 da origem e os footprints do pacote. O snapshot guarda
  proveniência e hash; [dados-geo.md](mapa/dados-geo.md) descreve as transformações.
- **GLBs:** prédios LOD0/LOD1, vegetação, props e o modelo
  `assets/totens/torre_pucstop.glb` são derivados dos artefatos PUCMaps.
  O manifesto registra hashes, caminhos e posicionamento. Publicação e
  limitações do pipeline externo: [assets-pipeline.md](mapa/assets-pipeline.md).
- **Código:** renderer 2D, abreviação de rótulos, organização de LOD e
  controllers de ambiente/diagnóstico foram adaptados do Flutter de origem.
  Rotas foram reimplementadas; as referências SQL e fixtures de paridade
  preservam o vínculo com os critérios de custo da origem.

Os dados cartográficos declaram **OpenStreetMap**, **ODbL 1.0** e
**© OpenStreetMap contributors**. Esses créditos permanecem nos assets e na
atribuição do mapa; a licença geral do projeto não os substitui. Logo e controles
de atribuição do Mapbox permanecem habilitados.

## Limitações de proveniência

Os fontes de modelagem e scripts Blender/Python não estão nestes repositórios;
novos GLBs dependem do pipeline externo. O áudio do totem não é distribuído:
sua origem/licença não foi confirmada.

As listas de totens de demonstração da origem não são dados de produção.
Conteúdo do campus é cadastrado pela coordenação. Credenciais, contas de serviço,
usuários e infraestrutura do PUCMaps não são requisitos do runtime do Ajuda-aí.
Decisões de integração estão nos [ADRs](README.md#arquitetura-e-decisões).
