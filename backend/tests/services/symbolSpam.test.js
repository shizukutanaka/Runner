// R-27: シンボル/エモート連投スパム検知。
// Nightbot/Moobot/StreamElements 等が標準で備えるフィルタだが本製品には無かった。
//
// 最重要の設計制約: 英語圏Botの素朴な「記号比率」フィルタをそのまま適用すると、
// 日本語配信で日常的に使われる顔文字・www・8888・絵文字リアクションを
// スパム判定してしまう。これらは荒らしではなく文化なので、必ず通すこと。
const moderationService = require('../../src/services/moderationService');

const analyze = (t) => moderationService.analyzeComment(t, 'youtube', 'u', new Date().toISOString());

describe('シンボル/エモート連投検知（R-27）', () => {
  describe('検知すべきもの', () => {
    it('記号の長い連打を検知する', async () => {
      const r = await analyze('!!!!!!!!!!!!!!!!!!!!');
      expect(r.symbolSpam).toBe(true);
      expect(r.symbolSpamKind).toBe('repeated_symbol');
    });

    it('絵文字の長い連打を検知する（サロゲートペア対応）', async () => {
      const r = await analyze('🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥');
      expect(r.symbolSpam).toBe(true);
      expect(r.symbolSpamKind).toBe('repeated_symbol');
    });

    it('文字をほとんど含まない記号だけの長文を検知する', async () => {
      const r = await analyze('@@@###$$$%%%^^^&&&***');
      expect(r.symbolSpam).toBe(true);
      expect(r.symbolSpamKind).toBe('symbol_only');
    });
  });

  // 日本語配信文化を壊さないことの保証（最重要）
  describe('【誤検知ガード】日本語チャット文化を潰さない', () => {
    const mustPass = [
      ['顔文字', '(´・ω・｀) おはようございます'],
      ['顔文字複数', '(・∀・)ノ ヤッホー (^^)/ また来ます'],
      ['笑い(www)', 'wwwwwwwww'],
      ['拍手(8888)', '88888888'],
      ['絵文字リアクション', 'すごい！🎉🎉 おめでとう'],
      ['通常の日本語', '今日の配信も楽しかったです、ありがとう'],
      ['短い記号', '!!!']
    ];
    it.each(mustPass)('%s はスパム判定しない', async (_label, text) => {
      const r = await analyze(text);
      expect(r.symbolSpam).toBeUndefined();
    });
  });

  it('単体では拒否に至らない軽度シグナルである', async () => {
    const r = await analyze('!!!!!!!!!!!!!!!!!!!!');
    // フラグは立つが、isOffensive/isSpam 単独判定にはしない
    expect(r.symbolSpam).toBe(true);
    expect(r.isOffensive).toBe(false);
  });
});
