# Eventos, cantinas e cardápios

> Estado: PLANEJADO (nenhum código implementado)

## Funcionalidades existentes no projeto de origem

O PUCMaps possui, como conceitos de domínio:

- **Eventos**: um evento do campus com título, descrição, período de ocorrência e localização (ponto e/ou polígono de área).
- **Cantinas**: um ponto de venda de alimentação, vinculado a um prédio ou sala, com horário de funcionamento.
- **Cardápios e ofertas**: itens de cardápio associados a uma cantina, e ofertas/promoções associadas a itens.

## O que pretendemos preservar

O conceito de cada uma dessas entidades (evento, cantina, cardápio, oferta) é preservado como candidato a domínio do Ajuda-aí, por ter valor de produto para o usuário do campus (saber o que está acontecendo, onde comer, o que está disponível).

## Estratégia inicial: leitura

A primeira implementação, quando ocorrer, deve ser **somente leitura**: exibir eventos, cantinas e cardápios existentes, sem uma tela de cadastro/edição no Ajuda-aí. Isso evita portar toda a infraestrutura de administração do projeto de origem só para sustentar uma funcionalidade de exibição.

## Administração futura

> PLANEJADO: quando fizer sentido, a administração de eventos/cantinas/cardápios passa a ser avaliada junto com o inventário geral de funcionalidades administrativas do PUCMaps, não antecipada aqui. Ver [ADR-0007](../decisoes/ADR-0007-admin-pucmaps.md) e [administracao.md](administracao.md).

## O que não é portado

A infraestrutura antiga usada para notificar eventos (ex.: regras de notificação push específicas da arquitetura antiga) não é portada junto; se o Ajuda-aí tiver um mecanismo de notificação próprio, a integração com eventos é decidida separadamente.
