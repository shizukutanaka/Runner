const request = require('supertest');
const app = require('../../src/app');
const db = require('../../src/db');
const { dbRun } = require('../../src/db');
const { generateToken } = require('../../src/middleware/auth');

// 既存の heldMessages.test.js は afterAll で共有DBを閉じるため、同じファイルに
// 追記すると後続の describe が "Database is closed" で落ちる。別ファイルにする。

beforeAll(async () => {
  await new Promise((resolve) => setTimeout(resolve, 1000));
});

// R-32: AutoMod保留の処理がTwitch側に返ること（因果鎖③の閉じ込み）。
//
// AutoModが止めたメッセージは**まだ公開されていない**。したがって
//   承認 → ALLOW（ここで初めて公開される）
//   却下 → DENY（破棄される）
// であって「削除」ではない。取り違えると「モデレーターが承認したのに
// 視聴者には永遠に見えない」という形で表面化する。
describe('AutoMod保留の処理がTwitchへ返ること（R-32）', () => {
  const moderatorToken = generateToken({ id: 'automod-tester', role: 'moderator' });
  const twitchIngestionService = require('../../src/services/twitchIngestionService');
  let original;
  let calls;

  beforeEach(() => {
    calls = [];
    original = twitchIngestionService.manageAutoModMessage;
    twitchIngestionService.manageAutoModMessage = async (messageId, action) => {
      calls.push({ messageId, action });
      return { ok: true, action };
    };
  });

  afterEach(async () => {
    twitchIngestionService.manageAutoModMessage = original;
    await dbRun('DELETE FROM held_messages WHERE source = \'twitch_automod\'');
  });

  const seedAutoModHold = async (messageId) => {
    const r = await dbRun(
      `INSERT INTO held_messages
        (message_id, content, user, platform, hold_reason, hold_level, reasons, status,
         platform_message_id, source)
       VALUES (?, ?, ?, 'twitch', 'Twitch AutoMod: aggression', 'medium', '[]', 'pending', ?, 'twitch_automod')`,
      [`automod_${messageId}`, 'held by automod', 'chatter', messageId]
    );
    return r.lastID;
  };

  test('承認するとALLOWがTwitchへ送られる', async () => {
    const holdId = await seedAutoModHold('am-approve-1');
    const res = await request(app)
      .put(`/api/moderation/held-messages/${holdId}`)
      .set('Authorization', `Bearer ${moderatorToken}`)
      .send({ action: 'approve' })
      .expect(200);

    expect(calls).toEqual([{ messageId: 'am-approve-1', action: 'ALLOW' }]);
    expect(res.body.data.platformDeletion.kind).toBe('twitch_automod');
    expect(res.body.data.platformDeletion.ok).toBe(true);
  });

  test('却下するとDENYがTwitchへ送られる（削除APIは呼ばない）', async () => {
    const holdId = await seedAutoModHold('am-reject-1');
    await request(app)
      .put(`/api/moderation/held-messages/${holdId}`)
      .set('Authorization', `Bearer ${moderatorToken}`)
      .send({ action: 'reject' })
      .expect(200);

    expect(calls).toEqual([{ messageId: 'am-reject-1', action: 'DENY' }]);
  });

  test('Twitchへの書き戻しが失敗してもローカルの処理は確定する', async () => {
    twitchIngestionService.manageAutoModMessage = async () => ({ ok: false, reason: 'api_error' });
    const holdId = await seedAutoModHold('am-fail-1');
    const res = await request(app)
      .put(`/api/moderation/held-messages/${holdId}`)
      .set('Authorization', `Bearer ${moderatorToken}`)
      .send({ action: 'reject' })
      .expect(200);

    expect(res.body.data.platformDeletion.ok).toBe(false);
    const row = await new Promise((resolve, reject) => {
      db.get('SELECT status FROM held_messages WHERE id = ?', [holdId],
        (err, r) => (err ? reject(err) : resolve(r)));
    });
    expect(row.status).toBe('rejected');
  });
});
