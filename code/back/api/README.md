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

**O único `.env` lido pela API é `code/back/api/.env`** (o `code/.env` serve só
ao Docker Compose). Copie `code/back/api/.env.example` para `code/back/api/.env`
e preencha os valores; o `.env` está no `.gitignore` e nunca deve ser versionado.

Banco local (Docker Compose): inicie `docker compose up -d postgres` a partir de
`code` e use `DB_HOST=localhost`, `DB_PORT=5433`, `DB_USERNAME=ajudaai`,
`DB_PASSWORD=ajudaai`, `DB_DATABASE=ajudaai`, `DB_SSL=false`, `SEED_DEMO_DATA=true` (alunos, ciclos e participações de
demonstração) e, se quiser que o schema seja criado/ajustado automaticamente,
`DB_SYNCHRONIZE=true`.

Banco remoto/compartilhado (ex.: Supabase): preencha `DB_HOST`, `DB_PORT`,
`DB_USERNAME`, `DB_PASSWORD` e `DB_DATABASE` com a connection string do projeto,
`DB_SSL=true`, `DB_SSL_CA=certs/supabase-ca.crt` (CA baixada em Database
Settings → SSL Configuration; o TLS é sempre validado), **`DB_SYNCHRONIZE=false`**
e **`SEED_DEMO_DATA=false`** (com banco remoto a API recusa iniciar com seed ligado) — a API se recusa a iniciar com
`synchronize` ligado fora de um banco local. Antes de subir a API contra um banco
novo, rode a verificação somente leitura:

```bash
npm run build
npm run db:verificar
```

Ela testa DNS, porta, login, SSL e tabelas, e lista (sem executar) o SQL que o
`synchronize` aplicaria. Antes de produção: migrations e `DB_SYNCHRONIZE=false`.

Ao iniciar, a API registra qual banco está usando (`[Banco] host:porta/banco ...`,
sem credenciais). `JWT_SECRET` com o valor de exemplo gera um aviso em
desenvolvimento e impede a inicialização em produção (exige ≥ 32 caracteres). O
login demo (`AUTH_DEMO_ENABLED=true`) é só para desenvolvimento e fica bloqueado
com `NODE_ENV=production`.

Arquivos ficam no Azure Blob Storage. `AZURE_STORAGE_CONNECTION_STRING` é
obrigatória no `.env` local (o placeholder do exemplo não sobe a API) e nunca
deve ser commitada. Containers públicos (`map-assets`, `restaurant-menus`)
usam a URL permanente do blob, sem SAS de leitura. Containers privados
(`profiles`, `feed`, `chat`) guardam só a chave (`profiles/{id}/{uuid}.webp`)
e recebem uma SAS curta na hora de ler ou enviar; essa SAS não deve ser salva
no banco. A validade padrão é 15 minutos para leitura e 10 para upload
(`AZURE_STORAGE_SAS_LEITURA_MINUTOS`, `AZURE_STORAGE_SAS_UPLOAD_MINUTOS`).
A API não cria containers. Upload direto pelo navegador exige CORS na conta de
armazenamento (origem do front, `PUT` e `OPTIONS`); o app mobile nativo não
depende desse CORS, e esta API não altera a conta.

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
