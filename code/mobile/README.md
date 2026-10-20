# Código mobile

## Login Microsoft

O botão “Entrar com a Microsoft” abre o Entra ID de verdade (authorization code + PKCE, sem client secret) quando o app é compilado com:

```bash
flutter run \
  --dart-define=MICROSOFT_CLIENT_ID=SEU_CLIENT_ID \
  --dart-define=MICROSOFT_TENANT_ID=SEU_TENANT_ID
```

O redirect padrão é `br.pucminas.ajudaai://auth`. Ele precisa estar cadastrado no app público do Entra ID, igual ao `MICROSOFT_CLIENT_ID` do backend. Sem esses valores, o botão avisa que a configuração falta e não abre cadastro nem inventa usuário.

Depois do ID token, o app chama `POST /auth/login`:

- quem já está em `usuarios` recebe o JWT normal e vai para a home;
- quem ainda não está recebe um JWT de onboarding (15 minutos). Esse token só serve para o `POST /cadastro` e o e-mail enviado é o da identidade validada.

## Login real

“Entrar com a Microsoft” é o fluxo principal. Exige uma conta real `@pucminas.edu.br`. E-mail inventado não funciona. Quem já está cadastrado entra no app; o primeiro acesso abre o cadastro com o e-mail da Microsoft.

## API no Android Emulator

No emulador, `localhost` é o próprio Android. O app em debug usa `http://10.0.2.2:3000`, que é a máquina Windows onde a API escuta na porta 3000.

`--dart-define=API_BASE_URL=...` tem prioridade. Não há URL de produção gravada no app. Na web o padrão continua `http://localhost:3000`. Em celular físico, passe o IP da máquina:

```bash
flutter run --dart-define=API_BASE_URL=http://IP_DA_MAQUINA:3000
```

No VS Code, a configuração **Ajuda-aí (Android Emulator)** já abre o projeto mobile em debug. O SDK usado por este workspace é `C:\Users\gabri\flutter`. O terminal integrado do VS Code enxerga o comando `flutter`. Um PowerShell aberto fora do VS Code continua sem esse comando, a menos que o PATH do Windows seja ajustado à mão:

```powershell
& "C:\Users\gabri\flutter\bin\flutter.bat" run -d emulator-5554
```

## Login demo

Só em build de desenvolvimento (`kDebugMode`). Em release o bloco some. Abaixo do botão da Microsoft aparece “Modo de desenvolvimento” e “Entrar como usuário de teste”. A lista é fixa (Camila, Lucas, Thiago, Ana, Pedro, Julia e Renata). A escolha chama `POST /auth/login-demo` e não passa pela Microsoft.

O backend ainda exige `AUTH_DEMO_ENABLED=true` e recusa a rota em produção e para qualquer e-mail fora dessa lista. Não há senha nem segredo no app.

Renata abre a área da coordenação. Os demais abrem a home do aluno. Para os alunos existirem no banco compartilhado, alguém da equipe roda uma vez `npm run seed:demo` na API. Não habilitar `SEED_DEMO_DATA=true` no banco remoto.

### Programas e matching da coordenação

Em **Mais → Programas**, cada ciclo mostra sua etapa, situação das inscrições e
calendário. A coordenação encerra inscrições por uma ação confirmada; isso não
aprova candidaturas. Depois de decidir todas as candidaturas e preparar ao menos
um padrinho aprovado, pode liberar o matching explicitamente. **Mais → Matching
manual** consulta o conjunto elegível somente após a liberação e permite criar
vínculos manuais; não gera sugestões nem grupos automaticamente.

### Entra ID

1. Registrar um aplicativo público (contas só deste diretório organizacional).
2. Plataforma móvel/área de trabalho, redirect `br.pucminas.ajudaai://auth`.
3. Permitir fluxos de cliente público e emitir ID tokens.
4. Não criar client secret para o app.
5. No iOS, quando o projeto existir, incluir o scheme `br.pucminas.ajudaai` em `CFBundleURLTypes`.

### Android

O scheme do redirect está em `android/app/build.gradle.kts` (`appAuthRedirectScheme`).
