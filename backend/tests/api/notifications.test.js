const request = require('supertest');
const app = require('../../src/app');
const { generateToken } = require('../../src/middleware/auth');

const createAuthHeader = (payload) => ({
  Authorization: `Bearer ${generateToken(payload)}`
});

const adminAuth = () => createAuthHeader({ id: 'admin-tester', role: 'admin' });
const userAuth = () => createAuthHeader({ id: 'user-tester', role: 'user' });

describe('Notifications API', () => {
  describe('GET /api/notifications', () => {
    it('正常系: 通知一覧取得（未読のみ）', async () => {
      const res = await request(app)
        .get('/api/notifications')
        .set(adminAuth())
        .expect(200);

      expect(res.body.status).toBe(200);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.data.length).toBeGreaterThanOrEqual(0);
      if (res.body.data.length > 0) {
        expect(res.body.data[0]).toHaveProperty('id');
        expect(res.body.data[0]).toHaveProperty('title');
        expect(res.body.data[0]).toHaveProperty('message');
        expect(res.body.data[0]).toHaveProperty('read');
      }
    });

    it('正常系: 既読も含めて取得', async () => {
      const res = await request(app)
        .get('/api/notifications?includeRead=true')
        .set(adminAuth())
        .expect(200);

      expect(res.body.status).toBe(200);
      expect(Array.isArray(res.body.data)).toBe(true);
    });

    it('正常系: ページネーション', async () => {
      const res = await request(app)
        .get('/api/notifications?limit=5&offset=0')
        .set(adminAuth())
        .expect(200);

      expect(res.body.status).toBe(200);
    });
  });

  describe('POST /api/notifications', () => {
    it('正常系: 通知作成', async () => {
      const res = await request(app)
        .post('/api/notifications')
        .set(adminAuth())
        .send({
          title: 'テスト通知',
          message: 'これはテストです',
          type: 'system',
          level: 'info'
        })
        .expect(201);

      expect(res.body.status).toBe(201);
      expect(res.body.data).toHaveProperty('id');
      expect(res.body.data.title).toBe('テスト通知');
      expect(res.body.data.read).toBe(false);
    });

    it('異常系: 必須項目不足', async () => {
      const res = await request(app)
        .post('/api/notifications')
        .set(adminAuth())
        .send({ message: 'メッセージのみ' })
        .expect(400);

      expect(res.body.message).toMatch(/title.*必須|必須.*title/i);
    });
  });

  describe('POST /api/notifications/:id/read', () => {
    it('正常系: 既読化', async () => {
      // まず通知を作成
      const createRes = await request(app)
        .post('/api/notifications')
        .set(adminAuth())
        .send({
          title: '既読化テスト',
          message: '既読化確認用',
          type: 'system',
          level: 'info'
        });

      const notificationId = createRes.body.data.id;

      // 既読化
      const res = await request(app)
        .post(`/api/notifications/${notificationId}/read`)
        .set(adminAuth())
        .expect(200);

      expect(res.body.status).toBe(200);
      expect(res.body.message).toMatch(/marked as read|既読/i);
    });

    it('異常系: 存在しないID', async () => {
      const res = await request(app)
        .post('/api/notifications/99999/read')
        .set(adminAuth())
        .expect(404);

      expect(res.body.message).toMatch(/not found|見つからない/i);
    });
  });

  describe('DELETE /api/notifications/read', () => {
    it('正常系: 既読通知一括削除', async () => {
      const res = await request(app)
        .delete('/api/notifications/read')
        .set(adminAuth())
        .expect(200);

      expect(res.body.status).toBe(200);
      expect(res.body.data).toHaveProperty('deleted');
      expect(typeof res.body.data.deleted).toBe('number');
    });
  });
});
