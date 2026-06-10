import { describe, expect, it } from 'vitest';
import { hashString, mulberry32 } from '../src/rng';
import { generateKamon, normalizeName } from '../src/params';
import { buildPlan } from '../src/paths';
import { kamonName } from '../src/name';

const SAMPLE_NAMES = [
  '山田太郎', '佐藤花子', 'すずき', 'タナカ', 'watanabe', 'ito hiroshi',
  '高橋', '小林一茶', '紫式部', '宮本武蔵', 'あい', 'ん',
  'Claude', 'Anthropic', 'kamon', '紋', '雪月花', '風林火山',
  '春夏秋冬', 'a', 'zz', '12345', '🌸', '田中　太郎',
];

describe('hashString / mulberry32', () => {
  it('同じ文字列から同じハッシュ', () => {
    expect(hashString('山田太郎')).toBe(hashString('山田太郎'));
  });

  it('mulberry32 は [0,1) の決定論的な列を返す', () => {
    const a = mulberry32(42);
    const b = mulberry32(42);
    for (let i = 0; i < 100; i++) {
      const v = a();
      expect(v).toBe(b());
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
});

describe('normalizeName', () => {
  it('前後の空白をtrimする(全角含む)', () => {
    expect(normalizeName('  山田 ')).toBe('山田');
    expect(normalizeName('　山田　')).toBe('山田');
  });

  it('NFKC正規化: 合成済みと結合文字が同一視される', () => {
    expect(normalizeName('ガ')).toBe(normalizeName('ガ'));
  });

  it('NFKC正規化: 全角英数が半角に揃う', () => {
    expect(normalizeName('Ａｂｃ')).toBe('Abc');
  });

  it('小文字化はしない', () => {
    expect(normalizeName('ABC')).not.toBe(normalizeName('abc'));
  });
});

describe('generateKamon', () => {
  it('同じ名前なら必ず同じパラメータ', () => {
    for (const name of SAMPLE_NAMES) {
      expect(generateKamon(name)).toEqual(generateKamon(name));
    }
  });

  it('正規化が等価な入力は同じ紋になる', () => {
    expect(generateKamon(' 山田太郎 ')).toEqual(generateKamon('山田太郎'));
    expect(generateKamon('Ａｂｃ')).toEqual(generateKamon('Abc'));
  });

  it('パラメータが仕様の範囲に収まる', () => {
    for (const name of SAMPLE_NAMES) {
      const p = generateKamon(name);
      expect(p.n).toBeGreaterThanOrEqual(3);
      expect(p.n).toBeLessThanOrEqual(12);
      expect(p.strokeWidth).toBeGreaterThan(1);
      expect(p.strokeWidth).toBeLessThan(4);
      for (const v of [p.v1, p.v2, p.v3]) {
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThan(1);
      }
    }
  });

  it('異なる名前はほぼ確実に異なるシードになる', () => {
    const seeds = new Set<number>();
    const count = 1000;
    for (let i = 0; i < count; i++) {
      seeds.add(generateKamon(`なまえ${i}号`).seed);
    }
    expect(seeds.size).toBeGreaterThan(count - 5);
  });
});

describe('buildPlan', () => {
  // パス内の数値をすべて取り出す
  const numbersIn = (d: string): number[] =>
    (d.match(/-?\d+(\.\d+)?/g) ?? []).map(Number);

  it('全サンプルでプランが破綻しない(数値が有限かつviewBox近傍)', () => {
    for (let i = 0; i < 500; i++) {
      const plan = buildPlan(generateKamon(`fuzz-${i}-テスト`));
      expect(plan.n).toBeGreaterThanOrEqual(3);
      expect(plan.motifElements.length).toBeGreaterThan(0);
      for (const el of [...plan.motifElements, ...plan.staticElements]) {
        if (el.kind === 'path') {
          for (const num of numbersIn(el.d)) {
            expect(Number.isFinite(num)).toBe(true);
            expect(num).toBeGreaterThanOrEqual(-220);
            expect(num).toBeLessThanOrEqual(220);
          }
        } else {
          expect(el.r).toBeGreaterThan(0);
          expect(el.r).toBeLessThanOrEqual(100);
          expect(Number.isFinite(el.cx)).toBe(true);
          expect(Number.isFinite(el.cy)).toBe(true);
        }
        if (el.mode === 'stroke') {
          expect(el.strokeWidth).toBeGreaterThan(0);
        }
      }
    }
  });

  it('同じパラメータから同じプラン', () => {
    const p = generateKamon('決定論');
    expect(buildPlan(p)).toEqual(buildPlan(p));
  });
});

describe('kamonName', () => {
  it('決定論的に非空の紋名を返す', () => {
    for (const name of SAMPLE_NAMES) {
      const p = generateKamon(name);
      const mon = kamonName(p);
      expect(mon.length).toBeGreaterThan(1);
      expect(kamonName(p)).toBe(mon);
    }
  });

  it('構成要素が反映される', () => {
    for (let i = 0; i < 200; i++) {
      const p = generateKamon(`name-${i}`);
      const mon = kamonName(p);
      if (p.outerRing === 'thick') expect(mon.startsWith('丸に')).toBe(true);
      if (p.lineStyle === 'stroke') expect(mon).toContain('陰');
      if (p.n === 3) expect(mon).toContain('三つ');
    }
  });
});
