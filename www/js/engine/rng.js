// rng.js — PRNG determinista con semilla. NUNCA Math.random en el engine.
// mulberry32: rapido, 32-bit, suficiente para simulacion de juego.

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Hash de dos enteros a semilla (para derivar sub-semillas por pelea, etc.)
export function hash2(a, b) {
  let h = 2166136261 >>> 0;
  h = Math.imul(h ^ (a >>> 0), 16777619) >>> 0;
  h = Math.imul(h ^ (b >>> 0), 16777619) >>> 0;
  h = Math.imul(h ^ (a >>> 16), 16777619) >>> 0;
  h = Math.imul(h ^ (b >>> 16), 16777619) >>> 0;
  return h >>> 0;
}

// Wrapper con helpers. Se inyecta en world/pelea. Estado serializable (seed + state).
export class Rng {
  constructor(seed) {
    this.seed = seed >>> 0;
    this.state = this.seed;
  }
  // secuencia identica a mulberry32(seed)
  next() {
    let a = this.state | 0;
    a = (a + 0x6d2b79f5) | 0;
    this.state = a;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  uniform(min, max) { return min + this.next() * (max - min); }
  int(min, maxIncl) { return min + Math.floor(this.next() * (maxIncl - min + 1)); }
  chance(p) { return this.next() < p; }
  pick(arr) { return arr[Math.floor(this.next() * arr.length)]; }
  // Distribucion triangular (talento sesgado)
  triangular(min, mode, max) {
    const u = this.next();
    const c = (mode - min) / (max - min);
    if (u < c) return min + Math.sqrt(u * (max - min) * (mode - min));
    return max - Math.sqrt((1 - u) * (max - min) * (max - mode));
  }
  // Ruido acotado ~ uniforme centrado
  noise(span) { return (this.next() * 2 - 1) * span; }
  fork(salt) { return new Rng(hash2(this.seed, salt >>> 0)); }
}

export function sigmoid(x) { return 1 / (1 + Math.exp(-x)); }
export function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }
