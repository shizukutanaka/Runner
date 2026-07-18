const { CreatorCultureService, CULTURE_PRESETS } = require('../../src/services/creatorCultureService');

describe('CreatorCultureService', () => {
  let svc;

  beforeAll(async () => {
    // DBスキーマ初期化完了を待つ（他テストファイルと同じ規約）。DB永続化テストは
    // culture_profilesテーブルが存在してからでないと復元を検証できない
    await new Promise((resolve) => setTimeout(resolve, 1000));
  });

  beforeEach(() => {
    svc = new CreatorCultureService();
  });

  describe('getProfile', () => {
    it('returns default entertainment profile for unknown channel', () => {
      const p = svc.getProfile('youtube', 'unknown');
      expect(p.cultureType).toBe('entertainment');
      expect(p.toxicityMultiplier).toBe(1.0);
      expect(p.isCustomized).toBe(false);
    });

    it('includes all available presets in listing', () => {
      const p = svc.getProfile('youtube', 'ch1');
      expect(p.availablePresets).toHaveLength(Object.keys(CULTURE_PRESETS).length);
    });
  });

  describe('setProfile', () => {
    it('correctly sets a valid culture type', () => {
      const p = svc.setProfile('youtube', 'ch1', 'family');
      expect(p.cultureType).toBe('family');
      expect(p.toxicityMultiplier).toBe(1.5);
      expect(p.updatedAt).not.toBeNull();
    });

    it('stores and retrieves gaming profile', () => {
      svc.setProfile('twitch', 'stream1', 'gaming');
      const p = svc.getProfile('twitch', 'stream1');
      expect(p.cultureType).toBe('gaming');
      expect(p.toxicityMultiplier).toBe(0.75);
    });

    it('applies custom overrides on top of preset', () => {
      svc.setProfile('youtube', 'ch2', 'entertainment', { autoRejectScore: 45 });
      const p = svc.getProfile('youtube', 'ch2');
      expect(p.autoRejectScore).toBe(45);
      expect(p.isCustomized).toBe(true);
    });

    it('throws for unknown culture type', () => {
      expect(() => svc.setProfile('youtube', 'ch1', 'unknown_type')).toThrow('Unknown culture type');
    });
  });

  describe('adjustScore — input validation', () => {
    it('throws for non-number rawScore', () => {
      expect(() => svc.adjustScore('youtube', 'ch1', 'fifty')).toThrow('expected finite number');
    });

    it('throws for NaN rawScore', () => {
      expect(() => svc.adjustScore('youtube', 'ch1', NaN)).toThrow('expected finite number');
    });

    it('throws for Infinity rawScore', () => {
      expect(() => svc.adjustScore('youtube', 'ch1', Infinity)).toThrow('expected finite number');
    });

    it('throws for rawScore below 0', () => {
      expect(() => svc.adjustScore('youtube', 'ch1', -1)).toThrow('out of bounds');
    });

    it('throws for rawScore above 100', () => {
      expect(() => svc.adjustScore('youtube', 'ch1', 101)).toThrow('out of bounds');
    });

    it('accepts boundary values 0 and 100', () => {
      expect(() => svc.adjustScore('youtube', 'ch1', 0)).not.toThrow();
      expect(() => svc.adjustScore('youtube', 'ch1', 100)).not.toThrow();
    });
  });

  describe('adjustScore', () => {
    it('amplifies score for family culture', () => {
      svc.setProfile('youtube', 'ch-family', 'family');
      const result = svc.adjustScore('youtube', 'ch-family', 50);
      expect(result.adjusted).toBeGreaterThan(50); // 1.5x multiplier
      expect(result.culture).toBe('family');
    });

    it('reduces score for gaming culture', () => {
      svc.setProfile('youtube', 'ch-gaming', 'gaming');
      const result = svc.adjustScore('youtube', 'ch-gaming', 60);
      expect(result.adjusted).toBeLessThan(60); // 0.75x multiplier
    });

    it('adds banned word boost when hit', () => {
      svc.setProfile('youtube', 'ch1', 'family');
      const without = svc.adjustScore('youtube', 'ch1', 40, {});
      const with_   = svc.adjustScore('youtube', 'ch1', 40, { bannedWordHit: true });
      expect(with_.adjusted).toBeGreaterThan(without.adjusted);
    });

    it('adds penalty for aggression exceeding tolerance', () => {
      svc.setProfile('youtube', 'ch1', 'family'); // allowedAggression: 0.1
      const low  = svc.adjustScore('youtube', 'ch1', 30, { aggressionScore: 0.05 });
      const high = svc.adjustScore('youtube', 'ch1', 30, { aggressionScore: 0.8 });
      expect(high.adjusted).toBeGreaterThan(low.adjusted);
    });

    it('returns correct verdict for each threshold', () => {
      svc.setProfile('youtube', 'ch1', 'entertainment');
      // autoRejectScore=60, autoApproveScore=30
      expect(svc.adjustScore('youtube', 'ch1', 70).verdict).toBe('reject');
      expect(svc.adjustScore('youtube', 'ch1', 20).verdict).toBe('approve');
      expect(svc.adjustScore('youtube', 'ch1', 45).verdict).toBe('review');
    });

    it('clamps score to 0-100', () => {
      svc.setProfile('youtube', 'ch1', 'family');
      const max = svc.adjustScore('youtube', 'ch1', 100, { bannedWordHit: true, aggressionScore: 1.0 });
      expect(max.adjusted).toBeLessThanOrEqual(100);
      expect(max.adjusted).toBeGreaterThanOrEqual(0);
    });
  });

  describe('isSentimentAcceptable', () => {
    it('family culture rejects borderline sentiment', () => {
      svc.setProfile('youtube', 'ch1', 'family'); // threshold 0.55
      expect(svc.isSentimentAcceptable('youtube', 'ch1', 0.50)).toBe(false);
      expect(svc.isSentimentAcceptable('youtube', 'ch1', 0.60)).toBe(true);
    });

    it('gaming culture accepts lower sentiment', () => {
      svc.setProfile('youtube', 'ch1', 'gaming'); // threshold 0.30
      expect(svc.isSentimentAcceptable('youtube', 'ch1', 0.35)).toBe(true);
    });
  });

  describe('listPresets', () => {
    it('returns all presets with required fields', () => {
      const presets = svc.listPresets();
      expect(presets.length).toBe(Object.keys(CULTURE_PRESETS).length);
      for (const p of presets) {
        expect(p).toHaveProperty('id');
        expect(p).toHaveProperty('label');
        expect(p).toHaveProperty('description');
        expect(p).toHaveProperty('strictness');
      }
    });
  });

  // DB永続化（短所#3の解消）: 再起動でプロファイルが消えないこと
  describe('DB永続化', () => {
    it('setProfileしたプロファイルは新しいインスタンス（=再起動相当）でも復元される', async () => {
      const channelId = `persist-${Date.now()}`;
      svc.setProfile('youtube', channelId, 'gaming', { note: 'keep-me' });
      // fire-and-forgetのDB書き込みが完了するのを待つ
      await new Promise((r) => setTimeout(r, 300));

      // 別インスタンスを生成し、DBからのロード完了を待つ（再起動をシミュレート）
      const fresh = new CreatorCultureService();
      await fresh._loaded;

      const restored = fresh.getProfile('youtube', channelId);
      expect(restored.cultureType).toBe('gaming');
      expect(restored.isCustomized).toBe(true);
      expect(restored.note).toBe('keep-me');
    });

    it('未設定チャンネルは復元後もデフォルト（entertainment）のまま', async () => {
      const fresh = new CreatorCultureService();
      await fresh._loaded;
      const p = fresh.getProfile('youtube', `never-set-${Date.now()}`);
      expect(p.cultureType).toBe('entertainment');
      expect(p.isCustomized).toBe(false);
    });
  });
});
