// W-4 / E-1-E-2: analyticsController のスタブ解消。従来ハードコード値/ダミー文字列を
// 返していた13関数のうち、DBから導出可能なものを実クエリ実装に、外部I/Oのものを
// 501 Not Implemented に変更した。その回帰テスト。
const db = require('../../src/db');
const analytics = require('../../src/controllers/analyticsController');

const dbRun = (sql, p = []) => new Promise((resolve, reject) => {
  db.run(sql, p, function cb(e) { e ? reject(e) : resolve(this); });
});

// Express の res/next を模したヘルパ
const invoke = (fn, req = {}) => new Promise((resolve) => {
  const res = {
    _status: 200,
    status(code) { this._status = code; return this; },
    json(body) { resolve({ status: this._status, body }); return this; }
  };
  const next = (err) => resolve({ status: err?.status || 500, body: { _error: err?.message } });
  Promise.resolve(fn({ query: {}, params: {}, ...req }, res, next)).catch((e) => next({ status: 500, message: e.message }));
});

describe('analyticsController（実装済みスタブ・W-4）', () => {
  beforeAll(async () => {
    await new Promise((r) => setTimeout(r, 1000)); // DBスキーマ初期化待ち
    const uniq = `az_${Date.now()}`;
    global.__azUser = uniq;
    // alice相当: visible2 + deleted1、bob相当: visible1
    await dbRun('INSERT INTO comments (id,platform,user,content,timestamp,status) VALUES (?,?,?,?,datetime(\'now\',\'-2 hours\'),\'visible\')', [`${uniq}_1`, 'youtube', uniq, 'hi']);
    await dbRun('INSERT INTO comments (id,platform,user,content,timestamp,status,moderation_reason,moderation_timestamp) VALUES (?,?,?,?,datetime(\'now\',\'-30 minutes\'),\'deleted\',\'NG\',datetime(\'now\',\'-29 minutes\'))', [`${uniq}_2`, 'youtube', uniq, 'bad']);
    await dbRun('INSERT INTO comments (id,platform,user,content,timestamp,status) VALUES (?,?,?,?,datetime(\'now\',\'-10 minutes\'),\'visible\')', [`${uniq}_3`, 'youtube', uniq, 'ok']);
    await dbRun('INSERT INTO users (id,platform,username,status) VALUES (?,?,?,?)', [`${uniq}_u`, 'youtube', uniq, 'active']);
  });

  it('getModerationStats はステータス別のflagged/passedを実データから返す', async () => {
    const { status, body } = await invoke(analytics.getModerationStats);
    expect(status).toBe(200);
    expect(body.stats.flagged).toBeGreaterThanOrEqual(1); // deleted 1件以上
    expect(body.stats.passed).toBeGreaterThanOrEqual(2);   // visible 2件以上
    expect(body.stats.byStatus).toHaveProperty('visible');
  });

  it('getRanking はコメント数上位ユーザーにseedユーザーを含む', async () => {
    const { body } = await invoke(analytics.getRanking);
    const mine = body.ranking.find((r) => r.user === global.__azUser);
    expect(mine).toBeDefined();
    expect(mine.commentCount).toBe(3);
  });

  it('getUserStats はユーザーのコメント数とステータスを返す', async () => {
    const { body } = await invoke(analytics.getUserStats, { params: { id: global.__azUser } });
    expect(body.stats.comments).toBe(3);
    expect(body.stats.status).toBe('active');
    expect(body.stats.banned).toBe(false);
  });

  it('getCommentStats は存在するコメントの状態を返し、無いものは404', async () => {
    const ok = await invoke(analytics.getCommentStats, { params: { id: `${global.__azUser}_2` } });
    expect(ok.status).toBe(200);
    expect(ok.body.stats.status).toBe('deleted');
    const missing = await invoke(analytics.getCommentStats, { params: { id: 'does-not-exist' } });
    expect(missing.status).toBe(404);
  });

  it('getPeriodStats/getHistory/getUsage/getPeak/getTrend/detectAnomaly は200で実データ形状を返す', async () => {
    expect((await invoke(analytics.getPeriodStats)).body.stats.commentCount).toBeGreaterThanOrEqual(3);
    expect((await invoke(analytics.getHistory)).body.count).toBeGreaterThanOrEqual(1);
    const usage = await invoke(analytics.getUsage);
    expect(usage.body.total).toBeGreaterThanOrEqual(1);
    expect(usage.body.usage).toBeGreaterThanOrEqual(0);
    expect((await invoke(analytics.getPeak)).body.peak).toMatch(/^\d{2}:00$/);
    expect(['up', 'down', 'stable']).toContain((await invoke(analytics.getTrend)).body.trend);
    expect(typeof (await invoke(analytics.detectAnomaly)).body.anomaly).toBe('boolean');
  });

  it('export/import/external はダミー成功ではなく 501 を返す', async () => {
    for (const fn of [analytics.exportAnalytics, analytics.importAnalytics, analytics.externalIntegration]) {
      const { status, body } = await invoke(fn);
      expect(status).toBe(501);
      expect(body.implemented).toBe(false);
    }
  });
});
