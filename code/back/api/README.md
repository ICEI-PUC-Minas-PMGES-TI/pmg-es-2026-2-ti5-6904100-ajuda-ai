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

Inicie o PostgreSQL definido no Docker Compose da stack:

```bash
cd code
docker compose up -d postgres
```

Copie `.env.example` para `.env` e preencha `MICROSOFT_TENANT_ID`,
`MICROSOFT_CLIENT_ID` e `JWT_SECRET`. O `MICROSOFT_CLIENT_ID` deve ser o mesmo usado
pelo aplicativo móvel para solicitar o ID token. Em produção, a API não inicia sem
`JWT_SECRET`. As variáveis `DB_*` já usam os valores padrão do PostgreSQL criado
pelo Docker Compose.

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
| `GET` | `/avisos` | Avisos publicados pela coordenação. |
| `GET` | `/publicacoes` | Lista as publicações persistidas no backend. |
| `POST` | `/publicacoes` | Cria uma publicação com zero curtidas e zero comentários. |
| `POST` | `/publicacoes/:id/comentarios` | Adiciona um comentário à publicação. |
| `POST` | `/publicacoes/:id/curtidas` | Adiciona ou remove uma curtida (`delta: 1` ou `-1`). |
| `DELETE` | `/publicacoes/:id` | Apaga uma publicação criada pelo usuário. |

As rotas do feed identificam o usuário pelo cabeçalho `x-user-id` enquanto a
integração Microsoft no aplicativo móvel é concluída. O banco impõe uma restrição
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
