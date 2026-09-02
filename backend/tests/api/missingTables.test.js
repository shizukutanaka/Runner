// E-29: ルーティング済みなのにテーブルが無く、呼べば必ず500だったエンドポイント群。
//
// ---------------------------------------------------------------------------
// どうやって見つけたか
// ---------------------------------------------------------------------------
// 「使われていないのに存在するもの」を機械的に探す過程で
// （`tests/architecture/deadExports.test.js`）、SQL文字列リテラルが参照する
// テーブル名を `CREATE TABLE IF NOT EXISTS` の集合と突き合わせたところ、
// **mount 済みの16エンドポイントが存在しないテーブルを引いていた**。
//
// 実サーバーで確認した:
//
//   GET /api/users/timeouts/active
//   → 500 {"code":"SQLITE_ERROR"}
//
// タイムアウトは配信のモデレーションで最も使われる操作である。
// 「実装されているが未接続」ではなく「呼べば必ず落ちる」状態が、
// テストが無いために誰にも気づかれていなかった。
//
// ---------------------------------------------------------------------------
// このテストが守るもの
// ---------------------------------------------------------------------------
// **500 を返さないこと**。データが無ければ空配列や404でよいが、
// SQLITE_ERROR による500だけは「壊れている」以外の意味を持たない。
// 個々のビジネスロジックの正しさは別の話で、ここでは因果鎖の
// 「呼べる／落ちない」を固定する。
const request = require('supertest');
const app = require('../../src/app');
const { generateToken } = require('../../src/middleware/auth');
const db = require('../../src/db');
const { randomUUID } = require('crypto');

const dbRun = (sql, p = []) => new Promise((resolve, reject) => {
  db.run(sql, p, function cb(e) { e ? reject(e) : resolve(this); });
});

let adminToken;
let userId;
let commentId;

const auth = (req) => req.set('Authorization', `Bearer ${adminToken}`);

const expectNotServerError = (res) => {
  if (res.status >= 500) {
    throw new Error(
      `${res.status} ${JSON.stringify(res.body?.error?.details || res.body)}`
    );
  }
};

describe('存在しないテーブルで500になっていたエンドポイント（E-29）', () => {
  beforeAll(async () => {
    await new Promise((r) => setTimeout(r, 1200)); // スキーマ初期化待ち
    adminToken = generateToken({ id: 'mt-admin', username: 'mt-admin', role: 'admin' });
    const uniq = `mt_${Date.now()}`;
    userId = `${uniq}_u`;
    // コメントIDはUUID必須（バリデーションで弾かれる）
    commentId = randomUUID();
    await dbRun('INSERT INTO users (id,platform,username,status) VALUES (?,?,?,?)',
      [userId, 'youtube', uniq, 'active']);
    await dbRun(
      'INSERT INTO comments (id,platform,user,content,timestamp,status) VALUES (?,?,?,?,datetime(\'now\'),\'visible\')',
      [commentId, 'youtube', uniq, 'hello']
    );
  });

  describe('タイムアウト（user_timeouts / user_timeout_history）', () => {
    it('POST /:id/timeout でタイムアウトを付与できる', async () => {
      const res = await auth(request(app).post(`/api/users/${userId}/timeout`))
        .send({ duration: 300, reason: 'test', platform: 'youtube' });
      expectNotServerError(res);
      expect(res.status).toBeLessThan(400);
    });

    it('GET /:id/timeout で現在のタイムアウトを取得できる', async () => {
      const res = await auth(request(app).get(`/api/users/${userId}/timeout`));
      expectNotServerError(res);
    });

    it('GET /timeouts/active（この不具合を最初に踏んだ経路）', async () => {
      const res = await auth(request(app).get('/api/users/timeouts/active'));
      expectNotServerError(res);
      expect(res.status).toBe(200);
    });

    it('GET /:id/timeout-history', async () => {
      const res = await auth(request(app).get(`/api/users/${userId}/timeout-history`));
      expectNotServerError(res);
    });

    it('DELETE /:id/timeout で解除できる', async () => {
      const res = await auth(request(app).delete(`/api/users/${userId}/timeout`))
        .send({ reason: 'done' });
      expectNotServerError(res);
    });

    it('POST /timeouts/cleanup', async () => {
      const res = await auth(request(app).post('/api/users/timeouts/cleanup'));
      expectNotServerError(res);
    });
  });

  describe('その他の欠損テーブル', () => {
    it('GET /:id/channel-activity（moderation_history）', async () => {
      const res = await auth(request(app).get(`/api/users/${userId}/channel-activity`));
      expectNotServerError(res);
    });

    it('PUT /:id/external-integration（external_integration_logs）', async () => {
      // E-30の教訓: 最初この本文は { serviceId, action, status } だった。
      // このハンドラのスキーマは { enabled, services, webhookUrl, ... } なので
      // **SQLに到達する前に400で弾かれ**、テストは「500でない」を満たしてしまう。
      // 通っているように見えて、実は検査対象の行を一度も実行していなかった。
      // 「500でない」を確かめるテストは、**そこまで到達していること**も要る。
      const res = await auth(request(app).put(`/api/users/${userId}/external-integration`))
        .send({ enabled: true, services: ['discord'], syncFrequency: 'manual', reason: 'E-30' });
      expectNotServerError(res);
      expect(res.status).toBe(200); // 400ならSQLまで届いていない
    });

    it('GET /comments/:id/edit-history は空配列を返す（500ではない）', async () => {
      // ここは存在しないテーブル comment_edits を、存在しない列で引いていた。
      // 編集機能自体が未実装なので履歴は空になるが、**空配列と500は違う**
      const res = await auth(request(app).get(`/api/comments/${commentId}/edit-history`));
      expectNotServerError(res);
      expect(res.status).toBe(200);
      expect(res.body.data).toEqual([]);
    });

    it('PUT /comments/:id/visibility →  GET /visibility/history（comment_visibility_history）', async () => {
      const put = await auth(request(app).put(`/api/comments/${commentId}/visibility`))
        .send({ visibility: 'moderators', reason: 'E-29 regression' });
      expectNotServerError(put);
      expect(put.status).toBeLessThan(400);

      // 書いた履歴が読めること（書き込み側だけ直しても意味がない）
      const hist = await auth(request(app).get(`/api/comments/${commentId}/visibility/history`));
      expectNotServerError(hist);
      expect(hist.status).toBe(200);
      expect(hist.body.data.history.length).toBeGreaterThanOrEqual(1);
    });

    it('POST /comments/visibility/batch', async () => {
      const res = await auth(request(app).post('/api/comments/visibility/batch'))
        .send({ updates: [{ commentId, visibility: 'public' }], reason: 'batch' });
      expectNotServerError(res);
    });

    it('PUT /moderation/ai-threshold/comments/:id（ai_threshold_history）', async () => {
      const res = await auth(request(app).put(`/api/moderation/ai-threshold/comments/${commentId}`))
        .send({ threshold: 0.7, reason: 'E-29 regression' });
      expectNotServerError(res);
    });

    it('PUT /moderation/ai-threshold/users/:id', async () => {
      const res = await auth(request(app).put(`/api/moderation/ai-threshold/users/${userId}`))
        .send({ threshold: 0.6, reason: 'E-29 regression' });
      expectNotServerError(res);
    });

    it('POST /moderation/ai-threshold/batch', async () => {
      const res = await auth(request(app).post('/api/moderation/ai-threshold/batch'))
        .send({ updates: [{ commentId, threshold: 0.5 }], reason: 'batch' });
      expectNotServerError(res);
    });

    it('存在しないコメントの edit-history は404（空と不在を区別する）', async () => {
      const res = await auth(request(app).get(`/api/comments/${randomUUID()}/edit-history`));
      expectNotServerError(res);
      expect(res.status).toBe(404);
    });
  });
});

// ---------------------------------------------------------------------------
// 監視ダッシュボードの「最近のログ」タブ
// ---------------------------------------------------------------------------
// `/api/monitoring/logs` は存在しない `logs` テーブルを引いており、
// 画面には毎回エラーが出ていた。DBにテーブルを足しても**そこへ書く経路が無い**ため
// 永久に空になる。実在するログは winston-daily-rotate-file が書く
// `backend/logs/application-YYYY-MM-DD.log`（1行1JSON）だけなので、そこを読む。
describe('監視のログ取得は実在するログを読む（E-29）', () => {
  const fs = require('fs');
  const path = require('path');
  const logDir = path.resolve(__dirname, '../../logs');
  const marker = `E29-marker-${Date.now()}`;
  let logFile;
  let createdDir = false;

  beforeAll(async () => {
    await new Promise((r) => setTimeout(r, 1200));
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
      createdDir = true;
    }
    const day = new Date().toISOString().slice(0, 10);
    logFile = path.join(logDir, `application-${day}.log`);
    fs.appendFileSync(logFile, `${JSON.stringify({
      timestamp: new Date().toISOString(),
      level: 'error',
      message: marker,
      service: 'runner-backend'
    })}\n`);
  });

  afterAll(() => {
    // 追記した行だけを取り除く（既存のログは壊さない）
    if (fs.existsSync(logFile)) {
      const kept = fs.readFileSync(logFile, 'utf8')
        .split('\n').filter((l) => l && !l.includes(marker));
      fs.writeFileSync(logFile, kept.length ? `${kept.join('\n')}\n` : '');
    }
    if (createdDir && fs.existsSync(logDir) && fs.readdirSync(logDir).length === 0) {
      fs.rmdirSync(logDir);
    }
  });

  it('書かれたログ行が読み出せる（500ではない）', async () => {
    const res = await auth(request(app).get('/api/monitoring/logs?limit=200'));
    expectNotServerError(res);
    expect(res.status).toBe(200);
    expect(res.body.data.logs.some((l) => l.message === marker)).toBe(true);
  });

  it('レベルで絞り込める', async () => {
    const res = await auth(request(app).get('/api/monitoring/logs?level=error&limit=200'));
    expectNotServerError(res);
    expect(res.body.data.logs.every((l) => l.level === 'error')).toBe(true);
    expect(res.body.data.logs.some((l) => l.message === marker)).toBe(true);
  });

  it('レベル別の集計を返す', async () => {
    const res = await auth(request(app).get('/api/monitoring/logs?limit=200'));
    expect(res.body.data.stats.errors).toBeGreaterThanOrEqual(1);
  });

  it('フロントが期待する形（logs[].level / message / timestamp / source）', async () => {
    const res = await auth(request(app).get('/api/monitoring/logs?limit=200'));
    const entry = res.body.data.logs.find((l) => l.message === marker);
    expect(entry).toMatchObject({ level: 'error', message: marker });
    expect(typeof entry.timestamp).toBe('string');
    expect(typeof entry.source).toBe('string');
  });
});

// 監視の設定・メトリクスも同じ理由で壊れていた
describe('監視の設定とメトリクス（E-29）', () => {
  beforeAll(async () => { await new Promise((r) => setTimeout(r, 1200)); });

  it('GET /monitoring/settings は未設定でも既定値を200で返す', async () => {
    const res = await auth(request(app).get('/api/monitoring/settings'));
    expectNotServerError(res);
    expect(res.status).toBe(200);
    expect(res.body.data.settings).toHaveProperty('thresholds');
  });

  it('PUT したものが GET で読み戻せる（書き側と読み側の列が食い違っていた）', async () => {
    const settings = { enabled: false, thresholds: { cpu: 42 } };
    const put = await auth(request(app).put('/api/monitoring/settings')).send({ settings });
    expectNotServerError(put);
    expect(put.status).toBe(200);

    const get = await auth(request(app).get('/api/monitoring/settings'));
    expectNotServerError(get);
    expect(get.body.data.settings.thresholds.cpu).toBe(42);
  });

  it('GET /monitoring/metrics はプロセス内の実測を返す', async () => {
    const res = await auth(request(app).get('/api/monitoring/metrics'));
    expectNotServerError(res);
    expect(res.status).toBe(200);
    // このテスト自身のリクエストが数えられているはず
    expect(res.body.data.totalRequests).toBeGreaterThan(0);
    // 期間で絞れないことを隠さない（プロセス内メモリのため）
    expect(res.body.data.windowed).toBe(false);
  });
});
