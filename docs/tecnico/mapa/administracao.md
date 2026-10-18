# Administração do mapa

A coordenação administra conteúdo no React do Ajuda-aí com a mesma sessão do
restante do sistema. Os endpoints exigem `JwtAuthGuard`, `RolesGuard` e papel
`coordenador`. Não há aplicação administrativa ou identidade paralela.

## Conteúdo da coordenação

- **PucStops:** posição escolhida no mapa, XP, raio e ativação. Excluir desativa;
  coletas e créditos já concedidos permanecem imutáveis. [Regras e API](pucstops.md).
- **Eventos:** período, descrição e local opcional por prédio, área ou ponto.
- **Restaurantes:** local obrigatório, horários e ativação; prédios do tipo
  `CAFETERIA` servem como sugestões, sem criar restaurantes automaticamente.
- **Cardápios:** imagem/PDF com vigência, substituição e remoção de arquivo.
  [Regras de conteúdo e upload](eventos-cantinas.md).

Eventos e restaurantes também são desativados ao excluir. PucStops não se
vinculam a ciclos de apadrinhamento nem a versões cartográficas.
Editar conteúdo não exige republicar o mapa.

O seletor recebe da API a envoltória do campus e sua margem; o servidor revalida
a posição. Tokens públicos e configuração web estão no
[README do frontend](../../../code/front/README.md#pucstops-e-mapa-coordenação).

## Dados geográficos e assets

Geografia é publicada por snapshot imutável, com importação transacional e
ativação explícita. Corrigir geografia exige novo código de versão; não há
edição avulsa de prédios, áreas ou grafo pela coordenação.

- [Importação e ativação](dados-geo.md#importador).
- [Publicação de GLBs e manifesto](assets-pipeline.md).
- [Inspeção do grafo](grafos/README.md).
- [Decisão de administração única](../decisoes/ADR-0007-admin-pucmaps.md).

Listas legadas de demonstração não alimentam conteúdo real. Imagens de eventos,
ofertas e notificações exigem desenho próprio; não são habilitadas pela importação
do snapshot. [Fronteiras de infraestrutura](../infraestrutura/evolucao.md).
