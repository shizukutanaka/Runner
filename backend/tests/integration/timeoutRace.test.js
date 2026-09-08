// 「ユーザーは同時に1件しかアクティブなタイムアウトを持たない」という
// 不変条件に競合状態が無いことを検査する（E-45）。
//
// ---------------------------------------------------------------------------
// なぜ必要か
// ---------------------------------------------------------------------------
// E-42（アカウント登録）・E-43（保留メッセージ承認）・E-44（パスワード
// リセット）と同じ形の check-then-act を、`usersController.timeoutUser`
// にも見つけた。
//
//   1. SELECT user_timeouts WHERE user_id=? AND status='active' AND timeout_until>now
//   2. 見つかれば 409「既にアクティブなタイムアウトがある」
//   3. 見つからなければ INSERT user_timeouts (..., status='active', ...)
//
// 手順1のチェックと手順3の書き込みが別文である。同じユーザーへ
// タイムアウトを同時に2回リクエストすると、**両方とも「アクティブなものは
// 無い」と判定し、両方ともINSERTしてしまう**——「1ユーザーにつき
// アクティブなタイムアウトは1件まで」という不変条件が破れる。
//
// これは単なる二重行の問題では終わらない。`removeTimeout` は
// `db.get`（1行だけ取得）でアクティブなタイムアウトを探し、
// **見つかった1行だけ**を`status='removed'`に更新する。
// アクティブな行が2件残っていると、モデレーターが解除操作をしても
// **もう1件が'active'のまま残り、ユーザーは解除されたと思わせておいて
// 実際にはタイムアウトが継続している**ことになる。
//
// ---------------------------------------------------------------------------
// このテストが固定すること
// ---------------------------------------------------------------------------
// 同じユーザーへ同時に複数のタイムアウト適用を送っても、
// アクティブな `user_timeouts` 行は**ちょうど1件**であること。
// さらに、その後の解除操作でアクティブな行が0件になること
// （解除したのに裏で継続してしまわないこと）。
const request = require('supertest');
const app = require('../../src/app');
const db = require('../../src/db');
const { generateToken } = require('../../src/middleware/auth');

const dbRun = (sql, params = []) => new Promise((resolve, reject) => {
  db.run(sql, params, function cb(err) { if (err) reject(err); else resolve(this); });
});
const dbAll = (sql, params = []) => new Promise((resolve, reject) => {
  db.all(sql, params, (err, rows) => { if (err) reject(err); else resolve(rows || []); });
});

describe('ユーザータイムアウトの適用に競合状態が無いこと（E-45）', () => {
  const moderatorToken = generateToken({ id: 'timeout-race-tester', role: 'moderator' });

  beforeAll(async () => {
    await new Promise((resolve) => setTimeout(resolve, 1000));
  });

  test('同じユーザーへ同時に5回タイムアウトを送っても、アクティブな行はちょうど1件', async () => {
    const userId = `timeout_race_${Date.now()}`;
    await dbRun(
      'INSERT INTO users (id,platform,username,status) VALUES (?,?,?,?)',
      [userId, 'youtube', userId, 'active']
    );

    const N = 5;
    const requests = Array.from({ length: N }, () => request(app)
      .post(`/api/users/${userId}/timeout`)
      .set('Authorization', `Bearer ${moderatorToken}`)
      .send({ duration: 3600, reason: 'race test', platform: 'youtube' }));

    const responses = await Promise.all(requests);
    const okCount = responses.filter((r) => r.status === 200).length;
    const conflictCount = responses.filter((r) => r.status === 409).length;

    expect(okCount).toBe(1);
    expect(conflictCount).toBe(N - 1);

    const activeRows = await dbAll(
      "SELECT id FROM user_timeouts WHERE user_id = ? AND status = 'active'",
      [userId]
    );
    expect(activeRows.length).toBe(1);
  });

  test('応答のtimeoutIdが、後続の書き込みのthisに上書きされず正しいこと', async () => {
    // 修正の副産物として見つけた別の欠陥: `sqlite3_last_insert_rowid()`は
    // 接続単位であり、テーブルを問わず「直近のINSERT」を指す。
    // 旧実装は timeout INSERT → history INSERT → users UPDATE と続くネストの
    // **一番内側（UPDATE）のコールバックで`this.lastID`を読んでおり**、
    // これは実際には直前に実行された history INSERT の id を指す。
    // `user_timeouts`と`user_timeout_history`が常に1行ずつペアで増える限り
    // 両テーブルのAUTOINCREMENTはたまたま足並みが揃うため**普段は気づけない**。
    // それを崩すため、先に`user_timeout_history`だけへ1行余分に挿入して
    // 2つの採番をわざとずらしておく
    const userId = `timeout_race_id_${Date.now()}`;
    await dbRun(
      'INSERT INTO users (id,platform,username,status) VALUES (?,?,?,?)',
      [userId, 'youtube', userId, 'active']
    );
    await dbRun(
      `INSERT INTO user_timeout_history (user_id, moderator_id, platform, reason, timeout_duration, timeout_until, status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
      ['decoy_user', 'decoy_mod', 'youtube', 'decoy row to desync autoincrement', 60, new Date().toISOString(), 'removed']
    );

    const res = await request(app)
      .post(`/api/users/${userId}/timeout`)
      .set('Authorization', `Bearer ${moderatorToken}`)
      .send({ duration: 3600, reason: 'id check', platform: 'youtube' });
    expect(res.status).toBe(200);

    const rows = await dbAll('SELECT id FROM user_timeouts WHERE user_id = ?', [userId]);
    expect(rows.length).toBe(1);
    // history側の採番は timeouts側より1つ先行しているはずなので、
    // ここが history の id と一致してしまっていたら旧実装のバグが再発している
    expect(res.body.data.timeoutId).toBe(rows[0].id);
  });

  test('解除操作の後、裏に残ったアクティブなタイムアウトが無いこと', async () => {
    const userId = `timeout_race_remove_${Date.now()}`;
    await dbRun(
      'INSERT INTO users (id,platform,username,status) VALUES (?,?,?,?)',
      [userId, 'youtube', userId, 'active']
    );

    const N = 3;
    await Promise.all(Array.from({ length: N }, () => request(app)
      .post(`/api/users/${userId}/timeout`)
      .set('Authorization', `Bearer ${moderatorToken}`)
      .send({ duration: 3600, reason: 'race test', platform: 'youtube' })));

    const removeRes = await request(app)
      .delete(`/api/users/${userId}/timeout`)
      .set('Authorization', `Bearer ${moderatorToken}`)
      .send({ reason: 'cleanup' });
    expect(removeRes.status).toBe(200);

    // 解除後、アクティブな行が1件も残っていないこと
    // （モデレーターが「解除した」と思っているのに、裏でタイムアウトが
    // 継続してしまう状態を許さない）
    const stillActive = await dbAll(
      "SELECT id FROM user_timeouts WHERE user_id = ? AND status = 'active'",
      [userId]
    );
    expect(stillActive.length).toBe(0);

    const user = await new Promise((resolve, reject) => {
      db.get('SELECT mute_until FROM users WHERE id = ?', [userId], (e, row) => (e ? reject(e) : resolve(row)));
    });
    expect(user.mute_until).toBeNull();
  });
});
