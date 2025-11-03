const request = require('supertest');
const app = require('../../src/app');
const db = require('../../src/db');

describe('Comments Integration Tests', () => {
  let authToken;
  let testUserId;
  let testCommentId;

  beforeAll(async () => {
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Create test user and get auth token
    const registerRes = await request(app)
      .post('/api/users/register')
      .send({
        username: 'testuser',
        password: 'TestPass123!',
        email: 'test@example.com',
      });

    if (registerRes.status === 201 || registerRes.status === 409) {
      const loginRes = await request(app)
        .post('/api/users/login')
        .send({
          username: 'testuser',
          password: 'TestPass123!',
        });

      authToken = loginRes.body.token;
      testUserId = loginRes.body.user.id;
    }
  });

  afterAll(async () => {
    if (db && db.closeDatabase) {
      await db.closeDatabase();
    }
  });

  describe('POST /api/comments - Create Comment', () => {
    test('should create a new comment with valid data', async () => {
      const newComment = {
        platform: 'youtube',
        content: 'This is a test comment',
        videoId: 'test-video-123',
        author: 'Test Author',
      };

      const res = await request(app)
        .post('/api/comments')
        .set('Authorization', `Bearer ${authToken}`)
        .send(newComment)
        .expect(201);

      expect(res.body).toHaveProperty('id');
      expect(res.body).toHaveProperty('content', newComment.content);
      expect(res.body).toHaveProperty('platform', newComment.platform);
      expect(res.body).toHaveProperty('status');

      testCommentId = res.body.id;
    });

    test('should reject comment without authentication', async () => {
      const newComment = {
        platform: 'youtube',
        content: 'Test comment',
      };

      await request(app)
        .post('/api/comments')
        .send(newComment)
        .expect(401);
    });

    test('should reject comment with invalid platform', async () => {
      const newComment = {
        platform: 'invalid-platform',
        content: 'Test comment',
      };

      await request(app)
        .post('/api/comments')
        .set('Authorization', `Bearer ${authToken}`)
        .send(newComment)
        .expect(400);
    });

    test('should reject comment with empty content', async () => {
      const newComment = {
        platform: 'youtube',
        content: '',
      };

      await request(app)
        .post('/api/comments')
        .set('Authorization', `Bearer ${authToken}`)
        .send(newComment)
        .expect(400);
    });

    test('should sanitize XSS attempts in content', async () => {
      const newComment = {
        platform: 'youtube',
        content: '<script>alert("XSS")</script>Test comment',
      };

      const res = await request(app)
        .post('/api/comments')
        .set('Authorization', `Bearer ${authToken}`)
        .send(newComment)
        .expect(201);

      expect(res.body.content).not.toContain('<script>');
    });
  });

  describe('GET /api/comments - Retrieve Comments', () => {
    test('should get all comments', async () => {
      const res = await request(app)
        .get('/api/comments')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(Array.isArray(res.body.comments)).toBe(true);
      expect(res.body).toHaveProperty('total');
    });

    test('should filter comments by platform', async () => {
      const res = await request(app)
        .get('/api/comments?platform=youtube')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(Array.isArray(res.body.comments)).toBe(true);
      res.body.comments.forEach(comment => {
        expect(comment.platform).toBe('youtube');
      });
    });

    test('should paginate comments', async () => {
      const res = await request(app)
        .get('/api/comments?limit=10&offset=0')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(res.body.comments.length).toBeLessThanOrEqual(10);
    });

    test('should sort comments by timestamp', async () => {
      const res = await request(app)
        .get('/api/comments?sort=desc')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      if (res.body.comments.length > 1) {
        const firstTimestamp = new Date(res.body.comments[0].timestamp);
        const secondTimestamp = new Date(res.body.comments[1].timestamp);
        expect(firstTimestamp >= secondTimestamp).toBe(true);
      }
    });

    test('should search comments by content', async () => {
      const res = await request(app)
        .get('/api/comments?search=test')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(Array.isArray(res.body.comments)).toBe(true);
    });
  });

  describe('GET /api/comments/:id - Retrieve Single Comment', () => {
    test('should get comment by ID', async () => {
      if (!testCommentId) {
        return;
      }

      const res = await request(app)
        .get(`/api/comments/${testCommentId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(res.body).toHaveProperty('id', testCommentId);
      expect(res.body).toHaveProperty('content');
    });

    test('should return 404 for non-existent comment', async () => {
      await request(app)
        .get('/api/comments/999999')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(404);
    });
  });

  describe('PUT /api/comments/:id - Update Comment', () => {
    test('should update comment content', async () => {
      if (!testCommentId) {
        return;
      }

      const updatedData = {
        content: 'Updated test comment',
      };

      const res = await request(app)
        .put(`/api/comments/${testCommentId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send(updatedData)
        .expect(200);

      expect(res.body).toHaveProperty('content', updatedData.content);
    });

    test('should update comment status', async () => {
      if (!testCommentId) {
        return;
      }

      const updatedData = {
        status: 'approved',
      };

      const res = await request(app)
        .put(`/api/comments/${testCommentId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send(updatedData)
        .expect(200);

      expect(res.body).toHaveProperty('status', 'approved');
    });

    test('should reject update with invalid status', async () => {
      if (!testCommentId) {
        return;
      }

      const updatedData = {
        status: 'invalid-status',
      };

      await request(app)
        .put(`/api/comments/${testCommentId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send(updatedData)
        .expect(400);
    });
  });

  describe('DELETE /api/comments/:id - Delete Comment', () => {
    test('should delete comment', async () => {
      if (!testCommentId) {
        return;
      }

      await request(app)
        .delete(`/api/comments/${testCommentId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      // Verify comment is deleted
      await request(app)
        .get(`/api/comments/${testCommentId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(404);
    });

    test('should return 404 when deleting non-existent comment', async () => {
      await request(app)
        .delete('/api/comments/999999')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(404);
    });
  });

  describe('POST /api/comments/:id/moderate - Moderate Comment', () => {
    let moderationCommentId;

    beforeEach(async () => {
      const newComment = {
        platform: 'youtube',
        content: 'Comment to moderate',
      };

      const res = await request(app)
        .post('/api/comments')
        .set('Authorization', `Bearer ${authToken}`)
        .send(newComment);

      moderationCommentId = res.body.id;
    });

    test('should approve comment', async () => {
      const res = await request(app)
        .post(`/api/comments/${moderationCommentId}/moderate`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ action: 'approve' })
        .expect(200);

      expect(res.body).toHaveProperty('status', 'approved');
    });

    test('should reject comment', async () => {
      const res = await request(app)
        .post(`/api/comments/${moderationCommentId}/moderate`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ action: 'reject', reason: 'Spam' })
        .expect(200);

      expect(res.body).toHaveProperty('status', 'rejected');
    });

    test('should flag comment for review', async () => {
      const res = await request(app)
        .post(`/api/comments/${moderationCommentId}/moderate`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ action: 'flag' })
        .expect(200);

      expect(res.body).toHaveProperty('status', 'flagged');
    });
  });

  describe('GET /api/comments/stats - Comment Statistics', () => {
    test('should return comment statistics', async () => {
      const res = await request(app)
        .get('/api/comments/stats')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(res.body).toHaveProperty('total');
      expect(res.body).toHaveProperty('byPlatform');
      expect(res.body).toHaveProperty('byStatus');
    });

    test('should return statistics for specific time range', async () => {
      const startDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
      const endDate = new Date().toISOString();

      const res = await request(app)
        .get(`/api/comments/stats?startDate=${startDate}&endDate=${endDate}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(res.body).toHaveProperty('total');
    });
  });
});
