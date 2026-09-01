// R-32: Twitch AutoMod 保留の取り込みと書き戻し。
//
// AutoMod が止めたメッセージはチャットに出ないまま Twitch 側のキューに溜まる。
// 取り込まないとモデレーターは二つのキューを見張ることになり、
// 「本製品の保留キューを空にしたのに未処理が残っている」状態が常態化する。
//
// 重要な設計上の違い: AutoMod 保留のメッセージは**まだ公開されていない**。
// したがって却下時の書き戻しは「削除」ではなく AutoMod キューへの DENY であり、
// 承認時は ALLOW（＝ここで初めて公開される）。この取り違えは
// 「モデレーターが承認したのに視聴者には永遠に見えない」という形で表面化する。
const { TwitchIngestionService } = require('../../src/services/twitchIngestionService');
const { dbGet, dbRun } = require('../../src/db');

const makeAutoModEvent = (overrides = {}) => ({
  broadcaster_user_id: '100',
  user_id: '200',
  user_login: 'chatter',
  user_name: 'Chatter',
  message_id: 'automod-msg-1',
  message: { text: 'この配信つまらない' },
  reason: 'automod',
  automod: { category: 'aggression', level: 3 },
  held_at: new Date().toISOString(),
  ...overrides
});

const notification = (type, event) => ({
  metadata: { message_type: 'notification' },
  payload: { subscription: { type }, event }
});

describe('Twitch AutoMod 連携（R-32）', () => {
  // src/db.js のスキーマ初期化は非同期IIFEなので、テーブル生成を待ってから触る
  // （他の統合テストと同じ待ち方）
  beforeAll(async () => {
    await new Promise((resolve) => setTimeout(resolve, 1000));
  });

  afterEach(async () => {
    await dbRun('DELETE FROM held_messages WHERE source = \'twitch_automod\'');
  });

  describe('保留キューへの取り込み', () => {
    it('AutoMod保留を source=twitch_automod として保留キューに入れる', async () => {
      const svc = new TwitchIngestionService();
      await svc._handleNotification(notification('automod.message.hold', makeAutoModEvent()));

      const row = await dbGet(
        'SELECT * FROM held_messages WHERE platform_message_id = ?', ['automod-msg-1']
      );
      expect(row).toBeDefined();
      expect(row.source).toBe('twitch_automod');
      expect(row.platform).toBe('twitch');
      expect(row.status).toBe('pending');
      expect(row.user).toBe('Chatter');
      expect(row.content).toBe('この配信つまらない');
    });

    it('AutoModの判定内容（カテゴリ・レベル）を保留理由として残す', async () => {
      const svc = new TwitchIngestionService();
      await svc._handleNotification(notification('automod.message.hold', makeAutoModEvent()));

      const row = await dbGet(
        'SELECT reasons FROM held_messages WHERE platform_message_id = ?', ['automod-msg-1']
      );
      const reasons = JSON.parse(row.reasons);
      expect(reasons[0].type).toBe('twitch_automod');
      expect(reasons[0].category).toBe('aggression');
      expect(reasons[0].level).toBe(3);
    });

    it('禁止語による保留は該当語を残す', async () => {
      const svc = new TwitchIngestionService();
      await svc._handleNotification(notification('automod.message.hold', makeAutoModEvent({
        message_id: 'automod-msg-2',
        reason: 'blocked_term',
        automod: null,
        blocked_term: { terms_found: [{ term_text: 'ngword' }] }
      })));

      const row = await dbGet(
        'SELECT hold_reason, reasons FROM held_messages WHERE platform_message_id = ?', ['automod-msg-2']
      );
      expect(row.hold_reason).toContain('禁止語');
      expect(JSON.parse(row.reasons)[0].blockedTerms).toEqual(['ngword']);
    });

    it('本文やユーザーが欠けた不正なイベントは無視する（例外を投げない）', async () => {
      const svc = new TwitchIngestionService();
      await expect(
        svc._handleNotification(notification('automod.message.hold', { message_id: 'x' }))
      ).resolves.not.toThrow();
      expect(await dbGet('SELECT * FROM held_messages WHERE platform_message_id = ?', ['x']))
        .toBeUndefined();
    });

    it('チャットメッセージの取り込み経路には影響しない', async () => {
      const svc = new TwitchIngestionService();
      // 購読していない型は無視される
      await expect(
        svc._handleNotification(notification('channel.follow', {}))
      ).resolves.not.toThrow();
    });
  });

  describe('Twitchへの書き戻し（フェイルセーフ）', () => {
    it('クレデンシャル未設定なら例外を投げず理由を返す', async () => {
      const svc = new TwitchIngestionService();
      expect(await svc.manageAutoModMessage('automod-msg-1', 'ALLOW'))
        .toEqual({ ok: false, reason: 'not_configured' });
    });

    it('メッセージIDが無い場合は理由を返す', async () => {
      const svc = new TwitchIngestionService();
      svc.enabled = true;
      expect(await svc.manageAutoModMessage(null, 'ALLOW'))
        .toEqual({ ok: false, reason: 'missing_message_id' });
    });

    it('ALLOW / DENY 以外のアクションは受け付けない', async () => {
      const svc = new TwitchIngestionService();
      svc.enabled = true;
      expect(await svc.manageAutoModMessage('m', 'DELETE'))
        .toEqual({ ok: false, reason: 'invalid_action' });
    });

    it('承認はALLOW、却下はDENYとしてTwitchに送られる', async () => {
      const svc = new TwitchIngestionService();
      svc.enabled = true;
      svc.userId = 'moderator-1';
      const calls = [];
      svc._helix = async (path, options) => {
        calls.push({ path, body: JSON.parse(options.body) });
        return null;
      };

      expect(await svc.manageAutoModMessage('m1', 'allow')).toEqual({ ok: true, action: 'ALLOW' });
      expect(await svc.manageAutoModMessage('m1', 'deny')).toEqual({ ok: true, action: 'DENY' });

      expect(calls).toHaveLength(2);
      expect(calls[0].path).toBe('/moderation/automod/message');
      expect(calls[0].body).toEqual({ user_id: 'moderator-1', msg_id: 'm1', action: 'ALLOW' });
      expect(calls[1].body.action).toBe('DENY');
    });

    it('API失敗時も例外を投げず理由を返す（ローカルの判断は保持される）', async () => {
      const svc = new TwitchIngestionService();
      svc.enabled = true;
      svc._helix = async () => { throw new Error('Twitch API 401: unauthorized'); };
      const r = await svc.manageAutoModMessage('m1', 'ALLOW');
      expect(r.ok).toBe(false);
      expect(r.reason).toBe('api_error');
    });
  });
});
