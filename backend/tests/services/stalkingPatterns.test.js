// R-31: つきまとい・監視の示唆検知。
//
// 既存のthreatリストは「住所特定した」「i know where you live」のような
// 直截な表現しか拾えず、評価セット(R-5b)の
//   「昨日どこにいたか知ってるよ。いつも同じ道通ってるね」
// のように、単語単体では完全に無害な語だけで構成された示唆を素通りしていた。
// Han et al. のヘイトレイド研究（arXiv:2305.16248）では、配信者が最も深刻に
// 受け取るのは罵倒そのものではなく「現実の身元・所在を握っている」という示唆だと
// 報告されている。
//
// 誤検知が特に危険な機能なので、このテストは検知よりも
// 「当たってはいけないもの」の方を厚く固定する。
const moderationService = require('../../src/services/moderationService');

const analyze = (t) => moderationService.analyzeComment(t, 'youtube', 'u', new Date().toISOString());

const flagged = async (text) => {
  const r = await analyze(text);
  return (r.flaggedWords || []).filter((w) => String(w).startsWith('stalking:'));
};

describe('つきまとい・監視の示唆検知（R-31）', () => {
  describe('検知すべきもの', () => {
    it('所在を把握しているという主張を検知する', async () => {
      expect(await flagged('昨日どこにいたか知ってるよ。いつも同じ道通ってるね'))
        .toContain('stalking:knows_whereabouts');
    });

    it('居住地を把握しているという主張を検知する', async () => {
      expect(await flagged('どこ住んでるか知ってるけどね'))
        .toContain('stalking:knows_whereabouts');
    });

    it('実世界の場所での待ち伏せを検知する', async () => {
      expect(await flagged('昨日、家の前で待ってたんだけど'))
        .toContain('stalking:near_real_location');
    });

    it('職場付近での目撃の主張を検知する', async () => {
      expect(await flagged('職場の近くで見たよ'))
        .toContain('stalking:near_real_location');
    });

    it('尾行の主張を検知する', async () => {
      expect(await flagged('駅から後をつけてみた')).toContain('stalking:followed');
    });

    it('threatカテゴリとして分類される', async () => {
      const r = await analyze('どこにいたか知ってるよ');
      expect(r.flaggedCategories).toContain('threat');
    });
  });

  describe('【過剰検知ガード】当たってはいけないもの', () => {
    it.each([
      ['ゲーム内の移動の話', 'このマップ、敵がいつも同じ道通ってくるんだよね'],
      ['ゲーム内の建物', '家の前に敵が湧くから気をつけて'],
      ['配信者自身の報告', '今日は職場の近くのカフェから配信してます'],
      ['一般的な道案内', '駅の近くまで来たら連絡してね'],
      ['純粋な質問', '次はどこに行く予定ですか？'],
      ['行き先を知らないという発言', 'どこ行ったか分からなくなった'],
      ['学校の思い出話', '学校まで歩いて通ってたなあ'],
      ['普通のコメント', '配信お疲れさまでした！']
    ])('%s: %s に当たらない', async (_label, text) => {
      expect(await flagged(text)).toEqual([]);
    });
  });
});

// 検知そのものより重要なのは「検知結果が人間のレビューに届くか」（第一原理の因果鎖 ④）。
// analyzeComment が threat を立てても保留キューに入らなければ製品としては無意味なので、
// 保留判定まで通して確認する
describe('つきまとい検知が保留キューに届くこと（R-31・因果鎖④）', () => {
  const { checkMessageHold } = require('../../src/controllers/commentsController');

  it('つきまとい示唆はhigh severityの理由付きで保留される', async () => {
    const content = '昨日どこにいたか知ってるよ。いつも同じ道通ってるね';
    const moderation = await analyze(content);
    const hold = await checkMessageHold(content, moderation, 'youtube', 'stalker-user');

    expect(hold.hold).toBe(true);
    const reason = hold.reasons.find((r) => r.type === 'ng_word_category');
    expect(reason).toBeDefined();
    expect(reason.categories).toContain('threat');
    expect(reason.severity).toBe('high');
  });

  it('【過剰検知ガード】ゲーム内の同じ言い回しは保留されない', async () => {
    const content = 'このマップ、敵がいつも同じ道通ってくるんだよね';
    const moderation = await analyze(content);
    const hold = await checkMessageHold(content, moderation, 'youtube', 'normal-user');
    expect(hold.hold).toBe(false);
    expect(hold.reasons).toEqual([]);
  });
});
