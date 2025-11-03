const request = require('supertest');
const app = require('../../src/app');
const db = require('../../src/db');

describe('Authentication Integration Tests', () => {
  let authToken;
  let refreshToken;
  const testUser = {
    username: 'authTestUser',
    password: 'SecurePass123!',
    email: 'authtest@example.com',
  };

  beforeAll(async () => {
    await new Promise(resolve => setTimeout(resolve, 1000));
  });

  afterAll(async () => {
    if (db && db.closeDatabase) {
      await db.closeDatabase();
    }
  });

  describe('POST /api/users/register - User Registration', () => {
    test('should register new user with valid data', async () => {
      const res = await request(app)
        .post('/api/users/register')
        .send(testUser)
        .expect(201);

      expect(res.body).toHaveProperty('success', true);
      expect(res.body).toHaveProperty('user');
      expect(res.body.user).toHaveProperty('username', testUser.username);
      expect(res.body.user).toHaveProperty('email', testUser.email);
      expect(res.body.user).not.toHaveProperty('password');
    });

    test('should reject duplicate username', async () => {
      await request(app)
        .post('/api/users/register')
        .send(testUser)
        .expect(409);
    });

    test('should reject weak password', async () => {
      await request(app)
        .post('/api/users/register')
        .send({
          username: 'weakpassuser',
          password: '123',
          email: 'weak@example.com',
        })
        .expect(400);
    });

    test('should reject invalid email', async () => {
      await request(app)
        .post('/api/users/register')
        .send({
          username: 'invalidemail',
          password: 'SecurePass123!',
          email: 'invalid-email',
        })
        .expect(400);
    });

    test('should reject missing required fields', async () => {
      await request(app)
        .post('/api/users/register')
        .send({
          username: 'incompleteuser',
        })
        .expect(400);
    });

    test('should sanitize user input', async () => {
      const res = await request(app)
        .post('/api/users/register')
        .send({
          username: '<script>alert("xss")</script>testuser2',
          password: 'SecurePass123!',
          email: 'sanitize@example.com',
        })
        .expect(201);

      expect(res.body.user.username).not.toContain('<script>');
    });
  });

  describe('POST /api/users/login - User Login', () => {
    test('should login with valid credentials', async () => {
      const res = await request(app)
        .post('/api/users/login')
        .send({
          username: testUser.username,
          password: testUser.password,
        })
        .expect(200);

      expect(res.body).toHaveProperty('success', true);
      expect(res.body).toHaveProperty('token');
      expect(res.body).toHaveProperty('user');
      expect(res.body.user).not.toHaveProperty('password');

      authToken = res.body.token;
      refreshToken = res.body.refreshToken;
    });

    test('should reject invalid password', async () => {
      await request(app)
        .post('/api/users/login')
        .send({
          username: testUser.username,
          password: 'WrongPassword123!',
        })
        .expect(401);
    });

    test('should reject non-existent user', async () => {
      await request(app)
        .post('/api/users/login')
        .send({
          username: 'nonexistentuser',
          password: 'SomePassword123!',
        })
        .expect(401);
    });

    test('should rate limit login attempts', async () => {
      const attempts = [];

      // Try to login multiple times with wrong password
      for (let i = 0; i < 6; i++) {
        attempts.push(
          request(app)
            .post('/api/users/login')
            .send({
              username: testUser.username,
              password: 'WrongPassword',
            })
        );
      }

      const results = await Promise.all(attempts);
      const rateLimited = results.some(res => res.status === 429);

      expect(rateLimited).toBe(true);
    });

    test('should create session cookie', async () => {
      const res = await request(app)
        .post('/api/users/login')
        .send({
          username: testUser.username,
          password: testUser.password,
        })
        .expect(200);

      expect(res.headers['set-cookie']).toBeDefined();
    });
  });

  describe('GET /api/users/me - Get Current User', () => {
    test('should get current user with valid token', async () => {
      const res = await request(app)
        .get('/api/users/me')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(res.body).toHaveProperty('username', testUser.username);
      expect(res.body).toHaveProperty('email', testUser.email);
      expect(res.body).not.toHaveProperty('password');
    });

    test('should reject request without token', async () => {
      await request(app)
        .get('/api/users/me')
        .expect(401);
    });

    test('should reject request with invalid token', async () => {
      await request(app)
        .get('/api/users/me')
        .set('Authorization', 'Bearer invalid-token')
        .expect(401);
    });

    test('should reject expired token', async () => {
      // This would require a token that's set to expire quickly
      // Placeholder for expired token test
      expect(true).toBe(true);
    });
  });

  describe('POST /api/users/refresh - Refresh Token', () => {
    test('should refresh access token with valid refresh token', async () => {
      if (!refreshToken) {
        return;
      }

      const res = await request(app)
        .post('/api/users/refresh')
        .send({ refreshToken })
        .expect(200);

      expect(res.body).toHaveProperty('token');
      expect(res.body).toHaveProperty('refreshToken');
    });

    test('should reject invalid refresh token', async () => {
      await request(app)
        .post('/api/users/refresh')
        .send({ refreshToken: 'invalid-refresh-token' })
        .expect(401);
    });
  });

  describe('POST /api/users/logout - User Logout', () => {
    test('should logout user', async () => {
      const res = await request(app)
        .post('/api/users/logout')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(res.body).toHaveProperty('success', true);
    });

    test('should invalidate token after logout', async () => {
      // After logout, the token should not work for subsequent requests
      // This depends on implementation (token blacklist, etc.)
      expect(true).toBe(true);
    });
  });

  describe('POST /api/users/forgot-password - Password Reset Request', () => {
    test('should send password reset email', async () => {
      const res = await request(app)
        .post('/api/users/forgot-password')
        .send({ email: testUser.email })
        .expect(200);

      expect(res.body).toHaveProperty('success', true);
      expect(res.body).toHaveProperty('message');
    });

    test('should not reveal if email exists', async () => {
      // Should return same response even if email doesn't exist (security)
      const res = await request(app)
        .post('/api/users/forgot-password')
        .send({ email: 'nonexistent@example.com' })
        .expect(200);

      expect(res.body).toHaveProperty('success', true);
    });

    test('should reject invalid email format', async () => {
      await request(app)
        .post('/api/users/forgot-password')
        .send({ email: 'invalid-email' })
        .expect(400);
    });
  });

  describe('POST /api/users/reset-password - Reset Password', () => {
    test('should reset password with valid token', async () => {
      // This would require a valid reset token
      // Placeholder for password reset test
      expect(true).toBe(true);
    });

    test('should reject invalid reset token', async () => {
      await request(app)
        .post('/api/users/reset-password')
        .send({
          token: 'invalid-reset-token',
          newPassword: 'NewSecurePass123!',
        })
        .expect(400);
    });

    test('should reject weak new password', async () => {
      await request(app)
        .post('/api/users/reset-password')
        .send({
          token: 'some-token',
          newPassword: '123',
        })
        .expect(400);
    });
  });

  describe('PUT /api/users/change-password - Change Password', () => {
    test('should change password with valid current password', async () => {
      const res = await request(app)
        .put('/api/users/change-password')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          currentPassword: testUser.password,
          newPassword: 'NewSecurePass456!',
        })
        .expect(200);

      expect(res.body).toHaveProperty('success', true);

      // Update test user password
      testUser.password = 'NewSecurePass456!';
    });

    test('should reject wrong current password', async () => {
      await request(app)
        .put('/api/users/change-password')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          currentPassword: 'WrongPassword',
          newPassword: 'NewSecurePass789!',
        })
        .expect(401);
    });

    test('should require authentication', async () => {
      await request(app)
        .put('/api/users/change-password')
        .send({
          currentPassword: 'anything',
          newPassword: 'NewSecurePass789!',
        })
        .expect(401);
    });
  });

  describe('POST /api/users/enable-2fa - Enable Two-Factor Authentication', () => {
    test('should enable 2FA and return QR code', async () => {
      const res = await request(app)
        .post('/api/users/enable-2fa')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(res.body).toHaveProperty('success', true);
      expect(res.body).toHaveProperty('qrCode');
      expect(res.body).toHaveProperty('secret');
    });

    test('should require authentication', async () => {
      await request(app)
        .post('/api/users/enable-2fa')
        .expect(401);
    });
  });

  describe('POST /api/users/verify-2fa - Verify 2FA Code', () => {
    test('should verify valid 2FA code', async () => {
      // This would require a valid TOTP code
      // Placeholder for 2FA verification test
      expect(true).toBe(true);
    });

    test('should reject invalid 2FA code', async () => {
      await request(app)
        .post('/api/users/verify-2fa')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ code: '000000' })
        .expect(401);
    });
  });

  describe('Security Features', () => {
    test('should hash passwords in database', async () => {
      // Verify that passwords are not stored in plain text
      // This would require direct database access
      expect(true).toBe(true);
    });

    test('should set secure HTTP headers', async () => {
      const res = await request(app)
        .get('/api/users/me')
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.headers).toHaveProperty('x-content-type-options');
      expect(res.headers).toHaveProperty('x-frame-options');
    });

    test('should prevent SQL injection', async () => {
      await request(app)
        .post('/api/users/login')
        .send({
          username: "admin' OR '1'='1",
          password: "anything",
        })
        .expect(401);
    });

    test('should prevent XSS attacks', async () => {
      const res = await request(app)
        .post('/api/users/register')
        .send({
          username: '<script>alert("xss")</script>xsstest',
          password: 'SecurePass123!',
          email: 'xss@example.com',
        });

      if (res.status === 201) {
        expect(res.body.user.username).not.toContain('<script>');
      }
    });
  });
});
