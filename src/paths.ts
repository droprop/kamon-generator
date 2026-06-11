import type { KamonParams } from './params';

/**
 * パラメータ → 描画プラン(純関数・DOM非依存)。
 * プランは「上向きに描いた1モチーフ + 回転数 n + 固定要素(外環・中心)」で構成され、
 * render.ts がこれをSVG DOMに変換する。
 */

export const SIZE = 200;
const C = 100; // 中心座標
const RMAX = 90; // 紋全体の最大半径(viewBox端まで10の余白)

export type Paint = 'ink' | 'paper';

export type PlanElement =
  | {
      kind: 'path';
      d: string;
      paint: Paint;
      mode: 'fill' | 'stroke';
      strokeWidth?: number;
      evenOdd?: boolean;
    }
  | {
      kind: 'circle';
      cx: number;
      cy: number;
      r: number;
      paint: Paint;
      mode: 'fill' | 'stroke';
      strokeWidth?: number;
    };

export interface KamonPlan {
  size: number;
  /** 回転コピー数 */
  n: number;
  /** 上向き(12時方向)に描いた1モチーフ分の要素 */
  motifElements: PlanElement[];
  /** 回転しない要素(外環・中心) */
  staticElements: PlanElement[];
}

/** 角度 a(ラジアン、0=真上、時計回り正)と半径から座標へ */
function polar(r: number, a: number): [number, number] {
  return [C + r * Math.sin(a), C - r * Math.cos(a)];
}

const f = (x: number) => Number(x.toFixed(2));
const pt = (p: [number, number]) => `${f(p[0])} ${f(p[1])}`;

/** 点を中心(C,C)まわりに ang(ラジアン、時計回り正)回転 */
function rotPt(p: [number, number], ang: number): [number, number] {
  const dx = p[0] - C;
  const dy = p[1] - C;
  const c = Math.cos(ang);
  const s = Math.sin(ang);
  return [C + dx * c - dy * s, C + dx * s + dy * c];
}

/** 3点を通る二次ベジェの制御点(t=0.5 で mid を通る) */
function quadControl(p1: [number, number], p2: [number, number], mid: [number, number]): [number, number] {
  return [2 * mid[0] - (p1[0] + p2[0]) / 2, 2 * mid[1] - (p1[1] + p2[1]) / 2];
}

interface MotifCtx {
  /** モチーフが収まるべき最大半径 */
  m: number;
  /** 1モチーフに割り当てられた半角(ラジアン) = π/n */
  ha: number;
  p: KamonParams;
}

/* ---------------- 植物系 ---------------- */

/** 花弁: 中心付近から外周へ伸びる弁。v2 で先端の丸み(0=尖り)、v3 が高いと桜式の切れ込み */
function petal({ m, ha, p }: MotifCtx): PlanElement[] {
  const r0 = 10;
  const w = Math.min(m * Math.sin(ha) * (0.78 + 0.3 * p.v1), m * 0.5);
  const tw = w * 0.55 * p.v2; // 先端の半幅
  const h = m - r0;
  const yb = C - r0;
  const yt = C - m;
  // 先端: 丸い弁(tw が十分)かつ v3 が高ければ中央に切れ込みを入れる(桜)
  const notch = p.v3 > 0.62 && tw > 3 ? h * 0.1 : 0;
  const tip = notch
    ? `C ${f(C - tw * 0.7)} ${f(yt)} ${f(C - tw * 0.25)} ${f(yt)} ${C} ${f(yt + notch)} ` +
      `C ${f(C + tw * 0.25)} ${f(yt)} ${f(C + tw * 0.7)} ${f(yt)} ${f(C + tw)} ${f(yt + h * 0.06)} `
    : `C ${f(C - tw * 0.55)} ${f(yt)} ${f(C + tw * 0.55)} ${f(yt)} ${f(C + tw)} ${f(yt + h * 0.06)} `;
  const d =
    `M ${C} ${f(yb)} ` +
    `C ${f(C - w)} ${f(yb - h * 0.18)} ${f(C - w)} ${f(yb - h * 0.62)} ${f(C - tw)} ${f(yt + h * 0.06)} ` +
    tip +
    `C ${f(C + w)} ${f(yb - h * 0.62)} ${f(C + w)} ${f(yb - h * 0.18)} ${C} ${f(yb)} Z`;
  return [{ kind: 'path', d, paint: 'ink', mode: 'fill' }];
}

/** 葉: 尖った弁 + 中央の葉脈(塗りでは白抜き) */
function leaf({ m, ha, p }: MotifCtx): PlanElement[] {
  const r0 = 10;
  const w = Math.min(m * Math.sin(ha) * (0.6 + 0.25 * p.v1), m * 0.42);
  const h = m - r0;
  const yb = C - r0;
  const yt = C - m;
  const d =
    `M ${C} ${f(yb)} ` +
    `C ${f(C - w)} ${f(yb - h * 0.22)} ${f(C - w * 0.92)} ${f(yb - h * 0.68)} ${C} ${f(yt)} ` +
    `C ${f(C + w * 0.92)} ${f(yb - h * 0.68)} ${f(C + w)} ${f(yb - h * 0.22)} ${C} ${f(yb)} Z`;
  const veinTop = yt + h * 0.18;
  const vein = `M ${C} ${f(yb - h * 0.06)} L ${C} ${f(veinTop)}`;
  return [
    { kind: 'path', d, paint: 'ink', mode: 'fill' },
    { kind: 'path', d: vein, paint: 'paper', mode: 'stroke', strokeWidth: Math.max(1.2, w * 0.12) },
  ];
}

/* ---------------- 幾何系 ---------------- */

/** 菱: 外向きの菱形。v2 が高いと入れ子(白抜きの内菱) */
function diamond({ m, ha, p }: MotifCtx): PlanElement[] {
  const rIn = m * (0.18 + 0.15 * p.v1);
  const hh = (m - rIn) / 2; // 半高
  const dc = (m + rIn) / 2; // 菱中心の半径
  const w = Math.min(dc * Math.sin(ha) * 0.95, hh * (0.5 + 0.3 * p.v2));
  const top = polar(m, 0);
  const bot = polar(rIn, 0);
  const mid = C - dc;
  const outer = `M ${pt(top)} L ${f(C + w)} ${f(mid)} L ${pt(bot)} L ${f(C - w)} ${f(mid)} Z`;
  const els: PlanElement[] = [];
  if (p.v3 > 0.55) {
    // 入れ子菱: evenodd で内側を抜く
    const s = 0.45;
    const inner =
      ` M ${C} ${f(C - dc - hh * s)} L ${f(C + w * s)} ${f(mid)} ` +
      `L ${C} ${f(C - dc + hh * s)} L ${f(C - w * s)} ${f(mid)} Z`;
    els.push({ kind: 'path', d: outer + inner, paint: 'ink', mode: 'fill', evenOdd: true });
  } else {
    els.push({ kind: 'path', d: outer, paint: 'ink', mode: 'fill' });
  }
  return els;
}

/** 鱗: 外向きの三角形。v3 が高いと白抜きの内鱗(入れ子) */
function scale({ m, ha, p }: MotifCtx): PlanElement[] {
  const rb = m * (0.22 + 0.18 * p.v1);
  const spread = ha * (0.7 + 0.25 * p.v2);
  const apex = polar(m, 0);
  const bl = polar(rb, -spread);
  const br = polar(rb, spread);
  const outer = `M ${pt(apex)} L ${pt(br)} L ${pt(bl)} Z`;
  if (p.v3 > 0.62) {
    const g: [number, number] = [
      (apex[0] + bl[0] + br[0]) / 3,
      (apex[1] + bl[1] + br[1]) / 3,
    ];
    const shrink = (q: [number, number]): [number, number] => [
      g[0] + (q[0] - g[0]) * 0.45,
      g[1] + (q[1] - g[1]) * 0.45,
    ];
    const inner = ` M ${pt(shrink(apex))} L ${pt(shrink(br))} L ${pt(shrink(bl))} Z`;
    return [{ kind: 'path', d: outer + inner, paint: 'ink', mode: 'fill', evenOdd: true }];
  }
  return [{ kind: 'path', d: outer, paint: 'ink', mode: 'fill' }];
}

/** 星: 小円の環。v3 が高いと蛇の目(白抜き穴) */
function star({ m, ha, p }: MotifCtx): PlanElement[] {
  const rm = m * (0.58 + 0.12 * p.v1);
  const cr = Math.min(m - rm - 1, rm * Math.sin(ha) * (0.72 + 0.2 * p.v2));
  const [cx, cy] = polar(rm, 0);
  const els: PlanElement[] = [{ kind: 'circle', cx: f(cx), cy: f(cy), r: f(cr), paint: 'ink', mode: 'fill' }];
  if (p.v3 > 0.5 && cr > 6) {
    els.push({ kind: 'circle', cx: f(cx), cy: f(cy), r: f(cr * 0.45), paint: 'paper', mode: 'fill' });
  }
  return els;
}

/* ---------------- 流体系 ---------------- */

/** 外周弧 + 内縁ベジェで作る三日月形 */
function crescentD(rOut: number, a1: number, a2: number, t: number): string {
  const half = (a2 - a1) / 2;
  const amid = (a1 + a2) / 2;
  const midR = rOut * Math.cos(half); // 弦の中点の半径
  const p1 = polar(rOut, a1);
  const p2 = polar(rOut, a2);
  const innerMid = polar(Math.max(midR * 0.6, rOut - t), amid);
  const cIn = quadControl(p2, p1, innerMid);
  return `M ${pt(p1)} A ${f(rOut)} ${f(rOut)} 0 0 1 ${pt(p2)} Q ${pt(cIn)} ${pt(p1)} Z`;
}

/** 波: 青海波式に重ねた2〜3段の三日月。わずかな非対称で流れを出す */
function wave({ m, ha, p }: MotifCtx): PlanElement[] {
  const bands = p.v3 > 0.45 ? 3 : 2;
  const skew = (p.v1 - 0.5) * 0.2; // 流れの向き
  const els: PlanElement[] = [];
  for (let k = 0; k < bands; k++) {
    const rOut = m * (1 - 0.21 * k);
    const half = Math.min(ha * (0.95 - 0.1 * k), 0.85 - 0.14 * k);
    const t = m * (0.13 + 0.05 * p.v2) * (1 - 0.12 * k);
    els.push({
      kind: 'path',
      d: crescentD(rOut, -half * (1 + skew), half * (1 - skew), t),
      paint: 'ink',
      mode: 'fill',
    });
  }
  return els;
}

/** 雲: 三こぶの雲形 */
function cloud({ m, ha, p }: MotifCtx): PlanElement[] {
  const rb = m * (0.5 + 0.1 * p.v1); // 雲の底の半径(外周寄りに置いて存在感を出す)
  // 底の半径での扇形幅に収め、隣の雲と融合しないようにする
  const W = Math.min(rb * Math.sin(ha) * 1.02, m * 0.5);
  const H = Math.min(m - rb - 1, W * (0.95 + 0.35 * p.v2), m * 0.36);
  const y0 = C - rb;
  const d =
    `M ${f(C - W)} ${f(y0)} ` +
    `C ${f(C - W * 1.06)} ${f(y0 - H * 0.6)} ${f(C - W * 0.52)} ${f(y0 - H * 0.7)} ${f(C - W * 0.34)} ${f(y0 - H * 0.58)} ` +
    `C ${f(C - W * 0.48)} ${f(y0 - H * 1.04)} ${f(C + W * 0.48)} ${f(y0 - H * 1.04)} ${f(C + W * 0.34)} ${f(y0 - H * 0.58)} ` +
    `C ${f(C + W * 0.52)} ${f(y0 - H * 0.7)} ${f(C + W * 1.06)} ${f(y0 - H * 0.6)} ${f(C + W)} ${f(y0)} ` +
    `C ${f(C + W * 0.5)} ${f(y0 + H * 0.1)} ${f(C - W * 0.5)} ${f(y0 + H * 0.1)} ${f(C - W)} ${f(y0)} Z`;
  return [{ kind: 'path', d, paint: 'ink', mode: 'fill' }];
}

/** 折れ線をCatmull-Rom由来の三次ベジェ列でなめらかに結ぶ(始点は現在位置とする) */
function smoothThrough(points: [number, number][]): string {
  let d = '';
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[Math.max(0, i - 1)];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[Math.min(points.length - 1, i + 2)];
    const c1: [number, number] = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2: [number, number] = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    d += ` C ${pt(c1)} ${pt(c2)} ${pt(p2)}`;
  }
  return d;
}

/** 巴: 頭(円)から外周に沿って尾が伸びる勾玉形 */
function tomoe({ m, ha, p }: MotifCtx): PlanElement[] {
  const sinHa = Math.sin(ha);
  // 隣の頭と接しない最大の頭半径(rm = m - rh の位置で rh ≤ rm·sin(ha)·0.9)
  const rhMax = (m * sinHa * 0.9) / (1 + sinHa * 0.9);
  const rh = Math.min(m * 0.26, rhMax);
  const rm = m - rh; // 頭の中心半径
  const ro = m; // 尾の外縁半径
  const ri = rm - rh;
  // 尾は自分の扇形(2·ha)の中に収め、隣と融合しないようにする
  const span = 2 * ha * (0.72 + 0.18 * p.v1);
  const pTop = polar(ro, 0);
  const pTip = polar(ro, span);
  // 内縁: 尾の先端(厚みゼロ)から頭の下端へ、半径が ro→ri に減衰する渦
  const steps = 10;
  const spiral: [number, number][] = [];
  for (let i = 0; i <= steps; i++) {
    const u = i / steps;
    const r = ri + (ro - ri) * Math.pow(1 - u, 1.6);
    spiral.push(polar(r, span * (1 - u)));
  }
  const d =
    `M ${pt(pTop)} A ${f(ro)} ${f(ro)} 0 0 1 ${pt(pTip)}` +
    smoothThrough(spiral) +
    ` A ${f(rh)} ${f(rh)} 0 0 1 ${pt(pTop)} Z`;
  return [{ kind: 'path', d, paint: 'ink', mode: 'fill' }];
}

const MOTIF_FNS: Record<KamonParams['motif'], (ctx: MotifCtx) => PlanElement[]> = {
  petal, leaf, diamond, scale, star, wave, cloud, tomoe,
};

/* ---------------- 副紋(主モチーフの間 = 半角 ha 回した位置に挟む) ---------------- */

/**
 * 剣: 主モチーフの間に立つ細身の剣先(剣片喰の構造)。
 * 主モチーフの張り出しが最も細る外周側(0.66m〜m)だけに置き、衝突を避ける。
 */
function kenAccent(m: number, ha: number): PlanElement[] {
  const w = Math.min(m * Math.sin(ha) * 0.22, m * 0.05);
  if (w < 1.1) return [];
  const r0 = m * 0.66;
  const rm = m * 0.82;
  const up: [number, number][] = [
    [C, C - m],
    [C + w, C - rm],
    [C + w * 0.5, C - r0],
    [C - w * 0.5, C - r0],
    [C - w, C - rm],
  ];
  const q = up.map((v) => rotPt(v, ha));
  const d = `M ${pt(q[0])} L ${pt(q[1])} L ${pt(q[2])} L ${pt(q[3])} L ${pt(q[4])} Z`;
  return [{ kind: 'path', d, paint: 'ink', mode: 'fill' }];
}

/** 星: 主モチーフの間に置く珠(星梅鉢の構造) */
function hoshiAccent(m: number, ha: number): PlanElement[] {
  const r = Math.min(m * Math.sin(ha) * 0.3, m * 0.075);
  if (r < 1.6) return [];
  const [cx, cy] = rotPt([C, C - m * 0.82], ha);
  return [{ kind: 'circle', cx: f(cx), cy: f(cy), r: f(r), paint: 'ink', mode: 'fill' }];
}

/* ---------------- 合成 ---------------- */

export function buildPlan(p: KamonParams): KamonPlan {
  const statics: PlanElement[] = [];
  let motifMax: number;

  // 外環。stroke は中心線基準なので外縁が RMAX に揃うよう半径を引く
  switch (p.outerRing) {
    case 'thin': {
      const w = 2.5;
      statics.push({ kind: 'circle', cx: C, cy: C, r: RMAX - w / 2, paint: 'ink', mode: 'stroke', strokeWidth: w });
      motifMax = RMAX - w - 6;
      break;
    }
    case 'thick': {
      const w = 7;
      statics.push({ kind: 'circle', cx: C, cy: C, r: RMAX - w / 2, paint: 'ink', mode: 'stroke', strokeWidth: w });
      motifMax = RMAX - w - 6;
      break;
    }
    case 'double': {
      const w1 = 4.5;
      const w2 = 1.5;
      const gap = 3.5;
      statics.push({ kind: 'circle', cx: C, cy: C, r: RMAX - w1 / 2, paint: 'ink', mode: 'stroke', strokeWidth: w1 });
      statics.push({ kind: 'circle', cx: C, cy: C, r: RMAX - w1 - gap - w2 / 2, paint: 'ink', mode: 'stroke', strokeWidth: w2 });
      motifMax = RMAX - w1 - gap - w2 - 5;
      break;
    }
    default:
      motifMax = RMAX - 2;
  }

  // 線主体の場合、ストロークの外側はみ出し分を確保
  const sw = p.strokeWidth;
  if (p.lineStyle === 'stroke') motifMax -= sw / 2;

  const ctx: MotifCtx = { m: motifMax, ha: Math.PI / p.n, p };
  let motifElements = MOTIF_FNS[p.motif](ctx);

  // 副紋: 主モチーフと一緒に回転するよう motifElements に加える
  if (p.accent === 'ken') motifElements = [...motifElements, ...kenAccent(motifMax, ctx.ha)];
  else if (p.accent === 'hoshi') motifElements = [...motifElements, ...hoshiAccent(motifMax, ctx.ha)];

  // 線主体: 塗り要素をアウトライン化。白抜き(paper)要素は墨線に置き換える
  if (p.lineStyle === 'stroke') {
    motifElements = motifElements.map((el) => ({
      ...el,
      paint: 'ink' as Paint,
      mode: 'stroke' as const,
      strokeWidth: el.mode === 'stroke' ? el.strokeWidth : sw,
    }));
  }

  // 中心要素
  if (p.center === 'dot') {
    statics.push({ kind: 'circle', cx: C, cy: C, r: f(3.5 + 3 * p.v2), paint: 'ink', mode: 'fill' });
  } else if (p.center === 'ring') {
    const r = 6 + 4 * p.v2;
    statics.push({ kind: 'circle', cx: C, cy: C, r: f(r), paint: 'ink', mode: 'stroke', strokeWidth: 2 });
  }

  return { size: SIZE, n: p.n, motifElements, staticElements: statics };
}
