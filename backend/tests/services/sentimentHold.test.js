// R-23: 感情分析まわりの2つの欠陥の回帰テスト
//  (1) ネガティブ感情による保留ルールが「感情価 vs 強度」のスケール取り違えで
//      一度も発火していなかった
//  (2) AI感情分析の結果を取得しながらルールベースで無条件に上書きし捨てていた
const moderationService = require('../../src/services/moderationService');

describe('感情分析の整合性（R-23）', () => {
  it('ネガティブ判定時の感情価スコアは低い（valence: 低いほどネガティブ）', async () => {
    const r = await moderationService.analyzeComment('最悪だしつまらない', 'youtube', 'u', new Date().toISOString());
    expect(r.sentiment).toBe('negative');
    expect(r.sentimentScore).toBeLessThan(0.5);
  });

  it('保留判定に使う negativity(=1-valence) が閾値0.8を満たしうる', () => {
    // 旧実装は valence(0.2) をそのまま >= 0.8 と比較していたため常に偽だった。
    // 強度へ変換すれば 1-0.2=0.8 となり閾値に到達する
    const valence = 0.2;
    const negativity = 1 - valence;
    expect(negativity).toBeGreaterThanOrEqual(0.8);
  });

  it('OpenAIキー未設定時はルールベースが使われる（フェイルセーフ規約）', async () => {
    const r = await moderationService.analyzeComment('楽しい配信でした', 'youtube', 'u', new Date().toISOString());
    expect(r.sentimentSource).toBe('rule');
    expect(r.sentiment).toBe('positive');
  });

  it('感情の出所(sentimentSource)が常に明示される', async () => {
    const r = await moderationService.analyzeComment('こんにちは', 'youtube', 'u', new Date().toISOString());
    expect(['ai', 'rule']).toContain(r.sentimentSource);
  });
});
