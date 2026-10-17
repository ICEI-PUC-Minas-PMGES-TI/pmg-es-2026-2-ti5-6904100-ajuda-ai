# PucStops

> Estado: PLANEJADO (nenhum código implementado)

## O que são

PucStops são pontos de interesse georreferenciados no campus que o usuário pode "coletar" (claim) ao estar fisicamente próximo, concedendo XP. Esta funcionalidade é a reescrita, no domínio do Ajuda-aí, do conceito de "totens" do projeto PUCMaps.

## Por que não é uma migração direta do sistema antigo

O sistema de totens do projeto de origem apresentava limitações conhecidas, identificadas em auditoria técnica do próprio projeto:

- A validação de proximidade (o usuário está de fato perto do totem?) era feita **apenas no cliente**, nunca confirmada pelo servidor.
- O endpoint de confirmação do claim não era protegido por autenticação de forma a identificar o usuário de maneira confiável.
- Havia totens de exemplo/teste (fallback) embutidos no código do cliente.

Essas limitações não são portadas. A arquitetura-alvo do PucStop corrige exatamente esses pontos.

## Arquitetura alvo

```
localização do cliente
      │
      ▼
  backend (autenticado via JWT do Ajuda-aí)
      │
      ▼
validação geoespacial no servidor (distância até o PucStop)
      │
      ▼
registro do claim (idempotente — não permite coletar o mesmo PucStop duas vezes)
      │
      ▼
crédito de XP, na mesma transação do claim
```

Pontos obrigatórios desta arquitetura, todos ainda não implementados:

- A identidade do usuário vem do JWT (`usuarios.id`, ver [ADR-0001](../decisoes/ADR-0001-identidade-central.md)), nunca de um campo enviado livremente pelo cliente.
- A validação de proximidade (geofence) é feita no servidor, usando uma função geoespacial de distância (ex.: `ST_DWithin` do PostGIS) comparando a localização enviada pelo cliente com a localização cadastrada do PucStop, considerando uma margem de precisão do GPS.
- O registro do claim é idempotente: coletar o mesmo PucStop duas vezes não deve conceder XP duas vezes.
- O claim e o crédito de XP (ver [ADR-0002](../decisoes/ADR-0002-xp-central.md) e [gamificacao/xp.md](../gamificacao/xp.md)) ocorrem na mesma transação de banco.
- Não há fallback client-side que credite XP sem confirmação do servidor.

## Riscos do protótipo antigo (referência)

> LEGADO (PUCMaps): registrado aqui apenas como motivação da arquitetura-alvo, não como algo a reproduzir — validação de proximidade só no cliente; claim sem transação única com o crédito de XP; totens de teste hardcoded no código do app.

## Dependências

PucStops depende de:

- Schema `mapa` com PostGIS (ver [ADR-0005](../decisoes/ADR-0005-schema-mapa-postgis.md)), para armazenar a localização do PucStop e validar a proximidade.
- XP central (ver [ADR-0002](../decisoes/ADR-0002-xp-central.md)), para conceder a recompensa.
- Sessão do usuário persistida e tratamento de expiração de token no app mobile — hoje a sessão é mantida apenas em memória, então um claim exigiria o usuário estar logado na mesma sessão em que fez login.

Nenhuma dessas dependências está implementada nesta etapa.
