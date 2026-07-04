const request = require('supertest');
const app = require('../../src/app');
const db = require('../../src/db');
const { generateToken } = require('../../src/middleware/auth');

const dbRun = (sql, params = []) => new Promise((resolve, reject) => {
  db.run(sql, params, function(err) { if (err) reject(err); else resolve(this); });
});

describe('Held Messages Queue', () => {
  const moderatorToken = generateToken({ id: 'held-msg-tester', role: 'moderator' });

  beforeAll(async () => {
    await new Promise(resolve => setTimeout(resolve, 1000));
  });

  afterAll(async () => {
    if (db && db.closeDatabase) {
      await db.closeDatabase();
    }
  });

  test('rejects unauthenticated access', async () => {
    await request(app).get('/api/moderation/held-messages').expect(401);
  });

  test('lists held messages and stats', async () => {
    await dbRun(
      `INSERT INTO held_messages (message_id, content, user, platform, hold_reason, risk_score, hold_level, reasons, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending')`,
      ['msg_test_1', 'suspicious content', 'testuser', 'youtube', 'ai_score', 0.75, 'medium', '[]']
    );

    const listRes = await request(app)
      .get('/api/moderation/held-messages')
      .set('Authorization', `Bearer ${moderatorToken}`)
      .expect(200);

    expect(listRes.body.data.messages.length).toBeGreaterThan(0);
    expect(listRes.body.data.pending).toBeGreaterThan(0);

    const statsRes = await request(app)
      .get('/api/moderation/held-messages/stats')
      .set('Authorization', `Bearer ${moderatorToken}`)
      .expect(200);

    expect(statsRes.body.data.queueStatus.pending).toBeGreaterThan(0);
  });

  test('approving a held message creates a real comment', async () => {
    const insertResult = await dbRun(
      `INSERT INTO held_messages (message_id, content, user, platform, hold_reason, risk_score, hold_level, reasons, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending')`,
      ['msg_test_2', 'approve me please', 'approveuser', 'twitch', 'suspicious_keywords', 0.6, 'low', '[]']
    );
    const holdId = insertResult.lastID;

    const res = await request(app)
      .put(`/api/moderation/held-messages/${holdId}`)
      .set('Authorization', `Bearer ${moderatorToken}`)
      .send({ action: 'approve', reason: 'looks fine' })
      .expect(200);

    expect(res.body.data.action).toBe('approve');

    const commentRow = await new Promise((resolve, reject) => {
      db.get('SELECT * FROM comments WHERE user = ?', ['approveuser'], (err, row) => {
        if (err) reject(err); else resolve(row);
      });
    });
    expect(commentRow).toBeDefined();
    expect(commentRow.content).toBe('approve me please');
  });

  test('rejecting a held message does not create a comment', async () => {
    const insertResult = await dbRun(
      `INSERT INTO held_messages (message_id, content, user, platform, hold_reason, risk_score, hold_level, reasons, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending')`,
      ['msg_test_3', 'reject me', 'rejectuser', 'youtube', 'ai_score', 0.9, 'high', '[]']
    );
    const holdId = insertResult.lastID;

    await request(app)
      .put(`/api/moderation/held-messages/${holdId}`)
      .set('Authorization', `Bearer ${moderatorToken}`)
      .send({ action: 'reject', reason: 'spam' })
      .expect(200);

    const commentRow = await new Promise((resolve, reject) => {
      db.get('SELECT * FROM comments WHERE user = ?', ['rejectuser'], (err, row) => {
        if (err) reject(err); else resolve(row);
      });
    });
    expect(commentRow).toBeUndefined();
  });

  test('returns 404 for a non-existent hold id', async () => {
    await request(app)
      .put('/api/moderation/held-messages/9999999')
      .set('Authorization', `Bearer ${moderatorToken}`)
      .send({ action: 'approve' })
      .expect(404);
  });

  test('returns 400 for an invalid action', async () => {
    const insertResult = await dbRun(
      `INSERT INTO held_messages (message_id, content, user, platform, hold_reason, risk_score, hold_level, reasons, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending')`,
      ['msg_test_4', 'test', 'baduser', 'youtube', 'ai_score', 0.5, 'low', '[]']
    );
    const holdId = insertResult.lastID;

    await request(app)
      .put(`/api/moderation/held-messages/${holdId}`)
      .set('Authorization', `Bearer ${moderatorToken}`)
      .send({ action: 'invalid_action' })
      .expect(400);
  });
});
