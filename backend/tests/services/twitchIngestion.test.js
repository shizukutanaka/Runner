// R-29: Twitch チャット取り込み。
//
// 製品名が「YouTube & Twitch」を約束しているのに未実装だった片翼。
// 経路は R-7 で確定した EventSub WebSocket + channel.chat.message。
//
// 最も間違えやすいのが **Shared Chat**（2024年導入の合同配信）の扱い。
// 合同配信ではメッセージが参加チャンネル全体にミラーされ、ペイロードに
// source_broadcaster_user_id が付く。これを自チャンネルと突き合わせないと
// 同一メッセージを多重処理し、二重BAN等が発生する。
const { TwitchIngestionService } = require('../../src/services/twitchIngestionService');

describe('Twitch取り込み（R-29）', () => {
  describe('クレデンシャル未設定時のフェイルセーフ', () => {
    it('未設定なら isEnabled() が false（例外は投げない）', () => {
      const svc = new TwitchIngestionService();
      expect(svc.isEnabled()).toBe(false);
    });

    it('未設定で startWatching しても例外を投げず理由を返す', async () => {
      const svc = new TwitchIngestionService();
      const r = await svc.startWatching('123456');
      expect(r.started).toBe(false);
      expect(r.reason).toBe('not_configured');
    });

    it('監視していない配信者の停止は理由を返す', async () => {
      const svc = new TwitchIngestionService();
      const r = await svc.stopWatching('nope');
      expect(r.stopped).toBe(false);
      expect(r.reason).toBe('not_watching');
    });

    it('listWatches() は空配列を返す', () => {
      expect(new TwitchIngestionService().listWatches()).toEqual([]);
    });
  });

  describe('Shared Chat のミラー除外（二重処理の防止）', () => {
    const makeNotification = (event) => ({
      metadata: { message_type: 'notification' },
      payload: { subscription: { type: 'channel.chat.message' }, event }
    });

    let svc;
    let ingested;

    beforeEach(() => {
      jest.resetModules();
      ingested = [];
      jest.doMock('../../src/controllers/commentsController', () => ({
        ingestComment: async (payload) => { ingested.push(payload); }
      }));
      // doMock 後に読み込む（遅延requireを実際に効かせるため）
      const { TwitchIngestionService: Svc } = require('../../src/services/twitchIngestionService');
      svc = new Svc();
    });

    afterEach(() => {
      jest.resetModules();
      jest.dontMock('../../src/controllers/commentsController');
    });

    it('自チャンネル由来のメッセージは取り込む', async () => {
      await svc._handleNotification(makeNotification({
        broadcaster_user_id: 'B1',
        chatter_user_name: 'viewer1',
        chatter_user_id: 'U1',
        message_id: 'M1',
        message: { text: 'こんにちは' }
      }));
      expect(ingested).toHaveLength(1);
      expect(ingested[0].platform).toBe('twitch');
      expect(ingested[0].platformMessageId).toBe('M1');
      expect(ingested[0].authorChannelId).toBe('U1');
    });

    it('source が自チャンネルと一致するミラーは取り込む', async () => {
      await svc._handleNotification(makeNotification({
        broadcaster_user_id: 'B1',
        source_broadcaster_user_id: 'B1',
        chatter_user_name: 'viewer1',
        message_id: 'M2',
        message: { text: 'やあ' }
      }));
      expect(ingested).toHaveLength(1);
    });

    it('【二重処理ガード】他チャンネル由来のミラーは取り込まない', async () => {
      await svc._handleNotification(makeNotification({
        broadcaster_user_id: 'B1',
        source_broadcaster_user_id: 'B2', // 合同配信の相手チャンネル由来
        chatter_user_name: 'viewer1',
        message_id: 'M3',
        message: { text: 'ミラーされたメッセージ' }
      }));
      expect(ingested).toHaveLength(0);
    });

    it('チャットメッセージ以外の通知は無視する', async () => {
      await svc._handleNotification({
        metadata: { message_type: 'notification' },
        payload: { subscription: { type: 'channel.follow' }, event: {} }
      });
      expect(ingested).toHaveLength(0);
    });

    it('本文またはユーザー名が欠けた通知は取り込まない', async () => {
      await svc._handleNotification(makeNotification({
        broadcaster_user_id: 'B1', message: { text: '' }, chatter_user_name: 'v'
      }));
      await svc._handleNotification(makeNotification({
        broadcaster_user_id: 'B1', message: { text: 'あり' }
      }));
      expect(ingested).toHaveLength(0);
    });
  });
});
