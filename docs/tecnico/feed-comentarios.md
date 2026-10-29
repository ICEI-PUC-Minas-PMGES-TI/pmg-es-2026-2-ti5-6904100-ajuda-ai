# Evolução do feed: mídia estável e comentários

## Diagnóstico e estado Flutter

O callback SSE consultava `GET /publicacoes` a cada evento e substituía toda a
lista. A API emite uma SAS de leitura em cada resposta, enquanto `midias` continua
contendo a chave estável do blob. Trocar a SAS mudava a chave do `NetworkImage`.

`FeedMedia` mantém a identidade por referência de `midias`. Uma SAS válida continua
em uso mesmo se chegar outra assinatura para a mesma mídia. A assinatura nova fica
disponível para recuperação de erro; não dispara download enquanto a atual funciona.
Expiração (`se`), erro de imagem e HTTP 401/403 no download permitem renovação. Há
deduplicação e intervalo mínimo entre tentativas para evitar loops em blobs ausentes.
Trocar a referência da mídia utiliza a nova imagem. O editor usa as URLs atuais e
continua salvando as referências, sem reenviar imagens existentes.

Eventos com `publicacaoId` consultam apenas `GET /publicacoes/:id`; o card usa um
`ValueNotifier` próprio. O painel de comentários recebe a mudança sem perder texto,
foco ou modo de resposta. `feed.ready` reconcilia a lista completa após reconexão.
Exclusão de publicação remove o card. A infraestrutura RabbitMQ/Outbox/SSE permanece.

## UX

- Toast próprio pequeno, flutuante, arredondado, com ícone, fade/slide sutil,
  SafeArea, desaparecimento automático e sem capturar toques. Sucesso e erro usam
  a mesma linguagem visual. Uma nova mensagem substitui a anterior.
- Viewer mantém Hero, zoom/pan e posição durante o salvamento. Salva apenas a
  imagem aberta e não pede SAS nova enquanto a atual funciona.
- Comentários usam linhas sem balões grandes: foto ou iniciais, nome fornecido
  pelo servidor, horário/data, texto e ações. Lista scrollável; campo fixo acima
  do teclado, inclusive em telas estreitas.
- `Responder` mostra o destinatário e permite cancelar. Responder a uma resposta
  mantém a raiz e preenche `@Nome`. A API também normaliza a raiz, sem confiar no app.
- Menu de exclusão depende de `podeExcluir`; confirmação avisa quando respostas
  também serão removidas. A decisão final continua no backend.
- Curtidas individuais aguardam confirmação, bloqueando repetição enquanto pendentes.

## Contrato da API

Os campos existentes de publicação, `comentariosTexto`, `midias` e `imagens`
continuam disponíveis. `comentariosDetalhes[]` passa a conter:

```json
{
  "id": 42,
  "texto": "Comentário",
  "paiId": null,
  "criadoEm": "2026-10-29T17:00:00.000Z",
  "autor": {"id": "usuario:123", "nome": "Nome cadastrado", "fotoUrl": null},
  "podeExcluir": true,
  "curtidas": 2,
  "curtidoPorMim": false
}
```

Identificadores de autor têm namespace para distinguir a conta da coordenação
dos IDs de alunos. Autor removido/desconhecido retorna nome indisponível e ID opaco;
nunca se deduz nome a partir do e-mail. A resposta não expõe e-mail, curso, status
ou outros dados do cadastro. Nomes são buscados em lote; fotos existentes usam o
blob privado `profiles/usuarios/<id>/avatar.img` com SAS de leitura. Ausência/falha
da foto não impede a leitura dos comentários.

- `POST /publicacoes/:id/comentarios`: `{texto, paiId?}`. `paiId` pode apontar para
  uma resposta, mas o servidor armazena sempre o ID da raiz na mesma publicação.
- `POST /publicacoes/:id/comentarios/:comentarioId/curtidas`: `{delta: 1|-1}`.
  Curtir/descurtir são idempotentes; uma única curtida por usuário/comentário.
- `DELETE /publicacoes/:id/comentarios/:comentarioId`: endpoint existente;
  autor ou usuário autorizado pela `FeedPolicy`, com cascata das respostas.

Os comandos continuam retornando a publicação atualizada. Dados do autor enviados
pelo cliente são recusados pela validação HTTP.

## Banco e migration para revisão

Migration criada: `code/back/api/src/migrations/1793400000000-ThreadsComentariosFeed.ts`.

- Adiciona `comentarios.pai_id` nullable com FK para comentários e cascata;
  comentários existentes permanecem raízes, com `pai_id = null`.
- Índice de publicação/thread e restrição contra autorreferência.
- Cria `curtidas_comentarios`, separada de `curtidas` da publicação, com unicidade
  `(comentario_id, usuario_id)` e FK com cascata.
- Operações usam o lock transacional já existente da publicação; evento é gravado
  na mesma transação da alteração.
- Rollback recusa descartar respostas/curtidas existentes.

**Não executada no Supabase compartilhado.** O teste aplicou/reverteu a migration
somente em schema `feed_test_*` descartável no PostgreSQL local, incluindo
preservação de comentário anterior à migration.

Antes de testar/deployar a API atualizada no banco compartilhado, revisar a
migration e a lista de migrations pendentes. Aplicação é uma etapa manual, após
essa revisão; não habilitar `DB_SYNCHRONIZE`. Depois, reiniciar o backend.

## Eventos

Novo: `feed.comment.like.updated`. Respostas usam `feed.comment.created` e
exclusões usam `feed.comment.deleted`; curtidas da publicação continuam usando
`feed.like.updated`. Todos seguem como invalidações com `publicacaoId`, sem
e-mail, texto de comentários, tokens ou SAS no broker/SSE.

## Validação e demonstração com dois clientes

1. Após revisar/aplicar manualmente a migration, iniciar a API com o RabbitMQ já
   configurado e compilar o Flutter. Em celular físico, passar
   `--dart-define=API_BASE_URL=http://IP_DO_NOTEBOOK:3000`.
2. Abrir cliente A como coordenação e B como aluno. Abrir o mesmo post com imagem
   e manter os comentários abertos nos dois clientes.
3. B comenta; A vê nome/foto quando disponível e o comentário sem refresh.
4. A responde; B vê a resposta recuada. B responde a essa resposta: a mesma raiz
   é mantida. Testar também cancelar o modo de resposta.
5. Curtir/descurtir comentários em ambos; conferir contador/estado e atualização
   remota. Curtidas da publicação não devem mudar com curtidas de comentários.
6. A exclui comentário de B após confirmação; ambos veem a remoção. Conferir que
   aluno não recebe menu em comentário alheio e que a API rejeita tentativa direta.
   Excluir uma raiz também exclui suas respostas.
7. Observar que interações não piscam nem baixam novamente a imagem. Editar o post
   trocando a imagem deve mostrar a nova mídia. Abrir/fechar viewer, zoom/pan e
   salvar: toast compacto e imagem mantida na posição. SAS expirada deve renovar;
   falha persistente deve exibir mensagem, sem loop de requisições.

Testes adicionados/expandidos cobrem autor/foto, privacidade, autorização, raiz de
respostas, cancelamento, curtidas idempotentes/concorrentes, cascade, SSE,
estabilidade do `Image` e da SAS, renovação após erro, toast e teclado/scroll.

## Arquivos desta evolução

Backend (`code/back/api/`):

- `src/publicacoes/publicacoes.service.ts`, `publicacoes.controller.ts`,
  `publicacoes.dto.ts`, `publicacoes.module.ts`, `feed-evento.ts`,
  `feed-midias.service.ts`, `comentarios.spec.ts`;
- `src/publicacoes/entities/comentario.entity.ts`, `curtida-comentario.entity.ts`;
- `src/usuarios/usuarios.service.ts`;
- `src/migrations/1793400000000-ThreadsComentariosFeed.ts`;
- `test/helpers/feed.ts`, `test/feed.e2e.spec.ts`, `test/feed.integration.spec.ts`.

Flutter (`code/mobile/`):

- `lib/tela_feed.dart`, `lib/models/feed_comment.dart`;
- `lib/services/feed_media.dart`, `lib/services/feed_image_save.dart`;
- `lib/widgets/app_feedback.dart`, `lib/widgets/feed_comments_sheet.dart`;
- `test/feed_comments_test.dart`, `test/feed_media_test.dart`,
  `test/feed_imagens_test.dart`, `test/feed_mobile_admin_test.dart`,
  `test/feed_tempo_real_test.dart`;
- `README.md` e este documento.

Nenhuma dependência nova nesta evolução. As alterações anteriores do viewer e
do plugin `gal` foram preservadas; infraestrutura e configurações existentes
de upload, broker, storage, matching e demais áreas não foram refatoradas.
