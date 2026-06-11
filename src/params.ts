import { hashString, mulberry32 } from './rng';

export type Motif =
  | 'petal' // 花弁(植物系)
  | 'leaf' // 葉(植物系)
  | 'diamond' // 菱(幾何系)
  | 'scale' // 鱗(幾何系)
  | 'star' // 星=小輪の環(幾何系)
  | 'wave' // 波(流体系)
  | 'cloud' // 雲(流体系)
  | 'tomoe'; // 巴(流体系)

export type OuterRing = 'none' | 'thin' | 'thick' | 'double';
export type LineStyle = 'fill' | 'stroke';
export type CenterElement = 'none' | 'dot' | 'ring';
/** 副紋: 主モチーフの間に挟む意匠(剣片喰・星梅鉢の構造) */
export type Accent = 'none' | 'ken' | 'hoshi';

export interface KamonParams {
  seed: number;
  /** 対称数(回転コピー数) 3〜12 */
  n: number;
  motif: Motif;
  outerRing: OuterRing;
  /** 塗り主体 or 線主体 */
  lineStyle: LineStyle;
  strokeWidth: number;
  center: CenterElement;
  accent: Accent;
  /** モチーフ形状の連続バリエーション(0〜1) */
  v1: number;
  v2: number;
  v3: number;
}

/** NFKC正規化 + trim。大文字小文字や漢字/かなの違いはそのまま紋に反映する。 */
export function normalizeName(raw: string): string {
  return raw.normalize('NFKC').trim();
}

function pickWeighted<T>(rng: () => number, items: [T, number][]): T {
  const total = items.reduce((s, [, w]) => s + w, 0);
  let r = rng() * total;
  for (const [item, w] of items) {
    r -= w;
    if (r < 0) return item;
  }
  return items[items.length - 1][0];
}

/**
 * 名前から紋のパラメータを決定論的に生成する純関数。
 * rng の呼び出し順は決定論性の一部なので変更しないこと。
 */
export function generateKamon(name: string): KamonParams {
  const seed = hashString(normalizeName(name));
  const rng = mulberry32(seed);

  // 偶数寄りに重み付け(紋らしさ)
  let n = pickWeighted(rng, [
    [3, 2], [4, 3], [5, 3], [6, 4], [7, 2],
    [8, 4], [9, 1], [10, 2], [11, 1], [12, 2],
  ]);

  const motif = pickWeighted<Motif>(rng, [
    ['petal', 3], ['leaf', 2],
    ['diamond', 2], ['scale', 2], ['star', 2],
    ['wave', 2], ['cloud', 2], ['tomoe', 2],
  ]);

  // 巴は対称数が多いと頭部が融合して破綻するため 3〜6 に折り返す
  if (motif === 'tomoe' && n > 6) n = 3 + (n % 4);

  const outerRing = pickWeighted<OuterRing>(rng, [
    ['none', 25], ['thin', 25], ['thick', 30], ['double', 20],
  ]);

  const lineStyle = pickWeighted<LineStyle>(rng, [['fill', 65], ['stroke', 35]]);
  const strokeWidth = 1.8 + rng() * 1.4;

  const center = pickWeighted<CenterElement>(rng, [
    ['none', 45], ['dot', 30], ['ring', 25],
  ]);

  const v1 = rng();
  const v2 = rng();
  const v3 = rng();

  // 副紋。rng の消費は既存の列の末尾に追加し、上記パラメータの互換を保つ。
  // 扇形の間に余白を残すモチーフ・対称数でのみ採用する(融合・衝突の防止)。
  const accentRoll = pickWeighted<Accent>(rng, [['none', 60], ['ken', 22], ['hoshi', 18]]);
  const accentOk =
    n <= 10 && (motif === 'petal' || motif === 'leaf' || motif === 'diamond' || motif === 'scale');
  const accent = accentOk ? accentRoll : 'none';

  return { seed, n, motif, outerRing, lineStyle, strokeWidth, center, accent, v1, v2, v3 };
}
