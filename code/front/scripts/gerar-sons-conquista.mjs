/**
 * Gera os efeitos sonoros da animação de novo nível (WAV mono 16 bits),
 * sintetizados aqui — sem amostras de terceiros, sem dependências.
 *
 *   node scripts/gerar-sons-conquista.mjs
 *
 * Saída em `code/mobile/assets/gamificacao/sons/`: o app Flutter empacota a
 * pasta e a web a publica por `publicDir` (`/gamificacao/sons/*.wav`).
 * Determinístico: rodar de novo produz os mesmos arquivos.
 *
 * - giro.wav      (~0,6 s): "whoosh" de ruído filtrado, acompanha o giro;
 * - conquista.wav (~1,3 s): acorde arpejado em Dó maior, na revelação;
 * - brilho.wav    (~1,0 s): cintilar agudo e leve, na celebração.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const TAXA = 22050;
const DESTINO = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../../mobile/assets/gamificacao/sons',
);

/** Gerador pseudoaleatório com semente (resultado estável). */
function aleatorio(semente) {
  let s = semente >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

function wav(amostras) {
  const dados = Buffer.alloc(amostras.length * 2);
  amostras.forEach((v, i) => {
    const x = Math.max(-1, Math.min(1, v));
    dados.writeInt16LE(Math.round(x * 32767), i * 2);
  });
  const cab = Buffer.alloc(44);
  cab.write('RIFF', 0);
  cab.writeUInt32LE(36 + dados.length, 4);
  cab.write('WAVE', 8);
  cab.write('fmt ', 12);
  cab.writeUInt32LE(16, 16);
  cab.writeUInt16LE(1, 20); // PCM
  cab.writeUInt16LE(1, 22); // mono
  cab.writeUInt32LE(TAXA, 24);
  cab.writeUInt32LE(TAXA * 2, 28);
  cab.writeUInt16LE(2, 32);
  cab.writeUInt16LE(16, 34);
  cab.write('data', 36);
  cab.writeUInt32LE(dados.length, 40);
  return Buffer.concat([cab, dados]);
}

/** Normaliza para o pico pedido e aplica fade nas pontas (sem estalos). */
function finalizar(amostras, pico) {
  const max = amostras.reduce((m, v) => Math.max(m, Math.abs(v)), 0) || 1;
  const fade = Math.floor(TAXA * 0.01);
  return amostras.map((v, i) => {
    const borda = Math.min(1, i / fade, (amostras.length - 1 - i) / fade);
    return (v / max) * pico * borda;
  });
}

function giro() {
  const dur = 0.62;
  const n = Math.floor(TAXA * dur);
  const rnd = aleatorio(7);
  const saida = new Array(n).fill(0);
  // Filtro passa-faixa (state variable) com frequência varrendo para cima e
  // de volta: a sensação de algo passando rápido.
  let baixa = 0;
  let faixa = 0;
  for (let i = 0; i < n; i++) {
    const t = i / n;
    const freq = 380 + 2600 * Math.sin(Math.PI * Math.pow(t, 0.8));
    const f = 2 * Math.sin((Math.PI * freq) / TAXA);
    const q = 0.55;
    const ruido = rnd() * 2 - 1;
    baixa += f * faixa;
    const alta = ruido - baixa - q * faixa;
    faixa += f * alta;
    const env = Math.pow(Math.sin(Math.PI * Math.min(1, t * 1.05)), 1.6);
    saida[i] = faixa * env;
  }
  return finalizar(saida, 0.32);
}

function conquista() {
  const dur = 1.35;
  const n = Math.floor(TAXA * dur);
  const saida = new Array(n).fill(0);
  // Dó maior arpejado (C5 E5 G5 C6) e um acorde suave de fundo.
  const notas = [
    [523.25, 0.0],
    [659.25, 0.075],
    [783.99, 0.15],
    [1046.5, 0.24],
  ];
  for (const [freq, inicio] of notas) {
    const i0 = Math.floor(inicio * TAXA);
    for (let i = i0; i < n; i++) {
      const t = (i - i0) / TAXA;
      const env = Math.min(1, t / 0.008) * Math.exp(-t * 3.2);
      const tom =
        Math.sin(2 * Math.PI * freq * t) +
        0.35 * Math.sin(2 * Math.PI * freq * 2 * t) * Math.exp(-t * 6) +
        0.12 * Math.sin(2 * Math.PI * freq * 3 * t) * Math.exp(-t * 9);
      saida[i] += tom * env * 0.5;
    }
  }
  for (const freq of [261.63, 392.0]) {
    for (let i = 0; i < n; i++) {
      const t = i / TAXA;
      const env = Math.min(1, t / 0.12) * Math.exp(-t * 2.2);
      saida[i] += Math.sin(2 * Math.PI * freq * t) * env * 0.18;
    }
  }
  return finalizar(saida, 0.42);
}

function brilho() {
  const dur = 1.0;
  const n = Math.floor(TAXA * dur);
  const rnd = aleatorio(42);
  const saida = new Array(n).fill(0);
  const tons = [2093, 2637, 3136, 3951, 2349, 2794];
  for (let k = 0; k < 11; k++) {
    const freq = tons[Math.floor(rnd() * tons.length)];
    const inicio = 0.02 + rnd() * 0.62;
    const i0 = Math.floor(inicio * TAXA);
    const ganho = 0.35 + rnd() * 0.65;
    for (let i = i0; i < n; i++) {
      const t = (i - i0) / TAXA;
      const env = Math.min(1, t / 0.003) * Math.exp(-t * 14);
      if (env < 1e-4) break;
      saida[i] += Math.sin(2 * Math.PI * freq * t) * env * ganho;
    }
  }
  return finalizar(saida, 0.22);
}

mkdirSync(DESTINO, { recursive: true });
for (const [nome, gerar] of [
  ['giro', giro],
  ['conquista', conquista],
  ['brilho', brilho],
]) {
  const arquivo = resolve(DESTINO, `${nome}.wav`);
  writeFileSync(arquivo, wav(gerar()));
  console.log(arquivo);
}
