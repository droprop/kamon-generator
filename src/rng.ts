/**
 * 決定論的ハッシュと乱数。
 * 同じ入力文字列からは必ず同じ乱数列が得られる。
 */

/** FNV-1a 32bit。UTF-8バイト列に対して計算する。 */
export function hashString(str: string): number {
  const bytes = new TextEncoder().encode(str);
  let h = 0x811c9dc5;
  for (const b of bytes) {
    h ^= b;
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** mulberry32。seed から [0, 1) の決定論的乱数列を返す。 */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), a | 1);
    t = (t + Math.imul(t ^ (t >>> 7), t | 61)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
