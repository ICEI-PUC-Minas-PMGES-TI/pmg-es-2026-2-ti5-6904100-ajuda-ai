# API — Ajuda-aí

Back-end da aplicação, desenvolvido em NestJS com TypeScript.

## Estado atual

Versão parcial. Os endpoints respondem com dados fictícios mantidos em memória
(`src/dados/dados.ts`), sem banco de dados e sem autenticação real. A rota de login
devolve um token simulado apenas para permitir o fluxo de navegação dos clientes.

Persistência com PostgreSQL e TypeORM, autenticação JWT e mensageria estão previstas
para as próximas sprints.

## Pré-requisitos

* Node.js 20 ou superior
* npm 10 ou superior

## Instalação

```bash
cd code/back/api
npm install
```

## Execução

```bash
npm run start:dev
```

A API fica disponível em `http://localhost:3000`.

## Endpoints

| Método | Rota | Descrição |
| --- | --- | --- |
| `POST` | `/auth/login` | Autentica e devolve token e dados do usuário. Aceita `{ "perfil": "apadrinhado" \| "padrinho" \| "coordenador" }` no corpo. |
| `GET` | `/me` | Dados do usuário autenticado. Aceita `?perfil=` para alternar entre os perfis. |
| `GET` | `/me/vinculos` | Padrinho ou apadrinhados vinculados ao usuário. |
| `GET` | `/avisos` | Avisos publicados pela coordenação. |
| `GET` | `/publicacoes` | Lista as publicações criadas durante a execução da API. |
| `POST` | `/publicacoes` | Cria uma publicação com zero curtidas e zero comentários. |
| `POST` | `/publicacoes/:id/comentarios` | Adiciona um comentário à publicação. |
| `POST` | `/publicacoes/:id/curtidas` | Adiciona ou remove uma curtida (`delta: 1` ou `-1`). |
| `DELETE` | `/publicacoes/:id` | Apaga uma publicação criada pelo usuário. |

Exemplo:

```bash
curl -X POST http://localhost:3000/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"perfil":"padrinho"}'
```

## Build e verificação

```bash
npm run build
npm run lint
```
