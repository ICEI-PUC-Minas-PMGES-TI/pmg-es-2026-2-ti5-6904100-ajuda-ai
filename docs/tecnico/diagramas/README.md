# Diagramas técnicos

> Estado: PLANEJADO (plano de diagramas; nenhum arquivo `.puml`/imagem foi movido nesta etapa)

Este documento registra o plano de diagramas técnicos da integração. Nenhum diagrama do projeto PUCMaps foi copiado para este repositório nesta etapa — mover arquivos de diagrama é trabalho de implementação, não de documentação inicial.

## Diagramas existentes no projeto de origem (PUCMaps) e sua avaliação

| Diagrama (origem) | O que mostra | Representa o estado atual do PUCMaps? | Ação recomendada |
|---|---|---|---|
| Diagrama de classes da API (PlantUML, gerado a partir do código) | Classes de domínio dos módulos auth, business, event, gamification, map, totem | Sim, é o mais atualizado | ADAPTAR — regenerar cobrindo apenas os módulos efetivamente portados para o Ajuda-aí |
| Diagrama de dados "Ajuda-aí completo" (proposta) | Modelo de dados integrado proposto (identidade, programas, matching, mapa, XP, PucStops) | É uma proposta, não implementação | ADAPTAR — usar como ponto de partida, mas alinhar com as decisões já tomadas nos ADRs desta árvore (ex.: XP como carteira+movimentações, identidade por `usuarios.id`) e marcar claramente como "alvo", não "atual" |
| Diagrama de classes de domínio "Ajuda-aí" (proposta) | Classes de domínio propostas para o sistema integrado | Proposta | ADAPTAR, pela mesma razão acima |
| Diagrama de componentes/implantação (AWS, API Gateway, Lambdas, EC2) | Infraestrutura de produção do PUCMaps, hoje desligada | Não — a infraestrutura de produção do projeto de origem foi desligada | DESCARTAR — não representa nem o estado atual nem o alvo da integração |
| Diagramas de classe por módulo (auth/business/event/map, arquitetura antiga) | Classes de módulos de uma arquitetura de microsserviços nunca totalmente implementada | Não — parcialmente fictícios segundo a própria auditoria do projeto de origem | DESCARTAR |
| Diagrama entidade-relacionamento genérico ("der.png") | Não é um diagrama do PUCMaps — é um template de outro domínio (identificado na auditoria da documentação) | Não se aplica | DESCARTAR |
| Diagrama de componentes genérico ("componentes.png") | Não é um diagrama do PUCMaps — é um template de outro domínio | Não se aplica | DESCARTAR |
| Fluxograma Mermaid de arquitetura de runtime local (auditoria técnica do projeto de origem) | Arquitetura local do PUCMaps (Flutter, Angular, API, Postgres, Redis, fila local, Mapbox, OSM) | Sim, para o projeto de origem | RECRIAR — serve de inspiração para o diagrama Mermaid da arquitetura-alvo em [arquitetura.md](../arquitetura.md), já criado nesta etapa, mas não deve ser copiado como se descrevesse o Ajuda-aí |

## Diagramas criados nesta etapa

- [arquitetura.md](../arquitetura.md) contém um diagrama Mermaid da arquitetura-alvo da integração (app Flutter + pacote `campus_map` + backend NestJS + schemas `feed`/`mapa` + Mapbox + Azure).

## Plano

- Diagramas marcados ADAPTAR: usar como ponto de partida quando a modelagem de dados correspondente for implementada, revisando campos e nomes para bater com os ADRs desta árvore.
- Diagramas marcados DESCARTAR: não migrar.
- Diagramas marcados RECRIAR: redesenhar a partir do zero para representar o estado atual ou a arquitetura-alvo do Ajuda-aí, sem copiar a estrutura do diagrama antigo.
- Nenhum diagrama movido deve manter nomes de pessoas, contas pessoais ou caminhos locais — ver [origem-pucmaps.md](../origem-pucmaps.md#limitações-herdadas).
