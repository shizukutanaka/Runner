// 監視ダッシュボードが読む項目を、実バックエンドの応答と突き合わせる。
//
// ---------------------------------------------------------------------------
// なぜ「500でないこと」の次にこれが要るのか
// ---------------------------------------------------------------------------
// E-29 で「呼べば落ちる」は潰した。だがその一つ上の層に
// **200を返すが、フロントが読む項目が入っていない**という失敗がある。
// この場合エラーは一切出ず、画面には `undefined` か空欄が出るだけで、
// 「まだデータが無いのだろう」と読めてしまう。500より見つけにくい。
//
// `apiContract.test.js` は「URLが実在するか」を見るが、**形までは見ない**。
// ここでは MonitoringDashboard.js が実際に参照している項目を列挙し、
// 実アプリの応答に存在することを確かめる。
// 参照項目はソースから機械的に取り出すのではなく、**明示的に書き出す**。
// 自動抽出にすると、フロントが読むのをやめた項目まで永久に守り続けてしまう。
const request = require('supertest');
const app = require('../../src/app');
const { generateToken } = require('../../src/middleware/auth');

const token = () => generateToken({ id: 'mc-admin', username: 'mc-admin', role: 'admin' });
const get = (url) => request(app).get(url).set('Authorization', `Bearer ${token()}`);

// パスをたどる。存在しない場合と、値が undefined の場合を区別する
const dig = (obj, dotted) =>
  dotted.split('.').reduce((acc, key) => (acc === undefined || acc === null ? undefined : acc[key]), obj);

describe('MonitoringDashboard が読む項目が実応答に存在すること', () => {
  beforeAll(async () => {
    await new Promise((r) => setTimeout(r, 1200));
  });

  describe('GET /api/monitoring/system/stats', () => {
    let body;
    beforeAll(async () => {
      const res = await get('/api/monitoring/system/stats');
      expect(res.status).toBe(200);
      body = res.body;
    });

    it.each([
      'cpu.usage', 'cpu.cores',
      'memory.total', 'memory.used', 'memory.usagePercent',
      'network.totalRxBytes', 'network.totalTxBytes',
      'processes.total',
      'system.arch', 'system.environment', 'system.hostname',
      'system.nodeVersion', 'system.platform', 'system.uptime'
    ])('data.%s', (field) => {
      expect(dig(body.data, field)).toBeDefined();
    });

    it('disk はディスク一覧（フロントは配列として扱う）', () => {
      expect(Array.isArray(body.data.disk)).toBe(true);
    });
  });

  describe('GET /api/monitoring/app/stats', () => {
    let body;
    beforeAll(async () => {
      const res = await get('/api/monitoring/app/stats');
      expect(res.status).toBe(200);
      body = res.body;
    });

    it.each([
      'summary.totalComments',
      'summary.totalModerated',
      'summary.uniqueUsers',
      'summary.activeConnections'
    ])('data.%s', (field) => {
      expect(dig(body.data, field)).toBeDefined();
    });
  });

  describe('GET /api/monitoring/alerts', () => {
    it('data.alerts は配列（フロントが filter / map する）', async () => {
      const res = await get('/api/monitoring/alerts?limit=10');
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.data.alerts)).toBe(true);
    });
  });
});
