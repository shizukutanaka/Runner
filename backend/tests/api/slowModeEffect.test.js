// 「設定を保存したら、実際に挙動が変わるか」を検査する（E-39）。
//
// ---------------------------------------------------------------------------
// なぜ必要か
// ---------------------------------------------------------------------------
// 設定画面の検査を「保存APIが200を返すか」で済ませると、E-32 と同じ穴が空く。
// 保存されていても**それを読む側がいなければ、設定した人の期待は裏切られる**。
//
// 実際、`user_settings` に保存される項目のうち、
// **読み手がいるのは `slowMode` ただ一つ**である
// （`commentsController.checkSlowMode` が取り込み経路で読む）。
// `commentMaxLength` / `pinLimit` / `autoDeleteTime` / `autoNGWord` /
// `autoTranslation` / `individualThresholds` / `modelVersion` / `theme` /
// `primaryColor` は、保存はされるが読む側がどこにも無い。
//
// そこでこのテストは、**唯一効く設定が本当に効くこと**を端から端まで固定する:
//   設定を保存する → 取り込みの挙動が変わる → 解除すると元に戻る
//
// 「200が返った」ではなく「**2回目の投稿が実際に拒否された**」を見る。
const db = require('../../src/db');
const settings = require('../../src/controllers/settingsController');
const comments = require('../../src/controllers/commentsController');

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

const setSlowMode = (userId, body) =>
  invoke(settings.updateSlowModeSettings, { params: { userId }, body });

const post = (user) => comments.ingestComment({
  platform: 'youtube',
  user,
  content: `slow mode probe ${Math.random().toString(36).slice(2, 8)}`
});

describe('保存した設定が実際に効くこと（E-39）', () => {
  beforeAll(async () => {
    await new Promise((r) => setTimeout(r, 1500));
  });

  // **テストごとに新しい利用者を作ること。**
  // スローモードは「前回の投稿からの経過時間」で判定するので、
  // 使い回すと前のテストの投稿が残り、1回目から拒否されて意味が変わる
  const freshUser = async () => {
    const user = `sm_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    await dbRun('INSERT INTO users (id,platform,username,status) VALUES (?,?,?,?)',
      [user, 'youtube', user, 'active']);
    return user;
  };

  it('スローモードが無効なら連続投稿は通る', async () => {
    const user = await freshUser();
    const off = await setSlowMode(user, { enabled: false, intervalSeconds: 30 });
    expect(off.status).toBe(200);

    const first = await post(user);
    const second = await post(user);
    expect(first.outcome).not.toBe('rate_limited');
    expect(second.outcome).not.toBe('rate_limited');
  });

  it('スローモードを有効にすると、2回目の投稿が実際に拒否される', async () => {
    const user = await freshUser();
    const on = await setSlowMode(user, { enabled: true, intervalSeconds: 300 });
    expect(on.status).toBe(200);

    const first = await post(user);
    expect(first.outcome).not.toBe('rate_limited');

    const second = await post(user);
    expect(second.outcome).toBe('rate_limited');
    // 残り時間も返す（画面が「あと何秒か」を出せること）
    expect(typeof second.remainingTime).toBe('number');
    expect(second.remainingTime).toBeGreaterThan(0);
    expect(second.nextAllowedTime).toBeTruthy();
  });

  it('無効に戻すと、また通る（設定が一方通行でないこと）', async () => {
    const user = await freshUser();
    await setSlowMode(user, { enabled: true, intervalSeconds: 300 });
    await post(user);
    const blocked = await post(user);
    expect(blocked.outcome).toBe('rate_limited');

    const off = await setSlowMode(user, { enabled: false });
    expect(off.status).toBe(200);

    const allowed = await post(user);
    expect(allowed.outcome).not.toBe('rate_limited');
  });

  it('範囲外の間隔は400で拒否される（保存してから壊れない）', async () => {
    const user = await freshUser();
    const tooLong = await setSlowMode(user, { enabled: true, intervalSeconds: 301 });
    expect(tooLong.status).toBe(400);

    const notBoolean = await setSlowMode(user, { enabled: 'yes' });
    expect(notBoolean.status).toBe(400);
  });
});
