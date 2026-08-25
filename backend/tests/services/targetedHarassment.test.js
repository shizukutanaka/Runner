// R-33: 語彙に頼らない標的型ハラスメントの検知。
//
// 評価セット(R-5b)の indirect 層は NG語を一つも含まない攻撃で構成されており、
// 語彙フィルタは構造上 0% しか拾えなかった。R-31（つきまとい）で有効だった
// 「2成分以上の共起を要求する」設計を使って埋めている。
//
// ---------------------------------------------------------------------------
// このテストファイルの存在理由（重要）
// ---------------------------------------------------------------------------
// パターンを書いた人間が評価ケースも書くと、評価セットは「パターンが通る例」に
// 寄り、100%が出ても**一般化の証拠にはならない**。実際、最初の実装は自作の
// 評価セットで F1 100% を出したが、パターン設計時に想定していなかった
// 実在しそうなチャット8件を当てたところ **5件が誤検知**した:
//
//   「その顔でよく笑えるねw かわいい」        → 親愛のいじりを容姿侮辱と誤判定
//   「その顔で配信とか最高」                  → 賞賛を侮辱と誤判定
//   「このクエスト意味ないから途中でやめたらいいよ」→ ゲーム内の助言を活動否定と誤判定
//   「才能ないから引退しますw」                → 自虐を攻撃と誤判定
//   「誰も見てないうちに引退した装備売っちゃおう」→ 無関係な文を攻撃と誤判定
//
// そこで条件を絞った（詳細は moderationService.js のコメント）。
// 以下の「無害な発話」群は**パターンを書いた後に、パターンを見ずに**
// 実際のチャットとして書き出したものである。検知側より多く（15件 vs 6件）
// 持たせてあるのは、この機能で高くつく間違いが誤検知の側だから。
const moderationService = require('../../src/services/moderationService');

const analyze = (t) => moderationService.analyzeComment(t, 'youtube', 'u', new Date().toISOString());

const harassmentHits = async (text) => {
  const r = await analyze(text);
  return (r.flaggedWords || []).filter((w) => String(w).startsWith('harassment:'));
};

describe('標的型ハラスメント検知（R-33）', () => {
  describe('検知すべきもの', () => {
    it.each([
      ['容姿への言及＋人前に出ることの否定', 'その顔で配信とか、よく人前に出られるね', 'harassment:appearance_shaming'],
      ['声への言及＋恥の指摘', 'その声で歌とか、よく恥ずかしくないね', 'harassment:appearance_shaming'],
      ['活動の無価値化＋中止要求', '誰も見てないのに続ける意味あるの？やめたら？', 'harassment:worthlessness_and_quit'],
      ['配信の価値否定＋中止要求', 'こんな配信に価値ないでしょ、やめれば楽になるよ', 'harassment:worthlessness_and_quit'],
      ['未確認の悪評＋伝聞の枠組み', 'この配信者、前に問題起こしてたって本当ですか？みんな知ってる話で', 'harassment:rumor_mongering'],
      ['盗作の噂の流布', 'この人、前に盗作でやらかしたって噂ですけど', 'harassment:rumor_mongering']
    ])('%s: %s', async (_label, text, expectedId) => {
      expect(await harassmentHits(text)).toContain(expectedId);
    });

    it('abuseカテゴリとして分類され、人間のレビューに回る', async () => {
      const r = await analyze('誰も見てないのに続ける意味あるの？やめたら？');
      expect(r.flaggedCategories).toContain('abuse');
      expect(r.isOffensive).toBe(true);
    });
  });

  describe('【過剰検知ガード】実在しそうなチャットに当たらないこと', () => {
    it.each([
      // 実測で誤検知した5件（回帰防止）
      ['親愛のいじり', 'その顔でよく笑えるねw かわいい'],
      ['賞賛', 'その顔で配信とか最高'],
      ['ゲーム内の助言', 'このクエスト意味ないから途中でやめたらいいよ'],
      ['自虐', '才能ないから引退しますw'],
      ['無関係な文', '誰も見てないうちに引退した装備売っちゃおう'],
      // 追加のガード
      ['声への賞賛', 'その声で歌うの好き'],
      ['ゲーム内の話題', 'この人、炎上したキャラ使ってるらしい'],
      ['装備の話', 'この装備、意味ないから売った方がいい'],
      ['見た目の話題', 'そんな見た目で強いの面白い'],
      ['自分への言及', '才能ないなあ自分、でも楽しい'],
      ['引退した人の話', '引退した先輩が配信見に来てくれた'],
      ['小規模配信への好意', '誰も見てない配信を偶然見つけるの好き'],
      ['配信への肯定', 'この配信、価値あると思うよ'],
      ['引き留め', 'やめたらもったいないよ、応援してる'],
      ['向き不向きの話', '向いてないゲームでも楽しそう']
    ])('%s: %s', async (_label, text) => {
      expect(await harassmentHits(text)).toEqual([]);
    });
  });
});

// 検知が保留キューに届くこと（因果鎖④）。R-31 と同じ確認を R-33 にも掛ける。
// 語彙に頼らない検知は「なぜ保留されたか」がモデレーターに見えないと使えないので、
// 理由が構造化された形で残ることまで確認する
describe('標的型ハラスメントが保留キューに届くこと（R-33・因果鎖④）', () => {
  const { checkMessageHold } = require('../../src/controllers/commentsController');

  it('保留され、abuseカテゴリと該当パターンIDが理由に残る', async () => {
    const content = '誰も見てないのに続ける意味あるの？やめたら？';
    const moderation = await analyze(content);
    const hold = await checkMessageHold(content, moderation, 'youtube', 'harasser');

    expect(hold.hold).toBe(true);
    const reason = hold.reasons.find((r) => r.type === 'ng_word_category');
    expect(reason).toBeDefined();
    expect(reason.categories).toContain('abuse');
    // モデレーターがバッジ表示に使うID
    expect(reason.words).toContain('harassment:worthlessness_and_quit');
  });

  it('【過剰検知ガード】同じ語を含む無害な発話は保留されない', async () => {
    const content = 'このクエスト意味ないから途中でやめたらいいよ';
    const moderation = await analyze(content);
    const hold = await checkMessageHold(content, moderation, 'youtube', 'normal-user');
    expect(hold.hold).toBe(false);
    expect(hold.reasons).toEqual([]);
  });
});
