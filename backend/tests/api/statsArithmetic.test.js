// ダッシュボードが表示する数字が「出る」ではなく「**正しい**」ことを検査する。
//
// ---------------------------------------------------------------------------
// なぜ必要か
// ---------------------------------------------------------------------------
// E-29〜E-33 で「呼ばれるか」「落ちないか」「中身はあるか」「画面は受け取るか」
// 「本当に保存したか」を塞いだ。その次の問いが **「その数字は正しいか？」** である。
//
// 既存の analyticsController のテストは `toBeGreaterThanOrEqual` で書かれていた。
// これは**数え過ぎ・二重計上・分類の取り違えを一切検出できない**。
// 「1件以上ある」ことは「正しい」ことではない。
//
// テストDBは同一実行内で他のテストも書き込むため、絶対値は固定できない。
// そこで **投入前後の差分（delta）が期待値と厳密に一致すること** を検査する。
// 差分は共有DBでも厳密に定まる。
//
// ---------------------------------------------------------------------------
// 特に固定したい意味論
// ---------------------------------------------------------------------------
// `analyticsController.getStats` のミュート判定には既知の罠がある。
// `mute_until` は `new Date().toISOString()` 由来の 'YYYY-MM-DDTHH:MM:SS.sssZ'、
// SQLite の `datetime('now')` は 'YYYY-MM-DD HH:MM:SS'。10文字目が 'T'(0x54) と
// ' '(0x20) のため、**同じ日付なら必ず ISO 側が大きい**。
// つまり `datetime('now')` と比べると**期限切れのミュートが全部「継続中」に化ける**。
// 既定のミュートは300秒＝同日中に切れるので、これは日常的に起きる。
//
// 下の seed は「期限切れのミュート」と「継続中のミュート」を1件ずつ入れ、
// **前者を数えないこと**を差分で固定する。BANされたユーザーを
// ミュートに数えないことも同時に固定する。
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

const iso = (offsetMs) => new Date(Date.now() + offsetMs).toISOString();

describe('ダッシュボードの数字が厳密に正しいこと（差分で検査）', () => {
  const tag = `sa_${Date.now()}`;
  let before;
  let beforeMod;

  beforeAll(async () => {
    await new Promise((r) => setTimeout(r, 1000)); // スキーマ初期化待ち

    before = (await invoke(analytics.getStats)).body;
    beforeMod = (await invoke(analytics.getModerationStats)).body;

    // コメント: visible 2件 / deleted 1件
    const c = (n, status) => dbRun(
      "INSERT INTO comments (id,platform,user,content,timestamp,status) VALUES (?,?,?,?,datetime('now'),?)",
      [`${tag}_c${n}`, 'youtube', tag, 'x', status]
    );
    await c(1, 'visible');
    await c(2, 'visible');
    await c(3, 'deleted');

    // ユーザー6件。期待する分類をコメントで明示する
    const u = (n, status, muteUntil = null) => dbRun(
      'INSERT INTO users (id,platform,username,status,mute_until) VALUES (?,?,?,?,?)',
      [`${tag}_u${n}`, 'youtube', `${tag}_u${n}`, status, muteUntil]
    );
    await u(1, 'banned');                       // banned:  数える / muted: 数えない
    await u(2, 'active');                       // active:  数える
    await u(3, 'muted');                        // muted:   数える（status 由来）
    await u(4, 'active', iso(60 * 60 * 1000));  // active + muted（継続中のミュート）
    await u(5, 'active', iso(-60 * 1000));      // active のみ（**期限切れ**は数えない）
    await u(6, 'banned', iso(60 * 60 * 1000));  // banned のみ（BANはミュートに数えない）
  });

  it('getStats のコメント数・ユーザー数・BAN数・アクティブ数が投入分だけ増える', async () => {
    const { status, body } = await invoke(analytics.getStats);
    expect(status).toBe(200);

    expect(body.commentCount - before.commentCount).toBe(3);
    expect(body.userCount - before.userCount).toBe(6);
    expect(body.bannedCount - before.bannedCount).toBe(2); // u1, u6
    expect(body.activeUsers - before.activeUsers).toBe(3); // u2, u4, u5
  });

  it('ミュート数は「継続中」だけを数え、期限切れとBANは数えない', async () => {
    const { body } = await invoke(analytics.getStats);

    // u3（status='muted'）と u4（mute_until が未来）の2件だけ。
    // u5 は期限切れ、u6 は BAN。どちらも数えてはならない
    expect(body.mutedCount - before.mutedCount).toBe(2);
  });

  it('getModerationStats の flagged / passed の振り分けが厳密に一致する', async () => {
    const { status, body } = await invoke(analytics.getModerationStats);
    expect(status).toBe(200);

    // deleted 1件 → flagged、visible 2件 → passed
    expect(body.stats.flagged - beforeMod.stats.flagged).toBe(1);
    expect(body.stats.passed - beforeMod.stats.passed).toBe(2);

    // 内訳の合計は flagged + passed 以上（他の状態値も存在しうる）
    const total = Object.values(body.stats.byStatus).reduce((a, b) => a + b, 0);
    expect(total).toBeGreaterThanOrEqual(body.stats.flagged + body.stats.passed);
  });

  it('src のどこもコメントに status=\'active\' を書かないこと（語の統一・E-34）', () => {
    // 実際の承認経路そのものは tests/integration/heldMessages.test.js が
    // 「承認して出来た行の status が 'visible' であること」で固定している。
    // ここでは書き手が増えたときに二重の語彙が復活しないことを静的に見る
    const fs = require('fs');
    const path = require('path');
    const SRC = path.resolve(__dirname, '../../src');

    const walk = (dir, acc = []) => {
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, e.name);
        if (e.isDirectory()) walk(p, acc);
        else if (e.name.endsWith('.js')) acc.push(p);
      }
      return acc;
    };

    const offenders = [];
    for (const file of walk(SRC)) {
      const src = fs.readFileSync(file, 'utf8');
      const re = /INSERT\s+INTO\s+comments[\s\S]{0,400}?;/gi;
      let m;
      while ((m = re.exec(src))) {
        if (/'active'/.test(m[0])) offenders.push(path.relative(SRC, file));
      }
      // 既定値としての 'active' も禁止（commentService の `status || 'active'` 形）
      if (/(?:comment|commentData)\.status\s*\|\|\s*'active'/.test(src)) {
        offenders.push(`${path.relative(SRC, file)} (default)`);
      }
    }

    expect(offenders).toEqual([]);
  });

  it('コメントの状態値に "active" という綴りが残っていないこと', async () => {
    // 二重の語彙が復活したらここで落ちる。users テーブルの 'active'
    // （BANでもミュートでもない）は別概念なので対象外
    const row = await new Promise((resolve, reject) => {
      db.get("SELECT COUNT(*) as cnt FROM comments WHERE status = 'active'", (e, r) => (e ? reject(e) : resolve(r)));
    });
    expect(row.cnt).toBe(0);
  });

  it('同じ数字を二度読んでも変わらない（集計に副作用が無いこと）', async () => {
    const a = (await invoke(analytics.getStats)).body;
    const b = (await invoke(analytics.getStats)).body;
    expect(b.commentCount).toBe(a.commentCount);
    expect(b.userCount).toBe(a.userCount);
    expect(b.mutedCount).toBe(a.mutedCount);
  });
});
