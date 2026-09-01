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
    // 過去24時間以内に3件の違反履歴を作る
    for (let i = 0; i < 3; i++) {
      await dbRun(
        'INSERT INTO comments (id,platform,user,content,timestamp,status) VALUES (?,?,?,?,datetime(\'now\',\'-1 hours\'),\'deleted\')',
        [`${repeatUser}_${i}`, platform, repeatUser, 'bad']
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
