// W-3: AI層（toxicity判定 + Policy-as-Prompt）の効果測定。
//
// AI層の効果は OPENAI_API_KEY が無いと実測できないが、**測定器そのものが
// 正しいかどうか**は鍵なしで確かめられる。ここで固定するのはその部分:
//   1. レポートが「どの構成で測ったか」を必ず持つこと
//      （鍵未設定で出た決定論層だけの数値を「AI込みの性能」と読み違えるのを防ぐ）
//   2. 決定論的な根拠が無いのに検知されたケースを AI層の寄与として数えること
//
// これが動いていれば、鍵を入れた時点で
//   node src/scripts/evaluateModeration.js --no-ai   （決定論層のみ）
//   node src/scripts/evaluateModeration.js           （AI層込み）
// の差分がそのまま W-3 の答えになる。

describe('評価ハーネスのAI層アトリビューション（W-3の測定器）', () => {
  afterEach(() => {
    jest.resetModules();
    jest.dontMock('../../src/services/openaiService');
  });

  const loadHarnessWithAi = ({ isToxic, policyViolation }) => {
    jest.resetModules();
    const real = jest.requireActual('../../src/services/openaiService');
    jest.doMock('../../src/services/openaiService', () => ({
      ...real,
      isAvailable: () => true,
      analyzeSentiment: async () => ({ sentiment: 'neutral', score: 0.5, confidence: 0.9 }),
      detectToxicContent: async () => (
        isToxic
          ? { isToxic: true, score: 0.9, categories: { harassment: true } }
          : { isToxic: false, score: 0, categories: {} }
      ),
      moderateWithPolicy: async () => (
        policyViolation
          ? {
            available: true, isViolation: true, score: 80,
            reason: '遠回しな人格攻撃', category: 'harassment', cultureType: 'entertainment'
          }
          : { available: true, isViolation: false, score: 0, category: 'none', cultureType: 'entertainment' }
      )
    }));
    // eslint-disable-next-line global-require
    return require('../../src/scripts/evaluateModeration');
  };

  it('AI層が無効なとき、レポートはそれを明示する', async () => {
    jest.resetModules();
    // eslint-disable-next-line global-require
    const harness = require('../../src/scripts/evaluateModeration');
    const res = await harness.evaluate();
    expect(res.aiActive).toBe(false);
    expect(res.aiFlaggedCount).toBe(0);
  });

  it('AI層が有効なとき、レポートはそれを明示する', async () => {
    const harness = loadHarnessWithAi({ isToxic: false, policyViolation: false });
    const res = await harness.evaluate();
    expect(res.aiActive).toBe(true);
  });

  it('決定論的な根拠が無いのにAIが拾ったケースを寄与として数える', async () => {
    // すべてtoxic扱いにすると、NGワードを含まない無害な文まで検知される。
    // そのぶんが「AI層だけが拾った件数」に立つはず
    const harness = loadHarnessWithAi({ isToxic: true, policyViolation: true });
    const res = await harness.evaluate();
    expect(res.aiFlaggedCount).toBeGreaterThan(0);

    // 語彙で当たっているケースはAI寄与に数えない（二重計上しない）
    const lexical = res.rows.filter((r) => r.aiOnly === false && r.flagged);
    expect(lexical.length).toBeGreaterThan(0);
  });

  it('AI層はindirect（語彙に頼らない攻撃）の検知率を動かせる', async () => {
    // 決定論層はindirectを構造的に埋められない。AI層を入れると動くことを確認する
    // （実際の精度は鍵を入れて実測すること。ここで見るのは経路が繋がっていること）
    jest.resetModules();
    // eslint-disable-next-line global-require
    const withoutAi = await require('../../src/scripts/evaluateModeration').evaluate();
    const harness = loadHarnessWithAi({ isToxic: true, policyViolation: true });
    const withAi = await harness.evaluate();

    expect(withAi.byDifficulty.indirect.recall)
      .toBeGreaterThan(withoutAi.byDifficulty.indirect.recall);
  });

  it('AI層が有効でも、決定論的に検知済みのケースは検知されたまま', async () => {
    // arXiv:2607.12149 の制約: LLMの助言は決定論的判定を覆さない
    const harness = loadHarnessWithAi({ isToxic: false, policyViolation: false });
    const res = await harness.evaluate();
    const direct = res.byDifficulty.direct;
    expect(direct.recall).toBe(1);
  });
});
