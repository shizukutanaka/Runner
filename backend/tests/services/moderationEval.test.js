// R-5b: モデレーション検出性能の回帰テスト。
// 評価ハーネス(src/scripts/evaluateModeration.js)の測定値を固定し、
// NGワード追加や正規化変更が **既存の性能を落としていないか** を機械的に守る。
// 数値は現状の実測値（2026-08-25）であり、改善したら引き上げること。
// 45件（direct 5 / evasion 4 / indirect 7 / hard-negative 29）で
// Precision 100% / Recall 100% / F1 100%。
// hard-negative を意図的に厚くしてあるのは、この製品で高くつく間違いが
// 誤検知の側だから。うち14件は R-33 のパターンを書いた後に
// 「パターンを見ずに」書き出した実在しそうなチャットで、
// 初版はそのうち5件を実際に誤検知した。
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
    // ゼロ幅/全角/ホモグリフ対応（R-11）＋仮名表記の追加と語境界ガード（R-30）
    expect(res.byDifficulty.evasion.recall).toBe(1);
  });

  it('紛らわしい無害コメント（hard-negative）の誤検知が増えていない', () => {
    // R-30 の語境界ガードで「やっと死ねる」（ゲーム完走の肯定的表現）の誤検知は解消済み
    expect(res.byDifficulty['hard-negative'].fp).toBe(0);
  });

  it('全体のF1が現状水準を下回らない', () => {
    expect(res.overall.f1).toBeGreaterThanOrEqual(0.95);
  });

  it('語彙に頼らない攻撃（indirect）も検知できる', () => {
    // かつてここは「【既知の限界】indirectは0%しか検知できない」という
    // 現状記録のテストだった。R-33（標的型ハラスメントの2成分共起検知）で
    // 埋まったため、限界の記録から**回帰の防波堤**に役割を変えている。
    // 語彙一致では原理的に不可能だった層なので、下がったら気づけるようにする
    expect(res.byDifficulty.indirect.recall).toBeGreaterThanOrEqual(0.85);
  });

  it('誤検知ゼロを維持する（この製品で高くつくのは誤検知の側）', () => {
    // hard-negative には、R-33のパターンを書いた後に「パターンを見ずに」
    // 書き出した実在しそうなチャットが含まれている（うち5件は初版で実際に誤検知した）
    expect(res.byDifficulty['hard-negative'].fp).toBe(0);
  });
});
