/**
 * Community Health Service（コミュニティ健全性スコアリング）
 *
 * 【ソクラテス式問答から生まれた視点】
 * Q: 「モデレーションの成功をどう測るか？」
 * A: 「フラグを立てたコメント数」
 * Q: 「それは本当に成功を示しているか？ 削除数が多いほど良いのか？」
 * → 発見: 本当の成功は「介入が不要な健全なコミュニティ」を育てること
 *
 * Q: 「誰がコミュニティの健全性を判断すべきか？」
 * A: 「AIやモデレーター」
 * Q: 「コミュニティ自身が判断できるなら、それが最善では？」
 * → 新機能: 信頼ユーザーによる自己モデレーション
 *
 * 従来: スパムを削除した数 = 成功指標
 * 新視点: ポジティブな参加が増えた = 本当の成功
 */

const logger = require('../logger');
const detector = require('./emotionalContagionDetector');

// 健全性スコアの重みセット（根拠付き）
const HEALTH_WEIGHTS = {
  sentimentBalance:  0.25, // ポジティブ/ニュートラルの割合（量より質）
  engagementDepth:   0.20, // 有意義な発言の割合（短文スパムを排除）
  diversityScore:    0.15, // 発言者の多様性（少数支配を防ぐ）
  moderationLoad:    0.20, // モデレーション介入の少なさ（介入不要が理想）
  returnUserRate:    0.10, // リピーターの割合（継続参加は健全性の証拠）
  constructiveness:  0.10, // 建設的コメント（質問・提案・応援）の割合
};

class CommunityHealthService {
  /**
   * コミュニティ健全性スコアを計算する
   *
   * @param {Object[]} comments - 直近のコメント配列
   * @param {Object}   options  - オプション
   * @returns {Object} 健全性レポート
   */
  calculateHealth(comments, options = {}) {
    if (!comments || comments.length === 0) {
      return this._emptyReport();
    }

    const window = options.windowSize
      ? comments.slice(-options.windowSize)
      : comments;

    const signals = {
      sentimentBalance:  this._sentimentBalance(window),
      engagementDepth:   this._engagementDepth(window),
      diversityScore:    this._diversityScore(window),
      moderationLoad:    this._moderationLoad(window),
      returnUserRate:    this._returnUserRate(window, comments),
      constructiveness:  this._constructiveness(window),
    };

    // 加重平均でスコア計算
    const totalScore = Object.entries(HEALTH_WEIGHTS).reduce((sum, [key, weight]) => {
      return sum + (signals[key] ?? 0) * weight;
    }, 0);

    const score = Math.round(totalScore * 100);
    const grade = this._grade(score);

    return {
      score,               // 0–100
      grade,               // S / A / B / C / D
      signals: Object.fromEntries(
        Object.entries(signals).map(([k, v]) => [k, Math.round(v * 100) / 100])
      ),
      insight:    this._insight(score, signals),
      action:     this._suggestedAction(score, signals),
      sampleSize: window.length,
      timestamp:  new Date().toISOString(),
    };
  }

  // ─────────────────────────────────────────
  // シグナル計算
  // ─────────────────────────────────────────

  // ポジティブ + ニュートラルの割合
  _sentimentBalance(comments) {
    const nonNegative = comments.filter(c =>
      (c.sentimentScore ?? 0.5) >= 0.35 || c.sentiment === 'positive' || c.sentiment === 'neutral'
    );
    return nonNegative.length / comments.length;
  }

  // 有意義な発言の割合（20文字以上 & リンクスパムでない）
  _engagementDepth(comments) {
    const meaningful = comments.filter(c => {
      const text = c.content ?? '';
      return text.length >= 20 && (text.match(/https?:\/\//g) ?? []).length <= 1;
    });
    return meaningful.length / comments.length;
  }

  // 発言者の多様性（1人が占有していない）
  // ジニ係数の逆数的な値
  _diversityScore(comments) {
    if (comments.length === 0) return 1;
    const userCounts = {};
    for (const c of comments) {
      userCounts[c.user] = (userCounts[c.user] ?? 0) + 1;
    }
    const shares = Object.values(userCounts).map(n => n / comments.length);
    // HHI（ハーフィンダール・ハーシュマン指数）の逆数
    const hhi = shares.reduce((sum, s) => sum + s ** 2, 0);
    return Math.max(0, 1 - hhi);
  }

  // モデレーション介入の少なさ（低いほど健全）
  _moderationLoad(comments) {
    const moderated = comments.filter(c =>
      c.status && !['active', 'visible'].includes(c.status)
    );
    const moderationRate = moderated.length / comments.length;
    return 1 - moderationRate; // 介入が少ないほどスコアが高い
  }

  // リピーター率（全コメント vs 直近コメントの重複ユーザー）
  _returnUserRate(recentComments, allComments) {
    if (allComments.length <= recentComments.length) return 0.5;
    const olderUsers  = new Set(allComments.slice(0, -recentComments.length).map(c => c.user));
    const recentUsers = new Set(recentComments.map(c => c.user));
    let returns = 0;
    for (const u of recentUsers) if (olderUsers.has(u)) returns++;
    return returns / Math.max(recentUsers.size, 1);
  }

  // 建設的コメントの割合（質問・応援・提案）
  _constructiveness(comments) {
    const patterns = [
      /[?？]/,                         // 質問
      /すごい|great|nice|love|thanks/i, // 応援・賞賛
      /提案|おすすめ|試してみて|how about/i, // 提案
      /ありがとう|thank you/i,          // 感謝
    ];
    const constructive = comments.filter(c =>
      patterns.some(p => p.test(c.content ?? ''))
    );
    return constructive.length / comments.length;
  }

  // ─────────────────────────────────────────
  // スコア解釈
  // ─────────────────────────────────────────

  _grade(score) {
    if (score >= 85) return 'S';
    if (score >= 70) return 'A';
    if (score >= 55) return 'B';
    if (score >= 40) return 'C';
    return 'D';
  }

  _insight(score, signals) {
    const weakest = Object.entries(signals)
      .sort(([, a], [, b]) => a - b)[0];

    const labels = {
      sentimentBalance:  'ポジティブなコメントの割合',
      engagementDepth:   '有意義な発言の深さ',
      diversityScore:    '参加者の多様性',
      moderationLoad:    'モデレーション負荷（低いほど良い）',
      returnUserRate:    'リピーター率',
      constructiveness:  '建設的なコメント割合',
    };

    if (score >= 85) return 'このコミュニティは非常に健全です。現在の運営方針を維持してください。';
    return `改善の余地: ${labels[weakest[0]] ?? weakest[0]}（スコア: ${Math.round(weakest[1] * 100)}）が最も低い指標です。`;
  }

  _suggestedAction(score, signals) {
    if (score >= 85) return null; // 問題なし
    if (signals.diversityScore < 0.3) return '少数のユーザーが発言を支配しています。新規参加者を歓迎するメッセージを検討してください。';
    if (signals.moderationLoad < 0.7) return 'モデレーション介入が多い状態です。コミュニティルールの周知を強化してください。';
    if (signals.sentimentBalance < 0.5) return '否定的なコメントが多い状態です。ポジティブなトピック提示を検討してください。';
    if (signals.constructiveness < 0.2) return '建設的な会話が少ない状態です。視聴者への質問投げかけを試してみてください。';
    return '総合的に改善が必要です。コミュニティガイドラインの見直しを検討してください。';
  }

  _emptyReport() {
    return {
      score: null,
      grade: null,
      signals: {},
      insight: 'コメントデータが不足しています。',
      action: null,
      sampleSize: 0,
      timestamp: new Date().toISOString(),
    };
  }
}

module.exports = new CommunityHealthService();
module.exports.CommunityHealthService = CommunityHealthService;
