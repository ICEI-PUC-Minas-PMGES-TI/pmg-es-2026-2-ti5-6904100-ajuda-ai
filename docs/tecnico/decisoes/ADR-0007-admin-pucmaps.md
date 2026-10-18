# ADR-0007 — Administração integrada à coordenação

Estado: aceito.

## Contexto

O PUCMaps possui admin Angular próprio. O Ajuda-aí usa React para a coordenação,
com identidade e navegação compartilhadas com o programa de apadrinhamento.
Dois painéis duplicariam autenticação, operação e experiência administrativa.

## Decisão

- Administração de conteúdo do campus na coordenação React do Ajuda-aí,
  sustentada pela API NestJS e seus guards.
- Dados geográficos e assets publicados por scripts versionados, sem depender
  do pipeline assíncrono, editor de estilo ou serviços do admin de origem.
- Inspeção do grafo como ferramenta de engenharia regenerável, fora do runtime.
- Não incorporar o aplicativo Angular nem seu modelo de autenticação.

## Consequências

PucStops, eventos, restaurantes e cardápios usam as mesmas permissões do restante
da coordenação. Geografia é alterada por nova versão de snapshot, não por CRUD
avulso. Uma nova necessidade administrativa deve ser avaliada pelo valor para
o Ajuda-aí, sem obrigação de reproduzir telas da origem.

[Responsabilidades e operações](../mapa/administracao.md).
