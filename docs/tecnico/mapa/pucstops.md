# PucStops

PucStops são pontos cadastrados pela coordenação que concedem XP uma vez por
usuário e ponto. XP pertence à carteira global do Ajuda-aí, não à versão do
mapa ou ao ciclo de apadrinhamento. [Modelo de XP](../gamificacao/xp.md).

## Cadastro e identidade

`mapa.pucstops` guarda UUID gerado pelo banco, nome, posição, raio, XP,
ativação, criador e datas. Não há `versao_id`; editar conteúdo não publica
uma versão cartográfica. O manifesto guarda apenas o modelo visual do totem.

- Nome não vazio, até 120 caracteres; XP inteiro 1..1000; raio 10..200 m.
- Posição WGS84 dentro da região operacional do campus.
- Excluir significa **desativar**; a linha e seu histórico permanecem.
- Editar XP vale apenas para novas coletas. Mudar posição ou reativar não
  permite nova coleta a quem já coletou o mesmo UUID.
- Listas de totens de demonstração do PUCMaps não são dados de produção.
  Sem pontos cadastrados, lista vazia é resposta normal.

`criado_por` referencia `usuarios.id` quando o coordenador tem cadastro;
pode ser nulo no modo de demonstração. Não há trilha de quem editou, apenas
data de atualização. FKs de coletas impedem exclusão física do histórico.

## Limite do campus

`campus-limite.ts` calcula a envoltória convexa das geometrias de prédios,
áreas e nós da versão ativa, com margem geodésica de 30 m.
É uma região operacional, não um limite administrativo oficial nem o bbox
de câmera das footprints.

O seletor web desenha a mesma região devolvida pela API; o servidor decide.
Sem versão ativa, escrita retorna 503. Trocar a versão não revalida pontos
existentes automaticamente; editar posição ou reativar faz nova validação.

## Coleta, geofence e concorrência

`POST /mapa/pucstops/:id/claim` recebe somente
`{latitude, longitude, accuracy?}`. Usuário vem do JWT e cadastro;
XP e raio vêm do banco. Campos extras são recusados.

A geofence usa `ST_DWithin`/`ST_Distance` com `geography` em metros,
funções qualificadas pelo schema real do PostGIS. Distância igual ao raio é
aceita. `MARGEM_TECNICA_METROS = 0`; `accuracy` não amplia o raio.
Precisão informada acima de 100 m é recusada.
Isso não detecta GPS falsificado.

Uma transação reúne:

1. Leitura do PucStop ativo com `FOR SHARE` e geofence.
2. Criação/trava da carteira por usuário com `FOR UPDATE`.
3. Verificação de coleta anterior.
4. Inserção no ledger, atualização do saldo e registro da coleta.
5. Commit; qualquer falha provoca rollback.

Coleta e ledger têm chaves únicas para impedir crédito duplo. Requisições do
mesmo usuário serializam na carteira; repetição retorna 409 `ja-coletado`.
A trava do PucStop impede misturar XP/posição de antes e depois de uma edição.

## Endpoints

Leitura pública:

- `GET /mapa/pucstops`: ativos, por nome.
- `GET /mapa/pucstops/:id`: detalhe ativo; 404 inexistente/inativo.

Com JWT:

- `POST /mapa/pucstops/:id/claim`: 201 com
  `{pucstopId, xpGanho, xpTotal, claimedAt, distanciaMetros}`.
- `GET /me/pucstops`: coletas do próprio usuário.

Erros de coleta: 400 corpo inválido; 401 sem sessão; 403 sem cadastro;
404 ponto inexistente; 409 já coletado; 422 `fora-do-alcance`, `inativo`
ou `precisao-insuficiente`. Falha SQL da consulta geográfica é sanitizada
como 503, sem expor SQL, parâmetros ou causa com coordenadas.

Coordenação exige JWT e papel `coordenador`:

- `GET/POST /coordenacao/pucstops`, `GET/PATCH /coordenacao/pucstops/:id`.
- `GET /coordenacao/pucstops/campus`: região, margem, bbox e centro.
- `POST /coordenacao/pucstops/:id/desativar` ou `/ativar`: idempotentes.

PATCH aceita nome, posição, XP e raio; ativação usa as rotas próprias.
Não há escrita administrativa em `/mapa/pucstops`.

## Privacidade

A posição do claim vai no corpo do POST, é usada na consulta e não é gravada
ou registrada em log. A resposta contém distância, sem posição.
Erros do driver podem carregar SQL e parâmetros; não devem chegar ao logger
padrão do Nest. A regressão `pucstops-privacidade.spec.ts` protege esse limite.

O app lê GPS sob demanda para distância/coleta, sem stream, background ou
histórico. Consequentemente, as coletas não permitem auditar onde o usuário estava.

## Clientes e modelo visual

O app implementa `CampusPucStopService` com a sessão do Ajuda-aí e injeta o
serviço em `campus_map`. O total retornado pelo servidor substitui o saldo
exibido; o cliente não soma XP.

Pontos 2D mostram disponível/coletado; toque abre o card.
Totem 3D usa o modelo da seção `pucstops` do manifesto, somente nos disponíveis.
Sem modelo/rede, pontos e coleta continuam independentes do GLB.
O renderer recria a camada do totem ao mudar dados para evitar resíduos
translúcidos do SDK. [Renderização](renderizacao-3d.md).

A web usa clique/arraste no mapa para posição e geofence. Requer token público
Mapbox configurado para a origem web; sem ele, só permite editar os campos
não espaciais de um ponto existente.
[Configuração web](../../../code/front/README.md#pucstops-e-mapa-coordenação).

## Limitações e verificação

Não há coleta automática, cooldown, detecção de GPS falso ou rate limit distribuído.
O seletor espacial web exige mouse/toque.
Áudio do totem não é distribuído por falta de confirmação de origem/licença;
o callback de coleta não implica suporte de áudio.

`test/pucstops-xp.integration.spec.ts` valida geofence, CRUD, autorização,
concorrência e rollback com PostGIS descartável.
`src/gamificacao/pucstops/pucstops-privacidade.spec.ts` verifica sanitização.
Testes do app/pacote e `code/front/test/pucstops.test.mjs` cobrem contratos,
estados e interação sem substituir validação nativa de GPS/Mapbox.
[Executar integração local](../banco/migrations.md#testes).
