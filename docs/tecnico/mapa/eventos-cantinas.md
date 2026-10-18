# Eventos, restaurantes e cardápios

Conteúdo do campus é cadastrado pela coordenação, independente das versões
cartográficas. O aluno consulta listas, seleciona marcadores e traça rota até
o local. Não há seed automático baseado em listas de demonstração da origem.

## Modelo e localização

Tabelas no schema `mapa`, mantidas por `EventosRestaurantesCardapios`:

- `eventos`: título, descrição, início/fim com fuso, local opcional, ativação
  e dados de criação/atualização.
- `restaurantes`: nome, descrição, local obrigatório, horários e ativação.
- `cardapios`: restaurante, vigência, chave de arquivo, tipo, tamanho e criação.

Um local usa exatamente uma forma: `predio_id`, `area_id` ou ponto
`localizacao`. Evento pode não ter local; restaurante precisa de um.
IDs de prédio/área são resolvidos na versão ativa, sem duplicar geometria
nem FK incompatível com chaves por versão. Ponto livre é validado contra a
[região operacional do campus](pucstops.md#limite-do-campus).

Se o local deixar de existir na versão ativa, o item mantém seu nome,
mas não tem posição/rota disponível.
`criado_por` referencia `usuarios.id` quando há cadastro e pode ser nulo
para o coordenador de demonstração.

## Regras de conteúdo

Título/nome: 3..255 caracteres; descrição até 2000.
Evento tem um período de até 31 dias, fim após início e timestamps com fuso.
Recorrências são eventos separados.

Horários de restaurante usam `{dia: 0..6, abre, fecha}`, sem sobreposição
ou passagem de meia-noite. “Aberto agora” e cardápio do dia usam
`America/Sao_Paulo`; sem horário cadastrado, não afirmar que está fechado.

Excluir evento/restaurante desativa, preservando o registro.
Cardápio é removido fisicamente do banco e storage, não é histórico.
A vigência é inclusiva, até 31 dias; em sobreposição, vence o arquivo criado
mais recentemente. Prédios `CAFETERIA` são sugestões de cadastro, não
restaurantes criados automaticamente.

## API

Público, somente leitura:

- `GET /mapa/eventos`: ativos não encerrados, por início.
- `GET /mapa/eventos/:id`: ativo, inclusive encerrado para link direto.
- `GET /mapa/restaurantes` e `GET /mapa/restaurantes/:id`: ativos.
- `GET /mapa/restaurantes/:id/cardapio?data=AAAA-MM-DD`:
  `{data, cardapio}`, com `cardapio: null` sem arquivo vigente.

Coordenação, com JWT e papel `coordenador`:

- `GET /coordenacao/campus`: região de posicionamento.
- `GET/POST /coordenacao/eventos`, `GET/PATCH /coordenacao/eventos/:id`;
  `POST .../:id/ativar` ou `/desativar`.
- `GET/POST /coordenacao/restaurantes`, `GET/PATCH /coordenacao/restaurantes/:id`;
  `POST .../:id/ativar` ou `/desativar`.
- `GET /coordenacao/restaurantes/sugestoes`.
- `GET/POST /coordenacao/restaurantes/:id/cardapios`.
- `DELETE /coordenacao/cardapios/:id`.

PATCH é parcial; `local: null` só é aceito para evento.
Erros incluem 400 de validação/campo extra, 401/403 de autorização,
404 de recurso, 422 `local-inexistente`/`fora-do-campus`,
503 sem versão ativa e 413 de arquivo acima do limite.

## Cardápios e storage

O backend recebe multipart com `arquivo`, `validoDe`, `validoAte` e
`substitui?`. Aceita PNG/JPEG/WebP/PDF até 10 MB, conferidos pelos bytes,
sem confiar no Content-Type ou nome enviados.

Arquivo no container público `restaurant-menus`:
`restaurantes/<restauranteId>/cardapios/<cardapioId>.<ext>`.
UUID gerado pela API, nome sem dados do arquivo original,
`If-None-Match: *` e cache imutável de um ano.
A resposta tem URL pública, sem SAS ou segredo.

Banco e storage não compartilham transação distribuída:

- Envio grava o blob antes da linha; falha no banco tenta apagar o blob.
  Se a compensação também falhar, o serviço registra o órfão para investigação.
- Remoção apaga blob antes da linha. Falha de storage preserva a linha;
  blob já ausente não impede a remoção. Falha posterior de banco exige
  conferir a linha remanescente.
- Substituição grava o novo antes de remover o anterior; uma falha de remoção
  pode deixar ambos. Não se deve apagar o novo automaticamente sem conferir o banco.

## Clientes e rotas

A web usa seletor de prédio, área, ponto e, só para evento, sem local.
O servidor revalida os dados; o seletor não é fronteira de segurança.
[Configuração Mapbox web](../../../code/front/README.md#pucstops-e-mapa-coordenação).

O app injeta `CampusContentService` no pacote. Listas têm carregamento,
vazio e retry; recarga invalida respostas antigas. Marcadores usam tipo/ID
e ficam acima do 3D. Um card por vez evita conflito com busca e PucStops.

`local.rota` informa prédio por ID ou coordenada de área/ponto.
`CampusRouteTarget.forPlace` também preserva essa distinção para a busca.
[Encaixe e custo completo](rotas.md).
Imagem abre no app; PDF usa visualizador externo com alternativa de copiar link.

Imagens de eventos, push, ofertas e menu estruturado não fazem parte desses
contratos; exigem regras próprias, não simples extensão de uma lista de campos.

## Verificação

`test/campus.integration.spec.ts` usa PostGIS descartável e storage em memória.
Regras de horário e bytes de arquivo têm testes em `src/campus/`.
`code/front/test/eventos.test.mjs` e `restaurantes.test.mjs` cobrem
validação/contratos; os testes `campus_content_test.dart` e
`campus_conteudo_api_test.dart` cobrem pacote e adaptador do app.
[Executar integração](../banco/migrations.md#testes).
