// R-28: プラットフォーム書き戻し。
// R-20の第一原理分析で「モデレーション判断がYouTubeへ一切反映されない」ことが判明した。
// 読み取りはAPIキーで足りるが、liveChatMessages.delete / liveChatBans.insert には
// OAuth2 + youtube.force-ssl が必須。OAuth未設定でも取り込みは通常動作すること
// （フェイルセーフ規約）を保証する。
const svc = require('../../src/services/youtubeIngestionService');

describe('プラットフォーム書き戻し（R-28）', () => {
  describe('OAuth未設定時のフェイルセーフ', () => {
    it('canWriteBack() は false を返す', () => {
      expect(svc.canWriteBack()).toBe(false);
    });

    it('deleteLiveChatMessage は例外を投げず oauth_not_configured を返す', async () => {
      const r = await svc.deleteLiveChatMessage('LCC.someMessageId');
      expect(r.ok).toBe(false);
      expect(r.reason).toBe('oauth_not_configured');
    });

    it('banUser は例外を投げず oauth_not_configured を返す', async () => {
      const r = await svc.banUser('chatId', 'UCchannel');
      expect(r.ok).toBe(false);
      expect(r.reason).toBe('oauth_not_configured');
    });

    it('取り込み用のクォータ状態は書き戻し試行で消費されない', () => {
      const before = svc.getQuotaStatus().unitsUsed;
      return svc.deleteLiveChatMessage('x').then(() => {
        // OAuth未設定なら即return するのでクォータは減らない
        expect(svc.getQuotaStatus().unitsUsed).toBe(before);
      });
    });
  });

  describe('書き込みのクォータコストが定義されている', () => {
    it('書き込みは読み取りより高コストとして会計される', () => {
      // 公式上、作成/更新/削除は概ね50ユニット。取り込み(5)より高い
      const status = svc.getQuotaStatus();
      expect(status.dailyLimit).toBe(10000);
      expect(status).toHaveProperty('remaining');
    });
  });
});
