# API — Ajuda-aí

Back-end da aplicação, desenvolvido em NestJS com TypeScript.

## Visão geral

A API reúne os domínios do programa e do campus, com PostgreSQL/PostGIS e
armazenamento de arquivos no Azure. O login valida o ID token do Microsoft Entra ID
e emite o JWT da aplicação; dados de demonstração dependem da configuração do ambiente.

Arquitetura, migrations e contratos do mapa estão na
[documentação técnica](../../../docs/tecnico/README.md).

## Pré-requisitos

- Node.js 20 ou superior
- npm 10 ou superior

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

Arquivos ficam no Azure Blob Storage. `AZURE_STORAGE_CONNECTION_STRING`
nunca deve ser commitada. Em produção ela é obrigatória. Em desenvolvimento
a API sobe sem ela, ou com o placeholder do exemplo, e registra um aviso;
operações de arquivo falham até a connection string real estar no `.env`. Containers públicos (`map-assets`, `restaurant-menus`)
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

| Método | Rota                                  | Descrição                                                                                                                     |
| ------ | ------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `POST` | `/auth/login`                         | Valida um ID token Microsoft e devolve o JWT da API e os dados do usuário.                                                    |
| `GET`  | `/me`                                 | Dados do usuário autenticado. Exige JWT no cabeçalho `Authorization`.                                                         |
| `GET`  | `/me/vinculos`                        | Padrinho ou apadrinhados vinculados ao usuário. Exige JWT.                                                                    |
| `POST` | `/auth/login-demo`                    | Login de desenvolvimento sem Microsoft. Só com `AUTH_DEMO_ENABLED=true`, fora de produção, e só para os e-mails da base demo. |
| `GET`  | `/avisos`                             | Comunicados da coordenação (persistidos). `?publico=padrinhos\|apadrinhados` filtra os direcionados.                          |
| `GET`  | `/participacoes`                      | Histórico de participações do aluno (`x-user-id` ou `?usuarioId=`).                                                           |
| `GET`  | `/participacoes/situacao`             | Situação do aluno no ciclo atual: candidatura, padrinho/apadrinhados, grupo e etapas do programa.                             |
| `POST` | `/participacoes/candidatura-padrinho` | Envia (ou edita, enquanto em análise) a candidatura a padrinho com as `respostas`.                                            |
| `POST` | `/participacoes/cadastro-apadrinhado` | Envia o cadastro do apadrinhado; fica aguardando o match da coordenação.                                                      |
| `POST` | `/participacoes/confirmar`            | Confirmação manual de ingresso. Exige JWT de coordenador.                                                                     |
| `POST` | `/participacoes/rejeitar-candidatura` | Rejeição manual por e-mail. Exige JWT de coordenador.                                                                         |
| `GET`  | `/formularios/:tipo`                  | Perguntas extras publicadas para `padrinho` ou `apadrinhado`.                                                                 |

### Coordenação (exige JWT com perfil `coordenador`)

| Método      | Rota                                                    | Descrição                                                                                                                             |
| ----------- | ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `GET`       | `/coordenacao/dashboard`                                | Indicadores, etapas, candidaturas recentes e pontos de atenção (`?programa=`).                                                        |
| `GET`       | `/coordenacao/candidaturas`                             | Lista (`?programa=&papel=candidato\|apadrinhado&status=pendente\|em_analise\|nao_aprovado\|aguardando\|aprovadas\|sem_vinculo&conferencia=pendente\|requisitos_atendidos\|requisitos_nao_atendidos`). |
| `GET`       | `/coordenacao/candidaturas/:id`                         | Detalhe com respostas, versão do formulário, conferência acadêmica (itens, dados para consulta, registro e histórico) e vínculos ativos. |
| `PATCH`     | `/coordenacao/candidaturas/:id`                         | Volta para `pendente`/`em_analise` e salva observações.                                                                               |
| `PUT`       | `/coordenacao/candidaturas/:id/verificacao`             | Registra a conferência acadêmica (`{ itens: [{ id, atende }], observacoes? }`) com responsável e data; candidatura nova vai para análise. |
| `POST`      | `/coordenacao/candidaturas/:id/aprovar`                 | Aprova só com conferência registrada e requisitos atendidos; fica aguardando matching (não cria vínculo).                             |
| `POST`      | `/coordenacao/candidaturas/:id/rejeitar`                | Rejeita a candidatura (`{ justificativa }` obrigatória, visível ao aluno).                                                            |
| `POST`      | `/coordenacao/candidaturas/:id/revogar`                 | Retira uma aprovação (`{ justificativa }`); recusa se houver vínculo ativo e tira as sugestões pendentes do matching.                 |
| `POST`      | `/coordenacao/candidaturas/:id/vinculos/:vinculoId/encerrar` | Encerra um vínculo do matching da participação (tratamento antes de revogar).                                                         |
| `POST`      | `/coordenacao/candidaturas/:id/desvincular`             | Desfaz os vínculos do apadrinhado (matching e grupo legado).                                                                          |
| `POST`      | `/coordenacao/candidaturas/acoes`                       | Ação em massa: `{ ids, acao: "aprovar" \| "rejeitar" \| "em_analise" }`.                                                              |
| `GET`       | `/coordenacao/usuarios`                                 | Participantes do programa (`?programa=&papel=`).                                                                                      |
| `POST`      | `/coordenacao/vinculos`                                 | Define o padrinho de um apadrinhado (`{ apadrinhadoId, padrinhoId }`); cria o grupo se preciso.                                       |
| `GET`       | `/coordenacao/matching?programa=`                       | Visão administrativa, totais e pendências da outbox de chat.                                                                          |
| `GET`/`PUT` | `/coordenacao/matching/config`                          | Lê/cria uma versão da configuração (`PUT` recebe programa, liberação, capacidades e critérios).                                       |
| `POST`      | `/coordenacao/matching/liberar`                         | Cria uma nova versão alterando a liberação (`{ programa, liberado }`).                                                                |
| `POST`      | `/coordenacao/matching/executar`                        | Executa a alocação capacitada (`{ programa }`), sem criar vínculos ou chats.                                                          |
| `GET`       | `/coordenacao/matching/execucoes?programa=`             | Histórico de execuções e falhas.                                                                                                      |
| `GET`       | `/coordenacao/matching/sugestoes?programa=&status=`     | Sugestões pendentes e histórico de decisões/obsolescência.                                                                            |
| `GET`       | `/coordenacao/matching/sugestao/:id`                    | Detalhe, explicação por critério e eventos de chat associados.                                                                        |
| `POST`      | `/coordenacao/matching/sugestao/:id/aprovar`            | Revalida e confirma o vínculo; enfileira eventos de chat na mesma transação.                                                          |
| `POST`      | `/coordenacao/matching/sugestao/:id/recusar`            | Registra a recusa (`{ motivo? }`) sem alterar candidatura ou vínculo.                                                                 |
| `GET`       | `/coordenacao/programas`                                | Programas com etapas, datas e totais.                                                                                                 |
| `POST`      | `/coordenacao/programas`                                | Abre um novo ciclo.                                                                                                                   |
| `PATCH`     | `/coordenacao/programas?codigo=2026/2`                  | Atualiza etapa, inscrições, vagas, grupos e datas.                                                                                    |
| `GET`       | `/coordenacao/formularios`                              | Formulários de padrinho e apadrinhado do programa (`?programa=`), com `status` (`rascunho`, `publicado`, `encerrado`) e `versao`.     |
| `GET`/`PUT` | `/coordenacao/formularios/:tipo`                        | Lê/salva as perguntas e a publicação. Publicar, ou alterar um formulário publicado, cria nova versão; programa encerrado não publica. |
| `DELETE`    | `/coordenacao/formularios/:tipo`                        | Exclui um rascunho nunca publicado (`?programa=`).                                                                                    |
| `POST`      | `/coordenacao/formularios/:tipo/encerrar`               | Encerra novas respostas (`{ programa }`); os envios existentes são mantidos.                                                          |
| `POST`      | `/coordenacao/formularios/:tipo/duplicar`               | Copia as perguntas para outro programa como rascunho (`{ programaOrigem, programaDestino }`; 409 se o destino já tem formulário).     |
| `GET`       | `/coordenacao/formularios/:tipo/respostas`              | Envios do programa, cada um com aluno, programa e versão respondida.                                                                  |
| `GET`       | `/coordenacao/formularios/:tipo/respostas/por-pergunta` | Mesmas respostas agrupadas por pergunta, com contagem por alternativa.                                                                |
| `GET`       | `/coordenacao/recompensas`                              | Recompensas da lojinha (F27), com estoque, versão, transações e `disponivelAgora` (`?status=rascunho\|publicada\|inativa\|arquivada`). |
| `GET`       | `/coordenacao/recompensas/:id`                          | Detalhe com histórico de versões (condições vistas no resgate) e ajustes de estoque. |
| `POST`      | `/coordenacao/recompensas`                              | Cria (`nome`, `custoXp`, `condicoesRetirada`, `estoqueIlimitado`, `estoqueInicial` se limitado; opcionais `descricao`, `imagemUrl`, `limitePorAluno`, `publico`, `programaCodigo`, `disponivelDe/Ate`, `publicar`). |
| `PATCH`     | `/coordenacao/recompensas/:id`                          | Edita; mudar nome, descrição, imagem, custo ou condições cria nova versão (resgates anteriores mantêm a sua). |
| `POST`      | `/coordenacao/recompensas/:id/estoque`                  | Reposição, correção ou troca ilimitado/limitado (`{ tipo, quantidade?, motivo }`); nunca abaixo do comprometido. |
| `POST`      | `/coordenacao/recompensas/:id/publicar` \| `desativar` \| `arquivar` | Publica, tira da lojinha ou arquiva (somente leitura, histórico preservado). |
| `DELETE`    | `/coordenacao/recompensas/:id`                          | Exclui só sem transações; com resgates responde 409 `recompensa-com-transacoes` (arquive). |
| `GET`       | `/me/lojinha`                                           | Lojinha do aluno: publicadas, na vigência, do seu público/programa (`estoque` disponível; `null` = ilimitado). |
| `POST`      | `/me/lojinha/:id/resgatar`                              | Resgata com XP (`{ chaveIdempotencia }`); 404 indisponível, 409 esgotada/limite, 422 saldo insuficiente. |
| `GET`       | `/me/lojinha/resgates`                                  | Histórico de resgates do aluno, com as condições da versão resgatada. |
| `POST`      | `/coordenacao/comunicados`                              | Publica um comunicado para todos, padrinhos ou apadrinhados.                                                                          |
| `GET`       | `/publicacoes`                                          | Lista as publicações persistidas no backend.                                                                                          |
| `POST`      | `/publicacoes`                                          | Cria uma publicação com zero curtidas e zero comentários.                                                                             |
| `POST`      | `/publicacoes/:id/comentarios`                          | Adiciona um comentário à publicação.                                                                                                  |
| `POST`      | `/publicacoes/:id/curtidas`                             | Adiciona ou remove uma curtida (`delta: 1` ou `-1`).                                                                                  |
| `DELETE`    | `/publicacoes/:id`                                      | Apaga uma publicação criada pelo usuário.                                                                                             |

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
```

Quem já está em `usuarios` recebe `situacao: "autenticado"` e o JWT normal.
Quem ainda não está recebe `situacao: "onboarding"` e um JWT de 15 minutos
(`escopo: onboarding`) com nome e e-mail verificados. Esse token não abre `/me`.
O `POST /cadastro` exige esse token (ou a sessão normal) e recusa um e-mail
diferente do que está no token.

## Login real e login demo

O login real é `POST /auth/login` com o ID token da Microsoft. A conta precisa
ser `@pucminas.edu.br` (`AUTH_ALLOWED_DOMAIN`). Um e-mail inventado não entra.

O login demo é só para desenvolvimento. Não passa pela Microsoft, não usa senha
e não aceita um e-mail qualquer. `POST /auth/login-demo` exige
`AUTH_DEMO_ENABLED=true` e `NODE_ENV` diferente de `production`. Em produção
a rota é recusada mesmo com a flag ligada.

Usuários fixos (os e-mails já usados no código; não foram trocados):

| Nome                | E-mail                            | Papel no seletor                    |
| ------------------- | --------------------------------- | ----------------------------------- |
| Camila Duarte       | `camila@pucminas.edu.br`          | Apadrinhada                         |
| Lucas Almeida       | `lucas.almeida@pucminas.edu.br`   | Apadrinhado                         |
| Thiago Moreira      | `thiago@pucminas.edu.br`          | Padrinho                            |
| Ana Beatriz Costa   | `ana.beatriz@pucminas.edu.br`     | Candidata a padrinho                |
| Pedro Henrique Lima | `pedro.lima@pucminas.edu.br`      | Candidato a padrinho                |
| Julia Fernandes     | `julia.fernandes@pucminas.edu.br` | Candidata não aprovada              |
| Renata Martins      | `renata@pucminas.edu.br`          | Coordenadora (não vai para o banco) |

Renata continua só na base em memória. Os outros precisam de uma linha em
`usuarios`. No ambiente compartilhado, rode **uma vez** (não em produção):

```bash
npm run seed:demo
```

O comando é idempotente: cria quem falta e não duplica quem já existe. Ele
também completa programa, requisitos e participações demo. Não ligue
`SEED_DEMO_DATA=true` no banco remoto; a API continua recusando essa flag
fora de um banco local.

```bash
curl http://localhost:3000/me \
  -H 'Authorization: Bearer JWT_DEVOLVIDO_PELA_API'
```

## Build e verificação

```bash
npm run build
npm run lint
npm test
```
