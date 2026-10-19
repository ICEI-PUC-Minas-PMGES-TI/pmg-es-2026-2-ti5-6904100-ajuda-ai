# Busca e localização no campus

A busca usa `CampusPlaceRepository`; a localização usa `CampusLocationService`.
A câmera é abstraída por `CampusMapCamera`, permitindo testes sem GPS ou
engine nativos. [Setup](setup-mobile.md), [contrato da API](api.md#busca).

## Busca e modelo

`CampusPlace` guarda ID estável, nome/código, categoria opcional, tipo de local
e centro `[longitude, latitude]`. Polígonos não são duplicados no índice.
IDs de footprint unem busca e foco; UUIDs de áreas/salas não devem ser enviados
como ID de prédio para traçar rota.

Nome e código são indexados com normalização de caixa, acentos e espaços.
Ranking: código exato, nome exato, prefixo de nome, prefixo de código, nome contém.
Desempate local por nome, código e ID; a API também ordena por tipo de local.
Consulta vazia não carrega/lista o campus; resultados têm limite.

O índice local é montado uma vez por tela sobre footprints com nome ou código.
Não infere aliases ou salas: código `26` não é alias `P26`.
Polígonos com código compartilhado continuam separados por ID.
O ID da API de origem (`apiId`) não substitui o ID estável do footprint.

## Categorias de locais permanentes

O botão “Categorias de locais”, dentro da busca, abre quatro filtros:
Prédios acadêmicos (`ACADEMIC`, `CLASSROOM`, `AUDITORIUM`), Laboratórios
(`LAB`), Biblioteca (`LIBRARY`) e Esportes (`SPORTS`). O primeiro corresponde
ao agrupamento “Salas de Aula” do PUCMaps: prédios de ensino e apoio, não salas
individuais. A classificação herdada é ampla e não comprova uso exclusivo
para aulas em cada prédio.

`CampusPlaceCatalog` usa o índice local, com os tipos do snapshot, sem novas
requisições ou inferência por nome. A lista mostra todos os locais compatíveis
e pode ser filtrada por nome/código; o limite de oito sugestões da busca
textual não corta categorias. IDs evitam duplicação; footprints diferentes
com o mesmo código permanecem separados. A seleção usa o card e a rota normais
do prédio, e seu foco não exige uma segunda consulta remota.

Ao cancelar o painel, o texto da busca principal é preservado; ao voltar a
digitar nele, a busca permanece global. Eventos e Onde comer mantêm seus
atalhos e contratos próprios. Abrir/fechar o teclado recalcula os limites da
câmera sem substituir o foco escolhido por um fit do campus inteiro.

## Fonte remota e fallback

`MapaApiPlaceRepository`, no app, consulta a API do Ajuda-aí.
O pacote recebe esse repositório e compõe
`FallbackCampusPlaceRepository(primary, fallback)`.

Sucesso remoto, inclusive lista vazia, é resposta válida. Erro de rede,
servidor ou contrato aciona o snapshot local; falha nas duas fontes gera
mensagem controlada. A busca seguinte tenta a fonte remota novamente.

O foco usa os lugares da última busca antes de buscar detalhes do prédio.
A UI ignora respostas de consultas anteriores. A busca é disparada a cada
alteração do campo, sem debounce próprio; o debounce da câmera é exclusivo do LOD.

## Controller e interface

`CampusMapController` conecta/desconecta a câmera por style e invalida
operações pendentes ao sair. Controller externo pertence ao chamador;
o criado pela view é descartado por ela.

Os controles são overlay separado do `MapWidget`; digitar não recria
o mapa. Seleção esconde teclado/lista e foca o local; limpar mantém a câmera.
Controles reservam espaço para logo e atribuição nativos.
Foco e rota com card aberto reservam sua altura medida no padding da câmera.

## Localização e permissões

`GeolocatorCampusLocationService` verifica serviço e permissão antes da leitura.
Somente uma ação explícita de localização/rota/coleta inicia a solicitação;
abrir o mapa não pede acesso automaticamente.

Leituras concorrentes compartilham a operação. Serviço desligado, negativa,
negativa permanente, timeout e coordenada inválida produzem resultados tipados,
com ações de configurações quando cabíveis.
A implementação usa leitura pontual com timeout para essas ações. Durante
uma rota ativa, o monitor de desvio usa stream Geolocator; é cancelado ao
limpar a rota, sair, pausar ou trocar style. [Recálculo de rota](rotas.md).

Android declara `INTERNET`, `ACCESS_COARSE_LOCATION` e `ACCESS_FINE_LOCATION`.
Não solicita localização em background ou serviço foreground.
O puck 2D usa o provedor nativo do Mapbox; Geolocator fornece a posição pontual
para câmera/rota/coleta. Ao sair, trocar style ou ir ao segundo plano, o puck
é desligado. Resultados de uma leitura já iniciada são descartados ao sair.

A posição não é persistida pelo app. Para rota e claim ela segue no corpo do
POST, com políticas próprias de [rotas](rotas.md#cache-e-privacidade) e
[PucStops](pucstops.md#privacidade). Não se deve confundir puck em uso com
rastreamento global da conta.

## Compatibilidade e limites

A versão Geolocator fixada no pacote evita conflitos conhecidos entre
`package_info_plus`, `file_picker` e AGP/Kotlin integrado. Atualizá-la requer
resolver a árvore do app e testar a plataforma, sem dependency overrides cegos.

O snapshot local não modela navegação indoor. Rotas dependem da API.

## Atalhos de categorias

Sob a busca há uma linha horizontal rolável: Prédios acadêmicos,
Laboratórios, Biblioteca e Esportes. Um toque abre a categoria escolhida no
painel existente; seleção mantém foco → card normal → rota. Eventos e Onde
comer ficam em outra linha, com suas listas próprias. O antigo botão de
filtro foi removido porque repetia a mesma função. As linhas somem durante
a digitação/foco na busca para liberar espaço ao teclado e aos resultados.
A busca global e as classificações herdadas permanecem iguais.

## Limites da câmera

`CampusCameraPolicy` une o bbox das footprints ao bbox da origem `pucmaps-12`
(`oeste=-43.9961`, `sul=-19.9265`, `leste=-43.9885`, `norte=-19.9176`),
incluindo portões e grafo além das construções. Acrescenta 120 m para permitir
foco nas bordas e contexto próximo. O centro da câmera permanece nessa área;
a posição bruta do GPS e os destinos enviados à API não são recortados.
Essa restrição visual não comprova presença no campus nem substitui geofence.

O SDK recebe `CameraBoundsOptions`, máximo 22 e mínimo calculado por fit
Mercator do campus em pixels lógicos, conforme viewport e padding disponível,
com redução quando o fit nativo com perspectiva exige mais afastamento.
O bbox nativo inclui overscan de enquadramento: sem ele, o SDK aumenta o zoom
mínimo para fazer a viewport caber no bbox e corta o campus em telas estreitas.
O listener de câmera limita o centro separadamente, inclusive para gestos.

A abertura usa zoom 16,5, pitch 45° com 3D (0° em 2D), bearing 0° e a
mediana dos centros dos prédios do snapshot (`-43.9933884, -19.92298695`).
É independente do mínimo; se este superar 15,75, a abertura mantém ao menos
0,75 de aproximação acima dele, até o máximo 22. Há zoom out para o campus.
O PUCMaps usava fallback 16,5/65°/−20° no centro estático
`-43.9940, -19.9230` ou 18,5 com GPS no campus; aqui se prioriza leitura
central e espaço ocupado pela busca/atalhos/bottom navigation.

Uma abertura é aplicada por instância/configuração de mapa. Perfil → Mapa
cria nova tela e reaplica; background, recarga de style, teclado e rotação
preservam a exploração. O `CameraViewportState` provisório mantém a mesma
identidade durante rebuilds: recriá-lo faz o SDK iniciar outra transição.
Não há botão home/reset. Ao mudar o tamanho da tela,
a view recalcula os limites e reenquadra somente a rota ativa.
Padding proporcional e as alturas medidas dos controles e do card reservam
espaço aos controles; rotas mantêm rumo/inclinação e usam o fit nativo.
Em telas largas (largura mínima 600 pt e proporção mínima 1,5), os cards
ocupam uma coluna de até 360 pt; o fit reserva essa coluna e mantém a rota
ao lado. Nos demais formatos, permanece a reserva inferior medida.

## Verificação

Testes de busca, fallback, permissões e controles ficam em
`code/mobile/packages/campus_map/test/`; o contrato HTTP é testado em
`code/mobile/test/mapa_api_test.dart`. Esses testes não executam o GPS nativo.

Em emulador/aparelho, verificar busca, foco, reentrada, API indisponível,
permissão negada/permanente e serviço desligado.
O emulador aceita ponto público por `adb emu geo fix <longitude> <latitude>`;
não fixar posição simulada no código.
