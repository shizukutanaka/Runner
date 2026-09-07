// 保留メッセージの二重処理に競合状態が無いことを検査する（E-43）。
//
// ---------------------------------------------------------------------------
// なぜ必要か
// ---------------------------------------------------------------------------
// E-42 で「最初のアカウントを管理者にする」ロジックの check-then-act 競合を見つけた。
// その次の問いは**「同じ形は他にも無いか」**である。件数ではなく状態
// （`status !== 'pending'`）で分岐する箇所を探したところ、
// `moderationController.processHeldMessage` に同じ形があった。
//
//   1. SELECT held_messages WHERE id = ?          ← ここで status を読む
//   2. if (held.status !== 'pending') return 409; ← チェック
//   3. (approve の場合) INSERT INTO comments ...   ← 別の文（間に await が入る）
//   4. UPDATE held_messages SET status = ... WHERE id = ?  ← ここでようやく確定
//
// 手順1のチェックと手順4の確定の間に**書き込みを伴う別の文**が挟まっている。
// 同じ保留メッセージに対して2つのリクエスト（二重クリック、リトライ、
// 複数モデレーターの同時操作）が同時に届くと、**両方とも手順2で
// 「pending だ」と判定し、両方とも処理を進めてしまう**。
//
// 具体的な害:
//   - approve を2回同時に送ると、**同じメッセージに対応するコメントが2件**
//     comments テーブルに作られる（視聴者から見て同じ発言が2回表示される）
//   - approve と reject を同時に送ると、コメントは作られたのに最終的な
//     held_messages.status は 'rejected' になりうる（**存在するはずのないコメント**
//     と、**「拒否した」という記録**が矛盾したまま残る）
//
// ---------------------------------------------------------------------------
// このテストが固定すること
// ---------------------------------------------------------------------------
// 同じ保留メッセージに対する同時approveは、**一度しか処理されない**こと
// （comments に増える行数は1件だけ）。
const request = require('supertest');
const app = require('../../src/app');
const db = require('../../src/db');
const { generateToken } = require('../../src/middleware/auth');

const dbRun = (sql, params = []) => new Promise((resolve, reject) => {
  db.run(sql, params, function cb(err) { if (err) reject(err); else resolve(this); });
});
const dbGet = (sql, params = []) => new Promise((resolve, reject) => {
  db.get(sql, params, (err, row) => { if (err) reject(err); else resolve(row); });
});
const dbAll = (sql, params = []) => new Promise((resolve, reject) => {
  db.all(sql, params, (err, rows) => { if (err) reject(err); else resolve(rows || []); });
});

describe('保留メッセージの承認に競合状態が無いこと（E-43）', () => {
  const moderatorToken = generateToken({ id: 'race-tester', role: 'moderator' });

  beforeAll(async () => {
    await new Promise((resolve) => setTimeout(resolve, 1000));
  });

  test('同じ保留メッセージへの同時approveは、コメントを1件しか作らない', async () => {
    const messageId = `race_msg_${Date.now()}`;
    const user = `race_user_${Date.now()}`;

    const inserted = await dbRun(
      `INSERT INTO held_messages (message_id, content, user, platform, hold_reason, risk_score, hold_level, reasons, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending')`,
      [messageId, 'racing content', user, 'youtube', 'ai_score', 0.6, 'medium', '[]']
    );
    const holdId = inserted.lastID;

    const N = 5;
    const requests = Array.from({ length: N }, () => request(app)
      .put(`/api/moderation/held-messages/${holdId}`)
      .set('Authorization', `Bearer ${moderatorToken}`)
      .send({ action: 'approve', reason: 'race test' }));

    const responses = await Promise.all(requests);

    // 少なくとも1件は成功しなければ意味が無い
    const okCount = responses.filter((r) => r.status === 200).length;
    expect(okCount).toBeGreaterThanOrEqual(1);

    const comments = await dbAll('SELECT id FROM comments WHERE user = ?', [user]);
    expect(comments.length).toBe(1);

    const finalHold = await dbGet('SELECT status FROM held_messages WHERE id = ?', [holdId]);
    expect(finalHold.status).toBe('approved');
  });

  test('approveとrejectを同時に送っても、状態とコメントの有無が矛盾しない', async () => {
    // 最悪のケース: approveがコメントを作った直後に、rejectが最終状態を
    // 'rejected' に書き換えると、「拒否したはずなのにコメントが存在する」
    // という監査上の矛盾が残る。claimを取れた方だけが処理を進めるので、
    // この組み合わせでも「コメントが有る ⇔ 最終状態がapproved」が一致するはず
    const messageId = `race_mix_${Date.now()}`;
    const user = `race_mix_user_${Date.now()}`;

    const inserted = await dbRun(
      `INSERT INTO held_messages (message_id, content, user, platform, hold_reason, risk_score, hold_level, reasons, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending')`,
      [messageId, 'mixed race content', user, 'youtube', 'ai_score', 0.6, 'medium', '[]']
    );
    const holdId = inserted.lastID;

    const actions = ['approve', 'reject', 'approve', 'reject', 'approve'];
    const responses = await Promise.all(actions.map((action) => request(app)
      .put(`/api/moderation/held-messages/${holdId}`)
      .set('Authorization', `Bearer ${moderatorToken}`)
      .send({ action, reason: 'mixed race test' })));

    // 成功したのはちょうど1件（claimを取れたのは1件だけ）で、残りは409
    const okCount = responses.filter((r) => r.status === 200).length;
    const conflictCount = responses.filter((r) => r.status === 409).length;
    expect(okCount).toBe(1);
    expect(conflictCount).toBe(actions.length - 1);

    const comments = await dbAll('SELECT id FROM comments WHERE user = ?', [user]);
    const finalHold = await dbGet('SELECT status FROM held_messages WHERE id = ?', [holdId]);

    // コメントが存在する ⇔ 最終状態が approved（矛盾が無い）
    if (finalHold.status === 'approved') {
      expect(comments.length).toBe(1);
    } else {
      expect(comments.length).toBe(0);
    }
  });

  test('一括処理（bulk）の中で同じホールドIDが単発処理と競合しても二重処理しない', async () => {
    // bulkProcessHeldMessages は単発の processHeldMessage とは別のコードパスである。
    // 「同じ形の欠陥を全部探す」の一環として、この2つのエンドポイントが
    // 同じ保留メッセージを同時に取り合った場合も安全であることを固定する
    const messageId = `race_bulk_${Date.now()}`;
    const user = `race_bulk_user_${Date.now()}`;

    const inserted = await dbRun(
      `INSERT INTO held_messages (message_id, content, user, platform, hold_reason, risk_score, hold_level, reasons, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending')`,
      [messageId, 'bulk race content', user, 'youtube', 'ai_score', 0.6, 'medium', '[]']
    );
    const holdId = inserted.lastID;

    const single = () => request(app)
      .put(`/api/moderation/held-messages/${holdId}`)
      .set('Authorization', `Bearer ${moderatorToken}`)
      .send({ action: 'approve', reason: 'single side' });

    const bulk = () => request(app)
      .post('/api/moderation/held-messages/bulk')
      .set('Authorization', `Bearer ${moderatorToken}`)
      .send({ holdIds: [holdId], action: 'approve', reason: 'bulk side' });

    const bulkResponses = await Promise.all([single(), single(), bulk(), bulk()])
      .then((all) => all.filter((r) => r.request.method === 'POST'));

    const comments = await dbAll('SELECT id FROM comments WHERE user = ?', [user]);
    expect(comments.length).toBe(1);

    // bulk側が自己申告する processed 件数も、実際に取れたclaimの数
    // （＝コメント1件）を超えてはならない（自己申告と実際の書き込みの不一致を防ぐ）
    const totalBulkProcessed = bulkResponses
      .filter((r) => r.status === 200)
      .reduce((sum, r) => sum + (r.body?.data?.processed || 0), 0);
    expect(totalBulkProcessed).toBeLessThanOrEqual(1);
  });
});
