// R-26: 累犯エスカレーションと大文字乱用（CAPS）検知。
// 関連ソフトウェア（Nightbot / Moobot / StreamElements）が標準で備える
// 「警告→タイムアウト→BAN」の段階的処罰と CAPS フィルタが本製品には無かった。
const db = require('../../src/db');
const { checkMessageHold } = require('../../src/controllers/commentsController');
const moderationService = require('../../src/services/moderationService');

const dbRun = (sql, p = []) => new Promise((resolve, reject) => {
  db.run(sql, p, function cb(e) { e ? reject(e) : resolve(this); });
});

describe('累犯エスカレーション（R-26）', () => {
  const platform = 'youtube';
  let repeatUser;
  let cleanUser;

  beforeAll(async () => {
    await new Promise((r) => setTimeout(r, 1000));
    const n = Date.now();
    repeatUser = `rep_${n}`;
    cleanUser = `clean_${n}`;
    // 過去24時間以内に3件の違反履歴を作る。
    //
    // E-46: ここは以前 `datetime('now','-1 hours')` という**SQLite側で生成する
    // 表現**（'YYYY-MM-DD HH:MM:SS'、10文字目が空白）を直接埋め込んでいた。
    // しかし本番の書き込み経路（ingestComment等）は必ず
    // `new Date().toISOString()`（'YYYY-MM-DDTHH:MM:SS.sssZ'、10文字目が'T'）
    // で書く。テストが本番と異なる表現の時刻を注入していたため、
    // `countRecentViolations`側のISO比較との組み合わせが
    // **日付境界（深夜0時付近）でだけ**壊れ、時刻依存でしか再現しない
    // 欠陥を隠していた（実際にUTC 00:04の実行で失敗して発覚した）。
    // 本番の書き込みと同じ表現をテストでも使うこと
    const oneHourAgoIso = new Date(Date.now() - 3600 * 1000).toISOString();
    for (let i = 0; i < 3; i++) {
      await dbRun(
        'INSERT INTO comments (id,platform,user,content,timestamp,status) VALUES (?,?,?,?,?,\'deleted\')',
        [`${repeatUser}_${i}`, platform, repeatUser, 'bad', oneHourAgoIso]
      );
    }
  });

  // 単体では保留にならない中立的な判定結果
  const baseModeration = { score: 0, linkCount: 0, sentiment: 'neutral', sentimentScore: 0.5 };
  // 既に他の理由で保留になる判定結果（強いネガティブ感情）
  const suspectModeration = { score: 0, linkCount: 0, sentiment: 'negative', sentimentScore: 0.2 };

  it('既に疑いのあるコメントでは、常習犯にエスカレーション推奨が付く', async () => {
    const r = await checkMessageHold('ひどい', suspectModeration, platform, repeatUser);
    const reason = r.reasons.find((x) => x.type === 'repeat_offender');
    expect(reason).toBeDefined();
    expect(reason.violations).toBeGreaterThanOrEqual(3);
    expect(reason.escalation).toBe('timeout_recommended');
    expect(reason.recommendedAction).toContain('タイムアウト');
  });

  it('初犯には repeat_offender 理由が付かない（誤爆しない）', async () => {
    const r = await checkMessageHold('ひどい', suspectModeration, platform, cleanUser);
    expect(r.reasons.find((x) => x.type === 'repeat_offender')).toBeUndefined();
  });

  it('【過剰検知ガード】常習犯でも、無害なコメント単体では保留にしない', async () => {
    // エスカレーションは既存の疑いを強めるだけで、それ単体で保留を発生させない
    const r = await checkMessageHold('今日もありがとう', baseModeration, platform, repeatUser);
    expect(r.hold).toBe(false);
    expect(r.reasons.find((x) => x.type === 'repeat_offender')).toBeUndefined();
  });

  it('user未指定でも従来どおり動作する（後方互換）', async () => {
    const r = await checkMessageHold('普通のコメント', baseModeration, platform);
    expect(r).toHaveProperty('hold');
  });

  // E-46: held_messages側の再発防止。上のbeforeAllが直したのは comments 側の
  // テストデータ（本番の書き込み表現に合わせた）だが、`countRecentViolations`は
  // held_messages も同時に数える。held_messages.created_at は列定義の
  // `DEFAULT CURRENT_TIMESTAMP`（SQLiteネイティブ表現）で本番でも常に書かれる
  // ため、そちら側は「JS ISO文字列と比較しない」こと自体を固定する必要がある。
  //
  // この欠陥は「since（24時間前）と、実際の違反発生時刻の日付部分が一致する」
  // 場合にだけ発現する（10文字目が 'T' と ' ' で逆転するのは日付部分が
  // 一致したときだけ）。24時間ちょうどの窓のうち「since〜その日の終わり」の
  // 部分（=だいたい半日程度、実行時刻によって変動）がこれに該当するため、
  // 実行時刻に関わらずほぼ確実に踏む狙いで、sinceのすぐ後（2時間後）を
  // held_messagesの作成時刻として選ぶ。ごく短い時間帯（sinceの時刻が
  // 22:00〜24:00 UTC付近）でだけ日付境界をまたぎ再現しないことがあり得るが、
  // 修正後のコードは実行時刻に関わらず常に正しいので、その場合でも
  // このテスト自体が誤って失敗することは無い（見逃す方向にのみ緩い）
  it('held_messages側の違反も、深夜0時に関わらず正しく数えられる（E-46）', async () => {
    const heldUser = `held_rep_${Date.now()}`;
    const sinceInstant = Date.now() - 24 * 3600 * 1000;
    // SQLiteの`datetime()`が生成するのと同じ 'YYYY-MM-DD HH:MM:SS' 形式で、
    // sinceの2時間後（＝24時間の違反窓には収まるが、修正前のコードが
    // 「sinceと同じ日付ならISO比較で逆転する」罠を最も踏みやすい位置）を作る
    const rowInstant = new Date(sinceInstant + 2 * 3600 * 1000);
    const pad = (n) => String(n).padStart(2, '0');
    const sqliteNative = `${rowInstant.getUTCFullYear()}-${pad(rowInstant.getUTCMonth() + 1)}-${pad(rowInstant.getUTCDate())} `
      + `${pad(rowInstant.getUTCHours())}:${pad(rowInstant.getUTCMinutes())}:${pad(rowInstant.getUTCSeconds())}`;

    await dbRun(
      `INSERT INTO held_messages (message_id, content, user, platform, hold_reason, risk_score, hold_level, reasons, status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'rejected', ?)`,
      [`e46_${Date.now()}`, 'past violation', heldUser, platform, 'ai_score', 0.9, 'high', '[]', sqliteNative]
    );

    const r = await checkMessageHold('ひどい', suspectModeration, platform, heldUser);
    const reason = r.reasons.find((x) => x.type === 'repeat_offender');
    expect(reason).toBeDefined();
    expect(reason.violations).toBeGreaterThanOrEqual(1);
  });
});

describe('大文字乱用（CAPS）検知（R-26）', () => {
  const analyze = (t) => moderationService.analyzeComment(t, 'youtube', 'u', new Date().toISOString());

  it('英字が多く大半が大文字なら検知する', async () => {
    const r = await analyze('SHUT UP YOU IDIOT LOSER');
    expect(r.excessiveCaps).toBe(true);
    expect(r.capsRatio).toBeGreaterThanOrEqual(0.7);
  });

  it('日本語主体のコメントは誤検知しない', async () => {
    const r = await analyze('こんにちは、今日もありがとう');
    expect(r.excessiveCaps).toBeUndefined();
  });

  it('短い英字表現（OK/www等）は誤検知しない', async () => {
    expect((await analyze('OK www')).excessiveCaps).toBeUndefined();
  });

  it('通常の英文は誤検知しない', async () => {
    expect((await analyze('Hello everyone thanks for the stream')).excessiveCaps).toBeUndefined();
  });
});
