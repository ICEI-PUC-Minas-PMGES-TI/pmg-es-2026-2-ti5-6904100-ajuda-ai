# Assets 3D e publicação

GLBs ficam no container público `map-assets`; footprints e manifesto ficam
no pacote Flutter. O app lê HTTPS público e não usa SDK Azure.
Decisão: [ADR-0006](../decisoes/ADR-0006-assets-3d.md).
Origem e créditos: [origem-pucmaps.md](../origem-pucmaps.md).

## Pipeline externo

Os fontes de modelagem e os scripts Blender/Python não estão nestes repositórios.
A publicação é reproduzível com os GLBs finais e o manifesto; gerar novos
modelos exige acesso ao pipeline externo.

Ao reexportar o modelo herdado do totem, preservar os nós `Aneis_Bronze` e
`Joia_Azul` para compatibilidade com sua estrutura. O renderer do Ajuda-aí
não anima esses nós. O vitral deve usar `TEXCOORD_0`: o uso do segundo canal
UV não é compatível com o comportamento documentado do Mapbox para esse modelo.
Não extrapolar essas convenções para outro modelo sem validá-lo.

## Versão e layout

Cada versão é autocontida e **imutável**, sem alias `current`. Alterar um
GLB ou o manifesto exige nova versão; revisões anteriores não são sobrescritas.

```text
map-assets/campus/versions/<versão>/
  manifests/campus-models.json
  models/lod0/
  models/lod1/
  models/vegetation/
  models/props/
  models/pucstops/
```

A versão consumida pelo build vem de
`code/mobile/packages/campus_map/assets/data/campus_models.json`.
O pacote resolve `<base>/campus/versions/<versão>/<path>`.
A versão de assets é independente do código da versão geográfica do banco;
`versoes.versao_assets` não seleciona automaticamente o manifesto do app.

## Manifesto

- `schemaVersion` e `version` identificam formato e publicação.
- `source` preserva proveniência, hashes de origem e metadados OSM/ODbL.
- `placement` define unidades, orientação e escala dos modelos de prédios.
- `lod0`/`lod1` descrevem IDs, caminhos, âncoras, bbox, vínculo com prédios,
  tamanho e SHA-256. Cada prédio pertence a um modelo de cada LOD.
- `buildings` une IDs dos footprints aos modelos e à cor de parede da extrusão.
- `vegetation` e `props` guardam modelos e instâncias; os tipos são
  `tree`, `sports` e `vehicle`. Escala uniforme, giro vertical e posições
  vêm do pipeline, sem duplicar malhas por instância.
- `pucstops` descreve somente modelo e posicionamento visual do totem;
  posições reais e XP vêm da API, nunca do manifesto.

Caminhos são relativos, sem `..`, esquema, host ou barra inicial.
Debug e variantes experimentais são recusados; modelos de totem só são aceitos
em `models/pucstops/`. Seção ambiental/totem inválida é isolada, preservando
prédios e 2D. LOD2 usa extrusão das footprints, sem GLB próprio.
Limiares e ciclo de vida: [renderizacao-3d.md](renderizacao-3d.md).

## Publicador

`code/back/api/scripts/publicar-assets-mapa.mjs` reutiliza
`@azure/storage-blob` do backend. Requer Node compatível com o backend,
dependências instaladas, GLBs locais e manifesto com `bytes`/`sha256`.

`--source` aceita o layout publicado (`models/<tipo>/`) ou o layout PUCMaps:
`lod0/`, `lod1/`, `vegetation/`, `sports/`, `cars/` e `totens/`.
Só publica arquivos declarados no manifesto.

Em `code/back/api`:

```powershell
# Validação local; com credencial, também consulta conflitos remotos.
node --env-file=.env scripts/publicar-assets-mapa.mjs --source <pasta-dos-glbs> --dry-run

# Publicar a versão do manifesto.
node --env-file=.env scripts/publicar-assets-mapa.mjs --source <pasta-dos-glbs>

# Verificar leitura pública sem credenciais.
node scripts/publicar-assets-mapa.mjs --source <pasta-dos-glbs> --verificar --base-url https://<conta>.blob.core.windows.net/map-assets
```

Opções: `--manifest <arquivo>`, `--version <versão>` (igual à do manifesto),
`--dry-run`, `--retomar`, `--verificar` e `--base-url <url>`.
Não existe `--force`.

Antes de qualquer envio, o script valida o manifesto, caminhos, arquivos,
tamanhos e SHA-256. Erros são acumulados; qualquer divergência impede publicação.

Se algum blob da versão já existir, o envio para antes de publicar.
`--retomar` compara bytes existentes por SHA-256, pula iguais e envia ausentes.
Cada envio usa `If-None-Match: *` e `Content-MD5`.
Ao terminar, confere HTTP 200, tamanho, hash, Content-Type e Cache-Control pela URL pública.

## Publicar uma nova versão

1. Obter os GLBs do pipeline externo e conferir unidades, orientação e vínculo
   por ID com as footprints.
2. Escolher nova versão (`<data-osm>-r<n>`) e preparar o manifesto com hashes.
3. Executar dry-run; destinos precisam estar livres ou corresponder a uma
   retomada explicitamente conferida.
4. Publicar e verificar. `.glb`: `model/gltf-binary`; manifesto:
   `application/json; charset=utf-8`. Cache:
   `public, max-age=31536000, immutable`.
5. Atualizar o manifesto do pacote com a mesma versão/bytes publicados e executar
   seus testes. Verificar 2D/LOD, reentrada e comportamento sem acesso aos modelos.

A cópia do manifesto no storage deve corresponder à distribuída no pacote.
Credenciais de escrita ficam no ambiente administrativo
(`AZURE_STORAGE_CONNECTION_STRING`); nunca no Flutter.
`MAP_ASSETS_BASE_URL` deve ser HTTPS público, sem SAS/query, fragmento ou credencial.
