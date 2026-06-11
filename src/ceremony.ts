import type { KamonPlan } from './paths';
import { mulberry32 } from './rng';

/**
 * 生成セレモニー「一滴の墨が、あなたの紋に化ける」— 序破急の三段構成。
 *  序、落墨 — 一滴の墨が紋場に落ち、跳ね、膨らむ(溜め)
 *  破、爆ぜ — 墨溜まりが弾け、n本の筆勢が走り、紋が回転方向に加速しながら叩き込まれる
 *  急、決め — 外環が一閃で引かれ、墨飛沫が散って完成する
 *
 * 性能の原則: ほぼ全てを transform / opacity のみ(コンポジタ合成)で駆動し、
 * ペイント負荷のある stroke-dashoffset は外環の一閃などごく少数に限定する。
 *
 * 書き出し安全の原則: 演出は全て WAAPI で、一時要素は属性レベルでは常に不可視
 * (opacity="0" または dashoffset=全長)。本体要素の属性には一切触れないため、
 * 演出のどの瞬間に SVG をシリアライズしても完成形が得られる。
 */

const NS = 'http://www.w3.org/2000/svg';

export function reducedMotion(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export interface Ceremony {
  /** 紋が完成し、余韻(衝撃波・残光・銘の表示)を始めるべき時刻(ms) */
  climaxAt: number;
  finished: Promise<void>;
  cancel(): void;
}

/* ---------- 拍子(ms) ---------- */
const T_BURST = 620; // 落墨と溜めの長さ
const COPY_WINDOW = 560; // 全コピーが叩き込まれる窓
const T_RING = T_BURST + 720; // 外環の一閃
const CLIMAX = T_RING + 440;

const SNAP = 'cubic-bezier(0.2, 0.85, 0.25, 1)'; // 筆を打ち付けて止める
const SWEEP = 'cubic-bezier(0.33, 0, 0.15, 1)'; // 一閃

function setAttrs(el: SVGElement, attrs: Record<string, string>): void {
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
}

/** 要素が画面上で見えている色(fill 優先、なければ stroke) */
function visibleColor(el: SVGElement): string {
  const fill = el.getAttribute('fill');
  if (fill && fill !== 'none') return fill;
  return el.getAttribute('stroke') ?? '#000';
}

export function playCeremony(
  svg: SVGSVGElement,
  plan: KamonPlan,
  opts: { inverted: boolean; seed: number },
): Ceremony {
  const anims: Animation[] = [];
  const temps: Element[] = [];
  const wrappers: SVGGElement[] = [];
  const C = plan.size / 2;
  const origin = `${C}px ${C}px`;

  // 構成: children[0]=背景rect, [1..n]=回転コピー群, 残り=固定要素(外環・中心)
  const kids = Array.from(svg.children) as SVGElement[];
  const groups = kids.slice(1, 1 + plan.n);
  const statics = kids.slice(1 + plan.n);
  const ink = groups[0]?.firstElementChild
    ? visibleColor(groups[0].firstElementChild as SVGElement)
    : '#211c14';

  /** 一時要素を生成して追加(属性 opacity=0 で書き出しには写らない) */
  const temp = <K extends keyof SVGElementTagNameMap>(
    tag: K,
    attrs: Record<string, string>,
  ): SVGElementTagNameMap[K] => {
    const el = document.createElementNS(NS, tag);
    setAttrs(el, { opacity: '0', ...attrs });
    svg.appendChild(el);
    temps.push(el);
    return el;
  };

  /** 本体要素を無属性の <g> で包む(transform 演出用。終了時に外す) */
  const wrap = (el: SVGElement): SVGGElement => {
    const w = document.createElementNS(NS, 'g');
    el.replaceWith(w);
    w.appendChild(el);
    w.style.transformOrigin = origin;
    wrappers.push(w);
    return w;
  };

  /* ---------- 序、落墨 ---------- */

  const pool = temp('circle', { cx: String(C), cy: String(C), r: '11', fill: ink });
  pool.style.transformOrigin = origin;
  anims.push(
    pool.animate(
      [
        { opacity: 1, transform: 'translateY(-30px) scale(0.22)', easing: 'cubic-bezier(0.55, 0, 1, 1)' },
        { opacity: 1, transform: 'translateY(0) scale(0.55)', offset: 0.18 }, // 着滴
        { opacity: 1, transform: 'scale(1.2, 0.78)', offset: 0.3 }, // 潰れ
        { opacity: 1, transform: 'scale(0.9, 1.08)', offset: 0.44 },
        { opacity: 1, transform: 'scale(1.42)', offset: 0.82, easing: 'cubic-bezier(0.2, 0.7, 0.3, 1)' }, // 溜め
        { opacity: 1, transform: 'scale(1.48)' },
      ],
      { duration: T_BURST, fill: 'both' },
    ),
  );
  // 破裂の瞬間、鋭く縮んで消える
  anims.push(
    pool.animate(
      [
        { opacity: 1, transform: 'scale(1.48)' },
        { opacity: 0, transform: 'scale(0.15)' },
      ],
      { delay: T_BURST, duration: 150, easing: 'cubic-bezier(0.6, 0, 0.8, 1)', fill: 'forwards' },
    ),
  );

  // 着滴の跳ね墨
  const rng = mulberry32(opts.seed ^ 0x9e3779b9);
  for (let i = 0; i < 6; i++) {
    const a = rng() * Math.PI * 2;
    const d = 14 + rng() * 16;
    const drop = temp('circle', {
      cx: String(C), cy: String(C), r: (0.9 + rng() * 1.3).toFixed(2), fill: ink,
    });
    anims.push(
      drop.animate(
        [
          { opacity: 0.9, transform: 'translate(0, 0) scale(0.6)' },
          { opacity: 0, transform: `translate(${(Math.sin(a) * d).toFixed(1)}px, ${(-Math.cos(a) * d).toFixed(1)}px) scale(0.2)` },
        ],
        { delay: 130 + i * 12, duration: 330, easing: 'cubic-bezier(0.1, 0.6, 0.4, 1)', fill: 'forwards' },
      ),
    );
  }

  /* ---------- 破、爆ぜ ---------- */

  // n本の筆勢が外へ走る(あなたの名前が決めた対称数)
  for (let k = 0; k < plan.n; k++) {
    const a = (2 * Math.PI * k) / plan.n;
    const [r0, r1] = [12, 86];
    const line = temp('line', {
      x1: (C + r0 * Math.sin(a)).toFixed(2),
      y1: (C - r0 * Math.cos(a)).toFixed(2),
      x2: (C + r1 * Math.sin(a)).toFixed(2),
      y2: (C - r1 * Math.cos(a)).toFixed(2),
      stroke: ink,
      'stroke-width': '1.1',
      'stroke-linecap': 'round',
      'stroke-dasharray': String(r1 - r0),
      'stroke-dashoffset': String(r1 - r0),
    });
    line.removeAttribute('opacity'); // dashoffset=全長で既に不可視
    const at = T_BURST + k * 14;
    anims.push(
      line.animate(
        [
          { strokeDashoffset: String(r1 - r0), opacity: 0.4 },
          { strokeDashoffset: '0', opacity: 0.4 },
        ],
        { delay: at, duration: 190, easing: SWEEP, fill: 'both' },
      ),
    );
    anims.push(
      line.animate([{ opacity: 0.4 }, { opacity: 0 }], {
        delay: at + 220, duration: 260, easing: 'ease-out', fill: 'forwards',
      }),
    );
  }

  // 紋のコピーが回転方向に、加速しながら叩き込まれる
  const flingAt = (i: number): number =>
    T_BURST + 30 + COPY_WINDOW * Math.pow(i / Math.max(plan.n - 1, 1), 0.72);
  groups.forEach((group, i) => {
    const at = flingAt(i);

    // 残像(筆の勢い)— コピー本体の回転属性を保つため、無属性ラッパー側を動かす
    const ghostWrap = document.createElementNS(NS, 'g');
    ghostWrap.setAttribute('opacity', '0');
    ghostWrap.style.transformOrigin = origin;
    ghostWrap.appendChild(group.cloneNode(true));
    svg.appendChild(ghostWrap);
    temps.push(ghostWrap);
    anims.push(
      ghostWrap.animate(
        [
          { opacity: 0.3, transform: 'rotate(-46deg) scale(0.8)' },
          { opacity: 0, transform: 'rotate(-6deg) scale(1)' },
        ],
        { delay: at, duration: 300, easing: SNAP, fill: 'forwards' },
      ),
    );

    // 本体
    anims.push(
      wrap(group).animate(
        [
          { opacity: 0, transform: 'rotate(-30deg) scale(0.5)' },
          { opacity: 1, transform: 'rotate(4deg) scale(1.06)', offset: 0.65 },
          { opacity: 1, transform: 'rotate(0deg) scale(1)' },
        ],
        { delay: at, duration: 330, easing: SNAP, fill: 'backwards' },
      ),
    );
  });

  // 紋全体がわずかに回り込みながら据わる(勢いの余韻)
  svg.style.transformOrigin = '50% 50%';
  anims.push(
    svg.animate(
      [{ transform: 'rotate(-2.5deg)' }, { transform: 'rotate(0deg)' }],
      { delay: T_BURST, duration: 1000, easing: 'cubic-bezier(0.16, 0.8, 0.25, 1)' },
    ),
  );

  /* ---------- 急、決め ---------- */

  statics.forEach((el, i) => {
    const at = T_RING + i * 130;
    const isSweep = el instanceof SVGCircleElement && el.getAttribute('fill') === 'none';
    if (isSweep) {
      // 外環の一閃: 描線クローンが走り、本体が追って現れる
      const r = Number(el.getAttribute('r') ?? 1);
      const len = 2 * Math.PI * r;
      const clone = el.cloneNode(true) as SVGElement;
      setAttrs(clone, {
        'stroke-dasharray': String(len),
        'stroke-dashoffset': String(len),
        'stroke-linecap': 'round',
      });
      el.parentNode!.insertBefore(clone, el.nextSibling);
      temps.push(clone);
      anims.push(
        clone.animate(
          [{ strokeDashoffset: String(len) }, { strokeDashoffset: '0' }],
          { delay: at, duration: 380, easing: SWEEP, fill: 'both' },
        ),
      );
      anims.push(
        el.animate([{ opacity: 0 }, { opacity: 1 }], {
          delay: at + 240, duration: 200, easing: 'ease-out', fill: 'backwards',
        }),
      );
      anims.push(
        clone.animate([{ opacity: 1 }, { opacity: 0 }], {
          delay: at + 420, duration: 180, easing: 'ease-out', fill: 'forwards',
        }),
      );
    } else {
      // 中心・塗りの環: 打ち込むように現れる
      anims.push(
        wrap(el).animate(
          [
            { opacity: 0, transform: 'scale(0)' },
            { opacity: 1, transform: 'scale(1.2)', offset: 0.6 },
            { opacity: 1, transform: 'scale(1)' },
          ],
          { delay: at + 160, duration: 240, easing: SNAP, fill: 'backwards' },
        ),
      );
    }
  });

  // 墨飛沫 — 名前のシードから決定論的に散る
  const splats = 8 + Math.floor(rng() * 4);
  for (let i = 0; i < splats; i++) {
    const a = rng() * Math.PI * 2;
    const r = 52 + rng() * 34;
    const x = C + r * Math.sin(a);
    const y = C - r * Math.cos(a);
    const size = 0.8 + rng() * 2.6;
    const stretched = rng() < 0.4; // 一部は飛んだ方向に伸びる
    const splat = stretched
      ? temp('ellipse', {
          cx: x.toFixed(2), cy: y.toFixed(2),
          rx: (size * 2.1).toFixed(2), ry: (size * 0.7).toFixed(2), fill: ink,
        })
      : temp('circle', { cx: x.toFixed(2), cy: y.toFixed(2), r: size.toFixed(2), fill: ink });
    splat.style.transformOrigin = `${x.toFixed(2)}px ${y.toFixed(2)}px`;
    const rot = `rotate(${((a * 180) / Math.PI + 90).toFixed(1)}deg)`;
    anims.push(
      splat.animate(
        [
          { opacity: 0, transform: `${rot} scale(0)` },
          { opacity: 0.85, transform: `${rot} scale(1.15)`, offset: 0.1 },
          { opacity: 0.75, transform: `${rot} scale(1)`, offset: 0.32 },
          { opacity: 0, transform: `${rot} scale(1)` },
        ],
        { delay: CLIMAX - 80 + i * 12, duration: 1000, easing: 'ease-out', fill: 'forwards' },
      ),
    );
  }

  /* ---------- 終了処理 ---------- */

  const cleanup = (): void => {
    for (const t of temps) t.remove();
    for (const w of wrappers) {
      const child = w.firstElementChild;
      if (child) w.replaceWith(child);
      else w.remove();
    }
    wrappers.length = 0;
    svg.style.transformOrigin = '';
  };
  const finished = Promise.allSettled(anims.map((a) => a.finished)).then(cleanup);

  return {
    climaxAt: CLIMAX,
    finished,
    cancel(): void {
      for (const a of anims) a.cancel();
      cleanup();
    },
  };
}
