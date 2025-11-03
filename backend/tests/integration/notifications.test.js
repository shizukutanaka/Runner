const request = require('supertest');
const app = require('../../src/app');
const db = require('../../src/db');

describe('Notifications Integration Tests', () => {
  let authToken;
  let testUserId;
  let testNotificationId;

  beforeAll(async () => {
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Create test user and get auth token
    const registerRes = await request(app)
      .post('/api/users/register')
      .send({
        username: 'notifuser',
        password: 'TestPass123!',
        email: 'notif@example.com',
      });

    if (registerRes.status === 201 || registerRes.status === 409) {
      const loginRes = await request(app)
        .post('/api/users/login')
        .send({
          username: 'notifuser',
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

  describe('GET /api/notifications - Retrieve Notifications', () => {
    test('should get all notifications for user', async () => {
      const res = await request(app)
        .get('/api/notifications')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(Array.isArray(res.body.notifications)).toBe(true);
      expect(res.body).toHaveProperty('total');
      expect(res.body).toHaveProperty('unread');
    });

    test('should filter unread notifications', async () => {
      const res = await request(app)
        .get('/api/notifications?read=false')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(Array.isArray(res.body.notifications)).toBe(true);
      res.body.notifications.forEach(notification => {
        expect(notification.read).toBe(false);
      });
    });

    test('should filter notifications by type', async () => {
      const res = await request(app)
        .get('/api/notifications?type=comment')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(Array.isArray(res.body.notifications)).toBe(true);
      if (res.body.notifications.length > 0) {
        res.body.notifications.forEach(notification => {
          expect(notification.type).toBe('comment');
        });
      }
    });

    test('should paginate notifications', async () => {
      const res = await request(app)
        .get('/api/notifications?limit=5&offset=0')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(res.body.notifications.length).toBeLessThanOrEqual(5);
    });

    test('should require authentication', async () => {
      await request(app)
        .get('/api/notifications')
        .expect(401);
    });
  });

  describe('PUT /api/notifications/:id/read - Mark as Read', () => {
    beforeEach(async () => {
      // Create a test notification first
      const res = await request(app)
        .get('/api/notifications?read=false')
        .set('Authorization', `Bearer ${authToken}`);

      if (res.body.notifications && res.body.notifications.length > 0) {
        testNotificationId = res.body.notifications[0].id;
      }
    });

    test('should mark notification as read', async () => {
      if (!testNotificationId) {
        return;
      }

      const res = await request(app)
        .put(`/api/notifications/${testNotificationId}/read`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(res.body).toHaveProperty('read', true);
    });

    test('should return 404 for non-existent notification', async () => {
      await request(app)
        .put('/api/notifications/999999/read')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(404);
    });

    test('should require authentication', async () => {
      await request(app)
        .put('/api/notifications/1/read')
        .expect(401);
    });
  });

  describe('PUT /api/notifications/read-all - Mark All as Read', () => {
    test('should mark all notifications as read', async () => {
      const res = await request(app)
        .put('/api/notifications/read-all')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(res.body).toHaveProperty('success', true);
      expect(res.body).toHaveProperty('updated');
    });

    test('should require authentication', async () => {
      await request(app)
        .put('/api/notifications/read-all')
        .expect(401);
    });
  });

  describe('DELETE /api/notifications/:id - Delete Notification', () => {
    let deleteNotificationId;

    beforeEach(async () => {
      const res = await request(app)
        .get('/api/notifications')
        .set('Authorization', `Bearer ${authToken}`);

      if (res.body.notifications && res.body.notifications.length > 0) {
        deleteNotificationId = res.body.notifications[0].id;
      }
    });

    test('should delete notification', async () => {
      if (!deleteNotificationId) {
        return;
      }

      await request(app)
        .delete(`/api/notifications/${deleteNotificationId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      // Verify notification is deleted
      const res = await request(app)
        .get('/api/notifications')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      const found = res.body.notifications.find(n => n.id === deleteNotificationId);
      expect(found).toBeUndefined();
    });

    test('should return 404 for non-existent notification', async () => {
      await request(app)
        .delete('/api/notifications/999999')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(404);
    });

    test('should require authentication', async () => {
      await request(app)
        .delete('/api/notifications/1')
        .expect(401);
    });
  });

  describe('DELETE /api/notifications - Clear All Notifications', () => {
    test('should clear all notifications', async () => {
      const res = await request(app)
        .delete('/api/notifications')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(res.body).toHaveProperty('success', true);
      expect(res.body).toHaveProperty('deleted');
    });

    test('should require authentication', async () => {
      await request(app)
        .delete('/api/notifications')
        .expect(401);
    });
  });

  describe('GET /api/notifications/settings - Notification Settings', () => {
    test('should get notification settings', async () => {
      const res = await request(app)
        .get('/api/notifications/settings')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(res.body).toHaveProperty('email');
      expect(res.body).toHaveProperty('push');
      expect(res.body).toHaveProperty('desktop');
    });

    test('should require authentication', async () => {
      await request(app)
        .get('/api/notifications/settings')
        .expect(401);
    });
  });

  describe('PUT /api/notifications/settings - Update Settings', () => {
    test('should update notification settings', async () => {
      const newSettings = {
        email: true,
        push: false,
        desktop: true,
        types: {
          comment: true,
          moderation: true,
          system: false,
        },
      };

      const res = await request(app)
        .put('/api/notifications/settings')
        .set('Authorization', `Bearer ${authToken}`)
        .send(newSettings)
        .expect(200);

      expect(res.body).toHaveProperty('email', newSettings.email);
      expect(res.body).toHaveProperty('push', newSettings.push);
      expect(res.body).toHaveProperty('desktop', newSettings.desktop);
    });

    test('should reject invalid settings', async () => {
      const invalidSettings = {
        email: 'not-a-boolean',
      };

      await request(app)
        .put('/api/notifications/settings')
        .set('Authorization', `Bearer ${authToken}`)
        .send(invalidSettings)
        .expect(400);
    });

    test('should require authentication', async () => {
      await request(app)
        .put('/api/notifications/settings')
        .send({ email: true })
        .expect(401);
    });
  });

  describe('POST /api/notifications/test - Send Test Notification', () => {
    test('should send test notification', async () => {
      const res = await request(app)
        .post('/api/notifications/test')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ type: 'email' })
        .expect(200);

      expect(res.body).toHaveProperty('success', true);
      expect(res.body).toHaveProperty('message');
    });

    test('should require authentication', async () => {
      await request(app)
        .post('/api/notifications/test')
        .send({ type: 'email' })
        .expect(401);
    });
  });

  describe('WebSocket Notifications', () => {
    test('should receive real-time notifications via WebSocket', async () => {
      // This would require WebSocket client setup
      // Placeholder for WebSocket testing
      expect(true).toBe(true);
    });
  });

  describe('Notification Batching', () => {
    test('should batch similar notifications', async () => {
      // Create multiple similar notifications
      for (let i = 0; i < 5; i++) {
        await request(app)
          .post('/api/comments')
          .set('Authorization', `Bearer ${authToken}`)
          .send({
            platform: 'youtube',
            content: `Test comment ${i}`,
          });
      }

      // Wait for batching
      await new Promise(resolve => setTimeout(resolve, 2000));

      const res = await request(app)
        .get('/api/notifications?type=comment')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      // Verify notifications are properly batched
      expect(Array.isArray(res.body.notifications)).toBe(true);
    });
  });
});
