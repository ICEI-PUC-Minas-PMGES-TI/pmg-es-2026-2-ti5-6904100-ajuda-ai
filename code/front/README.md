# Ajuda-aí Web

Frontend em React e Vite. Inclui:

- fluxo de cadastro do estudante (`/`);
- login e **Dashboard da coordenação** (`/login`, `/coordenacao`).

## Executar localmente

```powershell
cd code/front
npm install
npm run dev
```

A API Nest precisa estar em `http://localhost:3000` (ou defina `VITE_API_URL`).

### Acesso à coordenação

1. Garanta `AUTH_DEMO_ENABLED=true` no `.env` da API.
2. Abra `/login`.
3. Entre com `renata@pucminas.edu.br`.

As imagens e fontes vêm de `code/mobile/assets`.
