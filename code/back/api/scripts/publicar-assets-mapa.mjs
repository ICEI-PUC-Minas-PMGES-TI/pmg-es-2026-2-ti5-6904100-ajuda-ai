// Publica uma versão IMUTÁVEL dos GLBs do campus (prédios LOD0/LOD1 e, se o
// manifesto tiver, vegetação e props) e do manifesto no container público
// `map-assets`. Não sobrescreve nada: se algum
// blob da versão já existir, para antes de enviar qualquer arquivo.
//
// Uso (em code/back/api):
//   node --env-file=.env scripts/publicar-assets-mapa.mjs --source <dir> --dry-run
//   node --env-file=.env scripts/publicar-assets-mapa.mjs --source <dir>
//   node scripts/publicar-assets-mapa.mjs --source <dir> --verificar --base-url <url>
//
// --source   pasta com os GLBs, em `models/<tipo>/` ou no layout do pipeline
//            (assets/campus do PUCMaps: `lod0|lod1|vegetation/`, props em
//            `sports/` e `cars/`).
// --manifest manifesto (padrão: o do package campus_map); a versão vem dele.
// --version  opcional; se informada, precisa ser igual à do manifesto.
// --dry-run  só valida e lista; com credencial, também consulta o que já existe.
// --retomar  pula blobs já publicados com o mesmo SHA-256 (publicação interrompida).
// --verificar só baixa pela URL pública e compara tamanho/SHA-256; sem credencial.
//
// Credencial: AZURE_STORAGE_CONNECTION_STRING (mesmo nome do backend), lida do
// ambiente e nunca impressa.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const CONTAINER = 'map-assets';
export const CACHE_CONTROL = 'public, max-age=31536000, immutable';
export const CAMINHO_MANIFESTO = 'manifests/campus-models.json';
export const CONTENT_TYPES = {
  '.glb': 'model/gltf-binary',
  '.json': 'application/json; charset=utf-8',
};

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MANIFESTO_PADRAO = path.resolve(
  raiz,
  '../../mobile/packages/campus_map/assets/data/campus_models.json',
);
const VERSAO = /^[a-z0-9][a-z0-9.-]{0,63}$/;
const MODELO = /^models\/(lod[01]|vegetation|props)\/[a-z0-9_-]+\.glb$/;
/** Seções ambientais opcionais do manifesto. */
export const SECOES_AMBIENTE = ['vegetation', 'props'];
/** Assets do PUCMaps que não são produto: PucStop/totem e variantes de debug. */
const PROIBIDO = /(debug|totem|pucstop|torre|(^|\/)(ss|nowin|ind)_)/i;
/** Layout do pipeline: props do PUCMaps ficam em duas pastas. */
const PASTAS_PIPELINE = { props: ['sports', 'cars'] };
const SHA256 = /^[0-9a-f]{64}$/;

export function validarVersao(versao) {
  if (typeof versao !== 'string' || !VERSAO.test(versao)) {
    throw new Error(`versão inválida: ${JSON.stringify(versao)}`);
  }
  return versao;
}

/**
 * Só `models/lod0|lod1|vegetation|props/<nome>.glb` ou o manifesto; nunca
 * `..`, `/` inicial, esquema, debug ou totem.
 */
export function validarCaminhoRelativo(caminho) {
  if (
    typeof caminho !== 'string' ||
    caminho.startsWith('/') ||
    caminho.includes('\\') ||
    caminho.split('/').some((parte) => parte === '' || parte === '..') ||
    /^[a-z][a-z0-9+.-]*:/i.test(caminho) ||
    (caminho !== CAMINHO_MANIFESTO &&
      (!MODELO.test(caminho) || PROIBIDO.test(caminho)))
  ) {
    throw new Error(`caminho não publicável: ${JSON.stringify(caminho)}`);
  }
  return caminho;
}

export function nomeDoBlob(versao, caminho) {
  return `campus/versions/${validarVersao(versao)}/${validarCaminhoRelativo(caminho)}`;
}

export function contentTypePara(caminho) {
  const tipo = CONTENT_TYPES[path.extname(caminho).toLowerCase()];
  if (!tipo) throw new Error(`extensão não publicável: ${caminho}`);
  return tipo;
}

export const sha256 = (buffer) =>
  crypto.createHash('sha256').update(buffer).digest('hex');

/** Modelos declarados no manifesto (LOD1, LOD0, vegetação, props), já validados. */
export function lerManifesto(texto) {
  const json = JSON.parse(texto);
  if (json?.schemaVersion !== 1) throw new Error('schemaVersion inesperado');
  const versao = validarVersao(json.version);
  const listas = [
    ['lod1', json.lod1],
    ['lod0', json.lod0],
    ...SECOES_AMBIENTE.filter((secao) => secao in json).map((secao) => [
      secao,
      json[secao]?.models,
    ]),
  ];
  const modelos = [];
  for (const [tipo, lista] of listas) {
    if (!Array.isArray(lista) || lista.length === 0) {
      throw new Error(`lista ${tipo} ausente no manifesto`);
    }
    for (const modelo of lista) {
      const caminho = validarCaminhoRelativo(modelo?.path);
      if (!caminho.startsWith(`models/${tipo}/`)) {
        throw new Error(`${caminho} declarado em ${tipo}`);
      }
      if (
        !Number.isInteger(modelo.bytes) ||
        !SHA256.test(modelo.sha256 ?? '')
      ) {
        throw new Error(`bytes/sha256 ausentes em ${caminho}`);
      }
      modelos.push({ caminho, bytes: modelo.bytes, sha256: modelo.sha256 });
    }
  }
  if (new Set(modelos.map((m) => m.caminho)).size !== modelos.length) {
    throw new Error('caminho repetido no manifesto');
  }
  return { versao, modelos };
}

/** Arquivo local do modelo: layout publicado ou layout do pipeline (sem `models/`). */
export function localizar(origem, caminho) {
  const [, tipo, nome] = caminho.split('/');
  const candidatos = [
    caminho,
    `${tipo}/${nome}`,
    ...(PASTAS_PIPELINE[tipo] ?? []).map((pasta) => `${pasta}/${nome}`),
  ];
  for (const candidato of candidatos) {
    const arquivo = path.join(origem, ...candidato.split('/'));
    if (fs.existsSync(arquivo)) return arquivo;
  }
  return null;
}

/**
 * Valida tudo localmente antes de qualquer rede. Erros são acumulados para
 * mostrar todos de uma vez; com qualquer erro nada é publicado.
 */
export function planejar({ manifesto, origem, versao }) {
  const erros = [];
  if (!origem || !fs.existsSync(origem) || !fs.statSync(origem).isDirectory()) {
    throw new Error(
      `pasta de origem inexistente: ${origem ?? '(não informada)'}`,
    );
  }
  if (!fs.existsSync(manifesto))
    throw new Error(`manifesto inexistente: ${manifesto}`);
  const textoManifesto = fs.readFileSync(manifesto);
  const lido = lerManifesto(textoManifesto.toString('utf8'));
  if (versao !== undefined && validarVersao(versao) !== lido.versao) {
    throw new Error(`--version ${versao} difere do manifesto (${lido.versao})`);
  }
  const itens = [];
  for (const modelo of lido.modelos) {
    const arquivo = localizar(origem, modelo.caminho);
    if (!arquivo) {
      erros.push(`arquivo ausente: ${modelo.caminho}`);
      continue;
    }
    const conteudo = fs.readFileSync(arquivo);
    if (conteudo.length !== modelo.bytes) {
      erros.push(`tamanho diverge do manifesto: ${modelo.caminho}`);
    } else if (sha256(conteudo) !== modelo.sha256) {
      erros.push(`sha256 diverge do manifesto: ${modelo.caminho}`);
    }
    itens.push({ caminho: modelo.caminho, conteudo });
  }
  if (erros.length)
    throw new Error(`validação local falhou:\n  ${erros.join('\n  ')}`);
  itens.push({ caminho: CAMINHO_MANIFESTO, conteudo: textoManifesto });
  return {
    versao: lido.versao,
    itens: itens.map(({ caminho, conteudo }) => ({
      caminho,
      blob: nomeDoBlob(lido.versao, caminho),
      contentType: contentTypePara(caminho),
      bytes: conteudo.length,
      sha256: sha256(conteudo),
      conteudo,
    })),
  };
}

export function lerArgumentos(argv) {
  const opcoes = { manifesto: MANIFESTO_PADRAO };
  const valor = (i) => {
    if (argv[i + 1] === undefined || argv[i + 1].startsWith('--')) {
      throw new Error(`${argv[i]} exige um valor`);
    }
    return argv[i + 1];
  };
  for (let i = 0; i < argv.length; i++) {
    switch (argv[i]) {
      case '--source':
        opcoes.origem = path.resolve(valor(i++));
        break;
      case '--manifest':
        opcoes.manifesto = path.resolve(valor(i++));
        break;
      case '--version':
        opcoes.versao = valor(i++);
        break;
      case '--base-url':
        opcoes.baseUrl = valor(i++).replace(/\/+$/, '');
        break;
      case '--dry-run':
        opcoes.dryRun = true;
        break;
      case '--retomar':
        opcoes.retomar = true;
        break;
      case '--verificar':
        opcoes.verificar = true;
        break;
      default:
        throw new Error(`argumento desconhecido: ${argv[i]}`);
    }
  }
  return opcoes;
}

async function verificarPublico(baseUrl, plano) {
  let ok = true;
  for (const item of plano.itens) {
    const resposta = await fetch(`${baseUrl}/${item.blob}`, {
      cache: 'no-store',
    });
    const remoto = Buffer.from(await resposta.arrayBuffer());
    const tipo = resposta.headers.get('content-type');
    const cache = resposta.headers.get('cache-control');
    const igual =
      resposta.status === 200 &&
      remoto.length === item.bytes &&
      sha256(remoto) === item.sha256 &&
      tipo === item.contentType &&
      cache === CACHE_CONTROL;
    ok &&= igual;
    console.log(
      `${igual ? 'OK ' : 'ERR'} ${resposta.status} ${tipo} ${remoto.length}B ${item.caminho}`,
    );
  }
  return ok;
}

async function conectar() {
  const conexao = process.env.AZURE_STORAGE_CONNECTION_STRING?.trim();
  if (!conexao) return null;
  const { BlobServiceClient } = await import('@azure/storage-blob');
  return BlobServiceClient.fromConnectionString(conexao).getContainerClient(
    CONTAINER,
  );
}

async function main() {
  const opcoes = lerArgumentos(process.argv.slice(2));
  const plano = planejar(opcoes);
  const total = plano.itens.reduce((soma, item) => soma + item.bytes, 0);
  console.log(
    `versão ${plano.versao}: ${plano.itens.length} arquivos, ${total} bytes (validação local OK)`,
  );

  if (opcoes.verificar) {
    if (!opcoes.baseUrl)
      throw new Error(
        '--verificar exige --base-url <url pública do container>',
      );
    if (!(await verificarPublico(opcoes.baseUrl, plano))) process.exit(1);
    return;
  }

  const container = await conectar();
  if (!container && !opcoes.dryRun) {
    throw new Error(
      'AZURE_STORAGE_CONNECTION_STRING ausente (use --dry-run para só validar)',
    );
  }

  // Estado remoto antes de enviar: nenhum upload parcial por conflito.
  const existentes = [];
  for (const item of plano.itens) {
    const existe = container
      ? await container.getBlockBlobClient(item.blob).exists()
      : null;
    if (existe) existentes.push(item);
    console.log(
      `${existe === null ? '?' : existe ? 'EXISTE' : 'novo'}  ${item.contentType}  ${item.bytes}B  ${item.blob}`,
    );
  }
  if (opcoes.dryRun) {
    console.log(
      container
        ? 'dry-run: nada foi enviado.'
        : 'dry-run sem credencial: estado remoto não consultado.',
    );
    return;
  }
  if (existentes.length && !opcoes.retomar) {
    throw new Error(
      `${existentes.length} blob(s) da versão ${plano.versao} já existem. Versões são imutáveis: ` +
        'crie uma nova versão (ou use --retomar para completar uma publicação interrompida).',
    );
  }
  for (const item of existentes) {
    const remoto = await container
      .getBlockBlobClient(item.blob)
      .downloadToBuffer();
    if (sha256(remoto) !== item.sha256) {
      throw new Error(
        `${item.blob} já existe com conteúdo diferente; não será sobrescrito`,
      );
    }
  }

  const pular = new Set(existentes.map((item) => item.blob));
  for (const item of plano.itens) {
    if (pular.has(item.blob)) {
      console.log(`já publicado (sha256 igual): ${item.caminho}`);
      continue;
    }
    await container.getBlockBlobClient(item.blob).uploadData(item.conteudo, {
      conditions: { ifNoneMatch: '*' },
      blobHTTPHeaders: {
        blobContentType: item.contentType,
        blobCacheControl: CACHE_CONTROL,
        blobContentMD5: crypto.createHash('md5').update(item.conteudo).digest(),
      },
    });
    console.log(`enviado: ${item.caminho}`);
  }

  const baseUrl = opcoes.baseUrl ?? container.url;
  if (!(await verificarPublico(baseUrl, plano))) process.exit(1);
  console.log(
    `publicado e verificado: ${baseUrl}/campus/versions/${plano.versao}/`,
  );
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  main().catch((erro) => {
    // Mensagens próprias; erros do SDK podem trazer URL assinada, então só o tipo/código.
    const codigo = erro?.statusCode ? ` (HTTP ${erro.statusCode})` : '';
    console.error(
      erro?.statusCode
        ? `falha no Azure${codigo}: ${erro.code ?? erro.name}`
        : erro.message,
    );
    process.exit(1);
  });
}
