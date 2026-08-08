/**
 * ヘイトレイド（協調攻撃）検知
 *
 * 研究的背景:
 *  ライブ配信固有の脅威は「個々の有害コメント」ではなく、**多数のアカウントが
 *  同時に similar な内容を投稿する協調攻撃（hate raid）**である。Han et al.,
 *  "Hate Raids on Twitch: Understanding Real-Time Human-Bot Coordinated Attacks
 *  in Live Streaming Communities" (CSCW 2023 / arXiv:2305.16248) は、これが
 *  人間とボットが連携した集団攻撃であり、周縁化された配信者を標的にすること、
 *  そして配信者側の対抗手段が技術的手段に大きく依存していることを示した。
 *
 *  重要なのは、**1件ずつ見ると無害に見えるメッセージでも、短時間に多数の
 *  アカウントから同一/類似内容が投げ込まれれば攻撃**だという点である。
 *  本製品の `analyzeComment()` は1コメント単位の判定しか行わないため、
 *  この横断的なシグナルを見る層が存在しなかった。
 *
 * 検知シグナル（研究が挙げる「複数アカウントの同時投稿」を実装）:
 *  1. 短時間ウィンドウ内の**類似内容クラスタ**（異なるユーザーが同一/類似内容を投稿）
 *  2. メッセージ流量のスパイク
 *  3. 初出ユーザーの比率（レイドは新規/使い捨てアカウントを伴うことが多い）
 *
 * 誤検知への配慮: 配信では「草」「88888」等の**正当な同時多発コメント**が起きる。
 * そのため単一シグナルでは判定せず、複数シグナルの合成スコアで判断する。
 */

const logger = require('../logger');

// ─── 設定 ────────────────────────────────────────────────
const WINDOW_MS = 60 * 1000;          // 解析ウィンドウ（直近60秒）
const MAX_ENTRIES_PER_CHANNEL = 500;  // メモリ上限
const MIN_MESSAGES_FOR_ANALYSIS = 5;  // これ未満は判定しない（統計的に無意味）
const SIMILAR_CLUSTER_MIN_USERS = 3;  // 類似クラスタとみなす最小ユーザー数
const RATE_SPIKE_THRESHOLD = 30;      // ウィンドウ内メッセージ数のスパイク閾値
const RAID_SCORE_THRESHOLD = 0.6;     // これ以上でレイド判定

// 類似判定用の正規化: 記号/空白/連続同一文字を圧縮し、表記ゆれを吸収する。
// 「死ね!!!」「しね～」「死ね」を同一クラスタに寄せるのが狙い
const normalizeForSimilarity = (text) => String(text || '')
  .normalize('NFKC')
  .toLowerCase()
  .replace(/[\s　]+/g, '')
  .replace(/[!-\/:-@\[-`{-~！-／：-＠［-｀｛-～、。！？…〜ー]/g, '')
  .replace(/(.)\1{2,}/g, '$1$1'); // 3連以上の繰り返しは2文字に圧縮

class RaidDetector {
  constructor() {
    // channelKey → [{ userId, normalized, timestamp }]
    this.records = new Map();
    // channelKey → Set(userId)  これまでに観測したユーザー（初出判定用）
    this.seenUsers = new Map();
  }

  record(platform, channelId, userId, content, timestamp = new Date()) {
    const key = this._key(platform, channelId);
    if (!this.records.has(key)) {
      this.records.set(key, []);
      this.seenUsers.set(key, new Set());
    }

    const list = this.records.get(key);
    const seen = this.seenUsers.get(key);
    const ts = timestamp instanceof Date ? timestamp : new Date(timestamp);

    list.push({
      userId,
      normalized: normalizeForSimilarity(content),
      timestamp: ts,
      isFirstSeen: !seen.has(userId),
    });
    seen.add(userId);

    if (list.length > MAX_ENTRIES_PER_CHANNEL) {
      list.splice(0, list.length - MAX_ENTRIES_PER_CHANNEL);
    }
  }

  /**
   * 直近ウィンドウを解析し、協調攻撃の可能性を返す。
   * 返り値の score は 0–1（高いほどレイドの疑いが強い）。
   */
  analyze(platform, channelId) {
    const key = this._key(platform, channelId);
    const list = this.records.get(key) ?? [];
    const cutoff = Date.now() - WINDOW_MS;
    const recent = list.filter((r) => r.timestamp.getTime() >= cutoff);

    if (recent.length < MIN_MESSAGES_FOR_ANALYSIS) {
      return this._emptyResult(platform, channelId, recent.length);
    }

    // ── シグナル1: 類似内容クラスタ（異なるユーザーによる同一/類似投稿） ──
    const byContent = new Map(); // normalized → Set(userId)
    recent.forEach((r) => {
      if (!r.normalized) return;
      if (!byContent.has(r.normalized)) byContent.set(r.normalized, new Set());
      byContent.get(r.normalized).add(r.userId);
    });

    const clusters = [...byContent.entries()]
      .map(([content, users]) => ({ content, userCount: users.size }))
      .filter((c) => c.userCount >= SIMILAR_CLUSTER_MIN_USERS)
      .sort((a, b) => b.userCount - a.userCount);

    const distinctUsers = new Set(recent.map((r) => r.userId)).size;
    // クラスタに参加しているユーザーの割合（同時多発性の強さ）
    const clusteredUsers = clusters.reduce((sum, c) => sum + c.userCount, 0);
    const clusterRatio = distinctUsers > 0 ? Math.min(1, clusteredUsers / distinctUsers) : 0;

    // ── シグナル2: 流量スパイク ──
    const rateRatio = Math.min(1, recent.length / RATE_SPIKE_THRESHOLD);

    // ── シグナル3: 初出ユーザー比率 ──
    const firstSeenCount = recent.filter((r) => r.isFirstSeen).length;
    const firstSeenRatio = recent.length > 0 ? firstSeenCount / recent.length : 0;

    // 合成スコア: 研究が挙げる中心シグナル（複数アカウントの同時類似投稿）を最重視
    const score = Math.min(1,
      clusterRatio * 0.6 +
      rateRatio * 0.2 +
      firstSeenRatio * 0.2);

    const raidDetected = score >= RAID_SCORE_THRESHOLD && clusters.length > 0;

    if (raidDetected) {
      logger.warn('[RaidDetector] Possible coordinated attack detected', {
        platform, channelId, score: Math.round(score * 100) / 100,
        distinctUsers, topCluster: clusters[0]?.userCount,
      });
    }

    return {
      platform,
      channelId,
      raidDetected,
      score: Math.round(score * 100) / 100,
      windowSeconds: WINDOW_MS / 1000,
      messageCount: recent.length,
      distinctUsers,
      firstSeenRatio: Math.round(firstSeenRatio * 100) / 100,
      similarClusters: clusters.slice(0, 5),
      signals: {
        clusterRatio: Math.round(clusterRatio * 100) / 100,
        rateRatio: Math.round(rateRatio * 100) / 100,
        firstSeenRatio: Math.round(firstSeenRatio * 100) / 100,
      },
      recommendation: this._recommendation(raidDetected, score),
      timestamp: new Date().toISOString(),
    };
  }

  _recommendation(raidDetected, score) {
    if (!raidDetected) {
      return score >= 0.4
        ? '通常より同時多発的な投稿が見られます。監視を継続してください'
        : '協調攻撃の兆候はありません';
    }
    return '協調攻撃（レイド）の疑いがあります。スローモード/フォロワー限定モードの有効化と、'
      + '該当クラスタのユーザーへの一括対応を検討してください';
  }

  _emptyResult(platform, channelId, messageCount) {
    return {
      platform,
      channelId,
      raidDetected: false,
      score: 0,
      windowSeconds: WINDOW_MS / 1000,
      messageCount,
      distinctUsers: 0,
      firstSeenRatio: 0,
      similarClusters: [],
      signals: { clusterRatio: 0, rateRatio: 0, firstSeenRatio: 0 },
      recommendation: '解析に十分なメッセージがありません',
      timestamp: new Date().toISOString(),
    };
  }

  _key(platform, channelId) {
    return `${platform}:${channelId ?? 'default'}`;
  }
}

module.exports = new RaidDetector();
module.exports.RaidDetector = RaidDetector;
module.exports.normalizeForSimilarity = normalizeForSimilarity;
