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

O comando `flutter` precisa estar no PATH da sessão. Escolha o destino listado
por `flutter devices`:

```powershell
flutter run -d <device-id>
```

## Login demo

Só em build de desenvolvimento (`kDebugMode`). Em release o bloco some. Abaixo do botão da Microsoft aparece “Modo de desenvolvimento” e “Entrar como usuário de teste”. A lista é fixa (Camila, Lucas, Thiago, Ana, Pedro, Julia e Renata). A escolha chama `POST /auth/login-demo` e não passa pela Microsoft.

O backend ainda exige `AUTH_DEMO_ENABLED=true` e recusa a rota em produção e para qualquer e-mail fora dessa lista. Não há senha nem segredo no app.

Renata abre a área da coordenação. Os demais abrem a home do aluno. Para os alunos existirem no banco compartilhado, alguém da equipe roda uma vez `npm run seed:demo` na API. Não habilitar `SEED_DEMO_DATA=true` no banco remoto.

### Entra ID

1. Registrar um aplicativo público (contas só deste diretório organizacional).
2. Plataforma móvel/área de trabalho, redirect `br.pucminas.ajudaai://auth`.
3. Permitir fluxos de cliente público e emitir ID tokens.
4. Não criar client secret para o app.
5. No iOS, quando o projeto existir, incluir o scheme `br.pucminas.ajudaai` em `CFBundleURLTypes`.

### Android

O scheme do redirect está em `android/app/build.gradle.kts` (`appAuthRedirectScheme`).

## Feed em tempo real

A tela existente recebe eventos SSE autenticados e atualiza publicações, curtidas
e comentários abertos. O stream fecha ao sair da tela ou entrar em segundo plano.
Para executar em celular físico, use `--dart-define=API_BASE_URL=http://IP_DO_NOTEBOOK:3000`.
Configuração e demonstração completas: [guia do feed](../../docs/tecnico/feed.md).

O fluxo principal do feed funciona entre dois celulares Flutter. A coordenação
abre **Feed do programa** no cabeçalho ou em **Mais** para criar com imagens,
editar, remover imagens e excluir publicações. A permissão vem da API; o aluno
comum interage e recebe SSE. A demonstração completa está no guia acima.

Comentários agora incluem identidade explícita, respostas em um nível, curtidas
individuais e exclusão autorizada. O Flutter preserva a SAS válida pela referência
estável da mídia e atualiza somente o post afetado. A nova migration precisa de
revisão/aplicação manual antes de testar essa versão da API no banco compartilhado.
Contrato, arquivos e roteiro de dois clientes: [evolução dos comentários](../../docs/tecnico/feed-comentarios.md).

### Imagens em tela cheia e galeria

Toque em uma imagem para abrir o viewer com transição Hero, zoom de 1x a 5x,
arraste e botão de fechar. O ícone **Salvar imagem** baixa somente a imagem
aberta, usando a mesma URL SAS já recebida, e salva seus bytes na galeria com
`gal`. A URL não é enviada ao plugin nem usada como nome de arquivo. O botão
fica indisponível durante o salvamento e o zoom é preservado.

No Android, `WRITE_EXTERNAL_STORAGE` está declarada somente até API 29.
O plugin verifica/solicita o acesso ao salvar. Android 11+ usa MediaStore sem
permissão de leitura da galeria ou acesso amplo a arquivos. Não usamos álbum
personalizado, portanto não precisamos de `requestLegacyExternalStorage`.

Este repositório ainda não tem a plataforma `ios/`. Ao adicioná-la, configure
em `ios/Runner/Info.plist` as descrições requeridas pelo plugin:

```xml
<key>NSPhotoLibraryAddUsageDescription</key>
<string>O Ajuda-Aí salva as imagens do feed que você escolher em Fotos.</string>
<key>NSPhotoLibraryUsageDescription</key>
<string>O Ajuda-Aí precisa de acesso a Fotos para salvar imagens em versões anteriores ao iOS 14.</string>
```

Em iOS 14+, o salvamento sem álbum usa acesso de adição; versões anteriores
também exigem a descrição de acesso à biblioteca. A integração do plugin é
compartilhada, mas o build iOS depende da criação dessa plataforma em macOS.
Referência: [documentação do gal](https://pub.dev/packages/gal).

Para validar em Android físico, reconstrua o app com `flutter run -d <device-id>`
(plugins novos não entram só com hot reload), abra o feed e amplie uma imagem.
Salve, conceda a permissão se solicitada e confira **Imagem salva na galeria**
e o arquivo na Galeria/Fotos. Verifique que o zoom continua igual, que toques
rápidos não duplicam o download e que a segunda imagem de um carrossel salva
somente a segunda. Negue a permissão em um Android antigo ou tente salvar uma
URL expirada para conferir **Não foi possível salvar a imagem**.
