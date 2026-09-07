// 「最初に登録したアカウントを管理者にする」ロジックの競合状態を検査する（E-42）。
//
// ---------------------------------------------------------------------------
// なぜ必要か
// ---------------------------------------------------------------------------
// E-40・E-41 で「役割の判定そのもの」の欠陥を塞いだ。次の問いは
// **「その役割は、誰がどう決めるのか。決め方自体は攻撃者にゲームされないか？」**である。
//
// `authController.register` は次の手順で最初の管理者を作る:
//
//   1. ユーザー名/メールの重複チェック（SELECT）
//   2. bcrypt.hash(password, 12)  ← 本番コストで数百msかかる
//   3. SELECT COUNT(*) FROM accounts  ← ここで 0 なら admin
//   4. INSERT INTO accounts (..., role) VALUES (..., role)
//
// 1〜4 は**別々のSQL文であり、途中に await が複数ある**。
// アカウントが1件も無い（＝配備直後の最も無防備な瞬間）状態で、
// **複数の登録リクエストを同時に送ると、全員が手順3で「0件」を観測し、
// 全員が admin になりうる**。ユーザー名/メールさえ重複させなければ
// UNIQUE制約は防波堤にならない。特にbcryptハッシュ化の待ち時間が
// チェックと書き込みの間の窓を大きく広げている。
//
// これは典型的な TOCTOU（check-then-act）競合であり、
// 「配備直後に誰が最初の管理者になるか」という**最も重要な瞬間**で起きる。
//
// ---------------------------------------------------------------------------
// このテストが固定すること
// ---------------------------------------------------------------------------
// アカウントが0件の状態から同時に複数の登録を送っても、
// **管理者になるのはちょうど1人**であること。
const request = require('supertest');
const app = require('../../src/app');
const db = require('../../src/db');

const dbRun = (sql, params = []) => new Promise((resolve, reject) => {
  db.run(sql, params, function cb(err) { if (err) reject(err); else resolve(this); });
});

describe('最初の管理者アカウント決定に競合状態が無いこと（E-42）', () => {
  beforeAll(async () => {
    await new Promise((resolve) => setTimeout(resolve, 1000));
    // 「配備直後にアカウントが0件」の状況を再現するため、このワーカー専用の
    // DBファイルから既存アカウントを一掃する。他のワーカーのDBファイルは別物なので
    // 干渉しない（tests/setup.js のコメント参照）。同一ワーカー内のテストファイルは
    // 並行実行されないため、他ファイルの実行中データを壊す心配もない
    await dbRun('DELETE FROM accounts');
  });

  test('アカウント0件の状態で同時に5件登録しても、adminになるのはちょうど1人', async () => {
    const N = 5;
    const requests = Array.from({ length: N }, (_, i) => request(app)
      .post('/api/users/register')
      .send({
        username: `race_user_${i}_${Date.now()}`,
        email: `race_user_${i}_${Date.now()}@example.com`,
        password: 'SecurePass123!'
      }));

    const responses = await Promise.all(requests);

    for (const res of responses) {
      expect(res.status).toBe(201);
    }

    const roles = responses.map((r) => r.body.user.role);
    const adminCount = roles.filter((r) => r === 'admin').length;

    expect(adminCount).toBe(1);
  });
});
