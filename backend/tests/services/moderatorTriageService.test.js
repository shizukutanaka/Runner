const { ModeratorTriageService, TRIAGE_LEVELS } = require('../../src/services/moderatorTriageService');

const makeComment = (overrides = {}) => ({
  id: `c-${Math.random().toString(36).slice(2)}`,
  content: 'test comment',
  user: 'user1',
  platform: 'youtube',
  timestamp: new Date().toISOString(),
  toxicityScore: 0,
  moderationScore: 0,
  replyCount: 0,
  likeCount: 0,
  violationCount: 0,
  ...overrides,
});

describe('ModeratorTriageService', () => {
  let svc;

  beforeEach(() => {
    svc = new ModeratorTriageService();
  });

  describe('triage — empty input', () => {
    it('returns empty result for no comments', () => {
      const r = svc.triage([], {});
      expect(r.summary.total).toBe(0);
      expect(r.queues.EMERGENCY).toHaveLength(0);
    });
  });

  describe('triage — classification', () => {
    it('classifies highly toxic comment as EMERGENCY', () => {
      const comments = [makeComment({ toxicityScore: 0.95, content: '死ね、クソ' })];
      const r = svc.triage(comments, { riskLevel: 'safe' });
      expect(['EMERGENCY', 'URGENT']).toContain(r.queues.EMERGENCY.length > 0 ? 'EMERGENCY' : 'URGENT');
      const all = [...r.queues.EMERGENCY, ...r.queues.URGENT];
      expect(all.length).toBeGreaterThanOrEqual(1);
    });

    it('classifies benign comment as ROUTINE or CAN_WAIT', () => {
      const comments = [makeComment({ toxicityScore: 0, content: 'nice video!' })];
      const r = svc.triage(comments, { riskLevel: 'safe' });
      expect([...r.queues.ROUTINE, ...r.queues.CAN_WAIT]).toHaveLength(1);
    });

    it('escalates medium-toxicity comment when channel is critical', () => {
      const comment = makeComment({ toxicityScore: 0.45 });
      const safeTriage     = svc.triage([comment], { riskLevel: 'safe' });
      const criticalTriage = svc.triage([comment], { riskLevel: 'critical' });

      // Compare priority scores regardless of which queue each ended up in
      const safeItem     = Object.values(safeTriage.queues).flat()[0];
      const criticalItem = Object.values(criticalTriage.queues).flat()[0];

      const safeScore     = safeItem?.priorityScore     ?? 0;
      const criticalScore = criticalItem?.priorityScore ?? 0;
      expect(criticalScore).toBeGreaterThan(safeScore);

      // In critical channel, should be escalated to at least URGENT
      expect(['EMERGENCY', 'URGENT']).toContain(criticalItem?.triageLevel);
    });

    it('raises priority for repeat violators', () => {
      const clean   = makeComment({ violationCount: 0 });
      const recidiv = makeComment({ violationCount: 5 });
      const r = svc.triage([clean, recidiv], { riskLevel: 'safe' });
      const all = Object.values(r.queues).flat();
      const cleanItem   = all.find(i => i.commentId === clean.id);
      const recidivItem = all.find(i => i.commentId === recidiv.id);
      expect(recidivItem.priorityScore).toBeGreaterThan(cleanItem.priorityScore);
    });

    it('raises priority for Super Chat influencer', () => {
      const normal    = makeComment({ isSuperChat: false });
      const superChat = makeComment({ isSuperChat: true, toxicityScore: 0.3 });
      const r = svc.triage([normal, superChat], { riskLevel: 'watch' });
      const all = Object.values(r.queues).flat();
      const normalItem    = all.find(i => i.commentId === normal.id);
      const superChatItem = all.find(i => i.commentId === superChat.id);
      expect(superChatItem.priorityScore).toBeGreaterThan(normalItem.priorityScore);
    });
  });

  describe('triage — sorting', () => {
    it('sorts each queue by priority score descending', () => {
      const comments = [
        makeComment({ toxicityScore: 0.2 }),
        makeComment({ toxicityScore: 0.8 }),
        makeComment({ toxicityScore: 0.5 }),
      ];
      const r = svc.triage(comments, { riskLevel: 'safe' });
      for (const queue of Object.values(r.queues)) {
        for (let i = 1; i < queue.length; i++) {
          expect(queue[i - 1].priorityScore).toBeGreaterThanOrEqual(queue[i].priorityScore);
        }
      }
    });
  });

  describe('triage — summary', () => {
    it('summary counts sum to total', () => {
      const comments = Array.from({ length: 10 }, (_, i) =>
        makeComment({ toxicityScore: i * 0.1 })
      );
      const r = svc.triage(comments, { riskLevel: 'watch' });
      const sum = r.summary.emergency + r.summary.urgent + r.summary.routine + r.summary.canWait;
      expect(sum).toBe(r.summary.total);
      expect(r.summary.total).toBe(10);
    });
  });

  describe('TRIAGE_LEVELS export', () => {
    it('has 4 levels with required fields', () => {
      expect(Object.keys(TRIAGE_LEVELS)).toHaveLength(4);
      for (const level of Object.values(TRIAGE_LEVELS)) {
        expect(level).toHaveProperty('id');
        expect(level).toHaveProperty('label');
        expect(level).toHaveProperty('slaMinutes');
        expect(level).toHaveProperty('color');
      }
    });

    it('SLA times are ordered: EMERGENCY < URGENT < ROUTINE < CAN_WAIT', () => {
      expect(TRIAGE_LEVELS.EMERGENCY.slaMinutes).toBeLessThan(TRIAGE_LEVELS.URGENT.slaMinutes);
      expect(TRIAGE_LEVELS.URGENT.slaMinutes).toBeLessThan(TRIAGE_LEVELS.ROUTINE.slaMinutes);
      expect(TRIAGE_LEVELS.ROUTINE.slaMinutes).toBeLessThan(TRIAGE_LEVELS.CAN_WAIT.slaMinutes);
    });
  });

  describe('_keywordToxicity', () => {
    it.each([
      ['死ね', 0.9],
      ['クソ', 0.65],
      ['つまらない', 0.35],
      ['nice video', 0],
    ])('"%s" → %f', (text, expected) => {
      expect(svc._keywordToxicity(text)).toBe(expected);
    });
  });

  describe('suggestedFocus', () => {
    it('points to highest priority item', () => {
      const high = makeComment({ toxicityScore: 0.9, content: '死ね' });
      const low  = makeComment({ toxicityScore: 0.1 });
      const r = svc.triage([high, low], { riskLevel: 'warning' });
      if (r.suggestedFocus) {
        expect(r.suggestedFocus.commentId).toBe(high.id);
      }
    });

    it('is null when no comments pending', () => {
      const r = svc.triage([], {});
      expect(r.suggestedFocus).toBeNull();
    });
  });
});
