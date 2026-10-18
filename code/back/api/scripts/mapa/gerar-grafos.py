"""Documenta o snapshot local; Python 3.10+, somente biblioteca padrão, sem banco/rede."""
import argparse
import collections
import hashlib
import html
import json
import math
import pathlib

ROOT = pathlib.Path(__file__).resolve().parents[5]


def componentes(ids, arestas):
    adj = {n: set() for n in ids}
    for e in arestas:
        adj[e['origem']].add(e['destino'])
        adj[e['destino']].add(e['origem'])
    vistos, grupos = set(), []
    for n in sorted(ids):
        if n in vistos:
            continue
        pilha, grupo = [n], []
        while pilha:
            v = pilha.pop()
            if v in vistos:
                continue
            vistos.add(v)
            grupo.append(v)
            pilha.extend(sorted(adj[v] - vistos, reverse=True))
        grupos.append(sorted(grupo))
    return sorted(grupos, key=lambda g: (-len(g), g[0])), adj


def topologia(grupos, adj):
    # Layout de forças determinístico, independente das coordenadas geográficas.
    # Grade espacial limita a repulsão local; sem biblioteca de runtime no app.
    pontos = {}
    for k, grupo in enumerate(grupos):
        if k:
            cx, cy = 1120 + (k - 1) % 3 * 65, 140 + (k - 1) // 3 * 95
            for i, n in enumerate(grupo):
                pontos[n] = (cx + i * 24, cy)
            continue
        p = {n: [math.cos(i * 2.399963) * math.sqrt(i + 1) * 12,
                  math.sin(i * 2.399963) * math.sqrt(i + 1) * 12]
             for i, n in enumerate(grupo)}
        for passo in range(1800):
            grade = collections.defaultdict(list)
            for n, (x, y) in p.items():
                grade[(int(x // 30), int(y // 30))].append(n)
            novo = {}
            for n, (x, y) in p.items():
                fx, fy = -x * 0.001, -y * 0.001
                gx, gy = int(x // 30), int(y // 30)
                for dx in (-1, 0, 1):
                    for dy in (-1, 0, 1):
                        for v in grade[(gx + dx, gy + dy)]:
                            if v == n:
                                continue
                            vx, vy = x - p[v][0], y - p[v][1]
                            d2 = max(vx * vx + vy * vy, 0.01)
                            fx += vx * 80 / d2
                            fy += vy * 80 / d2
                for v in sorted(adj[n]):
                    vx, vy = p[v][0] - x, p[v][1] - y
                    d = max(math.hypot(vx, vy), 0.01)
                    f = (d - 18) * 0.05 / d
                    fx += vx * f
                    fy += vy * f
                limite = 3 * (1 - passo / 2000)
                norma = max(math.hypot(fx, fy), 0.01)
                fator = min(1, limite / norma)
                novo[n] = [x + fx * fator, y + fy * fator]
            p = novo
        xs, ys = [v[0] for v in p.values()], [v[1] for v in p.values()]
        escala = min(960 / max(max(xs) - min(xs), 1), 580 / max(max(ys) - min(ys), 1))
        for n, (x, y) in p.items():
            pontos[n] = (60 + (x - min(xs)) * escala, 115 + (y - min(ys)) * escala)
    return pontos


def gerar(snapshot, saida):
    bruto = snapshot.read_bytes()
    d = json.loads(bruto)
    nos = {n['id']: n for n in d['nos']}
    grupos, adj = componentes(nos, d['arestas'])
    grupo_de = {n: i for i, g in enumerate(grupos) for n in g}
    coords = [n['localizacao']['coordinates'] for n in nos.values()]
    lon0, lat0 = min(p[0] for p in coords), min(p[1] for p in coords)
    coslat = math.cos(math.radians(sum(p[1] for p in coords) / len(coords)))
    metro = 6371000 * math.pi / 180
    xy = lambda c: ((c[0] - lon0) * coslat * metro, (c[1] - lat0) * metro)
    metros = {n: xy(v['localizacao']['coordinates']) for n, v in nos.items()}
    xmax = max(p[0] for p in metros.values())
    ymax = max(p[1] for p in metros.values())
    escala = min(1160 / xmax, 560 / ymax)
    geo = lambda c: ((1360 - xmax * escala) / 2 + xy(c)[0] * escala, 690 - xy(c)[1] * escala)
    geografico = {n: geo(v['localizacao']['coordinates']) for n, v in nos.items()}
    topo = topologia(grupos, adj)
    resumo = {
        'codigo': d['codigo'], 'snapshotSha256': hashlib.sha256(bruto).hexdigest(),
        'nos': len(nos), 'arestasDirigidas': len(d['arestas']),
        'componentesFracas': [len(g) for g in grupos],
        'arestasAcessiveis': sum(e['acessivel'] for e in d['arestas']),
        'conectoresSemGeometria': sum(e['geometria'] is None for e in d['arestas']),
    }
    saida.mkdir(parents=True, exist_ok=True)
    svgs = {}
    for modo, pontos in [('topologico', topo), ('geografico', geografico)]:
        partes = [f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1360 790" role="img" aria-label="Grafo {modo} do campus">',
                  '<rect width="1360" height="790" fill="#fafafa"/>',
                  '<g font-family="sans-serif" fill="#242424">',
                  f'<text x="35" y="38" font-size="23">Campus · grafo {modo}</text>',
                  f'<text x="35" y="67" font-size="14">{html.escape(d["codigo"])} · {len(nos)} nós · {len(d["arestas"])} arestas dirigidas · {len(grupos)} componentes</text>',
                  '<text x="35" y="753" font-size="13">Cinza: acessível · Laranja: não acessível · Nó azul: prédio · Nó escuro: caminho · Nó laranja: fora do componente principal</text>',
                  '<text x="35" y="776" font-size="12">Fonte: snapshot versionado pucmaps-12; conectores nulos unem nós coincidentes. Pares de arestas reversas se sobrepõem.</text></g>', '<g id="edges" fill="none" stroke-width="1.1">']
        for e in d['arestas']:
            linha = [pontos[e['origem']], pontos[e['destino']]]
            if modo == 'geografico' and e['geometria']:
                linha = [geo(c) for c in e['geometria']['coordinates']]
            caminho = 'M' + ' L'.join(f'{x:.2f},{y:.2f}' for x, y in linha)
            titulo = f'{e["id"]}: {e["origem"]} → {e["destino"]}; {e["tempoCaminhadaS"]} s; {e["distanciaM"]:.2f} m; acessível={e["acessivel"]}'
            cor = '#a3a3a3' if e['acessivel'] else '#b45309'
            partes.append(f'<path data-edge="{html.escape(e["id"], quote=True)}" d="{caminho}" stroke="{cor}"><title>{html.escape(titulo)}</title></path>')
        partes.append('</g><g id="nodes">')
        for n, (x, y) in pontos.items():
            v = nos[n]
            cor = '#b45309' if grupo_de[n] else '#1d4ed8' if v['predioId'] else '#262626'
            titulo = f'{n}; prédio={v["predioId"]}; sala={v["salaId"]}; nível={v["nivel"]}; componente={grupo_de[n]+1}; coordenadas={v["localizacao"]["coordinates"]}'
            partes.append(f'<circle data-node="{html.escape(n, quote=True)}" cx="{x:.2f}" cy="{y:.2f}" r="{3 if v["predioId"] else 2}" fill="{cor}"><title>{html.escape(titulo)}</title></circle>')
        partes.append('</g>')
        if modo == 'geografico':
            largura = 100 * escala
            partes.append(f'<path d="M70,715 h{largura:.2f}" stroke="#242424" stroke-width="3"/><text x="70" y="735" font-family="sans-serif" font-size="12">100 m · projeção local equiretangular · norte ↑</text>')
        else:
            partes.append('<text x="1090" y="110" font-family="sans-serif" font-size="12">Componentes secundários</text>')
        partes.append('</svg>')
        svgs[modo] = '\n'.join(partes)
        (saida / f'campus-graph-{modo}.svg').write_text(svgs[modo] + '\n', encoding='utf-8')
    (saida / 'resumo.json').write_text(json.dumps(resumo, indent=2, ensure_ascii=False) + '\n', encoding='utf-8')
    # Inspeção por seletor também cobre nós coincidentes e arestas reversas.
    payload = json.dumps({'nos': list(nos.values()), 'arestas': d['arestas']}, ensure_ascii=False).replace('<', '\\u003c')
    pagina = '''<!doctype html><html lang="pt-BR"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Grafo do campus</title>
<style>body{margin:0;font:14px system-ui;color:#262626;background:#fafafa}header{padding:16px;display:flex;gap:12px;align-items:center;flex-wrap:wrap}button,select{font:inherit;padding:5px}main{height:70vh;overflow:hidden;border-block:1px solid #ddd;touch-action:none}svg{width:100%;height:100%;cursor:grab}pre{white-space:pre-wrap;padding:16px;max-height:22vh;overflow:auto}</style>
<header><strong>PUCMaps → Ajuda-aí · inspeção do grafo</strong><button id="modo">Trocar visão</button><button id="reset">Restaurar</button><label>Tipo <select id="tipo"><option value="nos">Nós</option><option value="arestas">Arestas</option></select></label><label>Objeto <select id="objeto" aria-label="Objeto do grafo"></select></label><span>Arraste para pan; roda para zoom. Coordenadas em longitude/latitude.</span></header><main></main><pre id="detalhe">Selecione ou clique num objeto para inspecionar.</pre><script>
const views=VIEWS, data=PAYLOAD; let mode='geografico',svg,drag;
const main=document.querySelector('main'),tipo=document.querySelector('#tipo'),objeto=document.querySelector('#objeto'),detalhe=document.querySelector('#detalhe');
function show(item){detalhe.textContent=JSON.stringify(item,null,2)}
function populate(){objeto.replaceChildren(...data[tipo.value].map(n=>{let o=document.createElement('option');o.value=n.id;o.textContent=n.id;return o}));inspect()}
function inspect(){show(data[tipo.value].find(n=>n.id===objeto.value))}
function mount(){main.innerHTML=views[mode];svg=main.querySelector('svg');svg.addEventListener('wheel',e=>{e.preventDefault();let v=svg.viewBox.baseVal,r=main.getBoundingClientRect(),f=e.deltaY>0?1.15:1/1.15;let x=v.x+(e.clientX-r.left)/r.width*v.width,y=v.y+(e.clientY-r.top)/r.height*v.height;v.x=x+(v.x-x)*f;v.y=y+(v.y-y)*f;v.width*=f;v.height*=f},{passive:false});svg.addEventListener('pointerdown',e=>{drag={x:e.clientX,y:e.clientY,vx:svg.viewBox.baseVal.x,vy:svg.viewBox.baseVal.y};svg.setPointerCapture(e.pointerId);let t=e.target.closest('[data-node],[data-edge]');if(t){tipo.value=t.dataset.node?'nos':'arestas';populate();objeto.value=t.dataset.node||t.dataset.edge;inspect()}});svg.addEventListener('pointermove',e=>{if(!drag)return;let v=svg.viewBox.baseVal,r=svg.getBoundingClientRect();v.x=drag.vx-(e.clientX-drag.x)*v.width/r.width;v.y=drag.vy-(e.clientY-drag.y)*v.height/r.height});svg.addEventListener('pointerup',()=>drag=null);svg.addEventListener('pointercancel',()=>drag=null)}
document.querySelector('#modo').onclick=()=>{mode=mode==='geografico'?'topologico':'geografico';mount()};document.querySelector('#reset').onclick=mount;tipo.onchange=populate;objeto.onchange=inspect;populate();mount();
</script></html>'''
    pagina = pagina.replace('VIEWS', json.dumps(svgs, ensure_ascii=False).replace('<', '\\u003c')).replace('PAYLOAD', payload)
    (saida / 'campus-graph.html').write_text(pagina + '\n', encoding='utf-8')
    print(json.dumps(resumo, ensure_ascii=False))


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--snapshot', type=pathlib.Path, default=ROOT / 'code/back/api/scripts/mapa/dados/pucmaps-12.json')
    parser.add_argument('--saida', type=pathlib.Path, default=ROOT / 'docs/tecnico/mapa/grafos')
    args = parser.parse_args()
    gerar(args.snapshot, args.saida)
