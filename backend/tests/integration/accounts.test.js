const request = require('supertest');
const bcrypt = require('bcrypt');
const { v4: uuidv4 } = require('uuid');
const app = require('../../src/app');
const db = require('../../src/db');

const dbGet = (sql, params = []) => new Promise((resolve, reject) => {
  db.get(sql, params, (err, row) => { if (err) reject(err); else resolve(row); });
});
const dbRun = (sql, params = []) => new Promise((resolve, reject) => {
  db.run(sql, params, function(err) { if (err) reject(err); else resolve(this); });
});

describe('Account Bootstrap and Role Management', () => {
  beforeAll(async () => {
    await new Promise(resolve => setTimeout(resolve, 1000));
  });

  afterAll(async () => {
    if (db && db.closeDatabase) {
      await db.closeDatabase();
    }
  });

  // 他のテストファイルが同じ test.db を共有するため、DBが空である保証はできない。
  // そのため「1件目は必ずadmin」ではなく、既存件数に応じた期待値で検証する。
  test('the first-ever registered account becomes admin; later ones default to moderator', async () => {
    const countBefore = await dbGet('SELECT COUNT(*) as cnt FROM accounts');

    const res = await request(app)
      .post('/api/users/register')
      .send({
        username: 'bootstrapTestUser',
        password: 'SecurePass123!',
        email: 'bootstraptest@example.com',
      })
      .expect(201);

    expect(res.body.user.role).toBe(countBefore.cnt === 0 ? 'admin' : 'moderator');

    const res2 = await request(app)
      .post('/api/users/register')
      .send({
        username: 'secondUser',
        password: 'SecurePass123!',
        email: 'seconduser@example.com',
      })
      .expect(201);

    // この時点でDBは空ではないため、必ずmoderatorになる
    expect(res2.body.user.role).toBe('moderator');
  });

  describe('with a known admin account', () => {
    const adminCreds = { username: 'seededAdmin', password: 'SecurePass123!' };
    let adminToken;

    beforeAll(async () => {
      const passwordHash = await bcrypt.hash(adminCreds.password, 12);
      await dbRun(
        `INSERT INTO accounts (id, username, email, password_hash, role, status) VALUES (?, ?, ?, ?, 'admin', 'active')`,
        [uuidv4(), adminCreds.username, 'seededadmin@example.com', passwordHash]
      );

      const loginRes = await request(app)
        .post('/api/users/login')
        .send(adminCreds)
        .expect(200);
      adminToken = loginRes.body.token;
    });

    test('an admin can list accounts and promote a moderator', async () => {
      const listRes = await request(app)
        .get('/api/users/accounts')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(listRes.body.success).toBe(true);
      const moderator = listRes.body.accounts.find(a => a.username === 'secondUser');
      expect(moderator).toBeDefined();
      expect(moderator.role).toBe('moderator');

      await request(app)
        .put(`/api/users/accounts/${moderator.id}/role`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ role: 'admin' })
        .expect(200);

      const listAfter = await request(app)
        .get('/api/users/accounts')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      const promoted = listAfter.body.accounts.find(a => a.username === 'secondUser');
      expect(promoted.role).toBe('admin');
    });

    test('rejects an invalid role value', async () => {
      await request(app)
        .put('/api/users/accounts/nonexistent-id/role')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ role: 'superadmin' })
        .expect(400);
    });

    test('a moderator cannot list accounts or change roles', async () => {
      const modRegister = await request(app)
        .post('/api/users/register')
        .send({
          username: 'plainModerator',
          password: 'SecurePass123!',
          email: 'plainmod@example.com',
        })
        .expect(201);
      expect(modRegister.body.user.role).toBe('moderator');

      const modLogin = await request(app)
        .post('/api/users/login')
        .send({ username: 'plainModerator', password: 'SecurePass123!' })
        .expect(200);

      await request(app)
        .get('/api/users/accounts')
        .set('Authorization', `Bearer ${modLogin.body.token}`)
        .expect(403);

      await request(app)
        .put(`/api/users/accounts/${modRegister.body.user.id}/role`)
        .set('Authorization', `Bearer ${modLogin.body.token}`)
        .send({ role: 'admin' })
        .expect(403);
    });
  });
});
