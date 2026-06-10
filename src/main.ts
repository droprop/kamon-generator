import './style.css';
import { generateKamon, normalizeName, type KamonParams } from './params';
import { buildPlan } from './paths';
import { renderKamon, type RenderOptions } from './render';
import { kamonName } from './name';
import { exportPng } from './export';

const INK = '#1a1a1a';
const PAPER = '#fcfbf8';

const form = document.getElementById('form') as HTMLFormElement;
const input = document.getElementById('name-input') as HTMLInputElement;
const result = document.getElementById('result') as HTMLElement;
const container = document.getElementById('kamon-container') as HTMLElement;
const ownerEl = document.getElementById('kamon-owner') as HTMLElement;
const nameEl = document.getElementById('kamon-name') as HTMLElement;
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

function colors(inverted: boolean): RenderOptions {
  return inverted ? { ink: PAPER, paper: INK } : { ink: INK, paper: PAPER };
}

function draw(): void {
  if (!state) return;
  const svg = renderKamon(buildPlan(state.params), colors(state.inverted));
  svg.classList.add('kamon-enter');
  container.replaceChildren(svg);
  ownerEl.textContent = `「${state.name}」の紋`;
  nameEl.textContent = state.monName;
  result.hidden = false;
}

function generate(rawName: string): void {
  const name = normalizeName(rawName);
  if (!name) {
    input.focus();
    return;
  }
  const params = generateKamon(name);
  state = { name, params, monName: kamonName(params), inverted: state?.inverted ?? false };
  draw();
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
  draw();
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
