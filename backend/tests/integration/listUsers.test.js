const request = require('supertest');
const app = require('../../src/app');
const db = require('../../src/db');
const { generateToken } = require('../../src/middleware/auth');

const dbRun = (sql, params = []) => new Promise((resolve, reject) => {
  db.run(sql, params, function(err) { if (err) reject(err); else resolve(this); });
});

describe('GET /api/users (list)', () => {
  const moderatorToken = generateToken({ id: 'list-users-tester', role: 'moderator' });

  beforeAll(async () => {
    await new Promise(resolve => setTimeout(resolve, 1000));
    await dbRun(
      `INSERT INTO users (id, platform, username, status) VALUES (?, ?, ?, ?)`,
      ['listtest-1', 'youtube', 'alice_yt', 'active']
    );
    await dbRun(
      `INSERT INTO users (id, platform, username, status) VALUES (?, ?, ?, ?)`,
      ['listtest-2', 'twitch', 'bob_twitch', 'banned']
    );
  });

  afterAll(async () => {
    if (db && db.closeDatabase) {
      await db.closeDatabase();
    }
  });

  test('rejects unauthenticated access', async () => {
    await request(app).get('/api/users').expect(401);
  });

  test('lists users with pagination metadata', async () => {
    const res = await request(app)
      .get('/api/users')
      .set('Authorization', `Bearer ${moderatorToken}`)
      .expect(200);

    expect(Array.isArray(res.body.data.users)).toBe(true);
    expect(res.body.data.total).toBeGreaterThanOrEqual(2);
    expect(res.body.data.pagination).toHaveProperty('limit');
    expect(res.body.data.pagination).toHaveProperty('offset');
  });

  test('filters by platform', async () => {
    const res = await request(app)
      .get('/api/users?platform=twitch')
      .set('Authorization', `Bearer ${moderatorToken}`)
      .expect(200);

    expect(res.body.data.users.every(u => u.platform === 'twitch')).toBe(true);
    expect(res.body.data.users.some(u => u.username === 'bob_twitch')).toBe(true);
  });

  test('filters by status', async () => {
    const res = await request(app)
      .get('/api/users?status=banned')
      .set('Authorization', `Bearer ${moderatorToken}`)
      .expect(200);

    expect(res.body.data.users.every(u => u.status === 'banned')).toBe(true);
  });

  test('searches by username substring', async () => {
    const res = await request(app)
      .get('/api/users?search=alice')
      .set('Authorization', `Bearer ${moderatorToken}`)
      .expect(200);

    expect(res.body.data.users.some(u => u.username === 'alice_yt')).toBe(true);
  });

  test('does not match GET /:id route (no ID collision)', async () => {
    const res = await request(app)
      .get('/api/users/listtest-1')
      .set('Authorization', `Bearer ${moderatorToken}`)
      .expect(200);

    expect(res.body.data.id).toBe('listtest-1');
  });
});
