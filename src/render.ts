import type { KamonPlan, PlanElement } from './paths';

/** 描画プラン → SVG DOM。色は属性として直接埋め込む(PNG書き出しのため)。 */

const NS = 'http://www.w3.org/2000/svg';

export interface RenderOptions {
  ink: string;
  paper: string;
}

function applyPaint(el: SVGElement, plan: PlanElement, opts: RenderOptions): void {
  const color = plan.paint === 'ink' ? opts.ink : opts.paper;
  if (plan.mode === 'fill') {
    el.setAttribute('fill', color);
    el.setAttribute('stroke', 'none');
  } else {
    el.setAttribute('fill', 'none');
    el.setAttribute('stroke', color);
    el.setAttribute('stroke-width', String(plan.strokeWidth ?? 2));
    el.setAttribute('stroke-linejoin', 'round');
    el.setAttribute('stroke-linecap', 'round');
  }
}

function createElement(plan: PlanElement, opts: RenderOptions): SVGElement {
  if (plan.kind === 'path') {
    const el = document.createElementNS(NS, 'path');
    el.setAttribute('d', plan.d);
    if (plan.evenOdd) el.setAttribute('fill-rule', 'evenodd');
    applyPaint(el, plan, opts);
    return el;
  }
  const el = document.createElementNS(NS, 'circle');
  el.setAttribute('cx', String(plan.cx));
  el.setAttribute('cy', String(plan.cy));
  el.setAttribute('r', String(plan.r));
  applyPaint(el, plan, opts);
  return el;
}

export function renderKamon(plan: KamonPlan, opts: RenderOptions): SVGSVGElement {
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('xmlns', NS);
  svg.setAttribute('viewBox', `0 0 ${plan.size} ${plan.size}`);

  // 背景(PNG書き出しと白抜き反転のため必ず敷く)
  const bg = document.createElementNS(NS, 'rect');
  bg.setAttribute('width', String(plan.size));
  bg.setAttribute('height', String(plan.size));
  bg.setAttribute('fill', opts.paper);
  svg.appendChild(bg);

  const c = plan.size / 2;
  for (let i = 0; i < plan.n; i++) {
    const g = document.createElementNS(NS, 'g');
    const angle = (360 / plan.n) * i;
    if (angle !== 0) g.setAttribute('transform', `rotate(${Number(angle.toFixed(3))} ${c} ${c})`);
    for (const el of plan.motifElements) g.appendChild(createElement(el, opts));
    svg.appendChild(g);
  }
  for (const el of plan.staticElements) svg.appendChild(createElement(el, opts));
  return svg;
}
