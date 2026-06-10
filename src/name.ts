import type { KamonParams, Motif, OuterRing } from './params';

/**
 * パラメータから決定論的に和風の紋名を合成する。
 * 形式: {外環}{陰?}{数詞}{モチーフ}(例:「丸に陰六つ花」「細輪に三つ巴」)
 */

const MOTIF_NAMES: Record<Motif, string> = {
  petal: '花',
  leaf: '葉',
  diamond: '菱',
  scale: '鱗',
  star: '星',
  wave: '波',
  cloud: '雲',
  tomoe: '巴',
};

const COUNT_NAMES: Record<number, string> = {
  3: '三つ', 4: '四つ', 5: '五つ', 6: '六つ', 7: '七つ',
  8: '八つ', 9: '九つ', 10: '十', 11: '十一', 12: '十二',
};

const RING_PREFIX: Record<OuterRing, string> = {
  none: '',
  thin: '細輪に',
  thick: '丸に',
  double: '二重輪に',
};

export function kamonName(p: KamonParams): string {
  const kage = p.lineStyle === 'stroke' ? '陰' : ''; // 陰=輪郭線のみの紋の伝統的呼称
  return `${RING_PREFIX[p.outerRing]}${kage}${COUNT_NAMES[p.n]}${MOTIF_NAMES[p.motif]}`;
}
