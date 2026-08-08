// R-5b: モデレーション検出性能の回帰テスト。
// 評価ハーネス(src/scripts/evaluateModeration.js)の測定値を固定し、
// NGワード追加や正規化変更が **既存の性能を落としていないか** を機械的に守る。
// 数値は現状の実測値（2026-08-08）であり、改善したら引き上げること。
const { evaluate } = require('../../src/scripts/evaluateModeration');

describe('モデレーション検出性能の回帰（R-5b 評価ハーネス）', () => {
  let res;
  beforeAll(async () => {
    res = await evaluate();
  }, 30000);

  it('明示的なNG語（direct）は全件検知できる', () => {
    expect(res.byDifficulty.direct.recall).toBe(1);
  });

  it('表記回避（evasion）の検知率が現状水準を下回らない', () => {
    // ゼロ幅/全角/ホモグリフ対応（R-11）。ひらがな置換の1件は既知の未検知
    expect(res.byDifficulty.evasion.recall).toBeGreaterThanOrEqual(0.75);
  });

  it('紛らわしい無害コメント（hard-negative）の誤検知が増えていない', () => {
    // 「やっと死ねる」（ゲーム完走の肯定的表現）の1件のみが既知の誤検知
    expect(res.byDifficulty['hard-negative'].fp).toBeLessThanOrEqual(1);
  });

  it('全体のF1が現状水準を下回らない', () => {
    expect(res.overall.f1).toBeGreaterThanOrEqual(0.72);
  });

  it('【既知の限界】語彙に頼らない攻撃（indirect）は現状ほぼ検知できない', () => {
    // これは失敗ではなく **現状の正確な記録**。語彙一致の原理的限界であり、
    // R-4（Policy-as-Prompt によるLLM文脈判定）が解決すべき層。
    // ここが改善したら期待値を引き上げ、R-4の効果測定として使う
    expect(res.byDifficulty.indirect.recall).toBeLessThanOrEqual(0.25);
  });
});
