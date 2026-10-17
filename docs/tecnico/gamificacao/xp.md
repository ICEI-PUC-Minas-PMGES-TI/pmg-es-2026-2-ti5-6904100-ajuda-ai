# XP — gamificação central

> Estado: PLANEJADO (NÃO IMPLEMENTADO)

## Sistema antigo (projeto de origem)

O PUCMaps possuía um sistema de XP próprio: uma tabela de estatísticas por usuário (XP total acumulado e nível) e um log de eventos de XP, sem relação de chave estrangeira real com uma tabela de usuários, e sem integração com qualquer outro domínio do sistema.

## Motivo para não migrar diretamente

- O sistema antigo não tinha identidade de usuário confiável (ver [ADR-0001](../decisoes/ADR-0001-identidade-central.md)).
- O XP era um domínio isolado, sem relação com outras funcionalidades do produto.
- O Ajuda-aí já prevê gamificação (XP, níveis, conquistas) como funcionalidade de produto mais ampla que o mapa — não faz sentido o domínio de XP pertencer ao módulo de mapa.

Ver [ADR-0002 — XP central](../decisoes/ADR-0002-xp-central.md) para a decisão completa.

## Arquitetura alvo

- **Carteira** por usuário: XP total acumulado e nível derivado, vinculada a `usuarios.id`.
- **Movimentações**: um registro por evento que concede XP, com tipo de origem (ex.: `puc_stop_claim`) e uma chave que garanta idempotência — a mesma origem não pode gerar duas movimentações de crédito.
- Operações que concedem XP como consequência de uma ação (como coletar um PucStop) devem registrar a movimentação e atualizar a carteira **na mesma transação** que registra a ação em si.

## Integração com PucStops

Ver [mapa/pucstops.md](../mapa/pucstops.md). O PucStop é o primeiro consumidor previsto do domínio de XP, mas o domínio de XP não pertence ao mapa — outras funcionalidades do Ajuda-aí (fora do escopo desta integração) também podem conceder XP no futuro, usando a mesma carteira e o mesmo mecanismo de movimentações.

## Integração futura com outras features

> PLANEJADO, fora do escopo desta integração: qualquer outra funcionalidade do Ajuda-aí que vier a conceder XP (por exemplo, conclusão de etapas do programa de apadrinhamento) deve usar o mesmo domínio central de XP, não criar um sistema paralelo.

## Estado

**NÃO IMPLEMENTADO.** Nenhuma tabela, entidade, serviço ou endpoint de XP existe neste repositório até o momento desta documentação.
