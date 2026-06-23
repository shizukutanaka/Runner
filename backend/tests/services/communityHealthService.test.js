const { CommunityHealthService } = require('../../src/services/communityHealthService');

const makeComment = (overrides = {}) => ({
  content: 'This is a meaningful comment about the topic.',
  sentimentScore: 0.6,
  sentiment: 'positive',
  status: 'active',
  user: 'user1',
  ...overrides,
});

describe('CommunityHealthService', () => {
  let svc;

  beforeEach(() => {
    svc = new CommunityHealthService();
  });

  describe('calculateHealth', () => {
    it('returns empty report for null/empty input', () => {
      expect(svc.calculateHealth(null)).toMatchObject({ score: null, grade: null });
      expect(svc.calculateHealth([])).toMatchObject({ score: null, grade: null });
    });

    it('returns valid report for a set of comments', () => {
      const comments = Array.from({ length: 30 }, (_, i) =>
        makeComment({ user: `user${i % 10}` })
      );
      const report = svc.calculateHealth(comments);
      expect(report.score).toBeGreaterThanOrEqual(0);
      expect(report.score).toBeLessThanOrEqual(100);
      expect(['S', 'A', 'B', 'C', 'D']).toContain(report.grade);
      expect(report.signals).toHaveProperty('sentimentBalance');
      expect(report.signals).toHaveProperty('diversityScore');
      expect(report.sampleSize).toBe(30);
    });

    it('respects windowSize option', () => {
      const comments = Array.from({ length: 100 }, () => makeComment());
      const report = svc.calculateHealth(comments, { windowSize: 20 });
      expect(report.sampleSize).toBe(20);
    });

    it('grades S for a very healthy community', () => {
      const comments = Array.from({ length: 50 }, (_, i) => makeComment({
        user: `user${i}`,
        content: 'ありがとう！これは素晴らしい内容ですね。質問があります。',
        sentimentScore: 0.9,
        sentiment: 'positive',
        status: 'active',
      }));
      const report = svc.calculateHealth(comments);
      expect(['S', 'A']).toContain(report.grade);
    });

    it('grades D for a toxic community', () => {
      const comments = Array.from({ length: 30 }, () => makeComment({
        content: 'x',  // too short — low engagement
        sentimentScore: 0.1,
        sentiment: 'negative',
        status: 'deleted',
        user: 'baduser',  // single-user domination
      }));
      const report = svc.calculateHealth(comments);
      expect(['C', 'D']).toContain(report.grade);
    });
  });

  describe('_sentimentBalance', () => {
    it('returns 1 when all comments are positive', () => {
      const comments = Array.from({ length: 5 }, () => ({ sentimentScore: 0.9, sentiment: 'positive' }));
      expect(svc._sentimentBalance(comments)).toBe(1);
    });

    it('returns 0 when all comments are very negative', () => {
      const comments = Array.from({ length: 5 }, () => ({ sentimentScore: 0.1, sentiment: 'negative' }));
      expect(svc._sentimentBalance(comments)).toBe(0);
    });
  });

  describe('_engagementDepth', () => {
    it('scores 1 when all comments are meaningful', () => {
      const comments = [
        { content: 'This is a long and meaningful comment about the topic at hand.' },
        { content: 'Another substantive comment that adds value to the discussion.' },
      ];
      expect(svc._engagementDepth(comments)).toBe(1);
    });

    it('scores 0 for all short/spam comments', () => {
      const comments = [
        { content: 'lol' },
        { content: 'ok' },
        { content: 'https://spam.com https://spam2.com buy now https://spam3.com' },
      ];
      expect(svc._engagementDepth(comments)).toBe(0);
    });
  });

  describe('_diversityScore', () => {
    it('returns near 1 when each comment is from a unique user', () => {
      const comments = Array.from({ length: 10 }, (_, i) => ({ user: `user${i}` }));
      const score = svc._diversityScore(comments);
      expect(score).toBeGreaterThan(0.8);
    });

    it('returns near 0 when one user dominates all comments', () => {
      const comments = Array.from({ length: 10 }, () => ({ user: 'oneuser' }));
      const score = svc._diversityScore(comments);
      expect(score).toBeLessThan(0.1);
    });

    it('returns 1 for empty array', () => {
      expect(svc._diversityScore([])).toBe(1);
    });
  });

  describe('_moderationLoad', () => {
    it('returns 1 when no comments are moderated', () => {
      const comments = [{ status: 'active' }, { status: 'visible' }];
      expect(svc._moderationLoad(comments)).toBe(1);
    });

    it('returns 0 when all comments are moderated', () => {
      const comments = [{ status: 'deleted' }, { status: 'hidden' }, { status: 'flagged' }];
      expect(svc._moderationLoad(comments)).toBe(0);
    });
  });

  describe('_returnUserRate', () => {
    it('returns 0.5 when recent and all comments are the same set', () => {
      const comments = [{ user: 'u1' }, { user: 'u2' }];
      expect(svc._returnUserRate(comments, comments)).toBe(0.5);
    });

    it('detects return users correctly', () => {
      const older = [{ user: 'u1' }, { user: 'u2' }, { user: 'u3' }];
      const recent = [{ user: 'u1' }, { user: 'u4' }];
      const all = [...older, ...recent];
      const rate = svc._returnUserRate(recent, all);
      expect(rate).toBe(0.5); // u1 returned, u4 is new → 1/2
    });
  });

  describe('_constructiveness', () => {
    it('scores 1 when all comments are constructive', () => {
      const comments = [
        { content: 'ありがとう！' },
        { content: 'Great content, love it!' },
        { content: 'おすすめのツールはありますか？' },
      ];
      expect(svc._constructiveness(comments)).toBe(1);
    });

    it('scores 0 when no comments are constructive', () => {
      const comments = [
        { content: 'blah blah blah' },
        { content: 'boring content' },
      ];
      expect(svc._constructiveness(comments)).toBe(0);
    });
  });

  describe('_grade', () => {
    it.each([
      [90, 'S'],
      [75, 'A'],
      [60, 'B'],
      [45, 'C'],
      [30, 'D'],
    ])('score %i → grade %s', (score, expected) => {
      expect(svc._grade(score)).toBe(expected);
    });
  });

  describe('_insight', () => {
    it('returns positive message for score >= 85', () => {
      const insight = svc._insight(90, {});
      expect(insight).toContain('非常に健全');
    });

    it('identifies weakest signal', () => {
      const signals = {
        sentimentBalance: 0.8,
        engagementDepth: 0.1,
        diversityScore: 0.9,
        moderationLoad: 0.8,
        returnUserRate: 0.8,
        constructiveness: 0.7,
      };
      const insight = svc._insight(60, signals);
      expect(insight).toContain('有意義な発言の深さ');
    });
  });
});
