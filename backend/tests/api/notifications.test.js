const request = require('supertest');
const app = require('../../src/app');
const { generateToken } = require('../../src/middleware/auth');

// authenticateToken はJWTの署名検証のみでDB照会を行わないため、
// generateToken() で自己完結した任意のペイロードのトークンをそのまま使える
const createAuthHeader = (payload) => ({
  Authorization: `Bearer ${generateToken(payload)}`
});

const adminAuth = () => createAuthHeader({ id: 'admin-tester', role: 'admin' });

describe('Notifications API', () => {
  beforeAll(async () => {
    // データベース初期化完了を待つ（他のテストファイルと同じ規約）
    await new Promise(resolve => setTimeout(resolve, 1000));
  });

  describe('GET /api/notifications', () => {
    it('正常系: 通知一覧取得', async () => {
      const res = await request(app)
        .get('/api/notifications')
        .set(adminAuth())
        .expect(200);

      expect(Array.isArray(res.body.notifications)).toBe(true);
      expect(typeof res.body.total).toBe('number');
      expect(typeof res.body.unread).toBe('number');
      if (res.body.notifications.length > 0) {
        expect(res.body.notifications[0]).toHaveProperty('id');
        expect(res.body.notifications[0]).toHaveProperty('title');
        expect(res.body.notifications[0]).toHaveProperty('message');
        expect(res.body.notifications[0]).toHaveProperty('read');
      }
    });

    it('正常系: 未読のみフィルタ', async () => {
      const res = await request(app)
        .get('/api/notifications?read=false')
        .set(adminAuth())
        .expect(200);

      expect(Array.isArray(res.body.notifications)).toBe(true);
      res.body.notifications.forEach((n) => expect(n.read).toBe(false));
    });

    it('正常系: ページネーション', async () => {
      const res = await request(app)
        .get('/api/notifications?limit=5&offset=0')
        .set(adminAuth())
        .expect(200);

      expect(res.body.notifications.length).toBeLessThanOrEqual(5);
    });
  });

  describe('POST /api/notifications', () => {
    it('正常系: 通知作成', async () => {
      const res = await request(app)
        .post('/api/notifications')
        .set(adminAuth())
        .send({
          userId: 'admin-tester',
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

      // createNotificationはnext()経由でerrorHandlerに渡すため {error:{message}} 形式
      // （middleware/validation.js経由の400とは異なる封筒 - この一貫性の無さ自体は既知の課題）
      expect(res.body.error.message).toMatch(/title/i);
    });
  });

  describe('PUT /api/notifications/:id/read', () => {
    it('正常系: 既読化', async () => {
      const createRes = await request(app)
        .post('/api/notifications')
        .set(adminAuth())
        .send({
          userId: 'admin-tester',
          title: '既読化テスト',
          message: '既読化確認用',
          type: 'system',
          level: 'info'
        });

      const notificationId = createRes.body.data.id;

      const res = await request(app)
        .put(`/api/notifications/${notificationId}/read`)
        .set(adminAuth())
        .expect(200);

      expect(res.body.read).toBe(true);
    });

    it('異常系: 存在しないID', async () => {
      const res = await request(app)
        .put('/api/notifications/99999/read')
        .set(adminAuth())
        .expect(404);

      expect(res.body.error.message).toMatch(/not found|見つからない/i);
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
