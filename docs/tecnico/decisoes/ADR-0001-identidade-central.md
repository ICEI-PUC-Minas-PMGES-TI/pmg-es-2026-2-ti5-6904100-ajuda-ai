# ADR-0001 — Identidade central

> Estado: PLANEJADO (decisão tomada; aplicação ainda não implementada nos módulos de mapa)

## Contexto

O PUCMaps tinha identidade própria (tabela `users`, login e senha com argon2, JWT e refresh token próprios), sem relação com o Ajuda-aí.

O Ajuda-aí tem sua própria base de usuários (`usuarios`, chave `id` inteira, `SERIAL`) e seu próprio login (Microsoft/Entra ID, mais modo demo). Existe uma dívida legada: a tabela `participacoes` usa o e-mail do usuário (`varchar`) como chave de relacionamento, sem foreign key para `usuarios`.

A integração do mapa precisa de uma identidade única para registrar XP e PucStops.

## Decisão

- A identidade central para **todo novo domínio relacionado ao mapa** (XP, PucStops, e qualquer outra entidade futura que referencie usuário) é `usuarios.id` (inteiro, chave primária da tabela `usuarios` do Ajuda-aí).
- O backend resolve o usuário a partir do `sub` do JWT de acesso emitido pelo próprio Ajuda-aí (hoje uma string contendo o id do usuário).
- O cliente (app Flutter, pacote `campus_map`) nunca define ou envia sua própria identidade; ela é sempre derivada do token no servidor.
- O PUCMaps, depois da integração, não tem autenticação própria. O mapa recebe o token do Ajuda-aí (via `accessTokenProvider`) quando precisa chamar endpoints protegidos; endpoints de leitura pública (ex.: lista de prédios) podem não exigir autenticação.
- A dívida legada de `participacoes.usuario_id` usar e-mail **não é propagada** para os novos módulos. Ela permanece isolada ao domínio de participações existente até que, em trabalho separado, seja corrigida.

## Consequências

- Novas tabelas (`xp_carteiras`, `xp_movimentacoes`, `puc_stop_claims`, etc.) usam uma foreign key inteira para `usuarios.id`.
- Não há necessidade de uma segunda tabela de usuários nem de sincronização entre duas identidades.
- Qualquer endpoint do mapa que precise de identidade do usuário deve usar o guard de autenticação já existente no Ajuda-aí, nunca aceitar um identificador de usuário vindo do corpo da requisição como fonte de verdade.
- Fica registrado que a chave por e-mail em `participacoes` é dívida técnica conhecida e fora do escopo desta integração.
