// 同じプラットフォームのメッセージIDを何度取り込んでも1件しか保存しないこと（E-54）。
//
// Twitch EventSub の再接続や YouTube の nextPageToken 再取得では、同じ
// メッセージが再配信されうる。以前の ingestComment は platformMessageId を
// 保存するだけで重複排除をしておらず、再配信のたびに同じコメントが
// 二重にモデレーション・保存され、統計と累犯カウントが水増しされた。
const db = require('../../src/db');
const { ingestComment } = require('../../src/controllers/commentsController');

const dbGet = (sql, params = []) => new Promise((resolve, reject) => {
  db.get(sql, params, (err, row) => { if (err) reject(err); else resolve(row); });
});

const count = async (platformMessageId) => {
  const c = await dbGet('SELECT COUNT(*) AS n FROM comments WHERE platform_message_id = ?', [platformMessageId]);
  const h = await dbGet('SELECT COUNT(*) AS n FROM held_messages WHERE platform_message_id = ?', [platformMessageId]);
  return c.n + h.n;
};

describe('取り込みの冪等性', () => {
  beforeAll(async () => { await new Promise((r) => setTimeout(r, 300)); });

  it('同じplatformMessageIdを5並列で取り込んでも、保存されるのは1件だけ', async () => {
    const pid = `idem_${Date.now()}_a`;
    const results = await Promise.all(Array.from({ length: 5 }, () => ingestComment({
      content: 'こんにちは、配信たのしいです', user: `idem_user_a_${Date.now()}`, platform: 'youtube',
      platformMessageId: pid
    })));
    expect(await count(pid)).toBe(1);
    expect(results.filter((r) => r.outcome === 'duplicate')).toHaveLength(4);
  });

  it('順次の再配信も重複として扱い、保存しない', async () => {
    const pid = `idem_${Date.now()}_b`;
    const args = { content: 'ありがとう', user: `idem_user_b_${Date.now()}`, platform: 'twitch', platformMessageId: pid };
    const first = await ingestComment(args);
    const second = await ingestComment(args);
    expect(first.outcome).toBe('created');
    expect(second.outcome).toBe('duplicate');
    expect(await count(pid)).toBe(1);
  });

  it('platformMessageIdが無い投稿（HTTP経由）は重複扱いにしない', async () => {
    const user = `idem_user_c_${Date.now()}`;
    const a = await ingestComment({ content: 'おはよう', user, platform: 'youtube' });
    const b = await ingestComment({ content: 'おはよう', user: `${user}_2`, platform: 'youtube' });
    expect(a.outcome).toBe('created');
    expect(b.outcome).toBe('created');
  });

  it('プラットフォームが違えば同じIDでも別のメッセージ', async () => {
    const pid = `idem_${Date.now()}_d`;
    const a = await ingestComment({ content: 'やあ', user: `idem_user_d_${Date.now()}`, platform: 'youtube', platformMessageId: pid });
    const b = await ingestComment({ content: 'やあ', user: `idem_user_d2_${Date.now()}`, platform: 'twitch', platformMessageId: pid });
    expect(a.outcome).toBe('created');
    expect(b.outcome).toBe('created');
  });
});
