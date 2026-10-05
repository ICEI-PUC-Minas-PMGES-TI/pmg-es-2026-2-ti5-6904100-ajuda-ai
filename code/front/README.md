# Ajuda-aí Web

Frontend em React e Vite. Inclui:

- fluxo de cadastro do estudante (`/`): perfil → como quer participar (padrinho / apadrinhado / explorar) → formulário → revisão/envio;
- área do aluno (`/aluno/perfil`, `/aluno/candidatura`, `/aluno/padrinho`, `/aluno/historico`, `/aluno/configuracoes`);
- login demo e painel da coordenação (`/login`, `/coordenacao`: dashboard, candidaturas, usuários, programas, formulários, configurações/comunicados).

## Executar localmente

```powershell
cd code/front
npm install
npm run dev
```

A API Nest precisa estar em `http://localhost:3000` (ou defina `VITE_API_URL`).

### Identidade demo do aluno

Ainda não há login de aluno. O e-mail padrão é `fernanda.soares@pucminas.edu.br`;
use `?email=outro@pucminas.edu.br` (no cadastro `/` ou em `/aluno/...`) para trocar de aluno.
A sessão do aluno e as preferências ficam no `localStorage` do navegador
(“Refazer cadastro” e “Limpar dados locais” em Configurações).

### Acesso à coordenação

1. Garanta `AUTH_DEMO_ENABLED=true` no `.env` da API.
2. Abra `/login` (ou `/coordenacao`): o login demo com `renata@pucminas.edu.br` é automático.

As imagens e fontes vêm de `code/mobile/assets`.
