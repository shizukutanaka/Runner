// 「日別のコメント数とBAN数（直近7日）」グラフの数字が正しいことを検査する。
//
// ---------------------------------------------------------------------------
// なぜ必要か（E-35）
// ---------------------------------------------------------------------------
// BAN系列は `users.ban_until` を日付にして数えていた。
// しかし `ban_until` は **BANが切れる時刻**であって、BANした時刻ではない。
//
//   - 1時間BAN  → たまたま同じ日に落ちるので、それらしく見える
//   - 30日BAN   → 30日後の日付に計上され、直近7日のグラフには**永久に出ない**
//
// さらに系列を `bansByDay[コメントの日]` で引いていたため、
// **コメントが1件も無い日のBANは、その日ごと存在しないことになっていた**。
//
// 「いつBANしたか」は既に `audit_logs` に記録されている
// （`usersController.updateUser` → `logDataMod`）。列を足すのではなく実在する記録を読む。
//
// ---------------------------------------------------------------------------
// 検査の形
// ---------------------------------------------------------------------------
// テストDBは他のテストも書き込むため絶対値は固定できない。
// **投入前後の差分が厳密に一致すること**で固定する。
const { randomUUID } = require('crypto');
const db = require('../../src/db');
const analytics = require('../../src/controllers/analyticsController');
const users = require('../../src/controllers/usersController');

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
  Promise.resolve(fn({ query: {}, params: {}, body: {}, ...req }, res, next))
    .catch((e) => next({ status: 500, message: e.message }));
});

const today = () => new Date().toISOString().slice(0, 10);

const banUser = async (durationSeconds) => {
  const id = randomUUID();
  await dbRun(
    'INSERT INTO users (id,platform,username,status) VALUES (?,?,?,?)',
    [id, 'youtube', `gs_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`, 'active']
  );
  const res = await invoke(users.updateUser, {
    params: { id },
    body: { action: 'ban', duration: durationSeconds, reason: 'graphSeries test' },
    user: { id: 'mod_graph' }
  });
  expect(res.status).toBe(200);
  // 監査ログの書き込みは fire-and-forget なので、反映を待つ
  await new Promise((r) => setTimeout(r, 400));
  return id;
};

const bansOn = (body, day) => {
  const i = body.labels.indexOf(day);
  return i >= 0 ? body.bans[i] : 0;
};

describe('日別グラフの系列が正しいこと（E-35）', () => {
  beforeAll(async () => {
    await new Promise((r) => setTimeout(r, 1500)); // スキーマ・監査ログ初期化待ち
  });

  it('長期BANも「BANした日」に計上される（期限日ではない）', async () => {
    const day = today();
    const before = (await invoke(analytics.getGraph)).body;
    const b0 = bansOn(before, day);

    // 30日BAN。期限で数えていた頃は 30日後の日付に落ち、
    // 直近7日のグラフには一度も現れなかった
    await banUser(30 * 24 * 60 * 60);

    const after = (await invoke(analytics.getGraph)).body;
    expect(after.labels).toContain(day);
    expect(bansOn(after, day) - b0).toBe(1);
  });

  it('BANが2件なら2件増える（数え漏れも二重計上もしない）', async () => {
    const day = today();
    const before = (await invoke(analytics.getGraph)).body;
    const b0 = bansOn(before, day);

    await banUser(3600);
    await banUser(60 * 60 * 24 * 365);

    const after = (await invoke(analytics.getGraph)).body;
    expect(bansOn(after, day) - b0).toBe(2);
  });

  it('3系列の長さが揃っている（labels / comments / bans）', async () => {
    const { status, body } = await invoke(analytics.getGraph);
    expect(status).toBe(200);
    expect(Array.isArray(body.labels)).toBe(true);
    expect(body.comments).toHaveLength(body.labels.length);
    expect(body.bans).toHaveLength(body.labels.length);
    // ラベルは昇順で重複が無いこと
    expect([...body.labels].sort()).toEqual(body.labels);
    expect(new Set(body.labels).size).toBe(body.labels.length);
  });

  it('コメント数も投入分だけ増える', async () => {
    const day = today();
    const before = (await invoke(analytics.getGraph)).body;
    const i0 = before.labels.indexOf(day);
    const c0 = i0 >= 0 ? before.comments[i0] : 0;

    await dbRun(
      'INSERT INTO comments (id,platform,user,content,timestamp,status) VALUES (?,?,?,?,?,?)',
      [randomUUID(), 'youtube', `gs_c_${Date.now()}`, 'x', new Date().toISOString(), 'visible']
    );

    const after = (await invoke(analytics.getGraph)).body;
    const i = after.labels.indexOf(day);
    expect(i).toBeGreaterThanOrEqual(0);
    expect(after.comments[i] - c0).toBe(1);
  });
});
