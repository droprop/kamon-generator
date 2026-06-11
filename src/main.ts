import './style.css';
import { generateKamon, normalizeName, type KamonParams } from './params';
import { buildPlan } from './paths';
import { renderKamon, type RenderOptions } from './render';
import { kamonName, MOTIF_NAMES } from './name';
import { exportPng } from './export';
import { playCeremony, reducedMotion, type Ceremony } from './ceremony';

const INK = '#211c14';
const PAPER = '#fbf8ee';

const form = document.getElementById('form') as HTMLFormElement;
const input = document.getElementById('name-input') as HTMLInputElement;
const result = document.getElementById('result') as HTMLElement;
const frame = document.getElementById('kamon-frame') as HTMLElement;
const container = document.getElementById('kamon-container') as HTMLElement;
const bloom = document.getElementById('bloom') as HTMLElement;
const shockEl = document.getElementById('shockwave') as HTMLElement;
const ownerEl = document.getElementById('kamon-owner') as HTMLElement;
const nameEl = document.getElementById('kamon-name') as HTMLElement;
const sealEl = document.getElementById('kamon-seal') as HTMLElement;
const metaEl = document.getElementById('kamon-meta') as HTMLElement;
const actionsEl = document.querySelector('.actions') as HTMLElement;
const saveBtn = document.getElementById('save-btn') as HTMLButtonElement;
const shareBtn = document.getElementById('share-btn') as HTMLButtonElement;
const invertBtn = document.getElementById('invert-btn') as HTMLButtonElement;

interface State {
  name: string;
  params: KamonParams;
  monName: string;
  inverted: boolean;
}

let state: State | null = null;
let ceremony: Ceremony | null = null;
let reveals: Animation[] = [];
let revealed = false; // result セクションを一度でも表示したか

const KANJI_NUM: Record<number, string> = {
  3: '三', 4: '四', 5: '五', 6: '六', 7: '七',
  8: '八', 9: '九', 10: '十', 11: '十一', 12: '十二',
};

function colors(inverted: boolean): RenderOptions {
  return inverted ? { ink: PAPER, paper: INK } : { ink: INK, paper: PAPER };
}

/** 銘・落款・紋籍の各テキストを用意する(銘は一文字ずつ span に分割) */
function setTexts(): void {
  if (!state) return;
  const p = state.params;
  ownerEl.textContent = `「${state.name}」の紋`;
  nameEl.replaceChildren(
    ...[...state.monName].map((ch) => {
      const s = document.createElement('span');
      s.textContent = ch;
      return s;
    }),
  );
  sealEl.textContent = [...state.name][0] ?? '紋';
  metaEl.textContent =
    `意匠 ${MOTIF_NAMES[p.motif]} ・ 紋数 ${KANJI_NUM[p.n]} ・ ` +
    `紋籍 第${p.seed.toString(16).toUpperCase().padStart(8, '0')}号`;
}

/** クライマックス(紋の完成)以降の余韻: 衝撃波・残光・捺印・銘と落款の顕現 */
function reveal(at: number): void {
  const ease = 'cubic-bezier(0.2, 0.7, 0.2, 1)';
  const show = (el: HTMLElement, delay: number, dur = 480): void => {
    reveals.push(
      el.animate(
        [{ opacity: 0, transform: 'translateY(10px)' }, { opacity: 1, transform: 'none' }],
        { delay, duration: dur, easing: ease, fill: 'backwards' },
      ),
    );
  };

  // 打ち込みの衝撃: 沈み込んで据わる紋場、走り抜ける衝撃波、金の残光
  reveals.push(
    frame.animate(
      [
        { transform: 'scale(1)' },
        { transform: 'scale(0.972)', offset: 0.3 },
        { transform: 'scale(1.012)', offset: 0.65 },
        { transform: 'scale(1)' },
      ],
      { delay: Math.max(0, at - 160), duration: 380, easing: 'ease-in-out' },
    ),
  );
  reveals.push(
    shockEl.animate(
      [
        { opacity: 0.85, transform: 'scale(0.94)' },
        { opacity: 0, transform: 'scale(1.22)' },
      ],
      { delay: Math.max(0, at - 120), duration: 650, easing: 'cubic-bezier(0.1, 0.6, 0.3, 1)' },
    ),
  );
  reveals.push(
    bloom.animate(
      [{ opacity: 0 }, { opacity: 0.85, offset: 0.22 }, { opacity: 0 }],
      { delay: Math.max(0, at - 120), duration: 1100, easing: 'ease-out' },
    ),
  );

  show(ownerEl, at + 60);
  const chars = nameEl.querySelectorAll('span');
  chars.forEach((s, i) => {
    reveals.push(
      s.animate(
        [
          { opacity: 0, transform: 'translateY(0.35em)', filter: 'blur(5px)' },
          { opacity: 1, transform: 'none', filter: 'blur(0px)' },
        ],
        { delay: at + 160 + i * 45, duration: 430, easing: ease, fill: 'backwards' },
      ),
    );
  });
  const sealAt = at + 240 + chars.length * 45;
  reveals.push(
    sealEl.animate(
      [
        { opacity: 0, transform: 'scale(2.3) rotate(-14deg)' },
        { opacity: 1, transform: 'scale(0.88) rotate(-2deg)', offset: 0.6 },
        { opacity: 1, transform: 'scale(1) rotate(-3deg)' },
      ],
      { delay: sealAt, duration: 260, easing: 'cubic-bezier(0.3, 1.2, 0.3, 1)', fill: 'backwards' },
    ),
  );
  show(metaEl, sealAt + 140);
  show(actionsEl, sealAt + 260, 560);
}

function draw(withCeremony: boolean): void {
  if (!state) return;
  ceremony?.cancel();
  ceremony = null;
  for (const a of reveals) a.cancel();
  reveals = [];

  const plan = buildPlan(state.params);
  const svg = renderKamon(plan, colors(state.inverted));
  container.replaceChildren(svg);
  setTexts();
  result.hidden = false;

  if (!revealed) {
    revealed = true;
    if (!reducedMotion()) {
      reveals.push(
        result.animate(
          [{ opacity: 0, transform: 'translateY(16px)' }, { opacity: 1, transform: 'none' }],
          { duration: 650, easing: 'cubic-bezier(0.2, 0.7, 0.2, 1)' },
        ),
      );
    }
  }

  if (withCeremony && !reducedMotion()) {
    ceremony = playCeremony(svg, plan, { inverted: state.inverted, seed: state.params.seed });
    reveal(ceremony.climaxAt);
  }
}

function generate(rawName: string): void {
  const name = normalizeName(rawName);
  if (!name) {
    input.focus();
    return;
  }
  const params = generateKamon(name);
  state = { name, params, monName: kamonName(params), inverted: state?.inverted ?? false };
  input.blur();
  draw(true);
  const url = new URL(location.href);
  url.searchParams.set('n', name);
  history.replaceState(null, '', url);
}

form.addEventListener('submit', (e) => {
  e.preventDefault();
  generate(input.value);
});

saveBtn.addEventListener('click', () => {
  const svg = container.querySelector('svg');
  if (!svg || !state) return;
  exportPng(svg, `kamon-${state.name}.png`).catch((err) => {
    console.error(err);
    alert('画像の保存に失敗しました。');
  });
});

shareBtn.addEventListener('click', () => {
  if (!state) return;
  const url = new URL(location.href);
  const text = `「${state.name}」の紋は「${state.monName}」でした。 #あなたの紋`;
  const intent = new URL('https://twitter.com/intent/tweet');
  intent.searchParams.set('text', text);
  intent.searchParams.set('url', url.toString());
  window.open(intent, '_blank', 'noopener');
});

invertBtn.addEventListener('click', () => {
  if (!state) return;
  state.inverted = !state.inverted;
  invertBtn.setAttribute('aria-pressed', String(state.inverted));
  draw(false);
  if (!reducedMotion()) {
    container.querySelector('svg')?.animate([{ opacity: 0.35 }, { opacity: 1 }], {
      duration: 260,
      easing: 'ease-out',
    });
  }
});

/* デバッグギャラリー: ?debug=gallery で多数のシードを一覧表示(M3の目視レビュー用) */
function renderGallery(): void {
  const names = [
    '山田太郎', '佐藤花子', 'すずき', 'タナカ', 'watanabe', 'ito hiroshi',
    '高橋', '小林一茶', '紫式部', '宮本武蔵', 'あい', 'ん',
    'Claude', 'Anthropic', 'kamon', '紋', '雪月花', '風林火山',
    '春夏秋冬', 'a', 'zz', '12345', '田中田中田中', '東京都港区',
  ];
  document.querySelector('main')!.style.display = 'none';
  const grid = document.createElement('div');
  grid.id = 'gallery';
  // ?motif=tomoe&style=stroke で特定モチーフを n=3..12 で強制表示(調整用)
  const q = new URLSearchParams(location.search);
  const forceMotif = q.get('motif') as KamonParams['motif'] | null;
  const forceStyle = q.get('style') as KamonParams['lineStyle'] | null;
  names.forEach((n, i) => {
    let params = generateKamon(n);
    if (forceMotif) params = { ...params, motif: forceMotif, n: 3 + (i % 10) };
    if (forceStyle) params = { ...params, lineStyle: forceStyle };
    const fig = document.createElement('figure');
    fig.appendChild(renderKamon(buildPlan(params), colors(false)));
    const cap = document.createElement('figcaption');
    cap.textContent = `${n} — ${kamonName(params)}`;
    fig.appendChild(cap);
    grid.appendChild(fig);
  });
  document.body.appendChild(grid);
}

const query = new URLSearchParams(location.search);
if (query.get('debug') === 'gallery') {
  renderGallery();
} else {
  const initial = query.get('n');
  if (initial) {
    input.value = initial;
    generate(initial);
  }
}
