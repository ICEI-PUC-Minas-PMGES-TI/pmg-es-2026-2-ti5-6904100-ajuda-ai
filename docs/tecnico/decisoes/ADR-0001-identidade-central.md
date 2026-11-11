# ADR-0001 — Identidade central

Estado: aceito.

## Contexto

Mapa e XP precisam identificar o mesmo usuário do programa de apadrinhamento.
A origem PUCMaps possui usuários e autenticação próprios; mantê-los criaria duas
identidades para a mesma pessoa.

## Decisão

- Novos domínios do campus usam `usuarios.id`, chave inteira do Ajuda-aí.
- O servidor deriva a identidade do `sub` do JWT de acesso e confere o e-mail
  contra o cadastro. Não aceita identidade definida no corpo da requisição.
- O app principal fornece a sessão aos adaptadores dos serviços protegidos.
  `campus_map` recebe esses serviços e não implementa login.
- Leitura pública do mapa não exige token. Escritas da coordenação exigem
  também o papel `coordenador`.

## Consequências

Uma base de usuários e uma autenticação atendem aos domínios do campus.
Carteira, ledger e coletas referenciam `usuarios.id` com FK.

A relação por e-mail de `participacoes.usuario_id` é uma limitação do domínio
de participações e não é propagada aos domínios de mapa/XP.
O coordenador de demonstração pode não ter linha em `usuarios`; a conferência
de e-mail evita associar seu ID a outro usuário.
