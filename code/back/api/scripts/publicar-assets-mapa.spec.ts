import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  CACHE_CONTROL,
  contentTypePara,
  lerArgumentos,
  lerManifesto,
  localizar,
  nomeDoBlob,
  planejar,
  sha256,
  validarCaminhoRelativo,
  validarVersao,
} from './publicar-assets-mapa.mjs';

const aqui = path.dirname(fileURLToPath(import.meta.url));
const manifestoReal = path.resolve(
  aqui,
  '../../../mobile/packages/campus_map/assets/data/campus_models.json',
);

/** Pasta temporária com GLBs falsos e manifesto coerente com eles. */
function cenario(layout: 'publicado' | 'pipeline' = 'publicado') {
  const origem = fs.mkdtempSync(path.join(os.tmpdir(), 'assets-mapa-'));
  const modelo = (lod: string, id: string, pastaPipeline = lod) => {
    const conteudo = Buffer.from(`glb-${lod}-${id}`);
    const relativo = `models/${lod}/${id}.glb`;
    const destino = path.join(
      origem,
      ...(layout === 'publicado'
        ? relativo
        : `${pastaPipeline}/${id}.glb`
      ).split('/'),
    );
    fs.mkdirSync(path.dirname(destino), { recursive: true });
    fs.writeFileSync(destino, conteudo);
    return {
      id,
      path: relativo,
      bytes: conteudo.length,
      sha256: sha256(conteudo),
    };
  };
  const json = {
    schemaVersion: 1,
    version: '2099-01-01-r1',
    lod1: [modelo('lod1', 'g0')],
    lod0: [modelo('lod0', 'c00'), modelo('lod0', 'c01')],
    vegetation: { models: [modelo('vegetation', 'tree_round')], instances: [] },
    props: {
      models: [
        modelo('props', 'campus_sports', 'sports'),
        modelo('props', 'car_sedan_white', 'cars'),
      ],
      instances: [],
    },
  };
  const manifesto = path.join(origem, 'campus_models.json');
  fs.writeFileSync(manifesto, JSON.stringify(json));
  return { origem, manifesto, json };
}

describe('publicar-assets-mapa', () => {
  it('monta o blob dentro de campus/versions/<versão>/', () => {
    expect(nomeDoBlob('2026-09-30-r1', 'models/lod0/c00.glb')).toBe(
      'campus/versions/2026-09-30-r1/models/lod0/c00.glb',
    );
    expect(nomeDoBlob('2026-09-30-r1', 'manifests/campus-models.json')).toBe(
      'campus/versions/2026-09-30-r1/manifests/campus-models.json',
    );
  });

  it('valida versão', () => {
    expect(validarVersao('2026-09-30-r1')).toBe('2026-09-30-r1');
    for (const v of ['', 'current/x', '../a', 'A', undefined, 1]) {
      expect(() => validarVersao(v)).toThrow();
    }
  });

  it('aceita prédios, vegetação, props e o manifesto, bloqueando .., absolutos, debug e totem', () => {
    for (const c of [
      'models/lod1/g0.glb',
      'models/vegetation/tree_round.glb',
      'models/props/car_sedan_white.glb',
    ]) {
      expect(validarCaminhoRelativo(c)).toBe(c);
    }
    for (const c of [
      '../models/lod0/c00.glb',
      'models/../lod0/c00.glb',
      '/models/lod0/c00.glb',
      'https://x.invalid/models/lod0/c00.glb',
      'models\\lod0\\c00.glb',
      'models/lod2/c00.glb',
      'models/debug/ss_g0.glb',
      'models/props/ss_g0.glb',
      'models/props/ind_p43.glb',
      'models/props/torre_pucstop.glb',
      'models/vegetation/totem.glb',
      'models/props/pucstop_tower.glb',
      'models/cars/car_hatch_red.glb',
      'totens/torre_pucstop.glb',
      'torre_Pucstop.glb',
    ]) {
      expect(() => validarCaminhoRelativo(c), c).toThrow();
    }
  });

  it('classifica Content-Type e mantém Cache-Control imutável', () => {
    expect(contentTypePara('models/lod0/c00.glb')).toBe('model/gltf-binary');
    expect(contentTypePara('manifests/campus-models.json')).toBe(
      'application/json; charset=utf-8',
    );
    expect(() => contentTypePara('x.png')).toThrow();
    expect(CACHE_CONTROL).toBe('public, max-age=31536000, immutable');
  });

  it('calcula SHA-256', () => {
    expect(sha256(Buffer.from('abc'))).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
  });

  it('lê o manifesto real do package (16 prédios + 4 árvores + 8 props)', () => {
    const lido = lerManifesto(fs.readFileSync(manifestoReal, 'utf8'));
    expect(lido.versao).toBe('2026-09-30-r2');
    expect(lido.modelos).toHaveLength(28);
    const porTipo = (tipo: string) =>
      lido.modelos.filter((m) => m.caminho.startsWith(`models/${tipo}/`));
    expect(porTipo('lod1')).toHaveLength(4);
    expect(porTipo('lod0')).toHaveLength(12);
    expect(porTipo('vegetation')).toHaveLength(4);
    expect(porTipo('props')).toHaveLength(8);
  });

  it('manifesto sem seções ambientais (r1) continua válido', () => {
    const { json } = cenario();
    const r1 = { ...json, vegetation: undefined, props: undefined };
    delete r1.vegetation;
    delete r1.props;
    expect(lerManifesto(JSON.stringify(r1)).modelos).toHaveLength(3);
  });

  it('recusa seção ambiental vazia ou com caminho de outra seção', () => {
    const { json } = cenario();
    expect(() =>
      lerManifesto(JSON.stringify({ ...json, props: { models: [] } })),
    ).toThrow(/lista props ausente/);
    const trocado = structuredClone(json);
    trocado.props.models[0].path = 'models/vegetation/campus_sports.glb';
    expect(() => lerManifesto(JSON.stringify(trocado))).toThrow(
      /declarado em props/,
    );
  });

  it('planeja publicação com manifesto incluído, nos dois layouts de origem', () => {
    for (const layout of ['publicado', 'pipeline'] as const) {
      const { origem, manifesto } = cenario(layout);
      const plano = planejar({ manifesto, origem });
      expect(plano.versao).toBe('2099-01-01-r1');
      expect(plano.itens.map((i) => i.blob)).toEqual([
        'campus/versions/2099-01-01-r1/models/lod1/g0.glb',
        'campus/versions/2099-01-01-r1/models/lod0/c00.glb',
        'campus/versions/2099-01-01-r1/models/lod0/c01.glb',
        'campus/versions/2099-01-01-r1/models/vegetation/tree_round.glb',
        'campus/versions/2099-01-01-r1/models/props/campus_sports.glb',
        'campus/versions/2099-01-01-r1/models/props/car_sedan_white.glb',
        'campus/versions/2099-01-01-r1/manifests/campus-models.json',
      ]);
      expect(localizar(origem, 'models/lod0/c00.glb')).not.toBeNull();
      expect(
        localizar(origem, 'models/props/car_sedan_white.glb'),
      ).not.toBeNull();
    }
  });

  it('detecta arquivo ausente e hash divergente antes de qualquer upload', () => {
    const { origem, manifesto } = cenario();
    fs.rmSync(path.join(origem, 'models', 'lod0', 'c01.glb'));
    fs.writeFileSync(
      path.join(origem, 'models', 'lod0', 'c00.glb'),
      'glb-lod0-cXX',
    );
    expect(() => planejar({ manifesto, origem })).toThrow(
      /sha256 diverge do manifesto: models\/lod0\/c00\.glb/,
    );
    expect(() => planejar({ manifesto, origem })).toThrow(
      /arquivo ausente: models\/lod0\/c01\.glb/,
    );
  });

  it('recusa origem/manifesto inexistentes, versão divergente e path inválido', () => {
    const { origem, manifesto, json } = cenario();
    expect(() =>
      planejar({ manifesto, origem: path.join(origem, 'nada') }),
    ).toThrow(/origem inexistente/);
    expect(() =>
      planejar({ manifesto: path.join(origem, 'x.json'), origem }),
    ).toThrow(/manifesto inexistente/);
    expect(() =>
      planejar({ manifesto, origem, versao: '2099-01-02-r1' }),
    ).toThrow(/difere do manifesto/);
    json.lod0[0].path = 'models/lod0/../../segredo.glb';
    fs.writeFileSync(manifesto, JSON.stringify(json));
    expect(() => planejar({ manifesto, origem })).toThrow(/não publicável/);
  });

  it('lê argumentos sem aceitar opção desconhecida (não existe --force)', () => {
    const opcoes = lerArgumentos([
      '--source',
      'x',
      '--dry-run',
      '--version',
      'v1',
    ]);
    expect(opcoes.dryRun).toBe(true);
    expect(opcoes.versao).toBe('v1');
    expect(() => lerArgumentos(['--force'])).toThrow(/desconhecido/);
    expect(() => lerArgumentos(['--source'])).toThrow(/exige um valor/);
  });
});
