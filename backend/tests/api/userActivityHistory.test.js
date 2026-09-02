// ユーザー活動画面の「モデレーション履歴」が実際の操作を映していることを検査する。
//
// ---------------------------------------------------------------------------
// なぜ必要か（E-36）
// ---------------------------------------------------------------------------
// この画面は `moderation_history` テーブルを読み、そこから
// 「モデレーション操作の総数 / BAN回数 / ミュート回数」を出していた。
// ところが **そのテーブルに書き込むコードは製品のどこにも無かった**。
//
// 結果、昨日BANしたユーザーを開いても
// 「操作 0件 / BAN 0回 / ミュート 0回・履歴なし」と出続ける。
// 常に空を返す読み取りは「履歴が無いことの証明」ではなく、記録の断線である。
// 繰り返し違反者を見分けるのはモデレーションの中心的な仕事なので、
// ここが空だと**人間の判断（因果鎖④）そのものが成り立たない**。
//
// 履歴は既に `audit_logs` にある（`updateUser` と timeout 系が `logDataMod` で書く）。
// 書き手の無いテーブルを増やすのではなく、実在する記録を読むように直した。
//
// このテストは「行が返ること」ではなく **実際にBANした操作が履歴に現れること** を見る。
const { randomUUID } = require('crypto');
const db = require('../../src/db');
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

const activityOf = async (id) => {
  const { status, body } = await invoke(users.getUserChannelActivity, { params: { id }, query: { limit: 50, offset: 0 } });
  expect(status).toBe(200);
  return body;
};

describe('ユーザー活動画面のモデレーション履歴（E-36）', () => {
  let userId;

  beforeAll(async () => {
    await new Promise((r) => setTimeout(r, 1500)); // スキーマ・監査ログ初期化待ち

    userId = randomUUID();
    await dbRun(
      'INSERT INTO users (id,platform,username,status) VALUES (?,?,?,?)',
      [userId, 'youtube', `uah_${Date.now()}`, 'active']
    );

    // 実際の操作を通す（テーブルに直接書かない）。
    // ミュート → BAN の順で2件
    const mute = await invoke(users.updateUser, {
      params: { id: userId },
      body: { action: 'mute', duration: 300, reason: '荒らし警告' },
      user: { id: 'mod_uah' }
    });
    expect(mute.status).toBe(200);
    await new Promise((r) => setTimeout(r, 400));

    const ban = await invoke(users.updateUser, {
      params: { id: userId },
      body: { action: 'ban', duration: 3600, reason: '継続的な迷惑行為' },
      user: { id: 'mod_uah' }
    });
    expect(ban.status).toBe(200);
    await new Promise((r) => setTimeout(r, 400));
  });

  it('BANとミュートが履歴に現れる（テーブルが空のままにならない）', async () => {
    const body = await activityOf(userId);
    const actions = body.data.moderationHistory.map((m) => m.action);
    expect(actions).toContain('ban');
    expect(actions).toContain('mute');
  });

  it('操作回数が実際の操作数と一致する', async () => {
    const body = await activityOf(userId);
    const stats = body.data.statistics;
    expect(stats.totalModerationActions).toBe(2);
    expect(stats.banCount).toBe(1);
    expect(stats.muteCount).toBe(1);
  });

  it('理由と実行者が記録されている', async () => {
    const body = await activityOf(userId);
    const history = body.data.moderationHistory;
    const banEntry = history.find((m) => m.action === 'ban');
    expect(banEntry).toBeDefined();
    expect(banEntry.reason).toBe('継続的な迷惑行為');
    expect(banEntry.moderator).toBe('mod_uah');
    expect(banEntry.timestamp).toBeTruthy();
  });

  it('操作されていないユーザーの履歴は空である（空が常に正しいわけではないことの対照）', async () => {
    const cleanId = randomUUID();
    await dbRun(
      'INSERT INTO users (id,platform,username,status) VALUES (?,?,?,?)',
      [cleanId, 'youtube', `uah_clean_${Date.now()}`, 'active']
    );
    const body = await activityOf(cleanId);
    const stats = body.data.statistics;
    expect(stats.totalModerationActions).toBe(0);
  });
});
