# Ajuda-aí Web

Frontend em React e Vite para cadastro, área do aluno e coordenação.
Regras de administração do campus estão em
[administração do mapa](../../docs/tecnico/mapa/administracao.md).

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

### PucStops e mapa (coordenação)

`/coordenacao/pucstops` administra os totens do mapa do campus (não dependem
de programa/ciclo). A posição é escolhida clicando no mapa (Mapbox GL JS,
carregado sob demanda), dentro da área devolvida por
`GET /coordenacao/pucstops/campus`; o servidor revalida tudo. "Excluir"
desativa o PucStop e preserva o histórico de coletas.

- `VITE_MAPBOX_ACCESS_TOKEN`: token **público** (`pk.`) do Mapbox, o mesmo do
  app mobile. Nunca use token secreto (`sk.`): ele iria para o bundle. As
  restrições de URL do token precisam permitir a origem web (ex.:
  `http://localhost:5173`). Sem ele, a página mostra "Mapa indisponível" e só
  permite editar nome, XP e raio de PucStops existentes.
- `VITE_MAPBOX_STYLE_URI` (opcional): estilo do mapa; padrão
  `mapbox://styles/mapbox/streets-v12`.

### Validação

```powershell
node --test --test-concurrency=1 test/*.test.mjs
npm run build
```

Não há configuração de lint neste frontend. Os testes usam Node e renderização
React no servidor; o login real no Entra e o armazenamento Azure precisam ser
validados com a configuração externa do ambiente de integração.
