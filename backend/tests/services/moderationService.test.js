// moderationService.analyzeComment のルールベース経路のテスト
// （OPENAI_API_KEY は tests/setup.js で空にされるため、常にルールベース側を通る）
const moderationService = require('../../src/services/moderationService');

const analyze = (content) =>
  moderationService.analyzeComment(content, 'youtube', 'test-user', new Date().toISOString());

describe('moderationService.analyzeComment (rule-based path)', () => {
  describe('NGワード検出（ng-words.json — R-5a）', () => {
    it('日本語の敵対的コメントをフラグする', async () => {
      const result = await analyze('死ね');
      expect(result.isOffensive).toBe(true);
      expect(result.score).toBeGreaterThanOrEqual(50);
      expect(result.flaggedWords).toContain('死ね');
    });

    it('英語のNGワードは大文字小文字を区別せず検出する', async () => {
      const result = await analyze('KYS loser');
      expect(result.isOffensive).toBe(true);
      expect(result.flaggedWords).toContain('kys');
    });

    it('無害な日本語コメントはスコア0のまま', async () => {
      const result = await analyze('今日の配信も楽しかったです！');
      expect(result.score).toBe(0);
      expect(result.isOffensive).toBe(false);
      expect(result.isSpam).toBe(false);
      expect(result.flaggedWords).toHaveLength(0);
    });

    it('スパム定型文を検出する', async () => {
      const result = await analyze('誰でも簡単に稼げる方法教えます');
      expect(result.flaggedWords).toContain('誰でも簡単に稼げる');
      expect(result.score).toBeGreaterThanOrEqual(50);
    });
  });

  describe('カスタムフィルタ（regexフラグ重複バグの回帰テスト）', () => {
    // 旧実装は /.../i 定義のパターンに無条件で 'i' を連結し 'ii' で
    // SyntaxError となり、デフォルト3フィルタ群が一度も動作していなかった

    it('offensive-language フィルタが block 判定で+70する', async () => {
      const result = await analyze('you are a fucking idiot');
      const ids = (result.customFilterMatches || []).map((m) => m.filterId);
      expect(ids).toContain('offensive-language');
      expect(result.score).toBeGreaterThanOrEqual(70);
      expect(result.isSpam).toBe(true);
    });

    it('spam-patterns フィルタが flag 判定で+30する', async () => {
      const result = await analyze('WIN free $100 gift now');
      const ids = (result.customFilterMatches || []).map((m) => m.filterId);
      expect(ids).toContain('spam-patterns');
      expect(result.score).toBeGreaterThanOrEqual(30);
    });

    it('repeated-chars フィルタが繰り返し文字を検出する', async () => {
      const result = await analyze('wwwwwwwwww');
      const ids = (result.customFilterMatches || []).map((m) => m.filterId);
      expect(ids).toContain('repeated-chars');
    });
  });

  describe('detectLanguage（R-10でexport化）', () => {
    it('日本語/英語を判定できる', () => {
      expect(moderationService.detectLanguage('こんにちは、元気ですか').language).toBe('ja');
      expect(moderationService.detectLanguage('hello world how are you').language).toBe('en');
    });
  });

  describe('NGワード回避対策（R-11: 全角/ゼロ幅/ホモグリフ）', () => {
    it('全角文字によるNGワード回避を検出する', async () => {
      const result = await analyze('ｋｙｓ loser');
      expect(result.isOffensive).toBe(true);
      expect(result.flaggedWords).toContain('kys');
    });

    it('ホモグリフ（ギリシャ文字κ等）によるNGワード回避を検出する', async () => {
      const result = await analyze('κys loser'); // κ (Greek kappa) の代わりに k
      expect(result.isOffensive).toBe(true);
      expect(result.flaggedWords).toContain('kys');
    });

    it('単語内へのゼロ幅スペース挿入によるNGワード回避を検出する', async () => {
      const zwsp = String.fromCharCode(0x200b); // U+200B ZERO WIDTH SPACE
      const result = await analyze(`死${zwsp}ね`); // NG語の間にZWSPを挿入
      expect(result.isOffensive).toBe(true);
      expect(result.flaggedWords).toContain('死ね');
    });

    it('confusables正規化が日本語の無害なコメントを誤検出させない（回帰テスト）', async () => {
      // confusables.remove()は日本語仮名を英字と誤認することがある
      // （実測: "こんにちは"→"こhにちは"）。主判定文字列には使わない設計のため
      // 誤爆しても最終的なisOffensiveには影響しないことを確認する
      const result = await analyze('こんにちは、今日の配信も楽しかったです！');
      expect(result.isOffensive).toBe(false);
      expect(result.score).toBe(0);
    });
  });
});
