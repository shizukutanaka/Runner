// 「最後の管理者を降格できてはいけない」不変条件を検査する（E-49）。
//
// ---------------------------------------------------------------------------
// なぜ必要か
// ---------------------------------------------------------------------------
// `PUT /api/users/accounts/:id/role`（役割変更）と
// `GET /api/users/accounts`（アカウント一覧）は、どちらも**admin専用**である。
// 以前は役割変更に歯止めが無く、**最後の1人のadminをmoderatorへ格下げ**
// できた（自分自身の格下げも、他のadminの格下げも区別なく通っていた）。
//
// それが起きた瞬間、役割を戻せるadminがもう存在しなくなる。この製品には
// admin専用のエンドポイントが64件あり（アカウント管理・監視ダッシュボード・
// 設定エクスポート等）、それら**全てが永久にアクセス不能**になる——
// DBを直接操作する以外に復旧手段が無い。
//
// ---------------------------------------------------------------------------
// テストの設計
// ---------------------------------------------------------------------------
// テストDBは他のファイルと共有されており、この時点で他のadminアカウントが
// 既に存在しうる。「本当に最後の1人か」を制御するため、まず既存の
// adminを全員moderatorへ格下げして意図的に「admin1人だけ」の状態を作る
// （このテストはファイル内の他のテストに影響しないよう、admin不在の
// 一括操作系テストが無いこのファイル単独で完結させる）。
const request = require('supertest');
const bcrypt = require('bcrypt');
const { v4: uuidv4 } = require('uuid');
const app = require('../../src/app');
const db = require('../../src/db');

const dbRun = (sql, params = []) => new Promise((resolve, reject) => {
  db.run(sql, params, function cb(err) { if (err) reject(err); else resolve(this); });
});
const dbAll = (sql, params = []) => new Promise((resolve, reject) => {
  db.all(sql, params, (err, rows) => { if (err) reject(err); else resolve(rows || []); });
});

describe('最後の管理者を降格できないこと（E-49）', () => {
  beforeAll(async () => {
    await new Promise((resolve) => setTimeout(resolve, 1000));
  });

  test('唯一のadminは、自分自身も含めて誰からも降格できない', async () => {
    // 既存のadminを全員moderatorへ落とし、この後作る1人だけをadminにする
    await dbRun("UPDATE accounts SET role = 'moderator' WHERE role = 'admin'");

    const passwordHash = await bcrypt.hash('SecurePass123!', 4);
    const soleAdminId = uuidv4();
    const soleAdminUsername = `sole_admin_${Date.now()}`;
    await dbRun(
      `INSERT INTO accounts (id, username, email, password_hash, role, status)
       VALUES (?, ?, ?, ?, 'admin', 'active')`,
      [soleAdminId, soleAdminUsername, `${soleAdminUsername}@example.com`, passwordHash]
    );

    const before = await dbAll("SELECT id FROM accounts WHERE role = 'admin'");
    expect(before).toHaveLength(1);
    expect(before[0].id).toBe(soleAdminId);

    const loginRes = await request(app)
      .post('/api/users/login')
      .send({ username: soleAdminUsername, password: 'SecurePass123!' })
      .expect(200);
    const token = loginRes.body.token;

    // 唯一のadminが「自分自身」をmoderatorへ格下げしようとする
    const res = await request(app)
      .put(`/api/users/accounts/${soleAdminId}/role`)
      .set('Authorization', `Bearer ${token}`)
      .send({ role: 'moderator' });

    expect(res.status).toBe(409);

    const after = await dbAll("SELECT id, role FROM accounts WHERE id = ?", [soleAdminId]);
    expect(after[0].role).toBe('admin');
  });

  test('2人目のadminを昇格させれば、元のadminを降格できる（締めすぎ防止）', async () => {
    await dbRun("UPDATE accounts SET role = 'moderator' WHERE role = 'admin'");

    const passwordHash = await bcrypt.hash('SecurePass123!', 4);
    const firstAdminId = uuidv4();
    const secondAdminId = uuidv4();
    await dbRun(
      `INSERT INTO accounts (id, username, email, password_hash, role, status)
       VALUES (?, ?, ?, ?, 'admin', 'active')`,
      [firstAdminId, `first_admin_${Date.now()}`, `first_admin_${Date.now()}@example.com`, passwordHash]
    );
    await dbRun(
      `INSERT INTO accounts (id, username, email, password_hash, role, status)
       VALUES (?, ?, ?, ?, 'moderator', 'active')`,
      [secondAdminId, `second_admin_${Date.now()}`, `second_admin_${Date.now()}@example.com`, passwordHash]
    );

    const loginRow = (await dbAll('SELECT username FROM accounts WHERE id = ?', [firstAdminId]))[0];
    const loginRes = await request(app)
      .post('/api/users/login')
      .send({ username: loginRow.username, password: 'SecurePass123!' })
      .expect(200);
    const token = loginRes.body.token;

    // まず2人目をadminへ昇格（これは常に許可される）
    await request(app)
      .put(`/api/users/accounts/${secondAdminId}/role`)
      .set('Authorization', `Bearer ${token}`)
      .send({ role: 'admin' })
      .expect(200);

    // 今度は1人目を降格しても、2人目が残るので成功するはず
    const res = await request(app)
      .put(`/api/users/accounts/${firstAdminId}/role`)
      .set('Authorization', `Bearer ${token}`)
      .send({ role: 'moderator' });

    expect(res.status).toBe(200);

    const finalAdmins = await dbAll("SELECT id FROM accounts WHERE role = 'admin'");
    expect(finalAdmins.map((r) => r.id)).toEqual([secondAdminId]);
  });
});
