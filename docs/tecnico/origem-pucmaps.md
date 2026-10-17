# Origem PUCMaps — rastreabilidade da integração

> Estado: ATUAL (este documento reflete decisões já tomadas) + PLANEJADO (a maior parte do conteúdo técnico referenciado ainda não foi implementada)

## 1. Objetivo

Este documento é a referência central de rastreabilidade da integração do projeto PUCMaps ao Ajuda-aí: para cada funcionalidade trazida do PUCMaps, registra de onde ela vem, o que acontece com ela (preservar, adaptar, reescrever ou descartar), para onde ela vai no Ajuda-aí, e qual é o estado atual.

## 2. Relação entre PUCMaps e Ajuda-aí

PUCMaps é um projeto de mapeamento de campus desenvolvido anteriormente, com funcionalidades próprias de mapa 3D, navegação, eventos, cantinas e gamificação, mas com identidade de usuário, autenticação, backend e infraestrutura completamente separados do Ajuda-aí.

A decisão de integração (registrada nos ADRs em [decisoes/](decisoes/)) é trazer as funcionalidades de mapa para dentro do Ajuda-aí como um domínio integrado — não manter o PUCMaps como um segundo produto, nem hospedar um segundo backend, nem manter uma segunda identidade de usuário.

## 3. Componentes reaproveitados

Funcionalidade e conhecimento técnico com alto grau de aproveitamento direto, sujeitos a adaptação de linguagem/framework quando necessário:

- Renderização Mapbox do campus (estilo, camadas 2D, modelos 3D).
- Estratégia de LOD (níveis de detalhe) para os modelos 3D.
- Modelo conceitual de dados geoespaciais (versão do mapa, prédios, áreas, salas, grafo de navegação).
- Algoritmos de cálculo de rota (Dijkstra/A*) e lógica de snapping.
- Construção do grafo de navegação a partir de dados OpenStreetMap.
- Conceito de eventos, cantinas, cardápios e ofertas.
- Painel de diagnóstico de performance 3D.

## 4. Componentes adaptados

Funcionalidade preservada em conceito, mas com mudança de tecnologia, arquitetura ou implementação:

- Backend do domínio de mapa: portado para o NestJS do Ajuda-aí (framework e versão diferentes do backend de origem), não hospedado separadamente.
- Rotas: de pré-calculadas (armazenadas em banco) para calculadas sob demanda (ver [ADR-0003](decisoes/ADR-0003-rotas-sob-demanda.md)).
- Estrutura do app Flutter: de um app completo e independente para um pacote interno (`campus_map`) consumido pelo app do Ajuda-aí (ver [ADR-0004](decisoes/ADR-0004-campus-map-package.md)).
- Dados geoespaciais: migrados para um schema (`mapa`) dentro do mesmo banco do Ajuda-aí, não um banco separado (ver [ADR-0005](decisoes/ADR-0005-schema-mapa-postgis.md)).
- Assets 3D: de hospedagem própria para embutidos no pacote, com evolução futura para o Azure Blob Storage já existente no Ajuda-aí (ver [ADR-0006](decisoes/ADR-0006-assets-3d.md)).

## 5. Componentes reescritos

Funcionalidade cujo conceito é preservado, mas cuja implementação é refeita do zero por incompatibilidade de arquitetura ou por corrigir falhas de design identificadas:

- **Identidade e autenticação**: o PUCMaps não terá autenticação própria; usa a identidade e o JWT do Ajuda-aí (ver [ADR-0001](decisoes/ADR-0001-identidade-central.md)).
- **XP/gamificação**: reescrito como domínio central do Ajuda-aí, não restrito ao mapa (ver [ADR-0002](decisoes/ADR-0002-xp-central.md) e [gamificacao/xp.md](gamificacao/xp.md)).
- **Totens → PucStops**: reescrito com validação de proximidade no servidor, claim idempotente e transação única com o crédito de XP, corrigindo falhas de design identificadas na auditoria do projeto de origem (ver [mapa/pucstops.md](mapa/pucstops.md)).
- **Administração**: a aplicação Angular não é migrada como aplicação; funcionalidades úteis são reimplementadas na coordenação em React do Ajuda-aí quando fizer sentido (ver [ADR-0007](decisoes/ADR-0007-admin-pucmaps.md) e [mapa/administracao.md](mapa/administracao.md)).

## 6. Componentes descartados

Não são trazidos para o Ajuda-aí, sem nova justificativa documentada:

- Autenticação própria do PUCMaps (senha com argon2, split token, refresh token em Redis).
- Tabela de usuários paralela (`users` do PUCMaps).
- Redis, fila de cálculo de rota (SQS/equivalente local), gRPC, serviço de streaming de progresso.
- OpenTelemetry/Zipkin específicos da infraestrutura antiga.
- Uso de AWS SDK e infraestrutura (Lambdas, Terraform) específicos do pipeline de tiles e da infraestrutura de produção antiga, hoje desligada.
- Tabela de rotas pré-calculadas (`precalculated_routes`) — ver [ADR-0003](decisoes/ADR-0003-rotas-sob-demanda.md).
- Sistema antigo de XP (`user_stats`, `xp_log`) e o módulo de gamificação antigo.
- Mocks registrados em service locator e totens de teste hardcoded no código do cliente.
- A aplicação Angular como produto (não as funcionalidades que ela implementa — ver seção 5).

## 7. Rastreabilidade de funcionalidades

| Funcionalidade | Origem no PUCMaps | Documentação de origem | Estratégia | Destino no Ajuda-aí | Status |
|---|---|---|---|---|---|
| Mapbox (renderização base) | Configuração de estilo e camadas do app Flutter de origem | Documentação de configuração e execução local do projeto de origem | Adaptar (token/estilo configuráveis, sem conta pessoal fixa) | Pacote `campus_map` | IMPLEMENTADO E VALIDADO NO ANDROID |
| Renderer 2D | `map_renderer.dart` + `building_label.dart` | [dados-geo.md](mapa/dados-geo.md) | Extrair somente sources, fill/line, labels e recorte localizado | Pacote `campus_map` | IMPLEMENTADO E VALIDADO NO ANDROID |
| Snapshot de footprints | `campus_footprints.geojson` + metadados de `campus_chunks.json` | [dados-geo.md](mapa/dados-geo.md) | Preservar 82 geometrias e identidade; complementar por ID | `campus_map/assets/data/campus_footprints.geojson` | IMPLEMENTADO; SEM ÁREAS/SALAS CONFIRMADAS |
| Renderer 3D | Controlador de campus 3D (LOD0/1/2) | `renderizacao-3d.md` (origem) | Reaproveitar, revalidando resolução de assets | Pacote `campus_map` | PLANEJADO |
| GLBs | Modelos 3D embutidos no app de origem | — | Adaptar (selecionar, excluir debug, embutir no pacote) | Pacote `campus_map` | PLANEJADO |
| Vegetação | Controlador próprio no app de origem | — | Reaproveitar | Pacote `campus_map` | PLANEJADO |
| Props | Controlador próprio no app de origem | — | Reaproveitar | Pacote `campus_map` | PLANEJADO |
| Busca | Serviço de busca sobre dados geoespaciais do app de origem | — | Adaptar (snapshot local → API) | Pacote `campus_map` + backend | PLANEJADO |
| Dados geo (modelo conceitual) | Entidades de mapa do backend de origem | — | Reaproveitar o conceito | Schema `mapa` | PLANEJADO |
| map_versions | Entidade do backend de origem | — | Reaproveitar o conceito | Schema `mapa` | PLANEJADO |
| buildings | Entidade do backend de origem | — | Reaproveitar o conceito | Schema `mapa` | PLANEJADO |
| rooms | Entidade do backend de origem | — | Reaproveitar o conceito | Schema `mapa` | PLANEJADO |
| areas | Entidade do backend de origem | — | Reaproveitar o conceito | Schema `mapa` | PLANEJADO |
| Grafo (nós/arestas) | Construção a partir de OpenStreetMap no backend de origem | — | Reaproveitar o conceito e o processo de construção | Schema `mapa` + script de importação | PLANEJADO |
| Rotas | Estratégias Dijkstra/A* do backend de origem | — | Adaptar (sob demanda, sem pré-cálculo) | Backend NestJS do Ajuda-aí | PLANEJADO |
| Snapping | Lógica de ajuste ao grafo do backend e do cliente de origem | — | Reaproveitar | Backend + pacote `campus_map` | PLANEJADO |
| Eventos | Entidade/módulo do backend de origem | — | Reaproveitar o conceito, leitura inicial | Backend NestJS do Ajuda-aí | PLANEJADO |
| Cantinas | Entidade/módulo do backend de origem | — | Reaproveitar o conceito, leitura inicial | Backend NestJS do Ajuda-aí | PLANEJADO |
| Menus/ofertas | Entidade/módulo do backend de origem | — | Reaproveitar o conceito, leitura inicial | Backend NestJS do Ajuda-aí | PLANEJADO |
| Totens → PucStops | Módulo de totens do backend/cliente de origem | Auditoria de totens do projeto de origem | Reescrever (geofence no servidor, claim idempotente) | Backend + schema `mapa` | PLANEJADO |
| XP | `user_stats`/`xp_log` do backend de origem | — | Reescrever como domínio central | Backend NestJS do Ajuda-aí | PLANEJADO |
| Admin (geral) | Aplicação Angular de origem | — | Reescrever caso a caso | Coordenação React do Ajuda-aí / scripts | PLANEJADO (ver `mapa/administracao.md`) |
| Diagnóstico 3D | Painel de diagnóstico do app de origem | `docs/campus-3d-validacao.md` do projeto de origem | Reaproveitar como ferramenta de debug | Pacote `campus_map` | PLANEJADO |
| Visualizador de grafo | Ferramenta do admin Angular de origem | — | Adaptar/recriar como debug ou figura de documentação | A decidir (ver `mapa/administracao.md`) | AINDA AVALIAR |

### Arquivos utilizados na migração 2D (Tarefa 3)

Origem: checkout PUCMaps no commit `776e11391439b6c7ee6b85438613d0d74d652362`.
Os caminhos de origem abaixo são relativos ao PUCMaps; destinos relativos ao Ajuda-aí.

| Origem | Destino | Motivo | Transformação |
|---|---|---|---|
| `code/mobile/assets/campus/campus_footprints.geojson` | `code/mobile/packages/campus_map/assets/data/campus_footprints.geojson` | Footprints reais em WGS84 | Coordenadas/IDs/nomes/códigos/alturas preservados; `chunk`, `group`, `color` removidos |
| `code/mobile/assets/campus/campus_chunks.json` (`buildings[]` e `source`) | Mesmo asset GeoJSON, sem duplicar geometria | Identidade estável e âncoras de labels | Junção exata por ID para `osmId`, `apiId`, `center`; preservar licença/atribuição/timestamp; sem copiar manifesto, caminhos GLB, chunks ou materiais |
| `code/mobile/lib/features/map/presentation/components/organisms/map_renderer.dart` | `code/mobile/packages/campus_map/lib/src/campus_map_renderer.dart` + `campus_map_layer_ids.dart` | Sources, fill, contornos, labels e ciclo de style | Extração 2D; cores constantes; IDs próprios; clip só de símbolos do basemap nas pegadas; sem controllers, rotas, volumes ou serviços antigos |
| `code/mobile/lib/features/map/presentation/utils/building_label.dart` (`mapText`) | `CampusMapRenderer.mapLabel` | Números de prédio/nomes curtos legíveis | Abreviação adaptada; excluídas funções de ficha; nomes completos preservados no snapshot |

`GeoJsonService`, `PucMapsService`, `GeoJsonPresenter` e `ExtractCampusViewUseCase`
foram lidos para entender o contrato e a origem, mas não copiados.
`campus_3d_controller.dart` foi lido só para confirmar fronteiras e a relação do
manifesto com footprints. Não foi portado.

O stub `assets/local/campus-view.json` não foi migrado. Nenhum dado do bucket ou
endpoint antigo é necessário em runtime. Áreas abertas, salas e limite
administrativo não estão disponíveis como geometria estática confiável nos arquivos
auditados; a lacuna permanece explícita, sem fabricar features.

## 8. Licença/atribuição

A auditoria da documentação do projeto PUCMaps identificou que o projeto declara a licença **CC-BY-4.0** (metadados de citação do repositório de origem).

Esta integração:

- Não remove nem reinterpreta os termos dessa licença.
- Concentra a atribuição de origem **neste único documento**, em vez de repetir nomes de pessoas ou dados de autoria em cada página técnica — o que evita tanto a perda da atribuição quanto a disseminação desnecessária de dados pessoais pela documentação técnica.
- Registra como **pendência explícita para validação humana/orientador**: confirmar se a forma de atribuição aqui adotada (um único documento central, sem nomes pessoais nos demais documentos técnicos) satisfaz os termos da licença CC-BY-4.0 tal como aplicada pelo projeto de origem, ou se é necessária uma forma de crédito diferente (por exemplo, citar o nome do repositório/projeto de origem e a licença em um aviso mais visível).

**Atribuição registrada:** parte da funcionalidade de mapa do campus integrada ao Ajuda-aí tem origem no projeto acadêmico **PUCMaps**, desenvolvido por uma equipe anterior na mesma disciplina, distribuído sob licença CC-BY-4.0. Esta integração não copia a autoria do projeto de origem como autoria do Ajuda-aí; o código e os dados portados continuam sendo reconhecidos como derivados do PUCMaps.

O manifesto dos footprints migrados declara dados de **OpenStreetMap**, licença
**ODbL 1.0** e crédito **© OpenStreetMap contributors**. Esses metadados foram
preservados no snapshot; o crédito não foi substituído pela licença geral do
projeto. Logo e attribution oficiais do Mapbox/OpenStreetMap continuam habilitados.

> Esta seção não constitui parecer jurídico. A forma final de atribuição deve ser confirmada com o orientador da disciplina antes da entrega final do projeto.

## 9. Limitações herdadas

Registradas aqui para não se perderem, sem repetir dados sensíveis:

- O estilo Mapbox do projeto de origem está associado a uma conta pessoal, que não deve ser tratada como definitiva para o Ajuda-aí — uma conta/organização própria do projeto precisa ser decidida.
- A validação de proximidade de totens do projeto de origem era insuficiente (só no cliente) — corrigida na arquitetura-alvo de PucStops (ver seção 5 e [mapa/pucstops.md](mapa/pucstops.md)).
- O volume de rotas pré-calculadas do projeto de origem (ordem de 770 mil rotas / 7,5 GB por versão) não é compatível com o ambiente de banco deste projeto — por isso a mudança para cálculo sob demanda.
- O projeto de origem tem, em seu histórico de controle de versão, uma credencial que parece ter sido de fato uma senha de produção, já removida do código mas ainda presente no histórico do git daquele repositório. Isso não afeta o Ajuda-aí diretamente (nenhuma credencial do projeto de origem é copiada para cá), mas fica registrado como alerta de segurança referente ao repositório de origem.
- Parte da documentação técnica do projeto de origem descreve uma arquitetura de produção (nuvem) que já foi desligada; essa documentação não deve ser tratada como representando a arquitetura atual do PUCMaps, nem a do Ajuda-aí.
- O pipeline de geração dos modelos 3D (GLB) do projeto de origem não está no controle de versão do projeto de origem — é um processo externo, não reproduzível a partir do repositório (ver [mapa/assets-pipeline.md](mapa/assets-pipeline.md)).

## 10. Histórico de decisões

| Data | Decisão | Registro |
|---|---|---|
| 2026-10-17 | Avaliação arquitetural inicial: adiar integração completa até o fechamento de F02/F07 | Histórico de conversa/arquitetura (não versionado como arquivo separado) |
| 2026-10-17 (reavaliação) | F02/F07 concluído; integração autorizada a começar em branch própria | Histórico de conversa/arquitetura |
| 2026-10-17 (esta etapa) | Criação da estrutura de documentação técnica e dos ADRs 0001–0007, antes de qualquer código do mapa | Este documento e os arquivos em `decisoes/` |
| 2026-10-17 (Tarefa 3) | Snapshot local de 82 footprints e renderer 2D migrados, testados, compilados e validados no Android; 3D permanece pendente | [dados-geo.md](mapa/dados-geo.md), [setup-mobile.md](mapa/setup-mobile.md) |

Decisões futuras devem ser adicionadas a esta tabela à medida que forem tomadas, com uma referência ao commit, PR ou documento que as registra.

## Informações sensíveis identificadas durante a auditoria (sem reproduzir valores)

Durante a análise da documentação do projeto de origem, foram identificados os seguintes tipos de conteúdo sensível, que **não são reproduzidos nesta documentação**:

- Nomes de alunos e professores em documentos de gestão de projeto e atas de reunião.
- E-mails pessoais associados a integrantes do projeto de origem.
- Caminhos de sistema de arquivos locais de uma máquina de desenvolvimento específica.
- Nome de uma conta pessoal de um serviço de mapas (Mapbox) usada para hospedar o estilo do projeto de origem.
- Nome de usuário e identificadores de infraestrutura pessoal (host, IP local) de um ambiente de desenvolvimento.
- Credenciais padrão/placeholder de ambiente de desenvolvimento (não são segredos de produção, mas não devem ser reproduzidas sem necessidade).
- Uma credencial que aparenta ter sido uma senha de produção real, presente apenas no histórico de commits do projeto de origem (já removida do código atual daquele projeto) — recomenda-se que a equipe responsável por aquele repositório rotacione a credencial e avalie reescrever o histórico, se ainda não o fez.

Nenhum desses valores foi copiado para qualquer arquivo desta árvore de documentação.
