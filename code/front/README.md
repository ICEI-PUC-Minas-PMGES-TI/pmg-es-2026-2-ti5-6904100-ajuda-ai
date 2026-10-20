# Ajuda-aí Web

Frontend em React e Vite. Inclui:

- fluxo de cadastro do estudante (`/`): perfil → como quer participar (padrinho / apadrinhado / explorar) → formulário → revisão/envio;
- área do aluno (`/aluno/perfil`, `/aluno/candidatura`, `/aluno/padrinho`, `/aluno/historico`, `/aluno/configuracoes`);
- login demo e painel da coordenação (`/login`, `/coordenacao`: dashboard, candidaturas, usuários, programas, matching manual, formulários, configurações/comunicados).

## Executar localmente

```powershell
cd code/front
npm install
npm run dev
```

A API Nest precisa estar em `http://localhost:3000` (ou defina `VITE_API_URL`).

### Autenticação e integração F02/F07

O login Microsoft web usa authorization code com PKCE e troca o ID token em
`POST /auth/login`. Configure `VITE_MICROSOFT_CLIENT_ID`,
`VITE_MICROSOFT_TENANT_ID` e, se necessário, `VITE_MICROSOFT_REDIRECT_URI`
(padrão: `http://localhost:5173/auth/callback`). Cadastre esse redirect como SPA
no Entra ID e use o mesmo client ID aceito pelo backend. Não há segredo no cliente.
Sem essa configuração, o botão informa que o login está indisponível.

Em desenvolvimento (`npm run dev`), o seletor demo permite somente as contas
predefinidas. O backend também precisa de `AUTH_DEMO_ENABLED=true`. Escolha
Renata explicitamente para acessar a coordenação. Não existe login automático
nem troca de identidade via `?email=`.

O onboarding salva o perfil em `PUT /cadastro/perfil` antes de escolher a
participação. A área do aluno consulta `/me` e `/participacoes/situacao`.
O ciclo é selecionado entre os retornados em `/participacoes/programas`.
Perfil e foto são editados em `/aluno/perfil/editar`; foto usa somente
`PUT /me/foto` e `GET /me/foto`.

A candidatura passa por revisão e só é registrada ao confirmar o envio.
Após o envio, respostas são imutáveis. Aprovação aguarda matching; somente
`padrinho_ativo` libera acesso aos apadrinhados. Anexos não são suportados.

Na coordenação, cada programa mantém seu próprio calendário e ciclo. Em
`/coordenacao/programas`, encerre as inscrições sem decidir candidaturas e use
“Liberar matching” somente após preparar os aprovados. A rota
`/coordenacao/matching?programa=AAAA/semestre` só consulta participantes elegíveis
depois dessa liberação; os vínculos são manuais e não há geração automática de
sugestões ou grupos.

### Validação

```powershell
node --test --test-concurrency=1 test/*.test.mjs
npm run build
```

Não há configuração de lint neste frontend. Os testes usam Node e renderização
React no servidor; o login real no Entra e o armazenamento Azure precisam ser
validados com a configuração externa do ambiente de integração.
