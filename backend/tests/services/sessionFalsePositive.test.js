// 1メッセージあたりの誤検知率が低くても、配信1回分（多数のメッセージ）では
// 「少なくとも1件は誤って保留する」確率が跳ね上がる（E-56）。
// ライブチャット向けのモデレーション研究（FLAME）が指摘する点で、
// 評価出力に「誤検知0件」とだけ書くと、実運用での体感を過小評価させる。
const { sessionFalsePositiveProbability, falsePositiveRateUpperBound } = require('../../src/scripts/evaluateModeration');

describe('セッション単位の誤検知確率（E-56）', () => {
  it('1 - (1-p)^n を返す', () => {
    expect(sessionFalsePositiveProbability(0.01, 100)).toBeCloseTo(1 - 0.99 ** 100, 10);
    expect(sessionFalsePositiveProbability(0, 1000)).toBe(0);
    expect(sessionFalsePositiveProbability(1, 1)).toBe(1);
  });

  it('メッセージ数が増えるほど単調に増える', () => {
    const p = 0.005;
    expect(sessionFalsePositiveProbability(p, 1000)).toBeGreaterThan(sessionFalsePositiveProbability(p, 100));
  });

  it('不正な入力は例外にせず null を返す（数字を捏造しない）', () => {
    expect(sessionFalsePositiveProbability(-0.1, 10)).toBeNull();
    expect(sessionFalsePositiveProbability(1.5, 10)).toBeNull();
    expect(sessionFalsePositiveProbability(0.1, -1)).toBeNull();
    expect(sessionFalsePositiveProbability(NaN, 10)).toBeNull();
  });

  it('誤検知0件でも率を0とは言わず、3の法則で95%上限を出す', () => {
    expect(falsePositiveRateUpperBound(0, 29)).toBeCloseTo(3 / 29, 10);
    expect(falsePositiveRateUpperBound(2, 100)).toBeCloseTo(0.02, 10);
    expect(falsePositiveRateUpperBound(0, 0)).toBeNull();
  });
});
