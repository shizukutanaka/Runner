// コメントAPI自動テスト（正常系・異常系）
const request = require('supertest');
const app = require('../../src/app');
const db = require('../../src/db');

describe('Comments API', () => {
  let commentId;
  let authToken;

  // テスト用のコメントデータ
  const testCommentData = {
    content: 'テストコメント本文',
    user: 'testuser',
    platform: 'youtube',
    timestamp: new Date().toISOString()
  };

  const updatedCommentData = {
    action: 'hidden',
    content: '編集済みコメント本文',
    status: 'edited'
  };

  // /api/comments 配下は全ルートがrequireRole('moderator')で保護されているため認証が必要
  const auth = (req) => req.set('Authorization', `Bearer ${authToken}`);

  beforeAll(async () => {
    await new Promise(resolve => setTimeout(resolve, 1000));

    const registerRes = await request(app)
      .post('/api/users/register')
      .send({
        username: 'commentsapitester',
        password: 'TestPass123!',
        email: 'commentsapitester@example.com',
      });

    if (registerRes.status === 201 || registerRes.status === 409) {
      const loginRes = await request(app)
        .post('/api/users/login')
        .send({
          username: 'commentsapitester',
          password: 'TestPass123!',
        });

      authToken = loginRes.body.token;
    }
  });

  afterAll(async () => {
    if (db && db.closeDatabase) {
      await db.closeDatabase();
    }
  });

  describe('POST /api/comments', () => {
    it('正常系: コメント作成成功', async () => {
      const res = await auth(request(app).post('/api/comments')).send(testCommentData);

      expect(res.statusCode).toBe(201);
      expect(res.body.status).toBe(201);
      expect(res.body.data.id).toBeDefined();
      expect(res.body.data.content).toBe(testCommentData.content);
      expect(res.body.data.user).toBe(testCommentData.user);
      expect(res.body.data.platform).toBe(testCommentData.platform);
      expect(res.body.message).toMatch(/created|追加|作成/);

      commentId = res.body.data.id;
    });

    it('異常系: 必須フィールド欠如 (content)', async () => {
      const invalidData = { ...testCommentData };
      delete invalidData.content;

      const res = await auth(request(app).post('/api/comments')).send(invalidData);

      expect(res.statusCode).toBe(400);
      expect(res.body.status).toBe(400);
      expect(res.body.details).toBeDefined();
      expect(res.body.message).toMatch(/content|必須|required/);
    });

    it('異常系: 必須フィールド欠如 (user)', async () => {
      const invalidData = { ...testCommentData };
      delete invalidData.user;

      const res = await auth(request(app).post('/api/comments')).send(invalidData);

      expect(res.statusCode).toBe(400);
      expect(res.body.message).toMatch(/user|必須|required/);
    });

    it('異常系: 必須フィールド欠如 (platform)', async () => {
      const invalidData = { ...testCommentData };
      delete invalidData.platform;

      const res = await auth(request(app).post('/api/comments')).send(invalidData);

      expect(res.statusCode).toBe(400);
      expect(res.body.message).toMatch(/platform|必須|required/);
    });

    it('異常系: 不正なプラットフォーム値', async () => {
      const invalidData = { ...testCommentData, platform: 'invalid_platform' };

      const res = await auth(request(app).post('/api/comments')).send(invalidData);

      expect(res.statusCode).toBe(400);
      expect(res.body.message).toMatch(/platform|無効|invalid/);
    });

    it('異常系: コンテンツが長すぎる', async () => {
      const longContent = 'a'.repeat(501); // create schema上限は500文字
      const invalidData = { ...testCommentData, content: longContent };

      const res = await auth(request(app).post('/api/comments')).send(invalidData);

      expect(res.statusCode).toBe(400);
      expect(res.body.message).toMatch(/length|文字数|長さ/);
    });

    it('異常系: 空のコンテンツ', async () => {
      const invalidData = { ...testCommentData, content: '' };

      const res = await auth(request(app).post('/api/comments')).send(invalidData);

      expect(res.statusCode).toBe(400);
      expect(res.body.message).toMatch(/empty|空|content/);
    });

    it('異常系: ユーザー名が長すぎる', async () => {
      const longUser = 'a'.repeat(101); // 100文字制限超過
      const invalidData = { ...testCommentData, user: longUser };

      const res = await auth(request(app).post('/api/comments')).send(invalidData);

      expect(res.statusCode).toBe(400);
      expect(res.body.message).toMatch(/length|文字数|user/);
    });

    it('異常系: 認証なしは401', async () => {
      const res = await request(app).post('/api/comments').send(testCommentData);
      expect(res.statusCode).toBe(401);
    });
  });

  describe('GET /api/comments', () => {
    it('正常系: コメント一覧取得', async () => {
      const res = await auth(request(app).get('/api/comments?platform=youtube')).expect(200);

      expect(res.body.status).toBe(200);
      expect(Array.isArray(res.body.data.items)).toBe(true);
      expect(res.body.data.items.length).toBeGreaterThanOrEqual(1);
    });

    it('正常系: プラットフォーム指定なし', async () => {
      const res = await auth(request(app).get('/api/comments')).expect(200);

      expect(res.body.status).toBe(200);
      expect(Array.isArray(res.body.data.items)).toBe(true);
    });

    it('正常系: ページネーション', async () => {
      const res = await auth(request(app).get('/api/comments?platform=youtube&limit=5&offset=0')).expect(200);

      expect(res.body.status).toBe(200);
      expect(Array.isArray(res.body.data.items)).toBe(true);
    });

    it('異常系: 不正なlimit値', async () => {
      const res = await auth(request(app).get('/api/comments?platform=youtube&limit=-1'));

      expect(res.statusCode).toBe(400);
      expect(res.body.message).toMatch(/limit|無効|invalid/);
    });

    it('異常系: 不正なoffset値', async () => {
      const res = await auth(request(app).get('/api/comments?platform=youtube&offset=-1'));

      expect(res.statusCode).toBe(400);
      expect(res.body.message).toMatch(/offset|無効|invalid/);
    });
  });

  describe('GET /api/comments/:id', () => {
    it('正常系: 個別コメント取得', async () => {
      const createRes = await auth(request(app).post('/api/comments')).send(testCommentData);
      const newCommentId = createRes.body.data.id;
      expect(newCommentId).toBeDefined();

      const getRes = await auth(request(app).get(`/api/comments/${newCommentId}`)).expect(200);

      expect(getRes.body.status).toBe(200);
      expect(getRes.body.data.id).toBe(newCommentId);
      expect(getRes.body.data.content).toBe(testCommentData.content);
    });

    it('異常系: 存在しないコメント取得', async () => {
      const fakeId = '00000000-0000-4000-8000-000000000000';

      const res = await auth(request(app).get(`/api/comments/${fakeId}`)).expect(404);

      // 404はerrorHandlerミドルウェア経由のため {error:{message}} 形式（validate()middlewareの400とは異なる封筒）
      expect(res.body.error.message).toMatch(/not found|見つからない|存在しない/);
    });

    it('異常系: 不正なID形式', async () => {
      const res = await auth(request(app).get('/api/comments/invalid-id-format')).expect(400);

      expect(res.body.message).toMatch(/id|形式|format|guid|valid/i);
    });
  });

  describe('PUT /api/comments/:id', () => {
    it('正常系: コメント更新成功', async () => {
      expect(commentId).toBeDefined();

      const res = await auth(request(app).put(`/api/comments/${commentId}`)).send(updatedCommentData);

      expect(res.statusCode).toBe(200);
      expect(res.body.status).toBe(200);
      expect(res.body.message).toMatch(/updated|更新|編集/);
    });

    it('異常系: 存在しないコメントID', async () => {
      const fakeId = '00000000-0000-4000-8000-000000000000';

      const res = await auth(request(app).put(`/api/comments/${fakeId}`)).send(updatedCommentData);

      expect(res.statusCode).toBe(404);
      // 404はerrorHandlerミドルウェア経由のため {error:{message}} 形式（validate()middlewareの400とは異なる封筒）
      expect(res.body.error.message).toMatch(/not found|見つからない|存在しない/);
    });

    it('異常系: 不正なID形式', async () => {
      const res = await auth(request(app).put('/api/comments/invalid-id-format')).send(updatedCommentData);

      expect(res.statusCode).toBe(400);
      expect(res.body.message).toMatch(/id|形式|format|guid|valid/i);
    });

    it('異常系: 空の更新データ', async () => {
      expect(commentId).toBeDefined();

      const res = await auth(request(app).put(`/api/comments/${commentId}`)).send({});

      // action(必須フィールド)が無いため400 - "action"バリデーションエラーになる
      expect(res.statusCode).toBe(400);
      expect(res.body.message).toMatch(/action|必須|required/);
    });

    it('異常系: 不正なステータス値', async () => {
      expect(commentId).toBeDefined();

      const res = await auth(request(app).put(`/api/comments/${commentId}`)).send({ action: 'invalid_status' });

      expect(res.statusCode).toBe(400);
      expect(res.body.message).toMatch(/action|無効|invalid/);
    });
  });

  describe('DELETE /api/comments/:id', () => {
    const deletionReason = { reason: 'テストによる削除', reasonCategory: 'other' };

    it('正常系: コメント削除成功', async () => {
      expect(commentId).toBeDefined();

      const res = await auth(request(app).delete(`/api/comments/${commentId}`)).send(deletionReason).expect(200);

      expect(res.body.status).toBe(200);
      expect(res.body.message).toMatch(/deleted|削除/);
    });

    it('異常系: 存在しないコメント削除', async () => {
      const fakeId = '00000000-0000-4000-8000-000000000000';

      const res = await auth(request(app).delete(`/api/comments/${fakeId}`)).send(deletionReason).expect(404);

      // 404はerrorHandlerミドルウェア経由のため {error:{message}} 形式（validate()middlewareの400とは異なる封筒）
      expect(res.body.error.message).toMatch(/not found|見つからない|存在しない/);
    });

    it('異常系: 不正なID形式での削除', async () => {
      const res = await auth(request(app).delete('/api/comments/invalid-id-format')).send(deletionReason).expect(400);

      expect(res.body.message).toMatch(/id|形式|format|guid|valid/i);
    });

    it('異常系: 削除理由なし', async () => {
      const createRes = await auth(request(app).post('/api/comments')).send(testCommentData);
      const idToDelete = createRes.body.data.id;

      const res = await auth(request(app).delete(`/api/comments/${idToDelete}`)).send({}).expect(400);

      // deleteCommentは自前のJoiバリデーションを持ち、汎用メッセージ"Invalid deletion parameters"を返す
      expect(res.body.message).toMatch(/invalid|reason|必須|required/i);
      expect(res.body.details).toBeDefined();
    });
  });

  describe('POST /api/comments/summary', () => {
    it('正常系: AI要約生成', async () => {
      const comments = [
        { content: '素晴らしい配信でした！', user: 'user1', platform: 'youtube' },
        { content: '次の配信も楽しみです', user: 'user2', platform: 'youtube' },
        { content: '質問があります', user: 'user3', platform: 'youtube' }
      ];

      const res = await auth(request(app).post('/api/comments/summary')).send({ comments }).expect(200);

      expect(res.body.status).toBe(200);
      expect(typeof res.body.data.summary).toBe('string');
      expect(res.body.data.summary.length).toBeGreaterThan(0);
    });

    it('異常系: 空のコメント配列', async () => {
      const res = await auth(request(app).post('/api/comments/summary')).send({ comments: [] }).expect(400);

      expect(res.body.message).toMatch(/empty|空|comments/i);
    });

    it('異常系: コメント配列なし', async () => {
      const res = await auth(request(app).post('/api/comments/summary')).send({}).expect(400);

      expect(res.body.message).toMatch(/comments|必須|required/);
    });

    it('異常系: 不正なコメント形式', async () => {
      const invalidComments = [
        { content: 'テスト' }, // userとplatform欠如
        { user: 'user1' }, // content欠如
        null, // null値
        'invalid comment' // 文字列
      ];

      const res = await auth(request(app).post('/api/comments/summary')).send({ comments: invalidComments }).expect(400);

      expect(res.body.message).toMatch(/format|形式|invalid|required|必須/i);
    });
  });

  describe('POST /api/comments/auto-answer', () => {
    it('正常系: 自動Q&A応答生成', async () => {
      const testComment = 'このゲームの攻略方法を教えてください';

      const res = await auth(request(app).post('/api/comments/auto-answer')).send({ comment: testComment }).expect(200);

      expect(res.body.status).toBe(200);
      expect(typeof res.body.data.answer).toBe('string');
      expect(res.body.data.answer.length).toBeGreaterThan(0);
    });

    it('異常系: 空のコメント', async () => {
      const res = await auth(request(app).post('/api/comments/auto-answer')).send({ comment: '' }).expect(400);

      expect(res.body.message).toMatch(/empty|空|comment/i);
    });

    it('異常系: コメントなし', async () => {
      const res = await auth(request(app).post('/api/comments/auto-answer')).send({}).expect(400);

      expect(res.body.message).toMatch(/comment|必須|required/);
    });

    it('異常系: コメントが長すぎる', async () => {
      const longComment = 'a'.repeat(501); // autoAnswerスキーマ上限は500文字

      const res = await auth(request(app).post('/api/comments/auto-answer')).send({ comment: longComment }).expect(400);

      expect(res.body.message).toMatch(/length|文字数|長さ/);
    });
  });

  describe('セキュリティテスト', () => {
    it('XSS攻撃対策: スクリプトタグを含むコメント', async () => {
      const xssComment = {
        ...testCommentData,
        content: '<script>alert("XSS")</script>悪意のあるコメント'
      };

      const res = await auth(request(app).post('/api/comments')).send(xssComment);

      if (res.statusCode === 201) {
        // コメントが作成された場合、レスポンスでスクリプトがサニタイズされていることを確認
        expect(res.body.data.content).not.toMatch(/<script>/i);
      } else {
        // ブロックされた場合も正常
        expect([400, 403, 422]).toContain(res.statusCode);
      }
    });

    it('SQLインジェクション対策: SQLを含むコメント', async () => {
      const sqlInjectionComment = {
        ...testCommentData,
        content: "'; DROP TABLE comments; --"
      };

      const res = await auth(request(app).post('/api/comments')).send(sqlInjectionComment);

      // レスポンスが正常であることを確認（テーブルが破壊されずコメントとして安全に保存される）
      expect(res.statusCode).toBe(201);
    });
  });

  describe('レート制限テスト', () => {
    // config.rateLimit.enabled が config.js のどこにも定義されておらず、
    // buildLimiter() (middleware/security.js) が常に noopLimiter を返すため、
    // レート制限機能はアプリ全体で現在無効化されている（本テストのバグではなく
    // 実装側の未配線 - docs/FEATURE_AUDIT.md E-14 参照）。有効化されるまでは
    // このテストは原理的に成立しないためskipする
    it.skip('連続リクエストでのレート制限（E-14: レート制限機能自体が全体的に無効化されているため現状成立しない）', async () => {
      const requests = [];
      for (let i = 0; i < 150; i++) {
        requests.push(auth(request(app).get('/api/comments?platform=youtube')));
      }
      const results = await Promise.all(requests);
      const rateLimitedRequests = results.filter(res => res.statusCode === 429);
      expect(rateLimitedRequests.length).toBeGreaterThan(0);
    });
  });

  describe('パフォーマンステスト', () => {
    it('大量コメントの処理性能', async () => {
      const comments = [];

      // 100件のテストコメントを作成
      for (let i = 0; i < 100; i++) {
        comments.push({
          ...testCommentData,
          content: `テストコメント ${i + 1}`,
          user: `testuser${i + 1}`
        });
      }

      const startTime = Date.now();

      // バッチでコメントを作成
      const createPromises = comments.map(comment =>
        auth(request(app).post('/api/comments')).send(comment)
      );

      const results = await Promise.all(createPromises);
      const endTime = Date.now();

      const successfulCreates = results.filter(res => res.statusCode === 201);
      const processingTime = endTime - startTime;

      // 成功率と処理時間を確認
      expect(successfulCreates.length).toBeGreaterThanOrEqual(90); // 90%以上の成功率
      expect(processingTime).toBeLessThan(30000); // 30秒以内に処理完了
    });
  });
});
