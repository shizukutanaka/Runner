// R-36: 性的ハラスメントの検知。
//
// ---------------------------------------------------------------------------
// なぜ追加したか
// ---------------------------------------------------------------------------
// 配信者への性的ハラスメントは、ライブ配信のモデレーションで最も報告の多い
// 加害のひとつ（特に女性配信者）であるにもかかわらず、
// 本製品には**この区分がそもそも存在しなかった**。
// NGワードのカテゴリは abuse / threat / spam / discrimination のみで、
// 文化プロファイル側には `no_adult`（family）/ `adult_verified`（mature）という
// フラグが既にあるのに、**それが働きかける対象が無い**状態だった。
//
// 外部ベンチマークの語をコピーしたのではなく、製品ドメインから必要な区分として
// 設計している。検知結果は他と同じく**保留（人間のレビュー）**に回すだけで、
// 自動処罰はしない。成人向けチャンネルでの扱いは文化プロファイルの
// `bannedPatternBoost`（mature=0.7）がスコア側で調整する。
const moderationService = require('../../src/services/moderationService');

const analyze = (t) => moderationService.analyzeComment(t, 'youtube', 'u', new Date().toISOString());
const flagged = async (t) => {
  const r = await analyze(t);
  return Boolean(r.isOffensive || r.isSpam);
};
const sexualHits = async (t) => {
  const r = await analyze(t);
  return (r.flaggedWords || []).filter((w) => w === 'harassment:sexual');
};

describe('性的ハラスメント検知（R-36）', () => {
  describe('検知すべきもの', () => {
    it.each([
      ['身体への言及＋要求', 'おっぱい見せて'],
      ['接触の要求', '胸揉ませて'],
      ['下着の要求', 'パンツ見せてよ'],
      ['性行為への言及', '太もも舐めたい'],
      ['明示的な加害語', 'レイプするぞ'],
      ['性的な強要', 'ヤらせろよ'],
      ['英語', 'send nudes']
    ])('%s: %s', async (_label, text) => {
      expect(await flagged(text)).toBe(true);
    });

    it('sexualカテゴリとして分類される', async () => {
      const r = await analyze('おっぱい見せて');
      expect(r.flaggedCategories).toContain('sexual');
    });

    it('明示的な加害語は語彙側で拾う（2成分不要）', async () => {
      const r = await analyze('レイプするぞ');
      expect(r.flaggedCategories).toContain('sexual');
    });
  });

  describe('【過剰検知ガード】配信で普通に出る言い回しに当たらないこと', () => {
    it.each([
      ['ゲームの防具', 'このキャラの胸当て強いよね'],
      ['ゲームの性能', '脚が速いキャラ好き'],
      ['慣用句', '裸一貫で始めた話'],
      ['案件配信', '下着メーカーの案件配信'],
      ['ゲームジャンルの話', 'エロゲーの実況見たい'],
      ['バグの話', 'お尻から落ちるバグ面白い'],
      ['商品レビュー', '素肌に優しい化粧水'],
      ['服装への感想', 'パンツスタイル似合ってる'],
      ['離れた位置の共起', '下着メーカーの案件、来月から始まるらしくて内容が見たいですね'],
      ['普通のコメント', '今日の配信も楽しかった']
    ])('%s: %s', async (_label, text) => {
      expect(await sexualHits(text)).toEqual([]);
    });
  });

  describe('人間のレビューに回ること（因果鎖④）', () => {
    const { checkMessageHold } = require('../../src/controllers/commentsController');

    it('保留され、sexualカテゴリが理由に残る', async () => {
      const content = 'おっぱい見せて';
      const moderation = await analyze(content);
      const hold = await checkMessageHold(content, moderation, 'youtube', 'harasser');

      expect(hold.hold).toBe(true);
      const reason = hold.reasons.find((r) => r.type === 'ng_word_category');
      expect(reason.categories).toContain('sexual');
    });

    it('【過剰検知ガード】ゲームの話は保留されない', async () => {
      const content = 'このキャラの胸当て強いよね';
      const moderation = await analyze(content);
      const hold = await checkMessageHold(content, moderation, 'youtube', 'normal-user');
      expect(hold.hold).toBe(false);
    });
  });
});
