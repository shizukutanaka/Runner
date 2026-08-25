// `/health/detailed` と `/metrics` は認証必須、`/health` は公開。
//
// ---------------------------------------------------------------------------
// なぜこの区別が必要か
// ---------------------------------------------------------------------------
// 監査時点で `/health/detailed` と `/metrics` は**無認証で誰でも叩けた**。
// 実際に返っていた内容:
//   nodeVersion: "v22.22.2", platform, arch, cpus, totalMemory, freeMemory,
//   リクエスト統計（メソッド別・ステータス別）、エラー件数、メモリ使用量、稼働時間
//
// 特に **Nodeのバージョン開示は既知CVEの狙い撃ちを容易にする**。
// 運用のために公開する必要があるのは「生きているか」だけで、
// ホストの構成やバージョンまで公開する理由は無い。
//
// 一方 `/health` は**公開のままでなければならない**。
// コンテナのヘルスチェック（Dockerfile の HEALTHCHECK）やロードバランサが
// 認証情報を持たずに叩くため、ここを閉じると死活監視が壊れる。
const request = require('supertest');
const app = require('../../src/app');
const { generateToken } = require('../../src/middleware/auth');

describe('ヘルスチェック系エンドポイントの露出範囲', () => {
  beforeAll(async () => {
    await new Promise((resolve) => setTimeout(resolve, 1000));
  });

  describe('/health は公開のまま（死活監視のため閉じてはいけない）', () => {
    it('認証なしで200を返す', async () => {
      const res = await request(app).get('/health');
      expect(res.status).toBe(200);
    });

    it('ホストの構成情報を含まない', async () => {
      const body = JSON.stringify((await request(app).get('/health')).body);
      ['nodeVersion', 'platform', 'arch', 'cpus', 'totalMemory'].forEach((k) => {
        expect(body).not.toContain(k);
      });
    });
  });

  describe('/health/detailed は認証必須', () => {
    it('認証なしは401', async () => {
      expect((await request(app).get('/health/detailed')).status).toBe(401);
    });

    it('モデレーター権限では403（管理者のみ）', async () => {
      const res = await request(app)
        .get('/health/detailed')
        .set('Authorization', `Bearer ${generateToken({ id: 'mod-1', role: 'moderator' })}`);
      expect(res.status).toBe(403);
    });

    it('管理者は取得できる', async () => {
      const res = await request(app)
        .get('/health/detailed')
        .set('Authorization', `Bearer ${generateToken({ id: 'admin-1', role: 'admin' })}`);
      expect([200, 503]).toContain(res.status); // 依存の状態次第で503もありうる
      expect(res.body.system).toBeDefined();
    });
  });

  describe('/metrics は認証必須', () => {
    it('認証なしは401', async () => {
      expect((await request(app).get('/metrics')).status).toBe(401);
    });

    it('管理者は取得できる', async () => {
      const res = await request(app)
        .get('/metrics')
        .set('Authorization', `Bearer ${generateToken({ id: 'admin-2', role: 'admin' })}`);
      expect(res.status).toBe(200);
      expect(res.body.requests).toBeDefined();
    });
  });
});
