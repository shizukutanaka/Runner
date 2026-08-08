// R-24: Policy-as-Prompt の回帰テスト。
//
// 根拠: Palla et al. "Policy-as-Prompt" (FAccT 2025, arXiv:2502.18695)
// 制約: Neumann et al. (MuC 2026, arXiv:2607.12149) — プロンプトだけでは
//       ガバナンスとして不十分。LLM判定は助言に留め、決定論的判定を覆さない。
//
// 実LLMは呼べない（キー未設定）ため、openaiService をモックして
// プロンプト構築・助言としての扱い・フォールバックを検証する。
const { CreatorCultureService } = require('../../src/services/creatorCultureService');

describe('Policy-as-Prompt（R-24）', () => {
  describe('ポリシー文の構築（文化プロファイル→自然言語ポリシー）', () => {
    let svc;
    beforeAll(async () => {
      await new Promise((r) => setTimeout(r, 1000));
      svc = new CreatorCultureService();
      await svc._loaded;
    });

    it('ゲーム実況では煽り合いを許容する方針文が生成される', () => {
      svc.setProfile('twitch', 'pp-gaming', 'gaming');
      const { policy, cultureType } = svc.buildPolicyPrompt('twitch', 'pp-gaming');
      expect(cultureType).toBe('gaming');
      expect(policy).toContain('ゲーム実況');
      expect(policy).toMatch(/煽り|挑発/);
    });

    it('家族向けでは厳格な方針文が生成される', () => {
      svc.setProfile('youtube', 'pp-family', 'family');
      const { policy } = svc.buildPolicyPrompt('youtube', 'pp-family');
      expect(policy).toContain('家族向け');
      expect(policy).toMatch(/ほとんど許容されない/);
      expect(policy).toContain('下品');
    });

    it('文化が違えばポリシー文も実際に異なる（プロファイルが効いている）', () => {
      svc.setProfile('twitch', 'pp-a', 'gaming');
      svc.setProfile('twitch', 'pp-b', 'family');
      expect(svc.buildPolicyPrompt('twitch', 'pp-a').policy)
        .not.toBe(svc.buildPolicyPrompt('twitch', 'pp-b').policy);
    });

    it('どの文化でも、遠回しな誹謗中傷/脅迫は問題として扱う方針を含む', () => {
      ['family', 'gaming', 'mature'].forEach((c, i) => {
        svc.setProfile('twitch', `pp-c${i}`, c);
        const { policy } = svc.buildPolicyPrompt('twitch', `pp-c${i}`);
        expect(policy).toMatch(/遠回しでも/);
      });
    });

    it('判定しきい値が文化ごとに添付される', () => {
      svc.setProfile('youtube', 'pp-th', 'family');
      const { thresholds } = svc.buildPolicyPrompt('youtube', 'pp-th');
      expect(thresholds.autoRejectScore).toBe(40); // family は最も厳格
    });
  });

  describe('LLM判定の扱い（モック）', () => {
    afterEach(() => {
      jest.resetModules();
      jest.dontMock('../../src/services/openaiService');
    });

    const loadWithMock = (policyResult, toxic = { isToxic: false, score: 0, categories: {} }) => {
      jest.resetModules();
      const real = jest.requireActual('../../src/services/openaiService');
      jest.doMock('../../src/services/openaiService', () => ({
        ...real,
        isAvailable: () => true,
        analyzeSentiment: async () => ({ sentiment: 'neutral', score: 0.5, confidence: 0.9 }),
        detectToxicContent: async () => toxic,
        moderateWithPolicy: async () => policyResult,
      }));
      return require('../../src/services/moderationService');
    };

    it('LLMが違反と判定したら助言として記録しスコアを加点する', async () => {
      const mod = loadWithMock({
        available: true, isViolation: true, score: 80,
        reason: '遠回しな人格攻撃', category: 'harassment', cultureType: 'entertainment',
      });
      const r = await mod.analyzeComment('その顔で配信とか、よく人前に出られるね', 'youtube', 'u', new Date().toISOString());
      expect(r.policyAnalysis).toBeDefined();
      expect(r.policyAnalysis.isViolation).toBe(true);
      expect(r.policyAnalysis.advisory).toBe(true);       // 助言であることが明示される
      expect(r.policyAnalysis.cultureType).toBeTruthy();   // 監査用にポリシーが残る
      expect(r.needsHumanReview).toBe(true);               // 自動処罰ではなく人間へ回す
      expect(r.score).toBeGreaterThan(0);
    });

    it('LLMが「問題なし」でも、NGワードによる決定論的判定は覆らない', async () => {
      const mod = loadWithMock({
        available: true, isViolation: false, score: 0,
        reason: null, category: 'none', cultureType: 'gaming',
      });
      const r = await mod.analyzeComment('死ね', 'youtube', 'u', new Date().toISOString());
      // 助言が「問題なし」でも NGワード判定は維持される（arXiv:2607.12149の制約）
      expect(r.isOffensive).toBe(true);
      expect(r.flaggedWords).toContain('死ね');
    });

    it('LLMが利用不可でも解析は成立する（フェイルセーフ規約）', async () => {
      const mod = loadWithMock({
        available: false, isViolation: false, score: 0, error: 'OpenAI not available',
      });
      const r = await mod.analyzeComment('こんにちは', 'youtube', 'u', new Date().toISOString());
      expect(r.policyAnalysis).toBeUndefined(); // 助言は付かない
      expect(r.isOffensive).toBe(false);        // が、解析自体は正常
    });
  });
});
