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
});
