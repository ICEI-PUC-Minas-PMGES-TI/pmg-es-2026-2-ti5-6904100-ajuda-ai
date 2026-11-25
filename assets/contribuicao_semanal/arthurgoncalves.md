# Relatório Individual de Contribuição



**Aluno:** Arthur Gonçalves Vieira

**Projeto:** Ajuda-aí

**Papel no projeto:** Desenvolvedor  

## Contribuição

### Sprint 1
### Semana 1 (04/08 - 18/08)

- implementação do template no Github 
- requisitos funcionais e não funcionais.

### Sprint 2
### Semana 2 (01/09 - 08/09)

- slides para a apresentação inicial do projeto;
- implementação dos docs/3.requisitos.md

### Sprint 3
### Semana 3 (08/09 - 15/09)

- Ata de reunião de kickoff
- Planejamento da Sprint
- Fechamento da Sprint

### Sprint 4
### Semana 4 (16/09 - 22/09)

- Implementação (Parcial) da Tela do Feed

### Semana 5 (23/09 - 29/09)

- Finalização da tela do Feed;
- Implementação parcial das telas da jornada do apadrinhamento, em conjunto com Matheus Guilherme Viana Pereira;
- Elaboração da ata da reunião semanal.

### Sprint 5
### Semana 8 (20/10 - 27/10)

- Implementação da verificação acadêmica e aprovação das candidaturas na coordenação (F09 – #31);
- Criação da migration de conferência acadêmica em `participacoes`;
- Bloqueio da revogação de padrinho com vínculos ativos do matching;
- Filtros de candidaturas por papel e por conferência acadêmica;
- Testes do backend para a verificação acadêmica e o fluxo de aprovação;
- Correção do "Sobre mim" no perfil do app mobile;
- Ajuste visual da tela de login web (Microsoft e usuário de teste);
- Atualização da branch com a Sprint-5 e o construtor de formulários.

### Sprint 6
### Semana 11 (10/11 - 24/11)

- Implementação da entrega e do cancelamento de resgates da lojinha pela coordenação (F29 – #48), com devolução de XP e estoque no cancelamento;
- Implementação dos ajustes de XP pela coordenação (F26 – #45): consulta de saldo e extrato dos participantes e ajustes justificados, sem saldo negativo;
- Separação de XP ganho e XP gasto no saldo do aluno (`/me/xp`);
- Situação do resgate no histórico e no comprovante do aluno;
- Correções da lojinha: código de programa no formato real (ex.: 2026/2), imagem da versão resgatada no comprovante e FK de programa nas recompensas;
- Testes de integração de resgates e ajustes de XP;
- Atualização da branch com a Sprint-6;
- Documentação do contrato de API da coordenação (`/coordenacao/resgates` e `/coordenacao/xp`) e da F26/F29 (histórias de usuário e telas da lojinha);
- Fila de resgates com filtros no servidor (situação, programa, recompensa e busca), paginação por cursor e contagem por situação;
- Idempotência do ajuste de XP (chave por intenção) e respostas de erro 4xx corretas na API;
- Revisão das migrations da gamificação: adoção de schema legado só com estrutura idêntica e registro do programa da troca nos resgates;
- Correção do build da API e da execução das migrations;
- Tela web: fila de resgates filtrada no servidor e aviso do ajuste de XP já registrado pelo extrato;
- Testes da fila de resgates e do ajuste de XP no front-end;
- PR #70 (Arthur_gv → Sprint-6) mesclado na Sprint-6 (24/11).
