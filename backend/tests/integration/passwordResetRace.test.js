// パスワードリセットトークンが「一度しか使えない」ことを検査する（E-44）。
//
// ---------------------------------------------------------------------------
// なぜ必要か
// ---------------------------------------------------------------------------
// E-42・E-43で見つけた check-then-act の形を、他の「一度きり」であるべき
// 資源にも当ててみた。パスワードリセットトークンは典型例である
// （`reset_token_hash` を使用後に NULL へ戻す＝single-use が設計意図）。
//
// `authController.resetPassword` は（修正前）:
//
//   1. SELECT accounts WHERE reset_token_hash = ? AND reset_token_expires > CURRENT_TIMESTAMP
//   2. account が無ければ 400
//   3. bcrypt.hash(newPassword, ...)  ← 本番コストで数百ms
//   4. UPDATE accounts SET password_hash=?, reset_token_hash=NULL, ...
//      WHERE id = ?   ← トークンの再検証をしていない、idだけで確定
//
// 手順1の検証と手順4の確定（トークンを使い切る操作）が別文であり、
// **手順4のWHERE句はトークンを再検証しない**。同じトークンで2つの
// resetPasswordリクエストが同時に届くと、**両方とも手順1で「有効だ」と
// 判定し、両方ともパスワードを変更できてしまう**——トークンが
// single-useであるという設計意図に反する。
//
// リセットトークンの漏えい（メール盗み見・共有受信箱・ログ露出等）を
// 前提にした攻撃では、正規ユーザーが1回使った「はず」のトークンが
// 攻撃者にも通用してしまう窓が生まれる。
//
// ---------------------------------------------------------------------------
// このテストが固定すること
// ---------------------------------------------------------------------------
// 同じトークンで同時に複数のリセットを試みても、**成功するのはちょうど1回**
// であること。
const request = require('supertest');
const bcrypt = require('bcrypt');
const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');
const app = require('../../src/app');
const db = require('../../src/db');

const dbRun = (sql, params = []) => new Promise((resolve, reject) => {
  db.run(sql, params, function cb(err) { if (err) reject(err); else resolve(this); });
});

describe('パスワードリセットトークンがsingle-useであること（E-44）', () => {
  beforeAll(async () => {
    await new Promise((resolve) => setTimeout(resolve, 1000));
  });

  test('同じトークンで同時に5回リセットを試みても、成功するのはちょうど1回', async () => {
    const accountId = uuidv4();
    const rawToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
    const expires = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    const passwordHash = await bcrypt.hash('OriginalPass123!', 4);

    await dbRun(
      `INSERT INTO accounts (id, username, email, password_hash, role, status, reset_token_hash, reset_token_expires)
       VALUES (?, ?, ?, ?, 'moderator', 'active', ?, ?)`,
      [accountId, `pwreset_${Date.now()}`, `pwreset_${Date.now()}@example.com`, passwordHash, tokenHash, expires]
    );

    const N = 5;
    const requests = Array.from({ length: N }, (_, i) => request(app)
      .post('/api/users/reset-password')
      .send({ token: rawToken, newPassword: `SecurePass${i}word!` }));

    const responses = await Promise.all(requests);
    const successCount = responses.filter((r) => r.status === 200).length;

    expect(successCount).toBe(1);
  });
});
