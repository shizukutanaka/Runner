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

      // 閉じタグの無い<script>は xss ライブラリが安全側で"[removed]"マーカーを残すため
      // （攻撃検出のシグナルとして意図的な挙動）、正しく閉じたタグで実際の除去動作を検証する
      request(app)
        .post('/test')
        .send({ tags: ['tag1<script>x</script>', '<img>tag2'] })
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
    // config.security.allowedOrigins (config.js) は起動時に一度だけ CORS_ORIGIN/ALLOWED_ORIGINS
    // 環境変数から計算されるため、beforeEach内でのprocess.env変更はモジュール読み込み後には
    // 反映されない。テストではデフォルト許可オリジン（未設定時 'http://localhost:5173'）を使う
    const allowedOrigin = 'http://localhost:5173';

    it('should allow valid origin', (done) => {
      app.use(validateOrigin);
      app.get('/test', (req, res) => {
        res.json({ success: true });
      });

      request(app)
        .get('/test')
        .set('Origin', allowedOrigin)
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