/**
 * Efeitos sonoros da animação de novo nível. Os WAVs são os mesmos do app
 * (`code/mobile/assets/gamificacao/sons`, publicados por `publicDir`).
 *
 * Política de reprodução automática dos navegadores: o AudioContext só toca
 * depois de um gesto do usuário. Se ele estiver suspenso (página aberta sem
 * clique), a animação segue em silêncio; nunca há erro nem espera por áudio.
 */
export const SONS_CONQUISTA = {
  giro: '/gamificacao/sons/giro.wav',
  conquista: '/gamificacao/sons/conquista.wav',
  brilho: '/gamificacao/sons/brilho.wav',
};

const CHAVE_MUDO = 'ajudaai.sons.conquista.mudo';
const ouvintes = new Set();

export function somSilenciado() {
  try {
    return localStorage.getItem(CHAVE_MUDO) === '1';
  } catch {
    return false;
  }
}

export function definirSomSilenciado(mudo) {
  try {
    if (mudo) localStorage.setItem(CHAVE_MUDO, '1');
    else localStorage.removeItem(CHAVE_MUDO);
  } catch {
    /* sem armazenamento: vale só nesta página */
  }
  for (const ouvinte of ouvintes) ouvinte(Boolean(mudo));
}

/** Avisa quando o usuário liga/desliga o som (painel e animação juntos). */
export function ouvirSilenciado(ouvinte) {
  ouvintes.add(ouvinte);
  return () => ouvintes.delete(ouvinte);
}

let contexto = null;
const buffers = new Map();

function obterContexto() {
  if (contexto) return contexto;
  const Classe = typeof window !== 'undefined' && (window.AudioContext || window.webkitAudioContext);
  if (!Classe) return null;
  try {
    contexto = new Classe();
  } catch {
    contexto = null;
  }
  return contexto;
}

async function carregar(nome) {
  const ctx = obterContexto();
  if (!ctx) return null;
  if (!buffers.has(nome)) {
    buffers.set(nome, fetch(SONS_CONQUISTA[nome])
      .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error('som indisponível'))))
      .then((dados) => ctx.decodeAudioData(dados))
      .catch(() => {
        buffers.delete(nome);
        return null;
      }));
  }
  return buffers.get(nome);
}

/** Baixa e decodifica os três sons antes de precisar deles. */
export function prepararSons() {
  if (somSilenciado()) return;
  for (const nome of Object.keys(SONS_CONQUISTA)) carregar(nome);
}

/**
 * Libera o áudio dentro de um gesto (clique em "Reproduzir animação").
 * Fora de um gesto, `resume()` é recusado em silêncio.
 */
export function desbloquearAudio() {
  const ctx = obterContexto();
  if (ctx?.state === 'suspended') ctx.resume().catch(() => {});
}

/** Toca um efeito, se o som estiver ligado e o navegador permitir. */
export async function tocarSom(nome, volume = 1) {
  if (somSilenciado() || !SONS_CONQUISTA[nome]) return;
  const ctx = obterContexto();
  if (!ctx) return;
  if (ctx.state === 'suspended') {
    try {
      await ctx.resume();
    } catch {
      return;
    }
    if (ctx.state !== 'running') return;
  }
  const buffer = await carregar(nome);
  if (!buffer || somSilenciado()) return;
  const fonte = ctx.createBufferSource();
  const ganho = ctx.createGain();
  ganho.gain.value = volume;
  fonte.buffer = buffer;
  fonte.connect(ganho).connect(ctx.destination);
  fonte.start();
}
