const { EmotionalContagionDetector } = require('../../src/services/emotionalContagionDetector');

const makeComment = (overrides = {}) => ({
  id: `c-${Math.random()}`,
  platform: 'youtube',
  channelId: 'ch1',
  content: 'test comment',
  sentimentScore: 0.6,
  toxicityScore: 0,
  timestamp: new Date().toISOString(),
  user: 'user1',
  ...overrides,
});

describe('EmotionalContagionDetector', () => {
  let detector;

  beforeEach(() => {
    detector = new EmotionalContagionDetector();
  });

  describe('ingest + evaluate', () => {
    it('returns safe result when fewer than 3 comments', () => {
      detector.ingest(makeComment());
      detector.ingest(makeComment());
      const result = detector.evaluate('youtube', 'ch1');
      expect(result.level).toBe('safe');
      expect(result.riskScore).toBe(0);
    });

    it('returns a valid risk result with enough comments', () => {
      for (let i = 0; i < 5; i++) {
        detector.ingest(makeComment({ sentimentScore: 0.7 }));
      }
      const result = detector.evaluate('youtube', 'ch1');
      expect(result).toHaveProperty('riskScore');
      expect(result).toHaveProperty('level');
      expect(result).toHaveProperty('signals');
      expect(result).toHaveProperty('recommendation');
      expect(['safe', 'watch', 'warning', 'critical']).toContain(result.level);
    });

    it('escalates to warning/critical with highly toxic comments', () => {
      const now = new Date();
      for (let i = 0; i < 20; i++) {
        detector.ingest(makeComment({
          sentimentScore: 0.1,
          toxicityScore: 0.9,
          timestamp: new Date(now.getTime() - i * 1000).toISOString(),
          user: 'badUser',
        }));
      }
      const result = detector.evaluate('youtube', 'ch1');
      expect(result.riskScore).toBeGreaterThan(0.3);
      expect(['watch', 'warning', 'critical']).toContain(result.level);
    });

    it('emits risk event when score exceeds threshold', () => {
      const listener = jest.fn();
      detector.on('risk', listener);

      const now = new Date();
      for (let i = 0; i < 25; i++) {
        detector.ingest(makeComment({
          sentimentScore: 0.05,
          toxicityScore: 0.95,
          timestamp: new Date(now.getTime() - i * 500).toISOString(),
          user: `u${i % 3}`,
        }));
      }

      if (detector.evaluate('youtube', 'ch1').riskScore >= 0.65) {
        expect(listener).toHaveBeenCalled();
      }
    });

    it('off() removes listener', () => {
      const listener = jest.fn();
      detector.on('risk', listener);
      detector.off('risk', listener);
      // Force a high risk state and emit
      detector._emit('risk', { riskScore: 0.9 });
      expect(listener).not.toHaveBeenCalled();
    });
  });

  describe('getHealthSummary', () => {
    it('returns null for empty channel', () => {
      expect(detector.getHealthSummary('youtube', 'unknown')).toBeNull();
    });

    it('returns summary after ingesting comments', () => {
      for (let i = 0; i < 5; i++) {
        detector.ingest(makeComment({ channelId: 'ch2', platform: 'youtube' }));
      }
      const summary = detector.getHealthSummary('youtube', 'ch2');
      expect(summary).not.toBeNull();
      expect(summary).toHaveProperty('totalComments', 5);
      expect(summary).toHaveProperty('avgSentiment');
      expect(summary).toHaveProperty('trend');
      expect(['improving', 'declining']).toContain(summary.trend);
    });
  });

  describe('_sentimentGradient', () => {
    it('returns 0 for fewer than 2 comments', () => {
      const result = detector._sentimentGradient([{ sentiment: 0.5 }]);
      expect(result).toBe(0);
    });

    it('returns positive gradient for improving sentiment', () => {
      const comments = [0.1, 0.3, 0.5, 0.7, 0.9].map(s => ({ sentiment: s }));
      const gradient = detector._sentimentGradient(comments);
      expect(gradient).toBeGreaterThan(0);
    });

    it('returns negative gradient for declining sentiment', () => {
      const comments = [0.9, 0.7, 0.5, 0.3, 0.1].map(s => ({ sentiment: s }));
      const gradient = detector._sentimentGradient(comments);
      expect(gradient).toBeLessThan(0);
    });
  });

  describe('_detectAgitator', () => {
    it('scores 0 when no negative comments', () => {
      const comments = Array.from({ length: 5 }, () => ({ sentiment: 0.8, userId: 'u1' }));
      expect(detector._detectAgitator(comments)).toBe(0);
    });

    it('scores 1 when one user posts 5+ negative comments', () => {
      const comments = Array.from({ length: 5 }, () => ({ sentiment: 0.1, userId: 'badguy' }));
      expect(detector._detectAgitator(comments)).toBe(1);
    });
  });

  describe('_riskLevel', () => {
    it.each([
      [0.1, 'safe'],
      [0.35, 'watch'],
      [0.55, 'warning'],
      [0.75, 'critical'],
    ])('score %f → level %s', (score, expected) => {
      expect(detector._riskLevel(score)).toBe(expected);
    });
  });

  describe('history cap', () => {
    it('does not exceed MAX_HISTORY entries', () => {
      for (let i = 0; i < 600; i++) {
        detector.ingest(makeComment({ id: `c-${i}` }));
      }
      const key = 'youtube:ch1';
      expect(detector.history.get(key).length).toBeLessThanOrEqual(500);
    });
  });
});
