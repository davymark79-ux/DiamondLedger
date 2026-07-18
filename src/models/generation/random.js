// Small seeded PRNG + sampling helpers for placeholder data generation.
// Deterministic seeding is purely so generated rosters are reproducible for
// testing/demos — this has nothing to do with the eventual sim engine's RNG.

/**
 * Mulberry32 — small, fast, decent-quality seeded PRNG.
 * @param {number} [seed]
 * @returns {() => number} function returning a float in [0, 1)
 */
export function createRng(seed = Date.now()) {
  let a = seed >>> 0;
  return function rng() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function randomInRange(rng, min, max) {
  return min + rng() * (max - min);
}

/** Integer in [min, max], inclusive of both ends. */
export function randomInt(rng, min, max) {
  return Math.floor(randomInRange(rng, min, max + 1));
}

/** @param {{value: any, weight: number}[]} options */
export function pickWeighted(rng, options) {
  const total = options.reduce((sum, o) => sum + o.weight, 0);
  let roll = rng() * total;
  for (const option of options) {
    roll -= option.weight;
    if (roll <= 0) return option.value;
  }
  return options[options.length - 1].value;
}

export function pick(rng, values) {
  return values[Math.floor(rng() * values.length)];
}

/** Box-Muller transform for a normally-distributed sample. */
export function gaussianRandom(rng, mean = 0, stdDev = 1) {
  let u = 0;
  let v = 0;
  while (u === 0) u = rng();
  while (v === 0) v = rng();
  const z = Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
  return mean + z * stdDev;
}
