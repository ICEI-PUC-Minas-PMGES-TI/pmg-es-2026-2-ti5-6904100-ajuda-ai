# ADR-0004 — Pacote Flutter `campus_map`

Estado: aceito.

## Contexto

O mapa precisa conviver com a navegação, sessão e cliente HTTP do Ajuda-aí.
Copiar o aplicativo PUCMaps inteiro introduziria outro roteador, service locator
e fluxo de autenticação.

## Decisão

- Pacote Flutter interno em `code/mobile/packages/campus_map`, consumido por path.
- Widgets e controller expõem a experiência cartográfica; Mapbox e localização
  ficam encapsulados no pacote.
- O app injeta repositórios e serviços de busca, rotas, conteúdo e PucStops.
  HTTP, URLs e JWT pertencem aos adaptadores do app.
- Footprints e manifesto locais permitem renderização e fallback de busca;
  modelos 3D são resolvidos por HTTPS conforme [ADR-0006](ADR-0006-assets-3d.md).
- O pacote não registra rotas nem dependências globais no app principal.

## Consequências

O pacote pode ser testado com câmera, localização e serviços falsos sem iniciar
a engine nativa. Testes assim não comprovam a renderização Mapbox no aparelho.
Cada style/tela possui seus controllers; o descarte invalida operações pendentes.

A `MapaPage` integra o pacote usando a navegação existente.
[Setup e configuração](../mapa/setup-mobile.md).
