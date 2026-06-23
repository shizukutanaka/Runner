/**
 * Silent Departure Detector（サイレント離脱検知）
 *
 * 【ソクラテス式問答から生まれた視点】
 * Q: 「コミュニティはいつ衰退し始めるか？」
 * A: 「有害コメントが増えたとき」
 * Q: 「有害コメントが増える前に何が起きているか？」
 * A: 「...よくわからない」
 * Q: 「レギュラー視聴者は炎上が起きる前後どう行動するか？」
 * → 発見: 常連コメンターがまず静かになる。有害コメントの増加は二次的現象。
 *
 * Q: 「我々は誰が去ったかを追跡しているか？」
 * A: 「誰も去っていない（そのような指標はない）」
 * Q: 「では誰が静かになったかは？」
 * → 新視点: コメントの"不在"がコミュニティ衰退の最初の警告サイン
 *
 * 従来: コメント数・毒性率など「あるもの」を測定
 * 新視点: 「あるべきなのにないもの」——常連の沈黙——を検知
 *
 * 類比: 炭鉱のカナリア。カナリアが鳴き止んだとき危険が来る
 */

const logger = require('../logger');

// ─── 設定 ──────────────────────────────────────────────────
const REGULAR_WINDOW_DAYS  = 7;    // 過去N日間でコメントした人を"常連"とみなす
const REGULAR_MIN_COMMENTS = 3;    // 常連の最小コメント数
const SILENCE_THRESHOLD_DAYS = 3;  // N日間コメントなし＝"静かになった"
const MAX_HISTORY_ENTRIES  = 10000; // 保持する最大記録数
const MS_PER_DAY = 86400000;

class SilentDepartureDetector {
  constructor() {
    // channelKey → [{userId, timestamp: Date}]
    this.records = new Map();
  }

  // ─────────────────────────────────────────
  // コメントを記録
  // ─────────────────────────────────────────
  record(platform, channelId, userId, timestamp = new Date()) {
    const key = this._key(platform, channelId);
    if (!this.records.has(key)) {
      this.records.set(key, []);
    }

    const list = this.records.get(key);
    list.push({
      userId,
      timestamp: timestamp instanceof Date ? timestamp : new Date(timestamp),
    });

    // 古いデータを削除（メモリ管理）
    if (list.length > MAX_HISTORY_ENTRIES) {
      list.splice(0, list.length - MAX_HISTORY_ENTRIES);
    }
  }

  // ─────────────────────────────────────────
  // サイレント離脱分析（コアロジック）
  // ─────────────────────────────────────────
  analyze(platform, channelId) {
    const key  = this._key(platform, channelId);
    const list = this.records.get(key) ?? [];

    if (list.length === 0) {
      return this._emptyResult(platform, channelId);
    }

    const now        = new Date();
    const windowMs   = REGULAR_WINDOW_DAYS  * MS_PER_DAY;
    const silenceMs  = SILENCE_THRESHOLD_DAYS * MS_PER_DAY;

    // ─ シングルパスで全データを収集（O(n) → 旧実装のO(n²)を改善） ─
    const windowStartMs = now.getTime() - windowMs;
    const silenceStartMs = now.getTime() - silenceMs;
    const midPointMs    = now.getTime() - 3 * MS_PER_DAY;

    const commentCounts  = {};   // userId → count in window
    const lastSeenMap    = {};   // userId → latest timestamp
    const recentlyActive = new Set(); // active within silence threshold
    const olderActiveSet = new Set(); // active in window before midpoint
    const recentActiveSet = new Set(); // active in window after midpoint

    for (const r of list) {
      const ts = r.timestamp.getTime();

      // 常連カウント（過去7日間）
      if (ts >= windowStartMs) {
        commentCounts[r.userId] = (commentCounts[r.userId] ?? 0) + 1;

        // 沈黙判定用
        if (ts >= silenceStartMs) {
          recentlyActive.add(r.userId);
        }

        // トレンド判定用
        if (ts < midPointMs) {
          olderActiveSet.add(r.userId);
        } else {
          recentActiveSet.add(r.userId);
        }
      }

      // 最後のコメント時刻（全期間）
      if (!lastSeenMap[r.userId] || ts > lastSeenMap[r.userId]) {
        lastSeenMap[r.userId] = ts;
      }
    }

    // ─ 1. 常連ユーザーを特定 ─
    const regularUsers = new Set(
      Object.entries(commentCounts)
        .filter(([, count]) => count >= REGULAR_MIN_COMMENTS)
        .map(([userId]) => userId)
    );

    // ─ 2. 常連のうち沈黙ユーザーを抽出 ─
    const silentUsers = [];
    for (const userId of regularUsers) {
      if (!recentlyActive.has(userId)) {
        const lastSeenTs = lastSeenMap[userId] ?? null;
        const daysSilent = lastSeenTs
          ? Math.round((now.getTime() - lastSeenTs) / MS_PER_DAY)
          : SILENCE_THRESHOLD_DAYS;

        silentUsers.push({
          userId,
          lastSeen:    lastSeenTs ? new Date(lastSeenTs).toISOString() : null,
          daysSilent,
          commentFreq: commentCounts[userId] ?? 0,
        });
      }
    }

    // ─ 3. 離脱リスクスコア（0–1） ─
    const departureRatio = regularUsers.size === 0
      ? 0
      : silentUsers.length / regularUsers.size;

    const avgSilenceDays = silentUsers.length > 0
      ? silentUsers.reduce((sum, u) => sum + u.daysSilent, 0) / silentUsers.length
      : 0;
    const silenceWeight = Math.min(1, avgSilenceDays / 14);

    const departureRisk = Math.min(1,
      departureRatio * 0.70 + silenceWeight * 0.30
    );

    // ─ 4. トレンド判定 ─
    const olderRegularActive = olderActiveSet.size;
    const recentRegularActive = recentActiveSet.size;

    const trend = this._trend(olderRegularActive, recentRegularActive, regularUsers.size);

    return {
      platform,
      channelId,
      regularUserCount:  regularUsers.size,
      silentUserCount:   silentUsers.length,
      silentUsers:       silentUsers.sort((a, b) => b.daysSilent - a.daysSilent),
      departureRisk:     Math.round(departureRisk * 100) / 100,
      trend,             // 'stable' | 'declining' | 'critical'
      insight:           this._insight(departureRisk, silentUsers.length, regularUsers.size, trend),
      action:            this._action(departureRisk, trend),
      windowDays:        REGULAR_WINDOW_DAYS,
      silenceThreshold:  SILENCE_THRESHOLD_DAYS,
      timestamp:         now.toISOString(),
    };
  }

  // ─── 解釈 ─────────────────────────────────────────────
  _trend(olderActive, recentActive, totalRegulars) {
    if (totalRegulars === 0) return 'stable';
    const drop = olderActive - recentActive;
    const dropRate = totalRegulars > 0 ? drop / totalRegulars : 0;
    if (dropRate > 0.4) return 'critical';
    if (dropRate > 0.2) return 'declining';
    return 'stable';
  }

  _insight(risk, silentCount, regularCount, trend) {
    if (regularCount === 0) {
      return 'まだ常連ユーザーが形成されていません。コミュニティが成長すると追跡が始まります。';
    }
    if (risk < 0.15) {
      return `常連ユーザー${regularCount}名のうち、離脱の兆候はありません。コミュニティは安定しています。`;
    }
    if (trend === 'critical') {
      return `⚠ 常連${regularCount}名中${silentCount}名が沈黙中。急速な離脱が検出されています。緊急対応が必要です。`;
    }
    if (risk >= 0.5) {
      return `常連ユーザーの${Math.round(silentCount / regularCount * 100)}%が${SILENCE_THRESHOLD_DAYS}日以上コメントしていません。コミュニティが衰退しつつある可能性があります。`;
    }
    return `常連ユーザー${silentCount}名が静かになっています。早期に状況を確認することをお勧めします。`;
  }

  _action(risk, trend) {
    if (risk < 0.15) return null;
    if (trend === 'critical' || risk >= 0.6) {
      return '今すぐ行動: 沈黙している常連に向けたピン留めメッセージや特別なコンテンツを検討してください。';
    }
    if (risk >= 0.35) {
      return '次の配信で常連ユーザーへの呼びかけや、コメント参加を促すQ&Aを試してください。';
    }
    return '軽度の離脱兆候。コミュニティの会話テーマを見直すと良いかもしれません。';
  }

  _emptyResult(platform, channelId) {
    return {
      platform,
      channelId,
      regularUserCount: 0,
      silentUserCount:  0,
      silentUsers:      [],
      departureRisk:    0,
      trend:            'stable',
      insight:          'コメント記録がまだありません。',
      action:           null,
      windowDays:       REGULAR_WINDOW_DAYS,
      silenceThreshold: SILENCE_THRESHOLD_DAYS,
      timestamp:        new Date().toISOString(),
    };
  }

  _key(platform, channelId) {
    return `${platform}:${channelId ?? 'default'}`;
  }
}

module.exports = new SilentDepartureDetector();
module.exports.SilentDepartureDetector = SilentDepartureDetector;
