# Pipeline de assets 3D

> Estado: LEGADO (geração dos GLBs no projeto de origem) + ATUAL (inventário, versões, manifesto e publicação no Azure — Tarefas 4 e 5)

## Origem dos GLBs

Os modelos 3D (GLB) do campus usados no projeto PUCMaps são gerados por um processo de modelagem e exportação executado **fora do repositório do projeto de origem** — ou seja, o código-fonte dos modelos (projeto de modelagem 3D, cenas, texturas de origem) não está versionado junto com o código do aplicativo, apenas os arquivos `.glb` finais.

> **ARTEFATO EXTERNO / PROCESSO NÃO REPRODUZÍVEL A PARTIR DO REPOSITÓRIO ATUAL.** O repositório do PUCMaps contém apenas referências de configuração (nomes de flags de build, convenções de nomes de nós dentro dos GLBs) ao processo de geração, não o processo em si nem os arquivos-fonte de modelagem.

## O que é confirmado em código/documentação do projeto de origem

- Os GLBs finais ficam embutidos no app (bundled), organizados em pastas por categoria (campus LOD0, campus LOD1, vegetação, props/veículos, totem).
- Existe uma pasta de debug com GLBs de teste, que não compõe o produto final.
- Existem convenções de nomenclatura de nós dentro dos modelos GLB (relevantes para animação/identificação do totem), definidas no projeto de origem.
- Existem flags de build que ligam/desligam partes do pipeline de renderização 3D (modo debug, picking de prédios, cores de depuração).

## LOD (níveis de detalhe)

Ver [renderizacao-3d.md](renderizacao-3d.md#lod-níveis-de-detalhe).

## Modelo do totem/PucStop — convenções estruturais do GLB

> CONFIRMADO NO ARTEFATO (documentação operacional do projeto de origem). Estas convenções dizem respeito especificamente ao modelo GLB do totem usado no PUCMaps. Preservadas aqui porque são necessárias para reexportar ou dar manutenção a esse modelo sem quebrar a renderização.

- O modelo do totem é um arquivo GLB separado dos chunks de campus (LOD0/LOD1), carregado individualmente pelo renderer via Mapbox (`ModelSource`/`ModelLayer`).
- **Nomes de nó exigidos para a animação do topo do totem:** os nós precisam se chamar exatamente `Aneis_Bronze` e `Joia_Azul`. A rotação do topo do totem depende desses nomes — se o modelo for reexportado com nós renomeados, a animação de giro deixa de funcionar.
- **Canal de UV do vitral:** o material do vitral do totem deve usar **apenas o primeiro canal de UV (`TEXCOORD_0`)**. O motivo confirmado é que o Mapbox ignora um segundo canal de UV (`TEXCOORD_1`) se o modelo o tiver — então qualquer textura do vitral mapeada num segundo canal simplesmente não aparece.
- Essas duas convenções (nomes de nó e uso de `TEXCOORD_0`) são regras de **exportação** do modelo, não de código do app: elas precisam ser respeitadas em qualquer novo `.glb` do totem gerado pela ferramenta de modelagem 3D, antes de o arquivo ser embutido no app/pacote.

> **LEGADO, sujeito a mudança no PucStop:** essas convenções (nomes de nó específicos, dependência de canal único de UV) são amarradas ao **modelo GLB específico do totem do PUCMaps** e ao modo como o renderer de origem lê esse modelo. Se o PucStop do Ajuda-aí vier a usar um modelo 3D novo ou diferente (nova modelagem, nova geometria, outro esquema de materiais), essas convenções **não se aplicam automaticamente** ao novo modelo — elas precisam ser redefinidas (ou confirmadas como as mesmas) junto de quem fizer a nova modelagem, e esta seção deve ser atualizada para refletir o modelo realmente usado pelo PucStop.

## Dependência do pipeline Blender/Python

> CONFIRMADO NO ARTEFATO, mas **fora do repositório** — ver também o aviso em "Origem dos GLBs" acima.

O pipeline de geração dos modelos do campus (prédios, vegetação) depende de um conjunto de scripts Python executados a partir de um projeto Blender, mantido **fora do repositório do PUCMaps**. A documentação de origem descreve, em alto nível, que esse pipeline inclui pelo menos:

- uma etapa que processa os prédios, valida a geometria (incluindo checagem de geometria abaixo do nível do solo) e gera os chunks de LOD0/LOD1;
- uma etapa separada para posicionamento de vegetação (árvores), que também gera saída para os assets do app.

O modelo do totem, especificamente, é descrito como exportado a partir de um arquivo-fonte de modelagem (formato nativo da ferramenta 3D), mantido junto do mesmo pipeline externo.

> **ARTEFATO EXTERNO / PROCESSO NÃO REPRODUZÍVEL A PARTIR DO REPOSITÓRIO ATUAL.** Nem os scripts do pipeline, nem o arquivo-fonte de modelagem do totem, estão versionados no repositório do PUCMaps nem neste repositório. Esta seção não descreve comandos, nomes de pasta ou caminhos de máquina específicos — apenas o que a documentação de origem confirma sobre a existência e o propósito do pipeline. Qualquer comando exato do pipeline não é reproduzido aqui por depender de uma instalação/máquina específica, fora do controle de versão de ambos os projetos.

## Limitações conhecidas

> CONFIRMADO NO ARTEFATO:

- O pipeline de modelagem 3D roda fora do controle de versão de qualquer um dos dois repositórios, o que significa que **novos** modelos (um novo prédio, uma nova versão do totem) não podem ser gerados só a partir do que está neste repositório — depende de acesso a esse processo externo.
- As convenções de nome de nó e de canal de UV do totem são amarradas ao comportamento de leitura de GLB do Mapbox usado no projeto de origem; não há garantia de que outra versão do SDK do Mapbox, ou outro motor de renderização, tenha a mesma limitação (ex.: ignorar um segundo canal de UV) — isso não foi testado neste projeto e não deve ser presumido.

## Ferramentas e dependências do pipeline externo

Não documentadas de forma reproduzível neste repositório — o processo depende de ferramentas de modelagem 3D fora do controle de versão do projeto. Qualquer tentativa de descrever passos exatos aqui seria inventada e não deve ser feita.

## Scripts existentes (confirmados no projeto de origem)

O projeto de origem possui scripts auxiliares para popular/promover versões do mapa e atualizar o arquivo de dados geoespaciais consumido pelo app (`campus-view.json`), mas esses scripts operam sobre a infraestrutura antiga (banco próprio, armazenamento temporário) e não são portados como estão — ver [ADR-0007](../decisoes/ADR-0007-admin-pucmaps.md) e [dados-geo.md](dados-geo.md#importação-futura) para o que é planejado no lugar deles.

## Decisão atual de hospedagem

> ATUAL (Tarefa 4). Registrada na [ADR-0006](../decisoes/ADR-0006-assets-3d.md),
> que substituiu a decisão inicial de embutir os GLBs no pacote.

```
campus_map ─ manifesto (Git, no package) ─ resolver ─ URL HTTPS pública
                                                         │
                         Azure Blob Storage, container público map-assets
```

- Código e manifesto: Git. GeoJSON das footprints (46 KiB): continua no package.
- GLBs: só no container `map-assets` da conta já existente do Ajuda-aí. Nenhum
  `.glb` é versionado no Git do Ajuda-aí nem empacotado no APK.
- O app conhece apenas a URL pública (`MAP_ASSETS_BASE_URL`); não usa SDK do Azure.
- Metadados formais de versão (`map_versions`) ficam para o banco, em fase futura.

## Inventário dos GLBs do PUCMaps

Auditado no repositório de origem (commit `776e113`): **41 GLBs, 13.593.320 B**.

| Classe | Qtde | Bytes | Uso no código de origem | Decisão |
|---|---|---|---|---|
| LOD0 (`campus/lod0/c00..c11`) | 12 | 3.970.300 | `campus_3d_controller.dart` | **MIGRAR AGORA** |
| LOD1 (`campus/lod1/g0..g3`) | 4 | 1.134.592 | `campus_3d_controller.dart` | **MIGRAR AGORA** |
| LOD2 | 0 | — | `fill-extrusion` das footprints | Sem GLB (manifesto cita `models/lod2/*.glb` por prédio, que não existem no repositório) |
| Vegetação (`tree_*`) | 4 | 58.688 | `campus_vegetation_controller.dart` | **MIGRADO** (Tarefa 5, `2026-09-30-r2`) |
| Props (7 carros + área esportiva) | 8 | 93.036 | `campus_props_controller.dart` | **MIGRADO** (Tarefa 5, `2026-09-30-r2`) |
| Totem/PucStop (`totens/torre_pucstop.glb`) | 1 | 3.096.036 | `map_renderer.dart` | MIGRAR DEPOIS (fase PucStops) |
| Debug (`ss_g*`, `nowin_g*`, `ind_p*`) | 11 | 2.393.152 | variantes A/B do painel de diagnóstico | DESCARTAR |
| Órfão (`torre_Pucstop.glb` na raiz) | 1 | 2.847.516 | nenhum | DESCARTAR |

Áudios do totem continuam fora (fase PucStops). Os GeoJSONs de vegetação e
carros e o `campus_sports.json` não são publicados como arquivos: seus pontos
entram no manifesto (ver "Vegetação e props" abaixo).
Os GLBs individuais por prédio citados no manifesto de origem (`models/*.glb`)
existem só no pipeline externo.

## Versão técnica

Versão atual: **`2026-09-30-r2`** (Tarefa 5). Mesma data do snapshot OSM dos
prédios (`osmTimestamp 2026-09-30T17:10:14Z`) + revisão de publicação.

| Versão | Conteúdo | Estado |
|---|---|---|
| `2026-09-30-r1` | 16 GLBs de prédios + manifesto (17 objetos, Tarefa 4) | Publicada, **preservada intacta** (17/17 conferidos por `--verificar` depois da r2) |
| `2026-09-30-r2` | os mesmos 16 GLBs de prédios (bytes idênticos) + 4 de vegetação + 8 de props + manifesto (29 objetos) | Publicada (Tarefa 5); referenciada pelo package |

Por que nova versão: adicionar vegetação/props muda o manifesto publicado
(`manifests/campus-models.json`) e o conteúdo da versão. A r1 é imutável, então
nada foi adicionado nela. A r2 é autocontida (repete os GLBs de prédios, 5,1 MB)
para que cada versão continue resolvível só pelo seu manifesto e pela sua pasta,
sem referência cruzada entre versões. Os UUIDs de
`map_versions` do PUCMaps são do banco local antigo e não são reaproveitáveis.
Não existe alias `current`: cada build do app aponta para a versão do manifesto
empacotado. Uma versão publicada é **imutável**.

## Estrutura em `map-assets`

```
campus/versions/2026-09-30-r1/          (Tarefa 4, intacta)
  manifests/campus-models.json
  models/lod0/c00.glb … c11.glb
  models/lod1/g0.glb … g3.glb
campus/versions/2026-09-30-r2/          (Tarefa 5, atual)
  manifests/campus-models.json
  models/lod0/c00.glb … c11.glb
  models/lod1/g0.glb … g3.glb
  models/vegetation/tree_round.glb, tree_round_b.glb, tree_cone.glb, tree_cone_b.glb
  models/props/campus_sports.glb, car_{sedan_white,sedan_silver,sedan_graphite,hatch_white,hatch_grey,hatch_blue,hatch_red}.glb
```

Sem `lod2/` (não há GLB) e sem `data/` (footprints continuam no package).
r2: 29 objetos, 5.289.081 B (28 GLBs = 5.256.616 B + manifesto 32.465 B).

## Manifesto

Um único manifesto por versão. Prédios gerados a partir de `campus_chunks.json`
(sha256 `3a1d0bf0…cffd77`) e da cor de parede das footprints de origem; seções
ambientais a partir dos arquivos do PUCMaps listados abaixo. Cópia idêntica em
`code/mobile/packages/campus_map/assets/data/campus_models.json` e em
`manifests/campus-models.json` no Azure:

| Versão | Bytes | sha256 |
|---|---|---|
| r1 | 16.039 | `ea549f40fb1f6702259dc0875bbb1419b5d542c150c3c335893ddf607e75d6d8` |
| r2 | 32.465 | `d0febcce36400189d7ebf06d1778eb59cb173ae45b1727ec0c7013a5075111d8` |

Na r2 as seções `source`, `placement`, `lod1`, `lod0` e `buildings` são
idênticas às da r1 (conferido campo a campo).

| Campo | Conteúdo |
|---|---|
| `schemaVersion`, `version` | `1`, `2026-09-30-r1` |
| `source` | origem PUCMaps, sha256 do manifesto de origem, gerador, OSM/ODbL, timestamp |
| `placement` | metros, orientação `[0,0,0]`, escala `[1,1,1]` |
| `lod1[]`, `lod0[]` | `id`, `path` relativo, `anchor [lon,lat]`, `bbox`, `buildings`, `bytes`, `sha256` (+ `lod1` no LOD0) |
| `buildings[]` | `id` do footprint, `lod0`, `lod1`, `wallColor` (extrusão) |
| `vegetation`, `props` (r2, opcionais) | `source` (origem/sha256), `models[]` (`id`, `kind`, `path`, `bytes`, `sha256`), `instances[]` (`id`, `model`, `position [lon,lat]`, `scale`, `rotation`) |

### Vegetação e props

Seções próprias no mesmo manifesto, em vez de JSONs separados: são pequenas
(101 pontos), têm a mesma versão e as mesmas regras de caminho/hash dos prédios,
e um arquivo só evita uma segunda requisição e versões desencontradas.

| Seção | Tipos aceitos | Fonte no PUCMaps (sha256 registrado em `source`) |
|---|---|---|
| `vegetation` | `tree` | `assets/campus/vegetation/trees_pilot.geojson` (`place_trees.py`) |
| `props` | `sports`, `vehicle` | `assets/campus/sports/campus_sports.json` (âncora), `assets/campus/cars/cars.geojson` (`place_cars.py`) |

Conversão: `scale3` uniforme → `scale`; `rot3 [0,0,r]` → `rotation`; posição em
graus com 8 casas. Validação no app (`CampusEnvironmentSet`) e no script:

- caminho só `models/<seção>/<nome>.glb`; tipo da lista acima;
- recusa nomes de debug, totem/PucStop e variantes A/B (`debug`, `totem`,
  `pucstop`, `torre`, `ss_`, `nowin_`, `ind_`);
- ids únicos (modelos e instâncias), modelo declarado, escala entre 0 e 10;
- nenhum modelo sem instância (variante sem uso não é baixada);
- instância a no máximo ~200 m da área dos prédios (bbox dos grupos LOD1).

Seção inválida é desligada sozinha; os prédios do mesmo manifesto continuam.
Removidos da origem: materiais, triângulos, draw calls, gerador de picking,
Overpass URL, vínculo por `apiId`/distância e caminhos por prédio. Nenhuma
geometria é duplicada.

## Content-Type e cache

- `.glb`: `model/gltf-binary` (tipo registrado na IANA para glTF binário).
- `.json`: `application/json; charset=utf-8`.
- Todos: `Cache-Control: public, max-age=31536000, immutable` (versão imutável).
- Upload com `Content-MD5` (validado pelo Azure) e `If-None-Match: *`
  (não sobrescreve blob existente).

## Publicação realizada (Tarefa 4)

17 objetos em `campus/versions/2026-09-30-r1/`, todos verificados pela URL pública
sem credencial: HTTP 200, Content-Type acima, tamanho e sha256 iguais aos locais.
Primeiro foi publicado e renderizado só `models/lod0/c09.glb`; os demais vieram
depois da validação visual. O upload original usou uma ferramenta temporária com
as mesmas regras; ela foi substituída pelo script versionado abaixo, que foi
conferido contra essa versão só com `--dry-run` e `--verificar` (nenhum reenvio).

## Script de publicação

`code/back/api/scripts/publicar-assets-mapa.mjs` — Node (ESM), mesmo padrão de
`scripts/verificar-banco.mjs`. Reaproveita `@azure/storage-blob`, que já é
dependência do backend; nenhuma dependência nova. Testes em
`scripts/publicar-assets-mapa.spec.ts` (rodam no `npm test` do backend).

### Pré-requisitos

- Node 20+ e `npm install` feito em `code/back/api`.
- GLBs locais em `<pasta>/models/<tipo>/` (layout publicado) ou no layout do
  pipeline, igual a `assets/campus` do PUCMaps: `lod0|lod1|vegetation/`, e props
  em `sports/` e `cars/`.
- Manifesto com `bytes`/`sha256` de cada GLB. Padrão:
  `code/mobile/packages/campus_map/assets/data/campus_models.json`.
- Para enviar: `AZURE_STORAGE_CONNECTION_STRING` no ambiente (mesma variável do
  backend). O script não lê arquivos de segredo por conta própria; use
  `node --env-file=.env` ou exporte a variável na sessão. O valor nunca é impresso.

### Comandos (em `code/back/api`)

```powershell
# validar e listar destinos; com credencial, mostra o que já existe (somente leitura)
node --env-file=.env scripts/publicar-assets-mapa.mjs --source <pasta-dos-glbs> --dry-run

# publicar a versão declarada no manifesto
node --env-file=.env scripts/publicar-assets-mapa.mjs --source <pasta-dos-glbs>

# conferir as URLs públicas depois (sem credencial)
node scripts/publicar-assets-mapa.mjs --source <pasta-dos-glbs> --verificar --base-url https://<conta>.blob.core.windows.net/map-assets
```

Opções: `--manifest <arquivo>`, `--version <v>` (precisa ser igual à do
manifesto), `--dry-run`, `--retomar`, `--verificar`, `--base-url <url>`.
Não existe `--force`.

### O que o script valida antes de qualquer envio

- pasta de origem e manifesto existem; `schemaVersion` 1; versão não vazia e
  sem `/`; `--version` igual ao manifesto;
- todo caminho é relativo, sem `..`, `\`, esquema ou `/` inicial, e só
  `models/lod0|lod1|vegetation|props/*.glb` ou o manifesto; nomes de debug,
  totem/PucStop e variantes A/B são recusados;
- cada modelo está na pasta da sua lista (`lod1`, `lod0`, `vegetation.models`,
  `props.models`); seções ambientais são opcionais, mas se existirem não podem
  estar vazias;
- cada arquivo referenciado existe e tem `bytes` e SHA-256 iguais ao manifesto.

Só os arquivos listados no manifesto são publicados; o resto da pasta é ignorado.
Os erros são acumulados e nada é enviado se houver qualquer um.

### Imutabilidade e integridade

- Antes de enviar, consulta todos os blobs da versão. Se algum existir, **para
  sem enviar nada**: versões não são sobrescritas.
- `--retomar` serve só para completar uma publicação interrompida: baixa os blobs
  existentes, exige SHA-256 igual ao local, pula esses e envia os que faltam.
- Cada upload usa `If-None-Match: *` (não sobrescreve nem em corrida) e
  `Content-MD5` (o Azure rejeita bytes corrompidos no caminho).
- Ao final, baixa cada arquivo pela URL pública e confere status 200, tamanho,
  SHA-256, Content-Type e Cache-Control. Qualquer divergência sai com código 1.

### Estrutura gerada

`map-assets/campus/versions/<versão>/models/lod0|lod1|vegetation|props/` e
`manifests/campus-models.json`. Nada é publicado na raiz do container.

## Publicação realizada (Tarefa 5)

Versão `2026-09-30-r2`, com o script versionado (alterado só para aceitar
vegetação/props; testes em `publicar-assets-mapa.spec.ts`):

1. `--dry-run` com credencial: 29 destinos `novo` na r2; a r1 consultada com o
   manifesto antigo mostrou 17 `EXISTE`.
2. Publicação: 29 envios com `If-None-Match: *` e `Content-MD5`; verificação
   pública ao final: 29 × HTTP 200, Content-Type `model/gltf-binary` /
   `application/json; charset=utf-8`, tamanho e SHA-256 iguais,
   `Cache-Control` imutável.
3. Reexecução da publicação: recusada (“29 blob(s) da versão … já existem”).
4. `--verificar` da r1 com o manifesto r1: 17/17 OK (intacta).

Origem dos arquivos enviados: cópias dos GLBs do PUCMaps
(`code/mobile/assets/campus/`, commit `776e113`) organizadas no layout publicado;
o manifesto r2 foi gerado a partir do r1 e dos arquivos de origem acima. A
ferramenta de conversão foi temporária e não é versionada; o resultado é
verificável pelos sha256 registrados em `source`.

## Como publicar uma nova versão

1. **Obter os GLBs** do pipeline externo (ver "Dependência do pipeline
   Blender/Python"). Sem acesso a ele não há como gerar novos modelos.
2. **Validar**: só LOD0/LOD1 de prédios e vegetação/props aprovados; nenhum
   asset de debug ou totem; conferir
   convenção `placement` (metros, sem rotação/escala) e que todo prédio do
   manifesto existe em `campus_footprints.geojson` com o mesmo `id`.
3. **Criar a versão**: nova pasta `campus/versions/<data-osm>-r<n>`; nunca
   reutilizar uma versão publicada.
4. **Preparar o manifesto** no formato acima, com `bytes` e `sha256` de cada GLB
   e `version` igual à pasta. Atualizar `assets/data/campus_models.json`.
5. **Dry-run**: `publicar-assets-mapa.mjs --dry-run` — todos os destinos devem
   aparecer como `novo`.
6. **Upload**: o mesmo comando sem `--dry-run` (credencial local de escrita,
   fora do Git e do Flutter). Content-Type e Cache-Control são definidos pelo script.
7. **Hash**: feito pelo script ao final; pode ser repetido com `--verificar`.
8. **Testar URLs**: HTTP 200 sem SAS; manifesto publicado idêntico ao do package.
9. **Atualizar a referência**: commit do novo `campus_models.json`; `flutter test`
   do package valida ids, caminhos e vínculo com as footprints.
10. **Testar no app** com `MAP_ASSETS_BASE_URL`: visão geral, LOD1, LOD0,
    reentrada na tela e ausência de configuração.

Se um arquivo publicado precisar mudar: nova versão. Não sobrescrever.
