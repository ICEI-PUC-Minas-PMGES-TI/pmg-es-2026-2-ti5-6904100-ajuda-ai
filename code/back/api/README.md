# API — Ajuda-aí

Back-end da aplicação, desenvolvido em NestJS com TypeScript.

## Estado atual

Versão parcial. Os dados de usuário e os demais dados de negócio ainda são fictícios
e mantidos em memória (`src/dados/dados.ts`). O login, porém, valida o ID token
emitido pelo Microsoft Entra ID e emite um JWT da própria API. Somente contas do
domínio institucional configurado e previamente cadastradas podem entrar.

O feed não contém publicações fictícias: publicações, curtidas e comentários são
persistidos em PostgreSQL por meio do TypeORM. A mensageria permanece prevista para
as próximas sprints.

## Pré-requisitos

* Node.js 20 ou superior
* npm 10 ou superior

## Instalação

```bash
cd code/back/api
npm install
```

## Execução

Copie `code/back/api/.env.example` para `code/back/api/.env` e preencha
`MICROSOFT_TENANT_ID`, `MICROSOFT_CLIENT_ID`, `JWT_SECRET` e `DB_PASSWORD`. Use em
`DB_PASSWORD` a senha do banco configurada no projeto Supabase; não a versione. A API
usa a conexão direta do Supabase por padrão, com TLS (`DB_SSL=true`) e o banco
`postgres` no host configurado em `DB_HOST`. Em produção, a API não inicia sem
`JWT_SECRET` nem `DB_PASSWORD`.

Se o Node.js não confiar na cadeia do certificado TLS apresentada pelo Supabase,
baixe o certificado CA oficial do projeto e informe seu caminho local em
`DB_SSL_CA_FILE` no `.env` da API. A validação do certificado permanece habilitada;
não desative `DB_SSL` para contornar erros de certificado.
Para desenvolvimento local, `DB_SSL_REJECT_UNAUTHORIZED=false` permite TLS sem
validar o certificado do servidor; use essa opção somente em ambiente local. A API
recusa essa configuração quando `NODE_ENV=production`.

O PostgreSQL do Docker Compose continua disponível apenas como alternativa local.
Para usá-lo, inicie `docker compose up -d postgres` a partir de `code` e configure
`DB_HOST=localhost`, `DB_PORT=5433`, `DB_USERNAME=ajudaai`,
`DB_PASSWORD=ajudaai`, `DB_DATABASE=ajudaai` e `DB_SSL=false` no `.env` da API.

```bash
npm run start:dev
```

A API fica disponível em `http://localhost:3000`.

## Endpoints

| Método | Rota | Descrição |
| --- | --- | --- |
| `POST` | `/auth/login` | Valida um ID token Microsoft e devolve o JWT da API e os dados do usuário. |
| `GET` | `/me` | Dados do usuário autenticado. Exige JWT no cabeçalho `Authorization`. |
| `GET` | `/me/vinculos` | Padrinho ou apadrinhados vinculados ao usuário. Exige JWT. |
| `POST` | `/auth/login-demo` | Login de desenvolvimento sem Microsoft (`AUTH_DEMO_ENABLED=true`). Usado pelo painel da coordenação enquanto não há login. |
| `GET` | `/avisos` | Comunicados da coordenação (persistidos). `?publico=padrinhos\|apadrinhados` filtra os direcionados. |
| `GET` | `/participacoes` | Histórico de participações do aluno (`x-user-id` ou `?usuarioId=`). |
| `GET` | `/participacoes/situacao` | Situação do aluno no ciclo atual: candidatura, padrinho/apadrinhados, grupo e etapas do programa. |
| `POST` | `/participacoes/candidatura-padrinho` | Envia (ou edita, enquanto em análise) a candidatura a padrinho com as `respostas`. |
| `POST` | `/participacoes/cadastro-apadrinhado` | Envia o cadastro do apadrinhado; fica aguardando o match da coordenação. |
| `POST` | `/participacoes/confirmar` | Confirmação manual de ingresso. Exige JWT de coordenador. |
| `POST` | `/participacoes/rejeitar-candidatura` | Rejeição manual por e-mail. Exige JWT de coordenador. |
| `GET` | `/formularios/:tipo` | Perguntas extras publicadas para `padrinho` ou `apadrinhado`. |

### Coordenação (exige JWT com perfil `coordenador`)

| Método | Rota | Descrição |
| --- | --- | --- |
| `GET` | `/coordenacao/dashboard` | Indicadores, etapas, candidaturas recentes e pontos de atenção (`?programa=`). |
| `GET` | `/coordenacao/candidaturas` | Lista (`?programa=&status=pendente\|em_analise\|nao_aprovado\|aguardando\|aprovadas\|sem_vinculo`). |
| `GET` | `/coordenacao/candidaturas/:id` | Detalhe com respostas, observações, critérios e histórico do aluno. |
| `PATCH` | `/coordenacao/candidaturas/:id` | Volta para `pendente`/`em_analise` e salva observações. |
| `POST` | `/coordenacao/candidaturas/:id/aprovar` | Aprova: a candidatura vira padrinho ativo. |
| `POST` | `/coordenacao/candidaturas/:id/rejeitar` | Rejeita a candidatura. |
| `POST` | `/coordenacao/candidaturas/acoes` | Ação em massa: `{ ids, acao: "aprovar" \| "rejeitar" \| "em_analise" }`. |
| `GET` | `/coordenacao/usuarios` | Participantes do programa (`?programa=&papel=`). |
| `POST` | `/coordenacao/vinculos` | Define o padrinho de um apadrinhado (`{ apadrinhadoId, padrinhoId }`); cria o grupo se preciso. |
| `GET` | `/coordenacao/programas` | Programas com etapas, datas e totais. |
| `POST` | `/coordenacao/programas` | Abre um novo ciclo. |
| `PATCH` | `/coordenacao/programas?codigo=2026/2` | Atualiza etapa, inscrições, vagas, grupos e datas. |
| `GET`/`PUT` | `/coordenacao/formularios/:tipo` | Lê/salva as perguntas do formulário e a publicação. |
| `POST` | `/coordenacao/comunicados` | Publica um comunicado para todos, padrinhos ou apadrinhados. |
| `GET` | `/publicacoes` | Lista as publicações persistidas no backend. |
| `POST` | `/publicacoes` | Cria uma publicação com zero curtidas e zero comentários. |
| `POST` | `/publicacoes/:id/comentarios` | Adiciona um comentário à publicação. |
| `POST` | `/publicacoes/:id/curtidas` | Adiciona ou remove uma curtida (`delta: 1` ou `-1`). |
| `DELETE` | `/publicacoes/:id` | Apaga uma publicação criada pelo usuário. |

As rotas do feed e de participações identificam o usuário pelo cabeçalho
`x-user-id` (e-mail institucional) enquanto o login Microsoft no aplicativo do aluno
não é concluído. Por isso, ações que mudam o status de alguém no programa
(aprovar, rejeitar, vincular) ficam só nas rotas da coordenação, protegidas por JWT. O banco impõe uma restrição
única por usuário e publicação, impedindo curtidas duplicadas.

Exemplo:

```bash
curl -X POST http://localhost:3000/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"idToken":"ID_TOKEN_RECEBIDO_DA_MICROSOFT"}'

curl http://localhost:3000/me \
  -H 'Authorization: Bearer JWT_DEVOLVIDO_PELA_API'
```

## Build e verificação

```bash
npm run build
npm run lint
npm test
```
