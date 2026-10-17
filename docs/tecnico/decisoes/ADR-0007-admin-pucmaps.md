# ADR-0007 — Admin do PUCMaps

> Estado: PLANEJADO (inventário inicial feito; nenhuma reimplementação realizada)

## Contexto

O PUCMaps possui uma aplicação administrativa separada, em Angular, usada para gerenciar versões do mapa, prédios, áreas, rotas, eventos, cantinas e totens, incluindo ferramentas de diagnóstico como um visualizador de grafo e um editor/preview de estilo de mapa.

O Ajuda-aí já possui sua própria interface de coordenação, em React, com autenticação e navegação próprias, usada pela coordenação do programa de apadrinhamento.

Manter duas aplicações administrativas (Angular para o mapa, React para o programa de apadrinhamento) duplicaria autenticação, infraestrutura de frontend e experiência de uso para quem administra o sistema.

## Decisão

- A aplicação Angular do PUCMaps, **como aplicação**, não é migrada para o Ajuda-aí.
- Isso **não significa descartar as funcionalidades administrativas úteis** que ela oferece. Cada funcionalidade é inventariada individualmente (ver [mapa/administracao.md](../mapa/administracao.md)) e classificada em uma das opções:
  - **Reimplementar no React da coordenação** — quando a funcionalidade tem valor de produto para quem administra o Ajuda-aí (ex.: gerenciar versões do mapa, cadastrar prédios/áreas).
  - **Backend/script administrativo** — quando uma tela dedicada não agrega valor e a operação pode ser feita por um script ou endpoint administrativo simples (ex.: forçar o processamento de uma versão).
  - **Manter apenas como diagnóstico** — quando a ferramenta é útil para depuração técnica, mas não é uma funcionalidade de produto (ex.: visualizador de grafo).
  - **Descartar** — quando a funcionalidade depende de infraestrutura que não será trazida (ex.: pipeline de tiles raster) e não tem substituto necessário.
  - **Ainda avaliar** — quando a classificação depende de uma decisão de produto ainda não tomada.
- O backend que sustenta essas funcionalidades passa a ser o NestJS do Ajuda-aí, não um backend separado do PUCMaps.

## Consequências

- Uma única experiência de administração/coordenação, com uma única autenticação.
- Menos tecnologia duplicada (não é necessário manter Angular no projeto).
- Algumas telas precisarão ser reconstruídas no React, o que é trabalho real e deve ser planejado, não assumido como trivial.
- O inventário em [mapa/administracao.md](../mapa/administracao.md) é o documento vivo que acompanha essa decisão; nenhuma funcionalidade deve ser perdida silenciosamente só porque a implementação original era em Angular.
