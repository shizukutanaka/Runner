// 横断的なモデレーション操作履歴API（E-38）の検査。
//
// ---------------------------------------------------------------------------
// なぜ必要か
// ---------------------------------------------------------------------------
// モデレーター画面の「最近のモデレーションアクション」は
// **「サーバ側に横断的な履歴APIが無い」という理由で、その画面で実行した分しか
// 出せなかった**（再読み込みで消える）。
// しかし E-36 で分かったとおり、操作は全て `audit_logs` に残っている。
// 無かったのはAPIだけだった。
//
// 特に固定したいのは **BANがプラットフォームへ届いたかどうか** の3状態である:
//   true   届いた
//   false  届かなかった（当人は配信で発言し続けられる）
//   null   記録が無い（この機能より前の古い行）
// false と null を混ぜると、**古い記録を「届かなかった」と誤って表示する**ことになる。
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

const listActions = async (query = {}) => {
  const { status, body } = await invoke(analytics.getModerationActions, { query });
  expect(status).toBe(200);
  return body;
};

describe('横断的なモデレーション操作履歴（E-38）', () => {
  let bannedId;
  let mutedId;
  const username = `ma_${Date.now()}`;

  beforeAll(async () => {
    await new Promise((r) => setTimeout(r, 1500));

    bannedId = randomUUID();
    mutedId = randomUUID();
    await dbRun('INSERT INTO users (id,platform,username,status) VALUES (?,?,?,?)',
      [bannedId, 'youtube', `${username}_b`, 'active']);
    await dbRun('INSERT INTO users (id,platform,username,status) VALUES (?,?,?,?)',
      [mutedId, 'twitch', `${username}_m`, 'active']);

    await invoke(users.updateUser, {
      params: { id: mutedId },
      body: { action: 'mute', duration: 300, reason: '警告1回目' },
      user: { id: 'mod_ma' }
    });
    await new Promise((r) => setTimeout(r, 300));

    await invoke(users.updateUser, {
      params: { id: bannedId },
      body: { action: 'ban', duration: 3600, reason: '繰り返しの迷惑行為' },
      user: { id: 'mod_ma' }
    });
    await new Promise((r) => setTimeout(r, 500));
  });

  it('別のリクエストで実行した操作が返る（セッション内に限られない）', async () => {
    const body = await listActions({ limit: 200 });
    const mine = body.actions.filter((a) => a.moderator === 'mod_ma');
    const types = mine.map((a) => a.type);
    expect(types).toContain('ban');
    expect(types).toContain('mute');
  });

  it('誰が・誰に・なぜ・いつ が揃っている', async () => {
    const body = await listActions({ limit: 200 });
    const ban = body.actions.find((a) => a.userId === bannedId && a.type === 'ban');
    expect(ban).toBeDefined();
    expect(ban.moderator).toBe('mod_ma');
    expect(ban.reason).toBe('繰り返しの迷惑行為');
    expect(ban.user).toBe(`${username}_b`);   // IDではなく表示名で引けている
    expect(ban.platform).toBe('youtube');
    expect(ban.timestamp).toBeTruthy();
  });

  it('BANはプラットフォームへ届いたかを持つ（届かなければ false で、null にしない）', async () => {
    const body = await listActions({ limit: 200 });
    const ban = body.actions.find((a) => a.userId === bannedId && a.type === 'ban');
    // この環境には YouTube の資格情報が無いので書き戻しは成立しない。
    // 「不明」ではなく「届かなかった」と明確に記録されていること
    expect(ban.platformApplied).toBe(false);
    expect(typeof ban.platformReason).toBe('string');
  });

  it('BAN以外は届いたかどうかを持たない（null であって false ではない）', async () => {
    const body = await listActions({ limit: 200 });
    const mute = body.actions.find((a) => a.userId === mutedId && a.type === 'mute');
    expect(mute).toBeDefined();
    expect(mute.platformApplied).toBeNull();
  });

  it('新しい順に並び、limit を超えない', async () => {
    const body = await listActions({ limit: 3 });
    expect(body.actions.length).toBeLessThanOrEqual(3);
    expect(body.count).toBe(body.actions.length);
    const times = body.actions.map((a) => new Date(a.timestamp).getTime());
    expect([...times].sort((a, b) => b - a)).toEqual(times);
  });

  it('limit は上限200で頭打ちになる（不正値でも落ちない）', async () => {
    const body = await listActions({ limit: '99999' });
    expect(body.actions.length).toBeLessThanOrEqual(200);
    const bad = await listActions({ limit: 'abc' });
    expect(Array.isArray(bad.actions)).toBe(true);
  });
});
