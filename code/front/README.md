# Ajuda-aí Web

Frontend em React e JavaScript, criado com Vite. O fluxo de cadastro inclui perfil,
informações complementares, revisão e confirmação. Em telas largas, segue o layout
desktop de duas colunas; em telas menores, adapta os formulários para uma coluna.

## Executar localmente

```powershell
cd code/front
npm install
npm run dev
```

O Vite exibirá o endereço local no terminal. Para gerar os arquivos de produção:

```powershell
npm run build
```

As imagens e fontes são reutilizadas de `code/mobile/assets`. O envio do cadastro
ainda não persiste no backend, pois a API de inscrição está pendente.
