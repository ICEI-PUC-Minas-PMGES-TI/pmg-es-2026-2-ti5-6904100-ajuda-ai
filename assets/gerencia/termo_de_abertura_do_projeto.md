# Termo de Abertura de Projeto (TAP) 

**Nome da empresa: Ajuda-aí** 

**Data:** 24/08/2026

**Integrantes:**
Artur Vieira- Desenvolvedor
Arthur Henrique - Desenvolvedor
Fernanda Soares - Product Manager
Gabriel Lacerda - Arquiteto
Luiz Arthur - Desenvolvedor
Matheus Viana - Desenvolvedor

---

**Professores:**
Prof. Artur Martins Mol
Prof. Leonardo Vilela Cardoso
Prof. João Paulo Carneiro Aramuni

---

_Curso de Engenharia de Software, Unidade Coração Eucarístico_

_Instituto de Informática e Ciências Exatas – Pontifícia Universidade de Minas Gerais (PUC MINAS), Belo Horizonte – MG – Brasil_

---

## 1. IDENTIFICAÇÃO DO PROJETO

**1.1 Nome do Projeto:** Ajuda-aí

**1.2 Gerente do Projeto:** Fernanda Soares

**1.3 Cliente do Projeto:** PUC Minas

**1.4 Tipo de Projeto:**

[ ] Manutenção em produto existente
[X] Desenvolvimento de novo produto
[ ] Outro: \_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_

**1.5 Objetivo do projeto:** Apoiar calouros a se ambientarem na universidade através da ajuda de veteranos do curso.

**1.6 Benefícios que justificam o projeto:** Beneficia a conexão entre alunos do curso, fortalecendo um vínculo entre esses estudantes além de ajuda na jornada acadêmica do calouro.

**1.7 Qualidade esperada do produto final (requisitos de qualidade):**
*   **Desempenho e Escalabilidade:** Tempo de resposta adequado às operações realizadas pelos usuários. Suporte a pelo menos 500 usuários conectados simultaneamente sem comprometer as funcionalidades principais.
*   **Confiabilidade:** Comunicação em tempo real sem necessidade de recarregar a página. Tratamento de erros que impeça falha de uma funcionalidade comprometer o sistema geral.

## **2. ESCOPO PRELIMINAR E PREMISSAS**

**2.1 O que será feito (escopo do projeto)**
*   Autenticação e gerenciamento de perfis (apadrinhado, padrinho, coordenador).
*   Cadastro, aprovação e gerenciamento de padrinhos e apadrinhados pelo coordenador.
*   Sugestão automática de compatibilidade entre padrinhos e apadrinhados, com aprovação, rejeição ou edição pelo coordenador.
*   Criação e edição manual de grupos de apadrinhamento, com limite configurável de apadrinhados por padrinho.
*   Comunicação em tempo real (conversas privadas e grupos) com histórico de mensagens e indicação de não lidas.
*   Feed de anúncios da coordenação e consulta de informações sobre disciplinas, com compartilhamento de dicas entre alunos.
*   Gamificação com XP, níveis e conquistas.
*   Notificações de mensagens, anúncios e eventos do programa.

**2.2 O que não será feito no projeto (contra-escopo)**
*   Vínculo automático entre padrinho e apadrinhado sem aprovação do coordenador.
*   Integração automatizada com o Sistema de Gestão Acadêmica (SGA) da instituição.
*   Módulo financeiro, de pagamentos ou de gestão de bolsas dos participantes.
*   Chamadas de voz ou vídeo entre usuários (comunicação prevista por mensagens de texto).

**2.3 Resultados / serviços / produtos a serem entregues**

| **1.** | Sistema web (microsserviços) Ajuda-aí com autenticação, gerenciamento de padrinhos/apadrinhados, formação de grupos e compatibilidade. |
| --- | --- |
| **2.** | Módulo de comunicação em tempo real (conversas e grupos) e feed de anúncios/informações acadêmicas. |
| **3.** | Módulo de gamificação (XP, níveis e conquistas) integrado ao perfil do usuário. |

**2.4 Condições para início do projeto**
*   Aprovação do Documento de Requisitos do Ajuda-aí pela disciplina de Arquitetura de Software.
*   Definição da equipe do projeto e dos papéis de cada integrante.
*   Ambiente de desenvolvimento configurado (Docker Compose, PostgreSQL, RabbitMQ, MinIO, gRPC, SSE Gateway).
*   Conta ativa na Oracle Cloud Free Tier para hospedagem/homologação.
*   Aprovação deste TAP na reunião de kickoff do projeto.

## 3. ESTIMATIVA DE PRAZO


**3.1 Prazo previsto (horas):** 160 horas

**3.2 Data prevista de início:** 03 / 08 / 2026
**3.3 Data prevista de término:** 21 / 12 / 2026

## 4. ESTIMATIVA DE CUSTO

| Item de custo | Qtd. horas/unidade | Valor / hora | Valor total |
| --- | --- | --- | --- |
| **4.1 Recursos Humanos (especifique):** | 8/semana | 0 | 0 |
| **4.2 Hardware (especifique):** Máquinas dos próprios desenvolvedores | 6 | 0 | 0 |
| **4.3 Rede e serviços de hospedagem:** Oracle Cloud Free Tier | 1 | 0 | 0 |
| **4.4 Software de terceiros:** PostgreSQL, RabbitMQ, Docker | 3 | 0 | 0 |
| **4.5 Serviços e treinamento:** | 0 | 0 | 0 |
| **4.6 Total Geral:** | 18 |  |  |

## 5. PARTES INTERESSADAS

| Nome | Papel no projeto |
| --- | --- | --- |
| Artur Vieira | Desenvolvedor | 
| Arthur Henrique | Desenvolvedor | 
| Fernanda Soares | Product Manager | 
| Gabriel Lacerda | Arquiteto | 
| Luiz Arthur | Desenvolvedor | 
| Matheus Viana | Desenvolvedor | 

**Observações:**

- As estimativas de prazo e custo são aproximadas e podem variar ao longo do projeto, devendo ser revistas após o detalhamento dos requisitos.

- Este documento, após ser completamente preenchido, deve ser assinado pelos responsáveis do projeto (gestores envolvidos).

- Este documento, se aprovado na **reunião de** _ **kickoff** _, autoriza o início do projeto de acordo com a especificação supra e as normas da empresa.
