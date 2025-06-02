// コメントAPI自動テスト（正常系・異常系）
const request = require('supertest');
const app = require('../../src/app');

describe('Comments API', () => {
  let commentId;

  it('POST /api/comments - should create comment', async () => {
    const res = await request(app)
      .post('/api/comments')
      .send({ content: 'テストコメント', user: 'testuser', platform: 'youtube' });
    expect(res.statusCode).toBe(201);
    expect(res.body.status).toBe(201);
    expect(res.body.data.id).toBeDefined();
    commentId = res.body.data.id;
  });

  it('GET /api/comments - should fetch comments', async () => {
    const res = await request(app)
      .get('/api/comments?platform=youtube')
      .expect(200);
    expect(res.body.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
  });

  it('PUT /api/comments/:id - should update comment', async () => {
    const res = await request(app)
      .put(`/api/comments/${commentId}`)
      .send({ content: '編集済みコメント' });
    expect(res.statusCode).toBe(200);
    expect(res.body.status).toBe(200);
    expect(res.body.message).toMatch(/updated/);
  });

  it('POST /api/comments - バリデーションエラー', async () => {
    const res = await request(app)
      .post('/api/comments')
      .send({ user: 'testuser', platform: 'youtube' }); // content欠如
    expect(res.statusCode).toBe(400);
    expect(res.body.status).toBe(400);
    expect(res.body.details).toBeDefined();
  });
});
