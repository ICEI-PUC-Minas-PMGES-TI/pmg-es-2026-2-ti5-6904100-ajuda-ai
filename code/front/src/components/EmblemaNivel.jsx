/**
 * Emblema definitivo do nível (pixel art). Os PNGs ficam em
 * `code/mobile/assets/gamificacao` e a web os publica por `publicDir`.
 */
export function srcEmblemaNivel(numero) {
  const n = Number(numero);
  if (!Number.isInteger(n) || n < 1 || n > 10) return null;
  return `/gamificacao/nivel_${String(n).padStart(2, '0')}.png`;
}

export function EmblemaNivel({ numero, nome }) {
  const src = srcEmblemaNivel(numero);
  const alt = nome
    ? `Emblema do nível ${numero}, ${nome}`
    : `Emblema do nível ${numero}`;
  if (!src) {
    return (
      <span className="emblema-nivel emblema-nivel-fallback" role="img" aria-label={alt}>
        {numero}
      </span>
    );
  }
  return (
    <img
      className="emblema-nivel"
      src={src}
      alt={alt}
      width={448}
      height={448}
    />
  );
}
