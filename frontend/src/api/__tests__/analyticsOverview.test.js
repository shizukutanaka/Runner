import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import axios from 'axios';
import { fetchAnalyticsOverview } from '../comments';

// 分析タブのデータ取得。
//
// ---------------------------------------------------------------------------
// このテストが守る不変条件
// ---------------------------------------------------------------------------
// 以前 `AnalyticsPanel` は `/api/comments/stats` を叩いていたが、
// **そのエンドポイントは存在しない**（実測: 400が返る）。毎回失敗して
// `getDemoStats()` のハードコード値（コメント1240件・感情620/420/200 等）を
// 表示していたため、**このタブは一度も実データを出したことがなかった**。
//
// 修正の要点は2つで、どちらも退行しやすい:
//   1. 実在するエンドポイントを叩くこと
//   2. **取得できない指標を 0 と偽らないこと**（null を返し、UIは「—」と表示する）
//      デモデータへのフォールバックは復活させてはならない
describe('fetchAnalyticsOverview', () => {
  beforeEach(() => vi.restoreAllMocks());
  afterEach(() => vi.restoreAllMocks());

  const mockAll = ({ stats, graph, mod }) => {
    vi.spyOn(axios, 'get').mockImplementation((url) => {
      if (url.includes('/analytics/stats')) return stats;
      if (url.includes('/analytics/graph')) return graph;
      if (url.includes('/analytics/moderation')) return mod;
      return Promise.reject(new Error('unexpected url ' + url));
    });
  };

  const ok = (data) => Promise.resolve({ data });
  const fail = () => Promise.reject(new Error('404'));

  it('実在する3つの分析エンドポイントを叩く', async () => {
    mockAll({
      stats: ok({ commentCount: 5, userCount: 2, bannedCount: 1, activeUsers: 3 }),
      graph: ok({ labels: ['2026-09-01'], comments: [5], bans: [0] }),
      mod: ok({ stats: { flagged: 1, passed: 4, byStatus: { visible: 4, deleted: 1 } } })
    });
    await fetchAnalyticsOverview();
    const urls = axios.get.mock.calls.map((c) => c[0]);
    expect(urls.some((u) => u.includes('/analytics/stats'))).toBe(true);
    expect(urls.some((u) => u.includes('/analytics/graph'))).toBe(true);
    expect(urls.some((u) => u.includes('/analytics/moderation'))).toBe(true);
    // 存在しない旧エンドポイントを叩いていないこと
    expect(urls.some((u) => u.includes('/comments/stats'))).toBe(false);
  });

  it('実データを正しく合成する', async () => {
    mockAll({
      stats: ok({ commentCount: 5, userCount: 2, bannedCount: 1, activeUsers: 3 }),
      graph: ok({ labels: ['2026-09-01'], comments: [5], bans: [0] }),
      mod: ok({ stats: { flagged: 1, passed: 4, byStatus: { visible: 4, deleted: 1 } } })
    });
    const r = await fetchAnalyticsOverview();
    expect(r.total).toBe(5);
    expect(r.activeUsers).toBe(3);
    expect(r.bannedUsers).toBe(1);
    expect(r.moderated).toBe(1);
    expect(r.moderationRate).toBe(20); // 1/(1+4)
    expect(r.timelineComments).toEqual([5]);
    expect(r.byStatus).toEqual({ visible: 4, deleted: 1 });
  });

  it('取得できない指標は 0 ではなく null にする（偽の数字を出さない）', async () => {
    mockAll({ stats: fail(), graph: fail(), mod: ok({ stats: { flagged: 2, passed: 8, byStatus: {} } }) });
    const r = await fetchAnalyticsOverview();
    expect(r.total).toBeNull();
    expect(r.activeUsers).toBeNull();
    expect(r.timelineLabels).toBeNull();
    // 取れた分は実データで返す
    expect(r.moderated).toBe(2);
    expect(r.moderationRate).toBe(20);
  });

  it('一部だけ失敗しても、取れたものは返す', async () => {
    mockAll({
      stats: ok({ commentCount: 9, userCount: 0, bannedCount: 0, activeUsers: 0 }),
      graph: fail(),
      mod: fail()
    });
    const r = await fetchAnalyticsOverview();
    expect(r.total).toBe(9);
    expect(r.moderated).toBeNull();
    expect(r.moderationRate).toBeNull();
  });

  it('3つすべて失敗したときだけ例外にする（UIはエラー表示にする）', async () => {
    mockAll({ stats: fail(), graph: fail(), mod: fail() });
    await expect(fetchAnalyticsOverview()).rejects.toThrow();
  });
});
