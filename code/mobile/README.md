# Código mobile

## Login Microsoft

O botão “Entrar com a Microsoft” não autentica. O app não tem biblioteca MSAL, client ID, tenant nem URI de redirecionamento, e o backend não tem `MICROSOFT_TENANT_ID` / `MICROSOFT_CLIENT_ID` neste ambiente. O `POST /auth/login` também só emite sessão para quem já existe em `usuarios` (ou para a coordenadora demo). Por isso o botão avisa que o login está indisponível e não abre o cadastro.

Para ativar o fluxo real, ainda falta, fora deste repositório:

1. Registrar um app público no Entra ID da PUC Minas, com redirect do Flutter (sem client secret no app).
2. Configurar o mesmo client ID e o tenant no backend (`MICROSOFT_TENANT_ID`, `MICROSOFT_CLIENT_ID`).
3. No Flutter, obter o ID token e chamar `POST /auth/login`.
4. Ajustar o backend para devolver nome e e-mail de quem ainda não está em `usuarios`, porque hoje essa rota responde 401 e o cadastro precisa desses dados antes do `POST /cadastro`.

O login demo (`POST /auth/login-demo`, `AUTH_DEMO_ENABLED=true`, fora de produção) continua na área da coordenação e na sincronização de aluno já cadastrado. `renata@pucminas.edu.br` permanece só nesse fluxo.


