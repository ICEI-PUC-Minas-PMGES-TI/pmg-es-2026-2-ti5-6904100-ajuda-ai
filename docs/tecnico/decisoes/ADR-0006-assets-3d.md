# ADR-0006 — Assets 3D remotos e imutáveis

Estado: aceito. Substitui a proposta inicial de empacotar GLBs no Flutter.

## Contexto

GLBs pesados no APK aumentam o download e acoplam publicação de modelos ao app.
Mapbox carrega modelos por HTTPS; o projeto já usa Blob Storage.
Os fontes de modelagem são externos aos repositórios.

## Decisão

- GLBs no container público `map-assets`, em
  `campus/versions/<versão>/models/...`.
- Footprints e manifesto pequenos no pacote Flutter; caminhos relativos
  resolvidos a partir de `MAP_ASSETS_BASE_URL`.
- Sem SDK Azure no cliente e sem GLBs duplicados no APK/Git.
- Versão publicada é imutável e autocontida. Mudanças de bytes ou manifesto
  exigem outra versão; não há alias `current`.
- O publicador valida hashes/tamanhos antes do envio, impede sobrescrita e
  verifica as URLs públicas.
- Cache de longa duração: `public, max-age=31536000, immutable`.

## Consequências

O host pode ser trocado por configuração, sem mudar o renderer.
O 3D depende de rede/cache; 2D e extrusão sustentam a degradação quando modelos
não carregam. O cache não equivale a um pacote offline.

Credenciais de publicação ficam no ambiente administrativo. O cliente aceita
somente URL pública HTTPS sem query, fragmento ou credenciais.
Pipeline, manifesto, convenções do GLB e comandos:
[mapa/assets-pipeline.md](../mapa/assets-pipeline.md).
