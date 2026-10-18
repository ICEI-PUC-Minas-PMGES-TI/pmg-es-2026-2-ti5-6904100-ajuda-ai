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
Não infere aliases, salas ou categorias: código `26` não é alias `P26`.
Polígonos com código compartilhado continuam separados por ID.
O ID da API de origem (`apiId`) não substitui o ID estável do footprint.

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
A implementação usa leitura pontual com timeout; não cria stream Geolocator.

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

O bbox das construções orienta a câmera; não restringe a posição do GPS nem
comprova que o usuário está dentro do campus.
O snapshot local não modela navegação indoor. Rotas dependem da API.

## Verificação

Testes de busca, fallback, permissões e controles ficam em
`code/mobile/packages/campus_map/test/`; o contrato HTTP é testado em
`code/mobile/test/mapa_api_test.dart`. Esses testes não executam o GPS nativo.

Em emulador/aparelho, verificar busca, foco, reentrada, API indisponível,
permissão negada/permanente e serviço desligado.
O emulador aceita ponto público por `adb emu geo fix <longitude> <latitude>`;
não fixar posição simulada no código.
