# Pedido à TI: registro do aplicativo no Microsoft Entra ID

> **ADIADO (21/11/2026):** decidimos não depender da TI agora. O primeiro deploy usa o login demo protegido. Este texto fica pronto para quando o login Microsoft for retomado.

> Texto pronto para enviar à TI da PUC Minas (ou ao professor responsável). Alunos não podem registrar aplicativos neste diretório (política "usuários podem registrar aplicativos" desligada), por isso o registro precisa ser feito por quem tem permissão.
> Não há senha nem segredo envolvido: o app é **público** (sem client secret) e só valida a identidade institucional.

## E-mail sugerido

**Assunto:** Registro de aplicativo no Entra ID para o projeto acadêmico Ajuda-aí (login institucional)

Olá,

Somos o grupo do projeto Ajuda-aí (Engenharia de Software, PUC Minas), uma plataforma de apadrinhamento de calouros. Para o login com a conta institucional precisamos de **um registro de aplicativo** no diretório da PUC (os alunos não têm permissão para criá-lo). Seguem os dados:

| Item | Valor |
|---|---|
| Nome | Ajuda-aí |
| Contas compatíveis | **Somente este diretório** (locatário único) |
| Tipo | Aplicativo **público** (sem client secret, sem certificado) |
| Plataforma **Aplicativo de página única (SPA)**, URIs de redirecionamento | `https://<endereço-da-web>/auth/callback` (informaremos o endereço exato assim que o site estiver publicado) e `http://localhost:5173/auth/callback` (desenvolvimento) |
| Plataforma **Dispositivos móveis e desktop**, URI de redirecionamento | `br.pucminas.ajudaai://auth` |
| Permissões delegadas (Microsoft Graph) | `openid`, `profile`, `email` (nenhuma permissão de aplicativo) |
| Consentimento do administrador | Em princípio **não é necessário** (permissões básicas, consentíveis pelo próprio usuário). Se a política do diretório exigir, pedimos a aprovação única |
| Tokens | ID token (fluxo de código de autorização com PKCE) |

**O que precisamos receber:** o **ID do aplicativo (cliente)** e o **ID do diretório (locatário)**. São identificadores públicos, não são segredos.

**Perguntas:**
1. Qual o domínio dos e-mails de alunos (`@sga.pucminas.edu.br`, `@pucminas.edu.br` ou ambos) e o de professores/coordenação?
2. Posso colocar mais de um responsável como proprietário do aplicativo?

Obrigado!

## Como conferir depois (sem alterar nada)

No Portal do Azure › Microsoft Entra ID › Registros de aplicativos › Ajuda-aí › Autenticação: as duas plataformas e as URIs acima devem aparecer.

## Opcional: automação do deploy (não é necessário agora)

Para o GitHub Actions publicar na Azure sem senha seria preciso um segundo registro com **credencial federada** (emissor `token.actions.githubusercontent.com`, assunto `repo:ICEI-PUC-Minas-PMGES-TI/pmg-es-2026-2-ti5-6904100-ajuda-ai:environment:homologacao`). Não peça isso agora: o primeiro deploy é manual (`infra/azure/deploy-manual.ps1`), e a web pode ser publicada automaticamente por uma chave de storage guardada como secret do GitHub, sem Entra.
