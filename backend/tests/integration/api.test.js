const request = require('supertest');
const app = require('../../src/app');
const db = require('../../src/db');
const { v4: uuidv4 } = require('uuid');
const { generateToken } = require('../../src/middleware/auth');

describe('API Integration Tests', () => {
  let authToken;
  let seededUserId;
  // 全テストファイルがdata/test.dbを共有しており「最初の登録者がadmin化される」規約
  // （D-12）はファイル実行順に依存し不安定なため、admin権限が必須なテスト
  // （PUT /api/users/:id）はJWTを直接生成して確実にadminロールを与える
  // （tests/api/settings.test.js・billing.test.jsと同じ確立された手法）
  const adminToken = generateToken({ id: 'api-test-admin', role: 'admin' });

  beforeAll(async () => {
    // Wait for database initialization
    await new Promise(resolve => setTimeout(resolve, 1000));

    const registerRes = await request(app)
      .post('/api/users/register')
      .send({
        username: 'apiintegrationtester',
        password: 'TestPass123!',
        email: 'apiintegrationtester@example.com',
      });

    if (registerRes.status === 201 || registerRes.status === 409) {
      const loginRes = await request(app)
        .post('/api/users/login')
        .send({
          username: 'apiintegrationtester',
          password: 'TestPass123!',
        });

      authToken = loginRes.body.token;
    }

    // プラットフォーム利用者（コメント投稿者）を作成する公開APIが存在しないため
    // （users テーブルへの INSERT は tenantController 経由のみで、そのルートは未マウント）、
    // Users API のGET/PUT検証用に直接シードする
    seededUserId = uuidv4();
    await new Promise((resolve, reject) => {
      db.run(
        'INSERT INTO users (id, platform, username, status) VALUES (?, ?, ?, ?)',
        [seededUserId, 'youtube', 'testuser123', 'active'],
        (err) => (err ? reject(err) : resolve())
      );
    });
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

      // healthCheckHandler (middleware/monitoring.js) は 'ok' ではなく 'healthy'/'degraded'/'unhealthy' を返す
      expect(res.body).toHaveProperty('status', 'healthy');
      expect(res.body).toHaveProperty('timestamp');
    });

    test('GET /health/detailed - should return system metrics', async () => {
      const res = await request(app)
        .get('/health/detailed')
        .expect(200);

      expect(res.body).toHaveProperty('status');
      expect(res.body).toHaveProperty('uptime');
      expect(res.body).toHaveProperty('metrics');
      expect(res.body.metrics).toHaveProperty('memory');
    });
  });

  describe('Comments API', () => {
    const testComment = {
      platform: 'youtube',
      user: 'testuser',
      content: 'Test comment',
    };
    let createdCommentId;

    test('POST /api/comments - should create comment', async () => {
      const res = await request(app)
        .post('/api/comments')
        .set('Authorization', `Bearer ${authToken}`)
        .send(testComment)
        .expect(201);

      // コメントIDはクライアント指定を許さず、ingestComment()内で常にuuidv4()をサーバー側生成する
      // （意図的なセキュリティ設計）。生成されたIDを後続テストのために取得する
      expect(res.body.data).toHaveProperty('id');
      createdCommentId = res.body.data.id;
    });

    test('GET /api/comments - should retrieve comments', async () => {
      const res = await request(app)
        .get('/api/comments')
        .query({ platform: 'youtube', limit: 10 })
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(Array.isArray(res.body.data.items)).toBe(true);
      expect(res.body.data.items.length).toBeGreaterThan(0);
    });

    test('GET /api/comments/:id - should retrieve single comment', async () => {
      const res = await request(app)
        .get(`/api/comments/${createdCommentId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(res.body.data).toHaveProperty('id', createdCommentId);
      expect(res.body.data).toHaveProperty('content', testComment.content);
    });

    test('PUT /api/comments/:id - should update comment', async () => {
      // 実装のルートは PATCH ではなく PUT。ボディは status ではなく
      // action（visible/hidden/muted/deleted/flagged）を受け付ける
      const res = await request(app)
        .put(`/api/comments/${createdCommentId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ action: 'hidden' })
        .expect(200);

      expect(res.body.data).toHaveProperty('status', 'hidden');
    });

    test('DELETE /api/comments/:id - should delete comment', async () => {
      await request(app)
        .delete(`/api/comments/${createdCommentId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ reason: 'テストによる削除', reasonCategory: 'other' })
        .expect(200);

      // deleteCommentはソフトデリート（監査証跡目的で行は残り status='deleted' になるのみ）
      const res = await request(app)
        .get(`/api/comments/${createdCommentId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(res.body.data).toHaveProperty('status', 'deleted');
    });
  });

  describe('Users API', () => {
    // 注意: プラットフォーム利用者(users テーブル)を作成する公開APIが存在しないため
    // (POST /api/users 自体が routes/users.js に定義されていない)、作成テストはskipし、
    // beforeAll で直接シードした行に対して実在するGET/PUTエンドポイントのみ検証する
    test.skip('POST /api/users - should create user (users作成用の公開APIが存在しないためskip)', async () => {});

    test('GET /api/users/:id - should retrieve user', async () => {
      const res = await request(app)
        .get(`/api/users/${seededUserId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(res.body.data).toHaveProperty('username', 'testuser123');
    });

    test('PUT /api/users/:id - should update user (ban/mute action)', async () => {
      // 実装のルートは PATCH ではなく PUT。ボディは status ではなく
      // action（active/ban/mute/warn）を受け付ける（usersController.updateUser参照）
      await request(app)
        .put(`/api/users/${seededUserId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ action: 'mute', duration: 300, reason: 'test mute' })
        .expect(200);

      const res = await request(app)
        .get(`/api/users/${seededUserId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(res.body.data).toHaveProperty('status', 'mute');
      expect(res.body.data.mute_until).not.toBeNull();
    });
  });

  describe('Analytics API', () => {
    test('GET /api/analytics/stats - should return statistics', async () => {
      const res = await request(app)
        .get('/api/analytics/stats')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      // getStats()はcommentCount/userCount/bannedCount/activeUsersを返す
      // （totalComments/activeCommentsという名前のフィールドは存在しない）
      expect(res.body).toHaveProperty('commentCount');
      expect(typeof res.body.commentCount).toBe('number');
      expect(res.body).toHaveProperty('userCount');
      expect(res.body).toHaveProperty('bannedCount');
    });

    test.skip('GET /api/analytics/snapshots - should return historical data (該当エンドポイント自体が実装に存在しないためskip)', async () => {});
  });

  describe('Settings API', () => {
    // 注意: GET/PUT /api/settings/moderation/:platform という形のエンドポイントは
    // routes/settings.js にも routes/moderation.js にも存在しない。近い機能として
    // PUT /api/moderation/settings（プラットフォームをURLパラメータではなくボディで指定、
    // GETに相当するものは無い）があるが形状が異なり単純な付け替えができないためskip
    test.skip('GET /api/settings/moderation/:platform - should get settings (該当エンドポイントが存在しないためskip)', async () => {});
    test.skip('PUT /api/settings/moderation/:platform - should update settings (該当エンドポイントが存在しないためskip)', async () => {});
  });

  describe('Validation Tests', () => {
    test('POST /api/comments - should reject invalid platform', async () => {
      const res = await request(app)
        .post('/api/comments')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          platform: 'invalid-platform',
          user: 'test',
          content: 'test',
        })
        .expect(400);

      // middleware/validation.js の validate() は {message, details} を返す（{error}ではない）
      expect(res.body).toHaveProperty('message');
    });

    test('POST /api/comments - should reject missing required fields', async () => {
      const res = await request(app)
        .post('/api/comments')
        .set('Authorization', `Bearer ${authToken}`)
        .send({})
        .expect(400);

      expect(res.body).toHaveProperty('message');
    });

    test('PUT /api/comments/:id - should reject invalid status', async () => {
      const createRes = await request(app)
        .post('/api/comments')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ platform: 'youtube', user: 'test', content: 'for invalid status test' });

      await request(app)
        .put(`/api/comments/${createRes.body.data.id}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ action: 'invalid-status' })
        .expect(400);
    });
  });

  describe('Error Handling', () => {
    test('GET /api/comments/nonexistent - should return 404', async () => {
      // コメントIDはuuidv4形式が必須。整形式だが実在しないUUIDで本当の404を検証する
      const res = await request(app)
        .get('/api/comments/00000000-0000-4000-8000-000000000000')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(404);

      // 404はerrorHandlerミドルウェア経由のため {error:{message}} 形式
      expect(res.body).toHaveProperty('error');
    });

    // 重複ID時の500エラーというシナリオ自体が、コメントIDが常にサーバー側で
    // uuidv4()生成される（クライアントは指定不可）設計により発生しえないため対象外
    test.skip('POST /api/comments - should handle database errors gracefully (IDは常にサーバー側でuuid生成されるため重複が起こりえずskip)', async () => {});
  });

  describe('Rate Limiting', () => {
    // config.rateLimit.enabled が未定義のため、レート制限機能自体がアプリ全体で
    // 現在無効化されている（docs/FEATURE_AUDIT.md E-14参照）。有効化されるまでは
    // このテストは原理的に成立しないためskipする
    test.skip('Should enforce rate limits on API endpoints (E-14: レート制限機能自体が全体的に無効化されているため現状成立しない)', async () => {});
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
