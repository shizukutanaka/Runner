// モデレーターダッシュボード上部の「ミュートユーザー」カードのデータ源。
//
// ---------------------------------------------------------------------------
// なぜ追加したか
// ---------------------------------------------------------------------------
// このカードは長らく **12 という固定値**だった（`setModerationStats` が
// 一度も呼ばれていなかった）。実データに差し替えるにあたり、
// SQLite 側に時刻表現の罠がある:
//
//   `mute_until` は `new Date().toISOString()` 由来 → '2026-09-01T14:05:00.000Z'
//   `datetime('now')`                              → '2026-09-01 14:00:00'
//
// 文字列比較では10文字目が 'T'(0x54) と ' '(0x20) なので、**日付が同じなら
// 必ず ISO 側が大きい**。既定のミュートは300秒＝同日中に切れるため、
// `mute_until > datetime('now')` と書くと期限切れのミュートまで
// 「継続中」に数える。ここではその誤りを踏まないことを固定する。
const db = require('../../src/db');
const analytics = require('../../src/controllers/analyticsController');

const dbRun = (sql, p = []) => new Promise((resolve, reject) => {
  db.run(sql, p, function cb(e) { e ? reject(e) : resolve(this); });
});

const invoke = (fn, req = {}) => new Promise((resolve) => {
  const res = {
    _status: 200,
    status(code) { this._status = code; return this; },
    json(body) { resolve({ status: this._status, body }); return this; }
  };
  const next = (err) => resolve({ status: err?.status || 500, body: { _error: err?.message } });
  Promise.resolve(fn({ query: {}, params: {}, ...req }, res, next))
    .catch((e) => next({ status: 500, message: e.message }));
});

const countMuted = async () => (await invoke(analytics.getStats)).body.mutedCount;

describe('getStats の mutedCount', () => {
  let prefix;

  beforeAll(async () => {
    await new Promise((r) => setTimeout(r, 1000)); // DBスキーマ初期化待ち
    prefix = `mc_${Date.now()}`;
  });

  it('固定値ではなく実データを返す（キーが存在し数値である）', async () => {
    const { status, body } = await invoke(analytics.getStats);
    expect(status).toBe(200);
    expect(typeof body.mutedCount).toBe('number');
  });

  it('status=muted のユーザーを数える', async () => {
    const before = await countMuted();
    await dbRun('INSERT INTO users (id,platform,username,status) VALUES (?,?,?,?)',
      [`${prefix}_s`, 'youtube', `${prefix}_s`, 'muted']);
    expect(await countMuted()).toBe(before + 1);
  });

  it('mute_until が未来のユーザーを数える（タイムアウト経由のミュート）', async () => {
    const before = await countMuted();
    const future = new Date(Date.now() + 300 * 1000).toISOString();
    await dbRun('INSERT INTO users (id,platform,username,status,mute_until) VALUES (?,?,?,?,?)',
      [`${prefix}_f`, 'youtube', `${prefix}_f`, 'active', future]);
    expect(await countMuted()).toBe(before + 1);
  });

  it('【本命】同じ日に切れた mute_until を「継続中」に数えない', async () => {
    // datetime('now') と ISO を直接比較していると、この行が加算されてしまう
    const before = await countMuted();
    const justExpired = new Date(Date.now() - 60 * 1000).toISOString();
    await dbRun('INSERT INTO users (id,platform,username,status,mute_until) VALUES (?,?,?,?,?)',
      [`${prefix}_e`, 'youtube', `${prefix}_e`, 'active', justExpired]);
    expect(await countMuted()).toBe(before);
  });

  it('BANされたユーザーはミュートに数えない', async () => {
    const before = await countMuted();
    const future = new Date(Date.now() + 300 * 1000).toISOString();
    await dbRun('INSERT INTO users (id,platform,username,status,mute_until) VALUES (?,?,?,?,?)',
      [`${prefix}_b`, 'youtube', `${prefix}_b`, 'banned', future]);
    expect(await countMuted()).toBe(before);
  });
});
