import type { KamonPlan } from './paths';
import type { Motif } from './params';
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
  /** 墨溜まりが爆ぜる時刻(ms)。ページ側の衝撃演出の同期に使う */
  burstAt: number;
  /** 紋が完成し、余韻(衝撃波・残光・銘の表示)を始めるべき時刻(ms) */
  climaxAt: number;
  finished: Promise<void>;
  cancel(): void;
}

/* ---------- 拍子(ms) ---------- */
const T_BURST = 560; // 落墨と溜めの長さ
const SLASH_GAP = 230; // 乱れ斬りの間合い

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
  opts: {
    inverted: boolean;
    seed: number;
    /** 紋場の外へ墨が飛ぶ飛墨レイヤー(crest SVG の外なので書き出しに影響しない) */
    splash?: SVGSVGElement;
    /** 紋場の約2倍を覆う属性レイヤー(風・雪・雷などの自然演出) */
    element?: SVGSVGElement;
    /** 属性の決定に使う意匠 */
    motif?: Motif;
  },
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
    parent: SVGElement = svg,
  ): SVGElementTagNameMap[K] => {
    const el = document.createElementNS(NS, tag);
    setAttrs(el, { opacity: '0', ...attrs });
    parent.appendChild(el);
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
  for (let i = 0; i < 9; i++) {
    const a = rng() * Math.PI * 2;
    const d = 16 + rng() * 24;
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
      'stroke-width': '1.3',
      'stroke-linecap': 'round',
      'stroke-dasharray': String(r1 - r0),
      'stroke-dashoffset': String(r1 - r0),
    });
    line.removeAttribute('opacity'); // dashoffset=全長で既に不可視
    const at = T_BURST + k * 12;
    anims.push(
      line.animate(
        [
          { strokeDashoffset: String(r1 - r0), opacity: 0.5 },
          { strokeDashoffset: '0', opacity: 0.5 },
        ],
        { delay: at, duration: 170, easing: SWEEP, fill: 'both' },
      ),
    );
    anims.push(
      line.animate([{ opacity: 0.5 }, { opacity: 0 }], {
        delay: at + 200, duration: 240, easing: 'ease-out', fill: 'forwards',
      }),
    );
  }

  // 乱れ斬り: 斬撃が走るたび、紋のコピーがまとまって斬り出される
  const slashCount = plan.n <= 6 ? 2 : 3;
  const tSlash = (b: number): number => T_BURST + 40 + b * SLASH_GAP;
  const perBatch = Math.ceil(plan.n / slashCount);
  const flingAt = (i: number): number =>
    tSlash(Math.floor(i / perBatch)) + 70 + (i % perBatch) * 40;
  const tRing = tSlash(slashCount - 1) + 320; // 外環の一閃
  const climax = tRing + 380;
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
          { opacity: 0.35, transform: 'rotate(-62deg) scale(0.72)' },
          { opacity: 0, transform: 'rotate(-8deg) scale(1)' },
        ],
        { delay: at, duration: 280, easing: SNAP, fill: 'forwards' },
      ),
    );

    // 本体
    anims.push(
      wrap(group).animate(
        [
          { opacity: 0, transform: 'rotate(-40deg) scale(0.4)' },
          { opacity: 1, transform: 'rotate(5deg) scale(1.09)', offset: 0.6 },
          { opacity: 1, transform: 'rotate(0deg) scale(1)' },
        ],
        { delay: at, duration: 300, easing: SNAP, fill: 'backwards' },
      ),
    );
  });

  // 紋全体が回り込みながら据わる(勢いの余韻)
  svg.style.transformOrigin = '50% 50%';
  anims.push(
    svg.animate(
      [{ transform: 'rotate(-4deg)' }, { transform: 'rotate(0deg)' }],
      { delay: T_BURST, duration: 900, easing: 'cubic-bezier(0.16, 0.8, 0.25, 1)' },
    ),
  );

  /* ---------- 急、決め ---------- */

  statics.forEach((el, i) => {
    const at = tRing + i * 130;
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
          { delay: at, duration: 330, easing: SWEEP, fill: 'both' },
        ),
      );
      anims.push(
        el.animate([{ opacity: 0 }, { opacity: 1 }], {
          delay: at + 210, duration: 180, easing: 'ease-out', fill: 'backwards',
        }),
      );
      anims.push(
        clone.animate([{ opacity: 1 }, { opacity: 0 }], {
          delay: at + 370, duration: 160, easing: 'ease-out', fill: 'forwards',
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

  /* ---------- 飛墨 — 紋場の外まで墨が暴れる(ジャバっ/ズバっ) ---------- */

  if (opts.splash) {
    const layer = opts.splash;
    const SUMI = '#211c14'; // 地は常に明るい和紙なので飛墨は常に墨色
    const EDGE = 59; // 紋場の縁(レイヤーは紋場の約170%幅なので 100/1.7)
    const sPolar = (r: number, a: number): [number, number] =>
      [100 + r * Math.sin(a), 100 - r * Math.cos(a)];

    /** 墨滴をひとつ、(x, y) から (dx, dy) 方向へ飛ばす */
    const dropAt = (
      x: number, y: number, dx: number, dy: number,
      size: number, delay: number, dur: number, stretched: boolean,
    ): void => {
      const el = stretched
        ? temp('ellipse', {
            cx: x.toFixed(1), cy: y.toFixed(1),
            rx: (size * 2.4).toFixed(2), ry: (size * 0.75).toFixed(2), fill: SUMI,
          }, layer)
        : temp('circle', { cx: x.toFixed(1), cy: y.toFixed(1), r: size.toFixed(2), fill: SUMI }, layer);
      el.style.transformOrigin = `${x.toFixed(1)}px ${y.toFixed(1)}px`;
      const rot = `rotate(${((Math.atan2(dy, dx) * 180) / Math.PI).toFixed(1)}deg)`;
      anims.push(
        el.animate(
          [
            { opacity: 0, transform: `translate(0, 0) ${rot} scale(0.4)` },
            { opacity: 0.9, transform: `translate(${(dx * 0.3).toFixed(1)}px, ${(dy * 0.3).toFixed(1)}px) ${rot} scale(1)`, offset: 0.25 },
            { opacity: 0, transform: `translate(${dx.toFixed(1)}px, ${dy.toFixed(1)}px) ${rot} scale(0.45)` },
          ],
          { delay, duration: dur, easing: 'cubic-bezier(0.1, 0.7, 0.3, 1)', fill: 'forwards' },
        ),
      );
    };

    /** 縁の内側から角度 a の方向へ墨滴を飛ばす */
    const fling = (
      a: number, fly: number, size: number, delay: number, dur: number, stretched: boolean,
    ): void => {
      const [x, y] = sPolar(EDGE - 5, a);
      dropAt(x, y, Math.sin(a) * fly, -Math.cos(a) * fly, size, delay, dur, stretched);
    };

    /**
     * 斬撃: 刃のような墨の一条が紋場を斜めに走り抜け、軌道から墨が飛び散る。
     * レンズ形は水平に組み、keyframes 内の固定 rotate で角度を付ける
     * (CSS transform は属性 transform を上書きするため、回転は keyframes 側に置く)。
     */
    const streak = (deg: number, off: number, halfW: number, delay: number): void => {
      const rad = (deg * Math.PI) / 180;
      const [ux, uy] = [Math.cos(rad), Math.sin(rad)]; // 斬撃の進行方向
      const [vx, vy] = [-uy, ux]; // 軌道と垂直の方向
      const [cx, cy] = [100 + vx * off, 100 + vy * off];
      const L = 88;
      const d =
        `M ${(cx - L).toFixed(1)} ${cy.toFixed(1)} ` +
        `Q ${cx.toFixed(1)} ${(cy - halfW * 2).toFixed(1)} ${(cx + L).toFixed(1)} ${cy.toFixed(1)} ` +
        `Q ${cx.toFixed(1)} ${(cy + halfW * 2).toFixed(1)} ${(cx - L).toFixed(1)} ${cy.toFixed(1)} Z`;
      const el = temp('path', { d, fill: SUMI }, layer);
      el.style.transformOrigin = `${cx.toFixed(1)}px ${cy.toFixed(1)}px`;
      const rot = `rotate(${deg.toFixed(1)}deg)`;
      anims.push(
        el.animate(
          [
            { opacity: 0, transform: `${rot} translateX(-16px) scaleX(0.25)` },
            { opacity: 0.92, transform: `${rot} translateX(0) scaleX(1)`, offset: 0.3 },
            { opacity: 0, transform: `${rot} translateX(12px) scaleX(1.06)` },
          ],
          { delay, duration: 260, easing: 'cubic-bezier(0.2, 0.8, 0.3, 1)', fill: 'forwards' },
        ),
      );
      // 軌道から散る墨
      for (let k = 0; k < 5; k++) {
        const t = (rng() - 0.5) * 110;
        const side = rng() < 0.5 ? -1 : 1;
        const v = (8 + rng() * 14) * side;
        dropAt(
          cx + ux * t, cy + uy * t, vx * v, vy * v,
          0.8 + rng() * 1.5, delay + 60 + rng() * 90, 400, rng() < 0.25,
        );
      }
    };

    // ジャバっ: 爆ぜの瞬間、墨が縁を越えて弾け飛ぶ
    for (let i = 0; i < 8; i++) {
      const a = rng() * Math.PI * 2;
      fling(a, 12 + rng() * 22, 1.2 + rng() * 2.2, T_BURST + rng() * 60, 480 + rng() * 160, rng() < 0.3);
    }
    // 乱れ斬り: 斬撃が紋場を走り抜けるたび、紋が斬り出される
    const SLASH_DEGS = [-28, 207, -152, 23];
    for (let b = 0; b < slashCount; b++) {
      streak(SLASH_DEGS[b % 4] + (rng() - 0.5) * 14, (rng() - 0.5) * 26, 2.6 + rng() * 1.4, tSlash(b));
    }
    // 書き上げの墨はね: コピーが斬り出されるたび、その方角へ筆から墨が飛ぶ
    groups.forEach((_, i) => {
      const a = (2 * Math.PI * i) / plan.n + (rng() - 0.5) * 0.5;
      fling(a, 10 + rng() * 14, 0.9 + rng() * 1.6, flingAt(i) + 150, 430, false);
    });
    // どかっ: 完成の瞬間、ひと回り大きく墨がジャバっと散る
    for (let i = 0; i < 14; i++) {
      const a = rng() * Math.PI * 2;
      fling(a, 16 + rng() * 26, 1.3 + rng() * 2.8, climax - 90 + i * 8, 560 + rng() * 200, rng() < 0.4);
    }
    // 納刀の一閃: 銘のカットイン(main.ts側)に合わせ、縦一文字が銘の柱を斬り抜ける
    streak(90, -74, 3.2, climax + 560);
    for (let i = 0; i < 3; i++) {
      dropAt(
        174 + (rng() - 0.5) * 6, 60 + rng() * 60,
        (rng() - 0.5) * 16, 6 + rng() * 10,
        0.8 + rng() * 1.2, climax + 640 + rng() * 80, 420, false,
      );
    }
  }

  /* ---------- 八百万 — 紋の意匠に応じて自然が応える(属性レイヤー) ---------- */

  if (opts.element && opts.motif) {
    const layer = opts.element;
    const W = 200;
    const ambiEnd = climax + 500;
    const span = ambiEnd - T_BURST;

    const fallKind =
      opts.motif === 'petal' ? 'petal'
      : opts.motif === 'leaf' ? 'leaf'
      : opts.motif === 'diamond' ? 'snow'
      : null;

    if (fallKind) {
      // 花吹雪・木の葉・雪 — 広いレイヤー全体をひらひらと舞い落ちる
      for (let i = 0; i < 18; i++) {
        const x = rng() * W;
        const y0 = -6 - rng() * 14;
        const sway = (rng() - 0.5) * 50;
        const fall = 120 + rng() * 110;
        const r0 = Math.floor(rng() * 360);
        let el: SVGElement;
        if (fallKind === 'snow') {
          el = temp('circle', {
            cx: x.toFixed(1), cy: y0.toFixed(1), r: (0.9 + rng() * 0.9).toFixed(2),
            fill: '#ffffff', stroke: '#bdc8d8', 'stroke-width': '0.3',
          }, layer);
        } else {
          const [rx, ry] = fallKind === 'petal' ? [2.4 + rng(), 1.5] : [2.7 + rng(), 1.1];
          el = temp('ellipse', {
            cx: x.toFixed(1), cy: y0.toFixed(1), rx: rx.toFixed(2), ry: ry.toFixed(2),
            fill: fallKind === 'petal' ? 'rgba(188, 66, 50, 0.4)' : 'rgba(143, 117, 54, 0.55)',
          }, layer);
        }
        el.style.transformOrigin = `${x.toFixed(1)}px ${y0.toFixed(1)}px`;
        anims.push(
          el.animate(
            [
              { opacity: 0, transform: `translate(0, 0) rotate(${r0}deg)` },
              { opacity: 0.9, offset: 0.12 },
              { opacity: 0.9, transform: `translate(${sway.toFixed(1)}px, ${(fall * 0.55).toFixed(1)}px) rotate(${r0 + 160}deg)`, offset: 0.55 },
              { opacity: 0, transform: `translate(${(sway * 0.3).toFixed(1)}px, ${fall.toFixed(1)}px) rotate(${r0 + 300}deg)` },
            ],
            { delay: T_BURST + rng() * span, duration: 1700 + rng() * 1100, easing: 'cubic-bezier(0.4, 0.1, 0.6, 0.9)', fill: 'forwards' },
          ),
        );
      }
    } else if (opts.motif === 'star') {
      // 星屑 — 紋の周りで金の星がまたたく
      for (let i = 0; i < 16; i++) {
        const x = 14 + rng() * 172;
        const y = 14 + rng() * 172;
        if (Math.hypot(x - 100, y - 100) < 56) continue; // 紋場とは重ねない
        const s = 1.6 + rng() * 2.6;
        const d =
          `M ${x.toFixed(1)} ${(y - s).toFixed(1)} L ${(x + s * 0.3).toFixed(1)} ${(y - s * 0.3).toFixed(1)} ` +
          `L ${(x + s).toFixed(1)} ${y.toFixed(1)} L ${(x + s * 0.3).toFixed(1)} ${(y + s * 0.3).toFixed(1)} ` +
          `L ${x.toFixed(1)} ${(y + s).toFixed(1)} L ${(x - s * 0.3).toFixed(1)} ${(y + s * 0.3).toFixed(1)} ` +
          `L ${(x - s).toFixed(1)} ${y.toFixed(1)} L ${(x - s * 0.3).toFixed(1)} ${(y - s * 0.3).toFixed(1)} Z`;
        const el = temp('path', { d, fill: '#b8923f' }, layer);
        el.style.transformOrigin = `${x.toFixed(1)}px ${y.toFixed(1)}px`;
        anims.push(
          el.animate(
            [
              { opacity: 0, transform: 'scale(0) rotate(0deg)' },
              { opacity: 0.95, transform: 'scale(1) rotate(45deg)', offset: 0.4 },
              { opacity: 0, transform: 'scale(0.2) rotate(90deg)' },
            ],
            { delay: T_BURST + rng() * span, duration: 700 + rng() * 500, easing: 'ease-in-out', fill: 'forwards' },
          ),
        );
      }
    } else if (opts.motif === 'cloud' || opts.motif === 'wave' || opts.motif === 'scale') {
      // 風 — 突風の筋が紋場を吹き抜ける
      for (let i = 0; i < 9; i++) {
        const y = 14 + rng() * 172;
        const len = 26 + rng() * 40;
        const x0 = -40 - rng() * 30;
        const bow = (rng() - 0.5) * 10;
        const el = temp('path', {
          d: `M ${x0.toFixed(0)} ${y.toFixed(1)} q ${(len / 2).toFixed(1)} ${bow.toFixed(1)} ${len.toFixed(1)} 0`,
          fill: 'none',
          stroke: rng() < 0.35 ? 'rgba(143, 117, 54, 0.4)' : 'rgba(33, 28, 20, 0.22)',
          'stroke-width': (0.9 + rng() * 1.1).toFixed(2),
          'stroke-linecap': 'round',
        }, layer);
        anims.push(
          el.animate(
            [
              { opacity: 0, transform: 'translateX(0)' },
              { opacity: 0.9, offset: 0.25 },
              { opacity: 0, transform: `translateX(${(W - x0 + 60).toFixed(0)}px)` },
            ],
            { delay: T_BURST + rng() * Math.max(1, span - 700), duration: 750 + rng() * 450, easing: 'cubic-bezier(0.3, 0, 0.4, 1)', fill: 'forwards' },
          ),
        );
      }
    } else if (opts.motif === 'tomoe') {
      // 雷 — 巴は雷神太鼓の紋。稲妻が紋場へ落ちる
      const bolt = (x0: number, delay: number, big: boolean): void => {
        let x = x0;
        let d = `M ${x.toFixed(1)} -4`;
        const steps = 5;
        const yTarget = 50; // 紋場の上縁あたり
        let y = -4;
        for (let k = 1; k <= steps; k++) {
          x += (rng() - 0.5) * 26 + (100 - x0) * 0.12;
          y = -4 + ((yTarget + 4) * k) / steps;
          d += ` L ${x.toFixed(1)} ${y.toFixed(1)}`;
        }
        const el = temp('path', {
          d, fill: 'none', stroke: big ? '#c9a23f' : '#d8b45a',
          'stroke-width': big ? '2.2' : '1.4',
          'stroke-linejoin': 'miter', 'stroke-linecap': 'round',
          pathLength: '1', 'stroke-dasharray': '1', 'stroke-dashoffset': '1',
        }, layer);
        anims.push(
          el.animate(
            [{ strokeDashoffset: '1', opacity: 1 }, { strokeDashoffset: '0', opacity: 1 }],
            { delay, duration: 80, easing: 'linear', fill: 'both' },
          ),
        );
        anims.push(
          el.animate(
            [{ opacity: 1 }, { opacity: 0.2, offset: 0.3 }, { opacity: 0.9, offset: 0.5 }, { opacity: 0 }],
            { delay: delay + 90, duration: 300, easing: 'ease-out', fill: 'forwards' },
          ),
        );
        // 落雷の閃光
        const fl = temp('circle', {
          cx: x.toFixed(1), cy: y.toFixed(1), r: '10', fill: 'rgba(255, 248, 224, 0.9)',
        }, layer);
        fl.style.transformOrigin = `${x.toFixed(1)}px ${y.toFixed(1)}px`;
        anims.push(
          fl.animate(
            [{ opacity: 0.9, transform: 'scale(0.3)' }, { opacity: 0, transform: 'scale(2.6)' }],
            { delay: delay + 70, duration: 260, easing: 'ease-out', fill: 'forwards' },
          ),
        );
      };
      bolt(60 + rng() * 20, Math.max(0, T_BURST - 80), true);
      bolt(120 + rng() * 20, climax - 130, true);
      bolt(85 + rng() * 30, climax - 60, false);
    }
  }

  // 墨飛沫 — 名前のシードから決定論的に散る
  const splats = 12 + Math.floor(rng() * 5);
  for (let i = 0; i < splats; i++) {
    const a = rng() * Math.PI * 2;
    const r = 50 + rng() * 40;
    const x = C + r * Math.sin(a);
    const y = C - r * Math.cos(a);
    const size = 0.9 + rng() * 3.0;
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
        { delay: climax - 80 + i * 12, duration: 1000, easing: 'ease-out', fill: 'forwards' },
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
    burstAt: T_BURST,
    climaxAt: climax,
    finished,
    cancel(): void {
      for (const a of anims) a.cancel();
      cleanup();
    },
  };
}
