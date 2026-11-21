/**
 * Deterministic PRNG (xorshift32) built only from 32-bit integer ops, so a
 * seed yields the same sequence on every engine and platform.
 */
export interface Rng {
  /** Uniform in [0, 1). */
  next(): number;
  /** Uniform in [-1, 1). */
  signed(): number;
}

/** Avalanche-mixes a seed so nearby seeds give unrelated sequences. */
function mix(seed: number): number {
  let h = seed >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0 || 0x6d2b79f5;
}

export function createRng(seed: number): Rng {
  let s = mix(seed);
  const next = (): number => {
    s ^= s << 13;
    s >>>= 0;
    s ^= s >>> 17;
    s ^= s << 5;
    s >>>= 0;
    return s / 4294967296;
  };
  return { next, signed: () => next() * 2 - 1 };
}

/**
 * Independent stream for one purpose (`stream`) and item (`index`) of an
 * element. Separate streams keep, e.g., the outline wobble unchanged when the
 * fill style changes, and each hatch line stable when others appear.
 */
export function rngFor(seed: number, stream: number, index = 0): Rng {
  return createRng(seed ^ Math.imul(stream + 1, 0x27d4eb2d) ^ Math.imul(index + 1, 0x165667b1));
}
