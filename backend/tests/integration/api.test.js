const request = require('supertest');
const app = require('../../src/app');
const db = require('../../src/db');

describe('API Integration Tests', () => {
  let authToken;

  beforeAll(async () => {
    // Wait for database initialization
    await new Promise(resolve => setTimeout(resolve, 1000));
  });

  afterAll(async () => {
    if (db && db.closeDatabase) {
      await db.closeDatabase();
    }
  });

  describe('Health Checks', () => {
    test('GET /health - should return 200', async () => {
      const res = await request(app)
        .get('/health')
        .expect('Content-Type', /json/)
        .expect(200);

      expect(res.body).toHaveProperty('status', 'ok');
      expect(res.body).toHaveProperty('timestamp');
    });

    test('GET /health/detailed - should return system metrics', async () => {
      const res = await request(app)
        .get('/health/detailed')
        .expect(200);

      expect(res.body).toHaveProperty('status');
      expect(res.body).toHaveProperty('uptime');
      expect(res.body).toHaveProperty('memory');
    });
  });

  describe('Comments API', () => {
    const testComment = {
      id: 'test-comment-1',
      platform: 'youtube',
      user: 'testuser',
      content: 'Test comment',
      timestamp: new Date().toISOString()
    };

    test('POST /api/comments - should create comment', async () => {
      const res = await request(app)
        .post('/api/comments')
        .send(testComment)
        .expect(201);

      expect(res.body).toHaveProperty('id', testComment.id);
    });

    test('GET /api/comments - should retrieve comments', async () => {
      const res = await request(app)
        .get('/api/comments')
        .query({ platform: 'youtube', limit: 10 })
        .expect(200);

      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBeGreaterThan(0);
    });

    test('GET /api/comments/:id - should retrieve single comment', async () => {
      const res = await request(app)
        .get(`/api/comments/${testComment.id}`)
        .expect(200);

      expect(res.body).toHaveProperty('id', testComment.id);
      expect(res.body).toHaveProperty('content', testComment.content);
    });

    test('PATCH /api/comments/:id - should update comment', async () => {
      const res = await request(app)
        .patch(`/api/comments/${testComment.id}`)
        .send({ status: 'hidden' })
        .expect(200);

      expect(res.body).toHaveProperty('status', 'hidden');
    });

    test('DELETE /api/comments/:id - should delete comment', async () => {
      await request(app)
        .delete(`/api/comments/${testComment.id}`)
        .expect(200);

      await request(app)
        .get(`/api/comments/${testComment.id}`)
        .expect(404);
    });
  });

  describe('Users API', () => {
    const testUser = {
      id: 'test-user-1',
      platform: 'youtube',
      username: 'testuser123'
    };

    test('POST /api/users - should create user', async () => {
      const res = await request(app)
        .post('/api/users')
        .send(testUser)
        .expect(201);

      expect(res.body).toHaveProperty('id', testUser.id);
      expect(res.body).toHaveProperty('username', testUser.username);
    });

    test('GET /api/users/:id - should retrieve user', async () => {
      const res = await request(app)
        .get(`/api/users/${testUser.id}`)
        .expect(200);

      expect(res.body).toHaveProperty('username', testUser.username);
    });

    test('PATCH /api/users/:id - should update user', async () => {
      const res = await request(app)
        .patch(`/api/users/${testUser.id}`)
        .send({ status: 'muted' })
        .expect(200);

      expect(res.body).toHaveProperty('status', 'muted');
    });
  });

  describe('Analytics API', () => {
    test('GET /api/analytics/stats - should return statistics', async () => {
      const res = await request(app)
        .get('/api/analytics/stats')
        .expect(200);

      expect(res.body).toHaveProperty('totalComments');
      expect(res.body).toHaveProperty('activeComments');
      expect(typeof res.body.totalComments).toBe('number');
    });

    test('GET /api/analytics/snapshots - should return historical data', async () => {
      const res = await request(app)
        .get('/api/analytics/snapshots')
        .query({ limit: 10 })
        .expect(200);

      expect(Array.isArray(res.body)).toBe(true);
    });
  });

  describe('Settings API', () => {
    test('GET /api/settings/moderation/:platform - should get settings', async () => {
      const res = await request(app)
        .get('/api/settings/moderation/youtube')
        .expect(200);

      expect(res.body).toHaveProperty('platform', 'youtube');
    });

    test('PUT /api/settings/moderation/:platform - should update settings', async () => {
      const settings = {
        thresholds: { autoHide: 0.8, autoMute: 0.9 },
        bannedWords: ['spam', 'test']
      };

      const res = await request(app)
        .put('/api/settings/moderation/youtube')
        .send(settings)
        .expect(200);

      expect(res.body.thresholds).toEqual(settings.thresholds);
    });
  });

  describe('Validation Tests', () => {
    test('POST /api/comments - should reject invalid platform', async () => {
      const res = await request(app)
        .post('/api/comments')
        .send({
          id: 'test-invalid',
          platform: 'invalid-platform',
          user: 'test',
          content: 'test',
          timestamp: new Date().toISOString()
        })
        .expect(400);

      expect(res.body).toHaveProperty('error');
    });

    test('POST /api/comments - should reject missing required fields', async () => {
      const res = await request(app)
        .post('/api/comments')
        .send({ id: 'test' })
        .expect(400);

      expect(res.body).toHaveProperty('error');
    });

    test('PATCH /api/comments/:id - should reject invalid status', async () => {
      const res = await request(app)
        .patch('/api/comments/test-comment')
        .send({ status: 'invalid-status' })
        .expect(400);

      expect(res.body).toHaveProperty('error');
    });
  });

  describe('Error Handling', () => {
    test('GET /api/comments/nonexistent - should return 404', async () => {
      const res = await request(app)
        .get('/api/comments/nonexistent-id')
        .expect(404);

      expect(res.body).toHaveProperty('error');
    });

    test('POST /api/comments - should handle database errors gracefully', async () => {
      // Attempt to create duplicate
      const duplicate = {
        id: 'duplicate-test',
        platform: 'youtube',
        user: 'test',
        content: 'test',
        timestamp: new Date().toISOString()
      };

      await request(app).post('/api/comments').send(duplicate);

      const res = await request(app)
        .post('/api/comments')
        .send(duplicate)
        .expect(500);

      expect(res.body).toHaveProperty('error');
    });
  });

  describe('Rate Limiting', () => {
    test('Should enforce rate limits on API endpoints', async () => {
      const requests = Array(100).fill().map(() =>
        request(app).get('/api/comments')
      );

      const responses = await Promise.all(requests);
      const rateLimited = responses.some(res => res.status === 429);

      expect(rateLimited).toBe(true);
    });
  });

  describe('Security Headers', () => {
    test('Should include security headers', async () => {
      const res = await request(app).get('/health');

      expect(res.headers).toHaveProperty('x-content-type-options');
      expect(res.headers).toHaveProperty('x-frame-options');
      expect(res.headers['x-powered-by']).toBeUndefined();
    });
  });
});
