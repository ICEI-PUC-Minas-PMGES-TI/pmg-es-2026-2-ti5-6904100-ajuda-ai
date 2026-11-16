# Contas de demonstração da gamificação

Contas fictícias para testar os 10 níveis e os cenários do programa no app e na web.
Fonte única: `code/back/api/src/dados/demo-gamificacao.ts`. Seed: `code/back/api/src/scripts/seed-demo-gamificacao.ts`.

E-mails novos começam com `demo.` (nunca coincidem com aluno real). Camila, Thiago e Lucas são as contas demo antigas, reaproveitadas (o seed só acrescenta XP e moedas a elas).

## Como entrar

Login demo (só em desenvolvimento, com `AUTH_DEMO_ENABLED=true` e fora de produção; o backend recusa e-mails fora da lista):

- **App**: tela de login → "Entrar como usuário de teste" → escolher a conta (grupos "Níveis 1 a 10", "Cenários", "Candidatos", "Coordenação"; cada item mostra papel e cenário).
- **Web** (`npm run dev`): seletor "Usuário de teste" na tela de login.

## Contas (ciclo atual 2026/2)

| Conta | E-mail (login demo) | Papel / situação | Semestre | XP | Moedas | Nível | Cenário |
|---|---|---|---|---:|---:|---|---|
| Lucas Almeida | lucas.almeida@pucminas.edu.br | Apadrinhado ativo (padrinha Ana Beatriz, Grupo-7) | 2026/2 | 0 | 0 | 1 · Primeiro passo | Estado inicial |
| Sofia Martins | demo.sofia.martins@pucminas.edu.br | Apadrinhada ativa (Demo A) | 2026/2 | 80 | 80 | 2 · Curiosidade | Nível 2 |
| Pedro Costa | demo.pedro.costa@pucminas.edu.br | Padrinho aprovado, aguardando vínculo | 2026/2 | 220 | 120 | 3 · Exploração | Nível 3 · E (DP-22) |
| Ana Ribeiro | demo.ana.ribeiro@pucminas.edu.br | Apadrinhada aprovada, aguardando padrinho | 2026/2 | 380 | 280 | 4 · Descoberta | Nível 4 · E (DP-22) |
| Camila Duarte | camila@pucminas.edu.br | Apadrinhada ativa (padrinho Thiago) | 2026/2 | 580 | 180 | 5 · Conexão | Nível 5 · barra 32% |
| Mariana Lopes | demo.mariana.lopes@pucminas.edu.br | Madrinha ativa (Demo A) | 2026/2 | 900 | 450 | 6 · Parceria | Nível 6 |
| Thiago Moreira | thiago@pucminas.edu.br | Padrinho ativo (Camila) | 2026/2 | 1.310 | 610 | 7 · Mentoria | Nível 7 |
| Rafael Souza | demo.rafael.souza@pucminas.edu.br | Padrinho ativo (Demo B) | 2026/2 | 1.650 | 850 | 8 · Guia do campus | Nível 8 |
| Beatriz Santos | demo.beatriz.santos@pucminas.edu.br | Apadrinhada ativa (Demo B) | 2026/2 | 2.200 | 1.200 | 9 · Referência | Nível 9 (apadrinhada com nível alto) |
| Matheus Oliveira | demo.matheus.oliveira@pucminas.edu.br | Padrinho ativo (Demo C) | 2026/2 | 2.850 | 1.500 | 10 · Lenda da PUC | Nível máximo, acima de 2.600 |
| Gabriel Nunes | demo.gabriel.nunes@pucminas.edu.br | Apadrinhado ativo (Demo C) | 2026/2 | 40 | 40 | 1 | A · faltam 10 XP para subir |
| Helena Prado | demo.helena.prado@pucminas.edu.br | Apadrinhada aguardando | 2026/2 | 0 (380 com fixture local) | 0 | 1 | B · perto do teto de totens |
| Igor Fonseca | demo.igor.fonseca@pucminas.edu.br | Apadrinhado aguardando | 2026/2 | 0 (400 com fixture local) | 0 | 1 | C · teto de totens atingido |
| Daniel Rocha | demo.daniel.rocha@pucminas.edu.br | Padrinho aprovado, aguardando vínculo | 2026/2 | 1.700 | 0 | 8 | D · XP alto, 0 moedas |
| Larissa Pinto | demo.larissa.pinto@pucminas.edu.br | Candidata a padrinho pendente | 2026/2 | 0 | 0 | 1 | F · sem ganhos nem resgates |
| Otávio Mendes | demo.otavio.mendes@pucminas.edu.br | Candidatura não aprovada (com motivo) | 2026/2 | 0 | 0 | 1 | G |
| Bruno Teixeira | demo.bruno.teixeira@pucminas.edu.br | Ex-padrinho (concluído em 2026/1) | 2026/1 | 600 | 300 | 5 | H · consulta, sem ganhar nem resgatar |
| Renata Martins | renata@pucminas.edu.br | Coordenação (mockada, sem carteira) | — | — | — | — | I · totens, orçamento, lojinha |

Grupos novos: **Demo A** (Mariana → Sofia), **Demo B** (Rafael → Beatriz), **Demo C** (Matheus → Gabriel). Um padrinho por apadrinhado.

## Como o XP foi construído (sem burlar regras)

- Tudo via `registrarMovimentacao` (AJUSTE_ADMIN, no máximo ±200 por movimentação, carteira travada, chave de idempotência `demo:v1:<email>:...`).
- XP alto = trajetória em ciclos anteriores (`ciclo` 2025/1, 2025/2, 2026/1): não conta nos tetos do ciclo atual (que somam só totens e missões).
- Moedas abaixo do XP = ajuste "Demonstração: moedas já utilizadas (sem resgate real)" (só moedas, XP 0). Nenhum resgate, estoque ou entrega fictícia.
- **Cenários B e C** precisam de coletas no ciclo atual. No banco compartilhado isso exigiria coletas sem GPS; por isso as fixtures (`--fixtures-teto`, totens inativos `[fixture demo]` + coletas pelo domínio) só rodam em banco local. Os testes automatizados `test/pucstops-xp.integration.spec.ts` cobrem crédito parcial, coleta sem XP e concorrência no teto. No compartilhado, Helena e Igor chegam ao cenário coletando totens de verdade.

## Rodar de novo, reiniciar e desativar

Da pasta `code/back/api`:

```bash
npm run seed:demo-gamificacao                       # banco local
npm run seed:demo-gamificacao -- --compartilhado    # banco remoto (pede a flag)
npm run seed:demo-gamificacao -- --verificar        # só confere
npm run seed:demo-gamificacao -- --reiniciar        # volta XP/moedas ao alvo
npm run seed:demo-gamificacao -- --fixtures-teto    # cenários B/C (só local)
```

- **Sem duplicação**: usuário por e-mail, participação por (e-mail, programa, papel), movimentação por chave. Rodar de novo não soma XP; o relatório final mostra "ok" ou a diferença do alvo.
- **Reiniciar** (só com `--reiniciar`): se a conta foi usada (coletou, resgatou), grava ajustes de compensação `demo:reset:<data>` até o estado-alvo. O histórico continua no ledger.
- **Desativar ao fim dos testes**: (1) tirar as contas de `demo-gamificacao.ts` (o login demo para de aceitá-las); (2) encerrar as participações do ciclo (`status = 'concluido'`, `termino_em = now()`), o que tira as contas da elegibilidade, do orçamento e das listagens de participantes ativos; (3) não apagar usuários, carteiras, ledger nem coletas (são só-inserção ou referenciados).

## Impacto no ambiente compartilhado

As contas novas com participação ativa ou aprovada no ciclo entram nas estatísticas reais: **participantes elegíveis passou de 5 para 16**, o que muda a estimativa de emissão de moedas do orçamento, as listagens de participantes e o matching (Pedro Costa, Ana Ribeiro, Helena, Igor e Daniel aguardam vínculo). Não há filtro escondendo contas demo; para tirá-las das estatísticas, encerre as participações como descrito acima.
