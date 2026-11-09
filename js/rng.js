// 小型亂數工具。rng 是一個回傳 [0, 1) 的函式，測試時可以換成固定種子的版本。

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function rng() {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const randInt = (rng, min, max) => min + Math.floor(rng() * (max - min + 1));

export const pick = (rng, arr) => arr[Math.floor(rng() * arr.length)];

/** entries: [[value, weight], ...] */
export function weighted(rng, entries) {
  let total = 0;
  for (const e of entries) total += Math.max(0, e[1]);
  let r = rng() * total;
  for (const [value, w] of entries) {
    if (w <= 0) continue;
    r -= w;
    if (r < 0) return value;
  }
  for (let i = entries.length - 1; i >= 0; i--) if (entries[i][1] > 0) return entries[i][0];
  return entries[entries.length - 1][0];
}

export function shuffle(rng, arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
