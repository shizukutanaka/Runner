// E-14 / W-1: レート制限の有効化ロジックの回帰テスト。
// security.js の buildLimiter() は config.rateLimit.enabled が false のとき noop を返し、
// true のとき実際に 429 を返す。従来は enabled が未定義（=falsy）で全APIが無制限だった。
const express = require('express');
const request = require('supertest');

// config をモックしてレート制限を強制的に有効化/無効化した状態で security.js を読み込む
const loadSecurityWith = (rateLimitOverrides) => {
  jest.resetModules();
  const realConfig = jest.requireActual('../../src/config');
  jest.doMock('../../src/config', () => ({
    ...realConfig,
    rateLimit: { ...realConfig.rateLimit, ...rateLimitOverrides },
  }));
  // security.js はモジュールロード時に limiter を構築するため、doMock 後に require する
  return require('../../src/middleware/security');
};

afterEach(() => {
  jest.resetModules();
  jest.dontMock('../../src/config');
});

describe('rate limiting enable/disable (E-14 / W-1)', () => {
  it('enabled=false のとき generalRateLimit は素通し（429を返さない）', async () => {
    const security = loadSecurityWith({ enabled: false });
    const app = express();
    app.use(security.generalRateLimit);
    app.get('/ping', (req, res) => res.json({ ok: true }));

    // 上限を超える回数を叩いても全て 200
    for (let i = 0; i < 20; i++) {
      const res = await request(app).get('/ping');
      expect(res.status).toBe(200);
    }
  });

  it('enabled=true のとき generalRateLimit は上限超過で 429 を返す', async () => {
    const security = loadSecurityWith({
      enabled: true,
      store: 'memory',
      general: { windowMs: 60000, max: 3 }, // テスト用に低い上限
    });
    const app = express();
    app.use(security.generalRateLimit);
    app.get('/ping', (req, res) => res.json({ ok: true }));

    const statuses = [];
    for (let i = 0; i < 6; i++) {
      const res = await request(app).get('/ping');
      statuses.push(res.status);
    }
    // 最初の3回は200、その後は429になる
    expect(statuses.slice(0, 3)).toEqual([200, 200, 200]);
    expect(statuses.slice(3)).toContain(429);
  });
});
