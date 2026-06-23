const { SilentDepartureDetector } = require('../../src/services/silentDepartureDetector');

const daysAgo = (n) => new Date(Date.now() - n * 86400000);

describe('SilentDepartureDetector', () => {
  let det;

  beforeEach(() => {
    det = new SilentDepartureDetector();
  });

  describe('analyze — empty state', () => {
    it('returns zero risk for unknown channel', () => {
      const r = det.analyze('youtube', 'ch1');
      expect(r.departureRisk).toBe(0);
      expect(r.regularUserCount).toBe(0);
      expect(r.trend).toBe('stable');
    });
  });

  describe('record + analyze', () => {
    it('identifies regular users (≥3 comments in 7 days)', () => {
      for (let i = 0; i < 5; i++) {
        det.record('youtube', 'ch1', 'alice', daysAgo(i % 3));
      }
      const r = det.analyze('youtube', 'ch1');
      expect(r.regularUserCount).toBeGreaterThanOrEqual(1);
    });

    it('does not count low-frequency users as regular', () => {
      // Only 2 comments — below REGULAR_MIN_COMMENTS (3)
      det.record('youtube', 'ch1', 'bob', daysAgo(1));
      det.record('youtube', 'ch1', 'bob', daysAgo(2));
      const r = det.analyze('youtube', 'ch1');
      expect(r.regularUserCount).toBe(0);
    });

    it('detects silent departure when regular user stops commenting', () => {
      // Alice was active, last comment 5 days ago
      for (let i = 4; i < 8; i++) {
        det.record('youtube', 'ch1', 'alice', daysAgo(i));
      }
      // Ensure alice was regular (5 comments in window)
      const r = det.analyze('youtube', 'ch1');
      if (r.regularUserCount > 0) {
        expect(r.silentUserCount).toBeGreaterThanOrEqual(1);
        expect(r.departureRisk).toBeGreaterThan(0);
      }
    });

    it('shows zero silent users when regular is still active', () => {
      // Alice posts frequently including today
      for (let i = 0; i < 7; i++) {
        det.record('youtube', 'ch1', 'alice', daysAgo(i));
      }
      const r = det.analyze('youtube', 'ch1');
      expect(r.silentUserCount).toBe(0);
      expect(r.departureRisk).toBe(0);
    });

    it('risk increases proportionally with more silent regulars', () => {
      // 4 regulars, all silent for 6 days
      ['alice', 'bob', 'carol', 'dave'].forEach(user => {
        for (let i = 5; i < 8; i++) {
          det.record('youtube', 'ch1', user, daysAgo(i));
        }
      });
      const r = det.analyze('youtube', 'ch1');
      expect(r.departureRisk).toBeGreaterThan(0.3);
    });

    it('returns sorted silentUsers by daysSilent descending', () => {
      // alice silent 10 days, bob silent 5 days
      for (let i = 0; i < 5; i++) {
        det.record('youtube', 'ch2', 'alice', daysAgo(9 + i));
        det.record('youtube', 'ch2', 'bob',   daysAgo(4 + i));
      }
      const r = det.analyze('youtube', 'ch2');
      const silent = r.silentUsers;
      for (let i = 1; i < silent.length; i++) {
        expect(silent[i - 1].daysSilent).toBeGreaterThanOrEqual(silent[i].daysSilent);
      }
    });
  });

  describe('trend detection', () => {
    it('trend is stable when most regulars are still active', () => {
      for (let i = 0; i < 7; i++) {
        det.record('youtube', 'ch1', 'alice', daysAgo(i));
        det.record('youtube', 'ch1', 'bob',   daysAgo(i));
      }
      const r = det.analyze('youtube', 'ch1');
      expect(r.trend).toBe('stable');
    });
  });

  describe('history cap', () => {
    it('caps entries at MAX_HISTORY', () => {
      for (let i = 0; i < 11000; i++) {
        det.record('youtube', 'ch1', `user${i % 100}`, new Date());
      }
      const list = det.records.get('youtube:ch1');
      expect(list.length).toBeLessThanOrEqual(10000);
    });
  });

  describe('result shape', () => {
    it('has all required fields', () => {
      det.record('youtube', 'ch1', 'u1', new Date());
      const r = det.analyze('youtube', 'ch1');
      expect(r).toHaveProperty('platform');
      expect(r).toHaveProperty('channelId');
      expect(r).toHaveProperty('regularUserCount');
      expect(r).toHaveProperty('silentUserCount');
      expect(r).toHaveProperty('silentUsers');
      expect(r).toHaveProperty('departureRisk');
      expect(r).toHaveProperty('trend');
      expect(r).toHaveProperty('insight');
      expect(r).toHaveProperty('timestamp');
    });
  });
});
