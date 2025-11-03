const request = require('supertest');
const express = require('express');
const { sanitizeInput, validateOrigin } = require('../../src/middleware/security');

describe('Security Middleware', () => {
  let app;

  beforeEach(() => {
    app = express();
    app.use(express.json());
  });

  describe('sanitizeInput', () => {
    it('should sanitize HTML tags from body', (done) => {
      app.use(sanitizeInput);
      app.post('/test', (req, res) => {
        expect(req.body.content).toBe('Hello world');
        res.json({ success: true });
      });

      request(app)
        .post('/test')
        .send({ content: 'Hello <script>alert(\"xss\")</script> world' })
        .expect(200, done);
    });

    it('should sanitize nested objects', (done) => {
      app.use(sanitizeInput);
      app.post('/test', (req, res) => {
        expect(req.body.user.name).toBe('John Doe');
        expect(req.body.user.comment).toBe('Nice post');
        res.json({ success: true });
      });

      request(app)
        .post('/test')
        .send({
          user: {
            name: 'John <script>evil()</script> Doe',
            comment: 'Nice <img src=\"x\"> post'
          }
        })
        .expect(200, done);
    });

    it('should sanitize arrays', (done) => {
      app.use(sanitizeInput);
      app.post('/test', (req, res) => {
        expect(req.body.tags).toEqual(['tag1', 'tag2']);
        res.json({ success: true });
      });

      request(app)
        .post('/test')
        .send({ tags: ['tag1<script>', '<img>tag2'] })
        .expect(200, done);
    });

    it('should trim whitespace', (done) => {
      app.use(sanitizeInput);
      app.post('/test', (req, res) => {
        expect(req.body.content).toBe('trimmed content');
        res.json({ success: true });
      });

      request(app)
        .post('/test')
        .send({ content: '  trimmed content  ' })
        .expect(200, done);
    });
  });

  describe('validateOrigin', () => {
    beforeEach(() => {
      // Mock production environment
      process.env.NODE_ENV = 'production';
      process.env.FRONTEND_URL = 'https://example.com';
    });

    afterEach(() => {
      process.env.NODE_ENV = 'test';
      delete process.env.FRONTEND_URL;
    });

    it('should allow valid origin', (done) => {
      app.use(validateOrigin);
      app.get('/test', (req, res) => {
        res.json({ success: true });
      });

      request(app)
        .get('/test')
        .set('Origin', 'https://example.com')
        .expect(200, done);
    });

    it('should reject invalid origin in production', (done) => {
      app.use(validateOrigin);
      app.get('/test', (req, res) => {
        res.json({ success: true });
      });

      request(app)
        .get('/test')
        .set('Origin', 'https://malicious.com')
        .expect(403)
        .expect((res) => {
          expect(res.body.error).toBe('Forbidden: Invalid origin');
        })
        .end(done);
    });

    it('should allow requests without origin header', (done) => {
      app.use(validateOrigin);
      app.get('/test', (req, res) => {
        res.json({ success: true });
      });

      request(app)
        .get('/test')
        .expect(200, done);
    });
  });
});